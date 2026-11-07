import { NextResponse } from "next/server";
import { readClaims } from "@/lib/auth";
import { parseSubscription } from "@/lib/push";
import { saveSubscription, subscriberCount, vapidKeys } from "@/lib/pushSend";

export const dynamic = "force-dynamic";

/** Whether push is set up, the public key browsers subscribe with, and (for admins) how many devices are subscribed. */
export async function GET() {
  const keys = vapidKeys();
  const body: { enabled: boolean; publicKey: string | null; subscribers?: number } = { enabled: !!keys, publicKey: keys?.publicKey ?? null };
  try {
    if (keys && (await readClaims())) body.subscribers = await subscriberCount();
  } catch (e) {
    console.error(e);
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text().catch(() => "");
  if (!text || text.length > 4000) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * A resident turns on notifications on this device. The app also re-sends it
 * automatically on later visits (`auto: true`) to keep it fresh; a device an
 * admin removed stays removed then (only its details are refreshed).
 */
export async function POST(req: Request) {
  if (!vapidKeys()) return NextResponse.json({ error: "Notifications are not set up yet" }, { status: 503 });
  const body = await readJson(req);
  const sub = parseSubscription(body, new Date(), req.headers.get("user-agent"));
  if (!sub) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const auto = (body as { auto?: unknown }).auto === true;
  try {
    const state = await saveSubscription(sub, auto);
    return NextResponse.json({ ok: true, removed: state === "removed" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
}
