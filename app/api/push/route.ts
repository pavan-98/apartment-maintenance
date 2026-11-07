import { NextResponse } from "next/server";
import { readClaims } from "@/lib/auth";
import { parseSubscription, subKey, isPushEndpoint } from "@/lib/push";
import { subscriberCount, vapidKeys } from "@/lib/pushSend";
import { removePushSubscriptions, savePushSubscription } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Whether push is set up, the public key browsers subscribe with, and (for admins) how many phones are subscribed. */
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

/** A resident turns on notifications on this phone (also re-sent on later visits to keep it fresh). */
export async function POST(req: Request) {
  if (!vapidKeys()) return NextResponse.json({ error: "Notifications are not set up yet" }, { status: 503 });
  const sub = parseSubscription(await readJson(req), new Date(), req.headers.get("user-agent"));
  if (!sub) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  try {
    await savePushSubscription(subKey(sub.endpoint), JSON.stringify(sub));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
}

/** A resident turns notifications off on this phone. */
export async function DELETE(req: Request) {
  const body = (await readJson(req)) as { endpoint?: unknown } | null;
  if (!isPushEndpoint(body?.endpoint)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    await removePushSubscriptions([subKey(body.endpoint)]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
}
