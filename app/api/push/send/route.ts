import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sendNoticePush, sendPush, vapidKeys } from "@/lib/pushSend";
import { messagePayload, parseMessage, testPayload } from "@/lib/push";
import { auditPush } from "@/lib/pushAudit";
import { noticeTitle } from "@/lib/actions";
import { activeNotices } from "@/lib/whatsapp";

const plural = (n: number) => `${n} device${n === 1 ? "" : "s"}`;

/**
 * Admin: send a notification to subscribed devices. The body is one of:
 * - { noticeId }            a current notice, to every device
 * - { message }             a custom message (titles/bodies in English and Telugu), to every device
 * - { testIds: [id, ...] }  a test notification to the chosen devices
 * Notices and messages are recorded in the edit history.
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
      const r = await sendNoticePush(n);
      await auditPush(session, "Notification sent", `Notice: ${noticeTitle(n)} · to ${plural(r.sent)}`);
      return NextResponse.json(r);
    }
    if (body?.message !== undefined) {
      const m = parseMessage(body.message);
      if (typeof m === "string") return NextResponse.json({ error: m }, { status: 400 });
      const tag = `msg-${Date.now().toString(36)}`;
      const r = await sendPush((lang) => messagePayload(m, lang, tag), { urgency: m.important ? "high" : "normal" });
      await auditPush(session, "Notification sent", `${m.titleEn || m.titleTe} · to ${plural(r.sent)}`);
      return NextResponse.json(r);
    }
    if (Array.isArray(body?.testIds) && body.testIds.length <= 500 && body.testIds.every((x) => typeof x === "string")) {
      // A test is only useful now: don't deliver it hours later.
      return NextResponse.json(await sendPush(testPayload, { only: body.testIds as string[], urgency: "high", ttl: 60 * 60 }));
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not send. Please try again." }, { status: 500 });
  }
}
