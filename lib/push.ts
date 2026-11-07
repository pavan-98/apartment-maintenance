import { createHash } from "node:crypto";
import type { Lang } from "./i18n";
import type { Notice } from "./types";

/** A browser's push subscription as we store it, plus the resident's language. */
export interface StoredSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  lang: Lang;
  at: string;
}

/**
 * Push services run by the browser makers (Chrome/Edge/Samsung → Google,
 * Firefox → Mozilla, Safari → Apple, Edge on Windows → Microsoft). Only these
 * are accepted, so the server never posts to an arbitrary address.
 */
const PUSH_HOSTS = [".googleapis.com", ".mozilla.com", ".push.apple.com", ".notify.windows.com"];

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => host.endsWith(h));
  } catch {
    return false;
  }
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const key = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max && B64URL.test(v);

/** Check a subscription sent by a browser. Returns null if it isn't valid. */
export function parseSubscription(body: unknown, now = new Date()): StoredSub | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; lang?: unknown };
  const s = b.subscription;
  if (!s || !isPushEndpoint(s.endpoint)) return null;
  const p256dh = s.keys?.p256dh;
  const auth = s.keys?.auth;
  if (!key(p256dh, 200) || !key(auth, 100)) return null;
  return {
    endpoint: s.endpoint,
    keys: { p256dh: p256dh as string, auth: auth as string },
    lang: b.lang === "te" ? "te" : "en",
    at: now.toISOString(),
  };
}

/** Storage key for a subscription: a hash of its endpoint. */
export function subKey(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("base64url").slice(0, 32);
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

function clip(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

/** What the notification says, in the resident's language (falling back to the other one). */
export function noticePayload(n: Notice, lang: Lang): PushPayload {
  const title = lang === "te" ? n.titleTe || n.titleEn : n.titleEn || n.titleTe;
  const body = lang === "te" ? n.bodyTe || n.bodyEn : n.bodyEn || n.bodyTe;
  return {
    title: `${n.important ? "❗" : "📢"} ${clip(title, 80)}`,
    body: clip(body, 180),
    url: "/#notices",
    tag: `notice-${n.id}`,
  };
}
