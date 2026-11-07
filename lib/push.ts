import { createHash } from "node:crypto";
import type { Lang } from "./i18n";
import type { Notice } from "./types";

/** A browser's push subscription as we store it, plus the resident's language. */
export interface StoredSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  lang: Lang;
  /** When the phone subscribed (or last re-sent its subscription). */
  at: string;
  /** e.g. "Android · Chrome", from the browser's user agent. */
  device?: string;
  /** Opened as the installed app (Home Screen) rather than a browser tab. */
  installed?: boolean;
  /** Result of the last notification sent to this phone. */
  last?: { at: string; ok: boolean; status?: number };
  /** Random id this browser keeps, so a new subscription replaces its old one. */
  deviceId?: string;
}

/** What admins see about a subscribed phone (no keys, no endpoint). */
export interface DeviceInfo {
  id: string;
  device: string;
  service: string;
  lang: Lang;
  installed: boolean;
  at: string;
  last?: StoredSub["last"];
  /** Set for devices an admin removed. */
  removedAt?: string;
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

/** A short, readable device name from a user agent, e.g. "Android · Chrome". */
export function deviceLabel(ua: string | null | undefined): string {
  const u = ua ?? "";
  const os = /iPad/.test(u)
    ? "iPad"
    : /iPhone|iPod/.test(u)
      ? "iPhone"
      : /Android/.test(u)
        ? "Android"
        : /CrOS/.test(u)
          ? "Chromebook"
          : /Windows/.test(u)
            ? "Windows"
            : /Mac OS X|Macintosh/.test(u)
              ? "Mac"
              : /Linux/.test(u)
                ? "Linux"
                : "Unknown device";
  const browser = /SamsungBrowser/.test(u)
    ? "Samsung Internet"
    : /EdgA?\//.test(u)
      ? "Edge"
      : /OPR\/|Opera/.test(u)
        ? "Opera"
        : /Firefox\/|FxiOS/.test(u)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(u)
            ? "Chrome"
            : /Safari\//.test(u)
              ? "Safari"
              : "";
  return browser ? `${os} · ${browser}` : os;
}

/** Which company's push service delivers to this subscription. */
export function pushService(endpoint: string): string {
  const host = (() => {
    try {
      return new URL(endpoint).hostname;
    } catch {
      return "";
    }
  })();
  if (host.endsWith(".push.apple.com")) return "Apple";
  if (host.endsWith(".mozilla.com")) return "Mozilla";
  if (host.endsWith(".notify.windows.com")) return "Microsoft";
  if (host.endsWith(".googleapis.com")) return "Google";
  return "Other";
}

export function deviceInfo(id: string, s: StoredSub & { removedAt?: string }): DeviceInfo {
  return {
    ...(s.removedAt ? { removedAt: s.removedAt } : {}),
    id,
    device: s.device || "Unknown device",
    service: pushService(s.endpoint),
    lang: s.lang,
    installed: !!s.installed,
    at: s.at,
    last: s.last,
  };
}

/** Check a subscription sent by a browser. Returns null if it isn't valid. */
export function parseSubscription(body: unknown, now = new Date(), userAgent?: string | null): StoredSub | null {
  if (!body || typeof body !== "object") return null;
  const b = body as {
    subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    lang?: unknown;
    installed?: unknown;
    deviceId?: unknown;
  };
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
    device: deviceLabel(userAgent),
    installed: b.installed === true,
    ...(typeof b.deviceId === "string" && /^[A-Za-z0-9-]{8,64}$/.test(b.deviceId) ? { deviceId: b.deviceId } : {}),
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

/** A notification written by an admin, not tied to a notice. */
export interface CustomMessage {
  titleEn: string;
  bodyEn: string;
  titleTe: string;
  bodyTe: string;
  /** Which part of the app opens when it is tapped. */
  url: string;
  important: boolean;
}

/** Pages a notification may open. */
export const OPEN_PAGES = [
  { url: "/", label: "Home (this month)" },
  { url: "/#notices", label: "Notices" },
  { url: "/#history", label: "History" },
  { url: "/#rules", label: "Rules" },
] as const;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Check an admin's custom message. Returns an error message or the cleaned message. */
export function parseMessage(body: unknown): CustomMessage | string {
  if (!body || typeof body !== "object") return "Invalid message";
  const b = body as Record<string, unknown>;
  const m: CustomMessage = {
    titleEn: str(b.titleEn, 100),
    bodyEn: str(b.bodyEn, 400),
    titleTe: str(b.titleTe, 100),
    bodyTe: str(b.bodyTe, 400),
    url: OPEN_PAGES.some((p) => p.url === b.url) ? (b.url as string) : "/",
    important: b.important === true,
  };
  if (!m.titleEn && !m.titleTe) return "Please give the notification a title (English or Telugu)";
  return m;
}

export function messagePayload(m: CustomMessage, lang: Lang, tag: string): PushPayload {
  const title = lang === "te" ? m.titleTe || m.titleEn : m.titleEn || m.titleTe;
  const body = lang === "te" ? m.bodyTe || m.bodyEn : m.bodyEn || m.bodyTe;
  return { title: `${m.important ? "❗" : "🔔"} ${clip(title, 80)}`, body: clip(body, 180), url: m.url, tag };
}

export function testPayload(lang: Lang): PushPayload {
  return lang === "te"
    ? { title: "🔔 పరీక్ష నోటిఫికేషన్", body: "ఈ పరికరంలో నోటిఫికేషన్లు పనిచేస్తున్నాయి ✓", url: "/#notices", tag: "test" }
    : { title: "🔔 Test notification", body: "Notifications are working on this device ✓", url: "/#notices", tag: "test" };
}
