import { NextResponse } from "next/server";
import { adminPassword, checkPassword, COOKIE, cookieOptions, makeToken } from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; password?: string };
  if (!adminPassword()) {
    return NextResponse.json({ error: "Admin password is not set on the server (ADMIN_PASSWORD)." }, { status: 503 });
  }
  const name = String(body.name ?? "").trim().slice(0, 40);
  if (!name) return NextResponse.json({ error: "Please enter your name" }, { status: 400 });
  if (!checkPassword(String(body.password ?? ""))) {
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, admin: name });
  res.cookies.set(COOKIE, makeToken(name), cookieOptions);
  return res;
}
