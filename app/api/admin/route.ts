import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { updateDB } from "@/lib/store";
import { applyAction, ActionError, type Action } from "@/lib/actions";

export async function POST(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Please log in again" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { action?: Action } | null;
  if (!body?.action || typeof body.action.type !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  try {
    const db = await updateDB((cur) => applyAction(cur, body.action as Action, admin));
    return NextResponse.json({ db, admin });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
}
