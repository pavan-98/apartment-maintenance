import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listDevices, vapidKeys } from "@/lib/pushSend";
import { removePushSubscriptions } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Admin: the phones subscribed to notifications. */
export async function GET() {
  const { session } = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again" }, { status: 401 });
  try {
    return NextResponse.json({ enabled: !!vapidKeys(), devices: await listDevices() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not load. Please try again." }, { status: 500 });
  }
}

/** Admin: stop sending to a phone (it can subscribe again from the app). */
export async function DELETE(req: Request) {
  const { session } = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof body?.id !== "string" || body.id.length > 64) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await removePushSubscriptions([body.id]);
  return NextResponse.json({ ok: true });
}
