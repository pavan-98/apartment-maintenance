import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sendNoticePush, vapidKeys } from "@/lib/pushSend";
import { activeNotices } from "@/lib/whatsapp";

/** Admin: send (or send again) a notification for one notice. */
export async function POST(req: Request) {
  const { db, session } = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again" }, { status: 401 });
  if (!vapidKeys()) return NextResponse.json({ error: "Notifications are not set up yet (VAPID keys missing)" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { noticeId?: unknown } | null;
  const n = activeNotices(db).find((x) => x.id === body?.noticeId);
  if (!n) return NextResponse.json({ error: "Notice not found or expired" }, { status: 404 });
  try {
    return NextResponse.json(await sendNoticePush(n));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not send. Please try again." }, { status: 500 });
  }
}
