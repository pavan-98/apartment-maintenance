import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sendNoticePush, sendPush, vapidKeys } from "@/lib/pushSend";
import { messagePayload, parseMessage, testPayload } from "@/lib/push";
import { activeNotices } from "@/lib/whatsapp";

/**
 * Admin: send a notification to subscribed phones. The body is one of:
 * - { noticeId }            a current notice, to every phone
 * - { message }             a custom message (titles/bodies in English and Telugu), to every phone
 * - { testIds: [id, ...] }  a test notification to the chosen phones
 */
export async function POST(req: Request) {
  const { db, session } = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again" }, { status: 401 });
  if (!vapidKeys()) return NextResponse.json({ error: "Notifications are not set up yet (VAPID keys missing)" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { noticeId?: unknown; message?: unknown; testIds?: unknown } | null;
  try {
    if (body?.noticeId !== undefined) {
      const n = activeNotices(db).find((x) => x.id === body.noticeId);
      if (!n) return NextResponse.json({ error: "Notice not found or expired" }, { status: 404 });
      return NextResponse.json(await sendNoticePush(n));
    }
    if (body?.message !== undefined) {
      const m = parseMessage(body.message);
      if (typeof m === "string") return NextResponse.json({ error: m }, { status: 400 });
      const tag = `msg-${Date.now().toString(36)}`;
      return NextResponse.json(await sendPush((lang) => messagePayload(m, lang, tag), { urgency: m.important ? "high" : "normal" }));
    }
    if (Array.isArray(body?.testIds) && body.testIds.every((x) => typeof x === "string")) {
      return NextResponse.json(await sendPush(testPayload, { only: body.testIds as string[], urgency: "high" }));
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not send. Please try again." }, { status: 500 });
  }
}
