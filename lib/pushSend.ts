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
 * - `auto` (the app re-sending it on a later visit): a device an admin removed
 *   stays removed; only its details ("last seen", language) are refreshed.
 * - Otherwise the resident turned notifications on, which adds it (back) to the
 *   active list.
 * Either way an older subscription from the same browser is replaced, so each
 * device is listed once. Returns whether the device is active or removed.
 */
export async function saveSubscription(sub: StoredSub, auto = false): Promise<"active" | "removed"> {
  const id = subKey(sub.endpoint);
  const removed = (await loadSubs("push-removed")) as Record<string, RemovedSub>;
  const wasRemoved = removed[id] ?? removed[sameDevice(removed, id, sub)[0]];
  if (auto && wasRemoved) {
    await pushTableDelete("push-removed", sameDevice(removed, id, sub));
    await pushTableSet("push-removed", id, JSON.stringify({ ...sub, last: wasRemoved.last, removedAt: wasRemoved.removedAt }));
    return "removed";
  }
  const active = await loadSubs();
  const last = active[id]?.last ?? wasRemoved?.last;
  await savePushSubscription(id, JSON.stringify(last ? { ...sub, last } : sub));
  await removePushSubscriptions(sameDevice(active, id, sub));
  const stale = [id, ...sameDevice(removed, id, sub)].filter((k) => k in removed);
  if (stale.length) await pushTableDelete("push-removed", stale);
  return "active";
}

/** Admin: stop sending to a device. It is kept in the removed list and can be added back. */
export async function removeDevice(id: string, now = new Date()): Promise<boolean> {
  const raw = (await allPushSubscriptions())[id];
  if (!raw) return false;
  await pushTableSet("push-removed", id, JSON.stringify({ ...JSON.parse(raw), removedAt: now.toISOString() }));
  await removePushSubscriptions([id]);
  return true;
}

/** Admin: start sending to a removed device again. */
export async function restoreDevice(id: string): Promise<boolean> {
  const raw = await pushTableGet("push-removed", id);
  if (!raw) return false;
  const sub: Partial<RemovedSub> = JSON.parse(raw);
  delete sub.removedAt;
  await savePushSubscription(id, JSON.stringify(sub));
  await pushTableDelete("push-removed", [id]);
  return true;
}

export async function isRemovedDevice(id: string): Promise<boolean> {
  return (await pushTableGet("push-removed", id)) !== null;
}

/** Devices for the admin screen, newest first: active ones, and ones an admin removed. */
export async function listDevices(): Promise<{ devices: DeviceInfo[]; removed: DeviceInfo[] }> {
  const toList = (subs: Record<string, StoredSub>) =>
    Object.entries(subs)
      .map(([id, s]) => deviceInfo(id, s))
      .sort((a, b) => b.at.localeCompare(a.at));
  return { devices: toList(await loadSubs()), removed: toList(await loadSubs("push-removed")) };
}

export interface SendResult {
  sent: number;
  failed: number;
  removed: number;
  /** Why sends failed (other than expired subscriptions), e.g. "403 …". */
  errors?: string[];
}

/**
 * Send a notification to every subscribed phone (or only `only`), in each
 * phone's language. Phones the push service reports as gone are deleted; every
 * other phone gets its result recorded so admins can see what happened.
 */
export async function sendPush(
  build: (lang: Lang) => PushPayload,
  opts: { urgency?: "high" | "normal"; only?: string[] } = {},
): Promise<SendResult> {
  const keys = vapidKeys();
  const result: SendResult = { sent: 0, failed: 0, removed: 0 };
  if (!keys) return result;
  let entries = Object.entries(await loadSubs());
  if (opts.only) entries = entries.filter(([id]) => opts.only!.includes(id));
  const options = {
    vapidDetails: keys,
    TTL: 60 * 60 * 24 * 3, // keep trying for 3 days if the phone is off
    urgency: opts.urgency ?? "normal",
  };
  const gone: string[] = [];
  const updates: Record<string, string> = {};
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
        updates[id] = JSON.stringify({ ...s, last: { at, ok: true, status: r.value?.statusCode } });
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
        updates[id] = JSON.stringify({ ...s, last: { at, ok: false, status: code } });
      }
    });
  }
  if (gone.length) {
    await removePushSubscriptions(gone);
    result.removed = gone.length;
  }
  await updatePushSubscriptions(updates);
  return result;
}

/** Send a notice to every subscribed phone. */
export function sendNoticePush(n: Notice): Promise<SendResult> {
  return sendPush((lang) => noticePayload(n, lang), { urgency: n.important ? "high" : "normal" });
}
