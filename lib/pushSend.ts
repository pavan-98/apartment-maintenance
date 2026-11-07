import webpush from "web-push";
import type { Lang } from "./i18n";
import type { Notice } from "./types";
import { deviceInfo, noticePayload, subKey, type DeviceInfo, type PushPayload, type StoredSub } from "./push";
import {
  allPushSubscriptions,
  pushTableAll,
  pushTableDelete,
  pushTableGet,
  pushTableSet,
  removePushSubscriptions,
  savePushSubscription,
  updatePushSubscriptions,
  type PushTable,
} from "./store";

type RemovedSub = StoredSub & { removedAt: string };

/** At most this many devices (subscribed + removed). Far above any building; stops junk filling the list. */
export const MAX_DEVICES = 500;
/** Removed devices that haven't opened the app for this long are forgotten. */
const FORGET_REMOVED_AFTER_DAYS = 90;
const DAY = 86_400_000;

export class TooManyDevices extends Error {}

/** VAPID keys from the environment, or null when push isn't set up. */
export function vapidKeys(env: Record<string, string | undefined> = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  // Push services want a contact: a mailto: address or the site's own URL.
  const site = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://localhost";
  const subject = env.VAPID_SUBJECT?.trim() || site;
  return { publicKey, privateKey, subject };
}

/** Stored subscriptions, keyed by id (damaged entries are skipped). */
async function loadSubs(table: PushTable = "push"): Promise<Record<string, StoredSub>> {
  const out: Record<string, StoredSub> = {};
  for (const [id, raw] of Object.entries(table === "push" ? await allPushSubscriptions() : await pushTableAll(table))) {
    try {
      out[id] = JSON.parse(raw) as StoredSub;
    } catch {
      /* skip */
    }
  }
  return out;
}

/** Number of subscribed devices (the same list the admin screen shows). */
export async function subscriberCount(): Promise<number> {
  return Object.keys(await loadSubs()).length;
}

/** Ids in `subs` that belong to the same browser as `sub` (same device id), other than `id`. */
function sameDevice(subs: Record<string, StoredSub>, id: string, sub: StoredSub): string[] {
  return sub.deviceId ? Object.keys(subs).filter((k) => k !== id && subs[k].deviceId === sub.deviceId) : [];
}

/**
 * Save a subscription sent by a device.
 * - `auto` (the app re-sending it whenever it is opened): a device an admin
 *   removed stays removed; only its details ("last seen", language) are refreshed.
 * - Otherwise the resident turned notifications on, which adds it (back) to the
 *   active list.
 * Either way an older subscription from the same browser is replaced, so each
 * device is listed once. Throws TooManyDevices for a new device when the list is full.
 */
export async function saveSubscription(sub: StoredSub, auto = false): Promise<"active" | "removed"> {
  const id = subKey(sub.endpoint);
  const removed = (await loadSubs("push-removed")) as Record<string, RemovedSub>;
  const active = await loadSubs();
  const sameRemoved = sameDevice(removed, id, sub);
  const sameActive = sameDevice(active, id, sub);
  const wasRemoved = removed[id] ?? removed[sameRemoved[0]];
  const previous = active[id] ?? active[sameActive[0]] ?? wasRemoved;
  if (!previous && Object.keys(active).length + Object.keys(removed).length >= MAX_DEVICES) throw new TooManyDevices();
  // Keep when it first subscribed and the last result across re-sends.
  const merged: StoredSub = { ...sub, since: previous?.since ?? previous?.at ?? sub.at, ...(previous?.last ? { last: previous.last } : {}) };

  if (auto && wasRemoved) {
    await pushTableDelete("push-removed", sameRemoved);
    await pushTableSet("push-removed", id, JSON.stringify({ ...merged, removedAt: wasRemoved.removedAt }));
    return "removed";
  }
  await savePushSubscription(id, JSON.stringify(merged));
  await removePushSubscriptions(sameActive);
  const stale = [id, ...sameRemoved].filter((k) => k in removed);
  if (stale.length) await pushTableDelete("push-removed", stale);
  return "active";
}

/** Admin: stop sending to a device. It is kept in the removed list and can be added back. */
export async function removeDevice(id: string, now = new Date()): Promise<DeviceInfo | null> {
  const raw = (await allPushSubscriptions())[id];
  if (!raw) return null;
  const sub = JSON.parse(raw) as StoredSub;
  await pushTableSet("push-removed", id, JSON.stringify({ ...sub, removedAt: now.toISOString() }));
  await removePushSubscriptions([id]);
  return deviceInfo(id, sub);
}

/** Admin: start sending to a removed device again. */
export async function restoreDevice(id: string): Promise<DeviceInfo | null> {
  const raw = await pushTableGet("push-removed", id);
  if (!raw) return null;
  const sub: Partial<RemovedSub> = JSON.parse(raw);
  delete sub.removedAt;
  await savePushSubscription(id, JSON.stringify(sub));
  await pushTableDelete("push-removed", [id]);
  return deviceInfo(id, sub as StoredSub);
}

export async function isRemovedDevice(id: string): Promise<boolean> {
  return (await pushTableGet("push-removed", id)) !== null;
}

/**
 * Devices for the admin screen, last seen first: active ones, and ones an admin
 * removed. Removed devices not seen for 90 days (app uninstalled, phone
 * replaced) are forgotten here.
 */
export async function listDevices(now = new Date()): Promise<{ devices: DeviceInfo[]; removed: DeviceInfo[] }> {
  const removed = await loadSubs("push-removed");
  const old = Object.keys(removed).filter((k) => now.getTime() - Date.parse(removed[k].at) > FORGET_REMOVED_AFTER_DAYS * DAY);
  if (old.length) {
    await pushTableDelete("push-removed", old);
    for (const k of old) delete removed[k];
  }
  const toList = (subs: Record<string, StoredSub>) =>
    Object.entries(subs)
      .map(([id, s]) => deviceInfo(id, s))
      .sort((a, b) => b.at.localeCompare(a.at));
  return { devices: toList(await loadSubs()), removed: toList(removed) };
}

export interface SendResult {
  sent: number;
  failed: number;
  removed: number;
  /** Why sends failed (other than expired subscriptions), e.g. "403 …". */
  errors?: string[];
}

export interface SendOptions {
  urgency?: "high" | "normal";
  /** Send only to these device ids. */
  only?: string[];
  /** How long the push service keeps trying a device that is off (seconds). Default: 1 day. */
  ttl?: number;
}

/**
 * Send a notification to every subscribed device (or only `only`), in each
 * device's language. Devices the push service reports as gone are deleted;
 * every other device gets its result recorded so admins can see what happened.
 */
export async function sendPush(build: (lang: Lang) => PushPayload, opts: SendOptions = {}): Promise<SendResult> {
  const keys = vapidKeys();
  const result: SendResult = { sent: 0, failed: 0, removed: 0 };
  if (!keys) return result;
  let entries = Object.entries(await loadSubs());
  if (opts.only) entries = entries.filter(([id]) => opts.only!.includes(id));
  const options = {
    vapidDetails: keys,
    TTL: Math.round(opts.ttl ?? DAY / 1000),
    urgency: opts.urgency ?? "normal",
    timeout: 10_000, // don't let one slow push service hold up the rest
  };
  const gone: string[] = [];
  const results: Record<string, StoredSub["last"]> = {};
  const at = new Date().toISOString();
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    const settled = await Promise.allSettled(
      batch.map(([, s]) => webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(build(s.lang)), options)),
    );
    settled.forEach((r, j) => {
      const [id, s] = batch[j];
      if (r.status === "fulfilled") {
        result.sent++;
        results[id] = { at, ok: true, status: r.value?.statusCode };
        return;
      }
      result.failed++;
      const code = (r.reason as { statusCode?: number })?.statusCode;
      // 404/410: the person turned notifications off or the subscription expired.
      if (code === 404 || code === 410) {
        gone.push(id);
        console.log("push subscription expired, removed", code, s.device);
      } else {
        const why = `${code ?? "network"} ${(r.reason as { body?: string })?.body || (r.reason as Error)?.message || ""}`.trim();
        console.error("push failed", why);
        (result.errors ??= []).push(why.slice(0, 200));
        results[id] = { at, ok: false, status: code };
      }
    });
  }
  if (gone.length) {
    await removePushSubscriptions(gone);
    result.removed = gone.length;
  }
  // Record each result on the device's latest details (it may have checked in while sending).
  const fresh = await loadSubs();
  const updates: Record<string, string> = {};
  for (const [id, last] of Object.entries(results)) if (fresh[id]) updates[id] = JSON.stringify({ ...fresh[id], last });
  await updatePushSubscriptions(updates);
  return result;
}

/** How long a notice's notification is worth delivering: until the end of its last day (at least 1 hour, at most 3 days). */
export function noticeTtl(n: Notice, now = new Date()): number {
  const max = 3 * DAY;
  if (!n.expiresOn) return max / 1000;
  // End of the notice's last day in India (UTC+5:30).
  const end = Date.parse(`${n.expiresOn}T23:59:59+05:30`);
  return Math.round(Math.min(max, Math.max(60 * 60 * 1000, end - now.getTime())) / 1000);
}

/** Send a notice to every subscribed device. */
export function sendNoticePush(n: Notice): Promise<SendResult> {
  return sendPush((lang) => noticePayload(n, lang), { urgency: n.important ? "high" : "normal", ttl: noticeTtl(n) });
}
