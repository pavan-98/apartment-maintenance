import { NextResponse } from "next/server";
import { loadBook, updateBook } from "@/lib/store";
import { getSession } from "@/lib/session";
import { ActionError } from "@/lib/actions";
import { applyBookAction, BookConflict, checkBookPermission, type BookAction } from "@/lib/book";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Offline book pages — admins and managers only. */
export async function GET() {
  try {
    const { session } = await getSession();
    if (!session) return NextResponse.json({ error: "Please log in again" }, { status: 401, headers: NO_STORE });
    return NextResponse.json({ book: await loadBook() }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not load the book pages. Please try again." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  const { db, session } = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { action?: BookAction } | null;
  const action = body?.action;
  if (!action || typeof action.type !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const by = session.role === "manager" ? `${session.name} (manager)` : session.name;
  try {
    const book = await updateBook((cur) => {
      const denied = checkBookPermission(cur, session.role, action);
      if (denied) throw new ActionError(denied);
      return applyBookAction(cur, db, action, by);
    });
    return NextResponse.json({ book }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof BookConflict) return NextResponse.json({ error: e.message, conflict: true }, { status: 409 });
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
}
