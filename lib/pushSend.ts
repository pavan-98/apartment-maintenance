import webpush from "web-push";
import type { Lang } from "./i18n";
import type { Notice } from "./types";
import { deviceInfo, noticePayload, type DeviceInfo, type PushPayload, type StoredSub } from "./push";
import { allPushSubscriptions, removePushSubscriptions, updatePushSubscriptions } from "./store";

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
async function loadSubs(): Promise<Record<string, StoredSub>> {
  const out: Record<string, StoredSub> = {};
  for (const [id, raw] of Object.entries(await allPushSubscriptions())) {
    try {
      out[id] = JSON.parse(raw) as StoredSub;
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function subscriberCount(): Promise<number> {
  return Object.keys(await allPushSubscriptions()).length;
}

/** Subscribed phones for the admin screen, newest first. */
export async function listDevices(): Promise<DeviceInfo[]> {
  const subs = await loadSubs();
  return Object.entries(subs)
    .map(([id, s]) => deviceInfo(id, s))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export interface SendResult {
  sent: number;
  failed: number;
  removed: number;
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
      if (code === 404 || code === 410) gone.push(id);
      else {
        console.error("push failed", code, (r.reason as { body?: string })?.body || (r.reason as Error)?.message);
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
