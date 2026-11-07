// Offline support: network first, falling back to the last cached copy.
const CACHE = "apt-v5";
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

// Push notifications (new notices). The server sends { title, body, url, tag }.
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || "New notice", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/badge-96.png", // white shape on transparent: Android shows only its outline
      tag: data.tag || "notice",
      renotify: true,
      data: { url: data.url || "/#notices" },
    }),
  );
});

// Tapping the notification opens the app (or brings it to the front) on the Notices tab.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/#notices", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          return c.navigate(url).then((w) => (w || c).focus()).catch(() => c.focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
