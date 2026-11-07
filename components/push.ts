"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { isIos, isStandalone } from "./install";

/**
 * Notifications on this phone:
 * - loading: still checking (or offline)
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

const DEVICE_KEY = "apt-device-id";

/** A random id kept by this browser, so the server can replace this device's old subscription. */
function deviceId(): string | undefined {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

/** Was this subscription made with the server's current public key? (False after the keys are changed.) */
function madeWithKey(sub: PushSubscription, key: string): boolean {
  const k = sub.options?.applicationServerKey;
  if (!k) return true; // browser doesn't say: assume it's fine
  const a = new Uint8Array(k);
  const b = keyBytes(key);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * This browser's subscription, renewed if it was made with old keys (the admin
 * changed VAPID keys). Permission is already granted, so renewing needs no prompt.
 */
async function currentSubscription(reg: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  const sub = await reg.pushManager.getSubscription();
  if (!sub || !publicKey || madeWithKey(sub, publicKey)) return sub;
  await sub.unsubscribe().catch(() => undefined);
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
}

/** Send the subscription to the server. */
async function save(sub: PushSubscription, lang: Lang, auto = false): Promise<"ok" | "failed"> {
  try {
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), lang, installed: isStandalone(), auto, deviceId: deviceId() }),
    });
    return res.ok ? "ok" : "failed";
  } catch {
    return "failed";
  }
}
let syncedLang: Lang | null = null;

/**
 * Re-send the subscription every time the app is opened (and when the language
 * changes), so the server always has this device even if its copy was lost.
 */
async function sync(lang: Lang) {
  if (syncedLang === lang) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg && (await currentSubscription(reg));
  if (sub && (await save(sub, lang, true)) === "ok") syncedLang = lang;
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
    started = false; // offline: stay quiet and try again next time
    set("loading");
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
    const sub = (await currentSubscription(reg)) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    if ((await save(sub, lang)) !== "ok") throw new Error("save failed");
    syncedLang = lang;
    set("on");
  } catch {
    set("off");
    throw new Error("Could not turn on notifications");
  }
  return status;
}

/** The admin-screen id of this browser's subscription (same hash the server uses), or null. */
export async function currentDeviceId(): Promise<string | null> {
  try {
    if (!("serviceWorker" in navigator) || !crypto.subtle) return null;
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return null;
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sub.endpoint)));
    let bin = "";
    for (const b of hash) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 32);
  } catch {
    return null;
  }
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
  return { status, turnOn: () => turnOn(lang) };
}
