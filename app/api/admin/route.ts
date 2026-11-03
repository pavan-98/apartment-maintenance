import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { updateDB } from "@/lib/store";
import { getSession, viewFor } from "@/lib/session";
import { applyAction, ActionError, type Action } from "@/lib/actions";
import { checkPermission } from "@/lib/permissions";

export async function POST(req: Request) {
  const { session } = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { action?: Action } | null;
  if (!body?.action || typeof body.action.type !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  let action = body.action;

  // Manager passwords are hashed here; the hash never goes back to the browser.
  if (action.type === "user.add" || action.type === "user.resetPassword") {
    const pw = String(action.password ?? "");
    if (pw.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    action = { ...action, password: undefined, passwordHash: hashPassword(pw) };
  } else if ("passwordHash" in action) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const by = session.role === "manager" ? `${session.name} (manager)` : session.name;
  try {
    const db = await updateDB((cur) => {
      const denied = checkPermission(cur, session.role, action);
      if (denied) throw new ActionError(denied);
      return applyAction(cur, action, by);
    });
    return NextResponse.json({ db: viewFor(db, session), admin: session.name, role: session.role });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
}
