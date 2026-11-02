import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const COOKIE = "apt_admin";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Admin password from env. In local development it defaults to "admin". */
export function adminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD;
  if (p) return p;
  return process.env.NODE_ENV === "production" ? null : "admin";
}

function secret(): string {
  return (process.env.AUTH_SECRET || "") + "|" + (adminPassword() || "");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPassword(input: string): boolean {
  const p = adminPassword();
  if (!p) return false;
  const a = createHmac("sha256", "cmp").update(input).digest();
  const b = createHmac("sha256", "cmp").update(p).digest();
  return timingSafeEqual(a, b);
}

export function makeToken(name: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + MAX_AGE;
  const payload = `${Buffer.from(name).toString("base64url")}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined, now = Date.now()): string | null {
  if (!token || !adminPassword()) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [n, exp, sig] = parts;
  if (!safeEqual(sig, sign(`${n}.${exp}`))) return null;
  if (Number(exp) * 1000 < now) return null;
  try {
    return Buffer.from(n, "base64url").toString("utf8") || "Admin";
  } catch {
    return null;
  }
}

/** Name of the logged-in admin, or null. */
export async function currentAdmin(): Promise<string | null> {
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE)?.value);
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};
