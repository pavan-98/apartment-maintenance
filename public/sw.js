// Offline support: network first, falling back to the last cached copy.
const CACHE = "apt-v3";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Admin data and login state must never come from cache.
  if (url.pathname.startsWith("/api/") && url.pathname !== "/api/data") return;
  if (url.pathname.startsWith("/admin")) return;

  const isStatic = url.pathname.startsWith("/_next/static/");
  if (isStatic) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && url.pathname === "/api/data") {
          // Only cache the public (non-admin) view.
          res.clone().json().then((j) => {
            if (!j.admin) caches.open(CACHE).then((c) => c.put(req, new Response(JSON.stringify(j), { headers: { "Content-Type": "application/json" } })));
          }).catch(() => undefined);
        } else if (res.ok && req.mode === "navigate") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
  );
});
