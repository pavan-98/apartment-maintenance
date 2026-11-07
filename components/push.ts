"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { isIos, isStandalone } from "./install";

/**
 * Notifications on this phone:
 * - loading: still checking
 * - unsupported: this browser can't receive push (old browser, in-app browser)
 * - needs-install: iPhone/iPad in a browser tab — push works only from the Home Screen app
 * - disabled: the server has no VAPID keys yet
 * - denied: the person blocked notifications for this site
 * - off / on
 */
export type PushStatus = "loading" | "unsupported" | "needs-install" | "disabled" | "denied" | "off" | "on";

let status: PushStatus = "loading";
let publicKey: string | null = null;
let started = false;
const listeners = new Set<() => void>();
const set = (s: PushStatus) => {
  status = s;
  listeners.forEach((f) => f());
};

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (!existing) await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function save(sub: PushSubscription, lang: Lang): Promise<boolean> {
  try {
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), lang }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const SYNCED = "apt-push-synced";

/** Re-send an existing subscription once per visit (or when the language changes), so the server's copy stays current. */
async function sync(lang: Lang) {
  try {
    if (sessionStorage.getItem(SYNCED) === lang) return;
  } catch {
    /* ignore */
  }
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub && (await save(sub, lang))) {
    try {
      sessionStorage.setItem(SYNCED, lang);
    } catch {
      /* ignore */
    }
  }
}

async function start() {
  if (started) return;
  started = true;
  try {
    if (!supported()) return set(isIos() && !isStandalone() ? "needs-install" : "unsupported");
    const res = await fetch("/api/push", { cache: "no-store" });
    const info = (await res.json()) as { enabled?: boolean; publicKey?: string | null };
    publicKey = info.publicKey ?? null;
    if (!info.enabled || !publicKey) return set("disabled");
    if (Notification.permission === "denied") return set("denied");
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    set(sub && Notification.permission === "granted" ? "on" : "off");
  } catch {
    started = false; // offline: try again next time
    set("unsupported");
  }
}

/** Ask permission and subscribe. Must be called from a button tap. */
async function turnOn(lang: Lang): Promise<PushStatus> {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      set(perm === "denied" ? "denied" : "off");
      return status;
    }
    if (!publicKey) return status;
    const reg = await registration();
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    if (!(await save(sub, lang))) throw new Error("save failed");
    try {
      sessionStorage.setItem(SYNCED, lang);
    } catch {
      /* ignore */
    }
    set("on");
  } catch {
    set("off");
    throw new Error("Could not turn on notifications");
  }
  return status;
}

async function turnOff() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  set("off");
}

export function usePush(lang: Lang) {
  const [, rerender] = useState(0);
  useEffect(() => {
    const f = () => rerender((x) => x + 1);
    listeners.add(f);
    start();
    return () => {
      listeners.delete(f);
    };
  }, []);
  useEffect(() => {
    if (status === "on") sync(lang).catch(() => undefined);
  }, [lang, status]); // eslint-disable-line react-hooks/exhaustive-deps
  return { status, turnOn: () => turnOn(lang), turnOff };
}
