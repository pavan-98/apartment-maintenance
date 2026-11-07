import { NextResponse } from "next/server";
import { isPushEndpoint, subKey, testPayload } from "@/lib/push";
import { isRemovedDevice, sendPush, vapidKeys } from "@/lib/pushSend";

/**
 * A resident sends a test notification to their own device (only to a
 * subscription that is already saved). On failure, `reason` tells the app what
 * to do: "not-subscribed" (save it again), "gone" (the push service expired it:
 * make a new one) or "error".
 */
export async function POST(req: Request) {
  if (!vapidKeys()) return NextResponse.json({ error: "Notifications are not set up yet", reason: "error" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (!isPushEndpoint(body?.endpoint)) return NextResponse.json({ error: "Invalid request", reason: "error" }, { status: 400 });
  const id = subKey(body.endpoint);
  if (await isRemovedDevice(id)) return NextResponse.json({ error: "Paused by an admin", removed: true }, { status: 409 });
  const r = await sendPush(testPayload, { only: [id], urgency: "high" });
  console.log("push test", id.slice(0, 6), JSON.stringify(r));
  if (r.sent) return NextResponse.json(r);
  if (r.removed) return NextResponse.json({ ...r, reason: "gone", error: "The push service said this subscription has expired" }, { status: 410 });
  if (r.failed) return NextResponse.json({ ...r, reason: "error", error: r.errors?.[0] ?? "Push service error" }, { status: 502 });
  return NextResponse.json({ ...r, reason: "not-subscribed", error: "This device is not subscribed" }, { status: 404 });
}
