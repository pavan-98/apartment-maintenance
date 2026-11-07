import webpush from "web-push";
import type { Notice } from "./types";
import { noticePayload, subKey, type StoredSub } from "./push";
import { allPushSubscriptions, removePushSubscriptions } from "./store";

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

export async function subscriberCount(): Promise<number> {
  return (await allPushSubscriptions()).length;
}

export interface SendResult {
  sent: number;
  failed: number;
  removed: number;
}

/** Send a notice to every subscribed phone. Subscriptions the browser has dropped are deleted. */
export async function sendNoticePush(n: Notice): Promise<SendResult> {
  const keys = vapidKeys();
  if (!keys) return { sent: 0, failed: 0, removed: 0 };
  const subs: StoredSub[] = [];
  for (const raw of await allPushSubscriptions()) {
    try {
      subs.push(JSON.parse(raw) as StoredSub);
    } catch {
      /* skip a damaged entry */
    }
  }
  const options = {
    vapidDetails: keys,
    TTL: 60 * 60 * 24 * 3, // keep trying for 3 days if the phone is off
    urgency: (n.important ? "high" : "normal") as "high" | "normal",
  };
  const result: SendResult = { sent: 0, failed: 0, removed: 0 };
  const gone: string[] = [];
  for (let i = 0; i < subs.length; i += 50) {
    const batch = subs.slice(i, i + 50);
    const settled = await Promise.allSettled(
      batch.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(noticePayload(n, s.lang)), options)),
    );
    settled.forEach((r, j) => {
      if (r.status === "fulfilled") return void result.sent++;
      result.failed++;
      const code = (r.reason as { statusCode?: number })?.statusCode;
      // 404/410: the person turned notifications off or the subscription expired.
      if (code === 404 || code === 410) gone.push(subKey(batch[j].endpoint));
      else console.error("push failed", code, (r.reason as Error)?.message);
    });
  }
  if (gone.length) {
    await removePushSubscriptions(gone);
    result.removed = gone.length;
  }
  return result;
}
