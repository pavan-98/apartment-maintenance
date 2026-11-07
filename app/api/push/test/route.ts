import { NextResponse } from "next/server";
import { isPushEndpoint, subKey, testPayload } from "@/lib/push";
import { isRemovedDevice, sendPush, vapidKeys } from "@/lib/pushSend";

/** A resident sends a test notification to their own phone (only to a subscription that is already saved). */
export async function POST(req: Request) {
  if (!vapidKeys()) return NextResponse.json({ error: "Notifications are not set up yet" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (!isPushEndpoint(body?.endpoint)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const id = subKey(body.endpoint);
  const r = await sendPush(testPayload, { only: [id], urgency: "high" });
  if (r.sent + r.failed === 0) {
    const removed = await isRemovedDevice(id);
    return NextResponse.json({ error: removed ? "Paused by an admin" : "This device is not subscribed", removed }, { status: removed ? 409 : 404 });
  }
  return NextResponse.json(r);
}
