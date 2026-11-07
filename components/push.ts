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
  const sub = await reg?.pushManager.getSubscription();
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
    if ((await save(sub, lang)) !== "ok") throw new Error("save failed");
    syncedLang = lang;
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

type TestReply = { sent?: number; removed?: boolean; reason?: "not-subscribed" | "gone" | "error"; error?: string };

async function postTest(sub: PushSubscription): Promise<TestReply> {
  try {
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    return (await res.json().catch(() => ({ reason: "error", error: `HTTP ${res.status}` }))) as TestReply;
  } catch {
    return { reason: "error", error: "No internet connection" };
  }
}

/**
 * Send a test notification to this device, repairing the subscription on the
 * way: if the server lost it, it is saved again; if the push service says it
 * has expired, a new one is made (permission is already granted, so there is
 * no prompt). Throws Error("removed") if an admin removed the device, or an
 * Error with the reason if it still could not be sent.
 */
async function sendTest(lang: Lang) {
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) throw new Error("This browser has no subscription. Turn notifications off and on again.");
  let r = await postTest(sub);
  if (r.reason === "not-subscribed") {
    await save(sub, lang, true);
    r = await postTest(sub);
  }
  if (r.reason === "gone" && publicKey) {
    await sub.unsubscribe().catch(() => undefined);
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    await save(sub, lang);
    syncedLang = lang;
    r = await postTest(sub);
  }
  if (r.removed) throw new Error("removed");
  if (!r.sent) throw new Error(r.error || r.reason || "not sent");
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
  return { status, turnOn: () => turnOn(lang), turnOff, sendTest: () => sendTest(lang) };
}
