import { NextResponse } from "next/server";
import { adminPassword, checkPassword, COOKIE, cookieOptions, findManager, makeToken } from "@/lib/auth";
import { loadDB, updateDB } from "@/lib/store";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; password?: string };
  if (!adminPassword()) {
    return NextResponse.json({ error: "Admin password is not set on the server (ADMIN_PASSWORD)." }, { status: 503 });
  }
  const name = String(body.name ?? "").trim().slice(0, 40);
  const password = String(body.password ?? "");
  if (!name) return NextResponse.json({ error: "Please enter your name" }, { status: 400 });

  // Main admin: the ADMIN_PASSWORD set in Vercel.
  if (checkPassword(password)) {
    const res = NextResponse.json({ ok: true, admin: name, role: "owner" });
    res.cookies.set(COOKIE, makeToken({ name, role: "owner" }), cookieOptions);
    return res;
  }

  // Manager: name + their own password.
  const db = await loadDB();
  const manager = findManager(db, name, password);
  if (!manager) {
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Wrong name or password" }, { status: 401 });
  }
  await updateDB((cur) => ({
    ...cur,
    users: cur.users.map((u) => (u.id === manager.id ? { ...u, lastLoginAt: new Date().toISOString() } : u)),
  })).catch(() => undefined);
  const res = NextResponse.json({ ok: true, admin: manager.name, role: "manager" });
  res.cookies.set(COOKIE, makeToken({ name: manager.name, role: "manager", userId: manager.id, ver: manager.sessionVersion }), cookieOptions);
  return res;
}
