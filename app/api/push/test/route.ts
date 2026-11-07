import { NextResponse } from "next/server";
import { isPushEndpoint, subKey, testPayload } from "@/lib/push";
import { sendPush, vapidKeys } from "@/lib/pushSend";

/** A resident sends a test notification to their own phone (only to a subscription that is already saved). */
export async function POST(req: Request) {
  if (!vapidKeys()) return NextResponse.json({ error: "Notifications are not set up yet" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (!isPushEndpoint(body?.endpoint)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const r = await sendPush(testPayload, { only: [subKey(body.endpoint)], urgency: "high" });
  if (r.sent + r.failed === 0) return NextResponse.json({ error: "This phone is not subscribed" }, { status: 404 });
  return NextResponse.json(r);
}
