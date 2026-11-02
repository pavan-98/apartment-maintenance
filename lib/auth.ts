import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { AdminUser, DB, Role } from "./types";

export const COOKIE = "apt_admin";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Main admin password from env. In local development it defaults to "admin". */
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

/** Is this the main admin password? */
export function checkPassword(input: string): boolean {
  const p = adminPassword();
  if (!p) return false;
  const a = createHmac("sha256", "cmp").update(input).digest();
  const b = createHmac("sha256", "cmp").update(p).digest();
  return timingSafeEqual(a, b);
}

/* ---------- manager passwords (scrypt) ---------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 32).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const test = scryptSync(password, salt, 32).toString("base64url");
  return safeEqual(test, hash);
}

/** Find the active manager with this name and password. */
export function findManager(db: DB, name: string, password: string): AdminUser | null {
  const u = db.users.find((x) => x.active && x.name.trim().toLowerCase() === name.trim().toLowerCase());
  return u && verifyPassword(password, u.passwordHash) ? u : null;
}

/* ---------- login cookie ---------- */

export interface Claims {
  name: string;
  role: Role;
  userId?: string;
  ver?: number;
}

export interface Session {
  name: string;
  role: Role;
  userId?: string;
}

export function makeToken(c: Claims, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + MAX_AGE;
  const payload = [Buffer.from(c.name).toString("base64url"), c.role, c.userId ?? "", c.ver ?? 0, exp].join(".");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined, now = Date.now()): Claims | null {
  if (!token || !adminPassword()) return null;
  const parts = token.split(".");
  if (parts.length !== 6) return null;
  const [n, role, userId, ver, exp, sig] = parts;
  if (!safeEqual(sig, sign(parts.slice(0, 5).join(".")))) return null;
  if (Number(exp) * 1000 < now) return null;
  if (role !== "owner" && role !== "manager") return null;
  try {
    return { name: Buffer.from(n, "base64url").toString("utf8") || "Admin", role, userId: userId || undefined, ver: Number(ver) };
  } catch {
    return null;
  }
}

/** Login claims from the cookie (not yet checked against the database). */
export async function readClaims(): Promise<Claims | null> {
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE)?.value);
}

/**
 * Turn claims into a session. A manager's login stops working as soon as they
 * are removed, paused, or their password is changed.
 */
export function resolveSession(claims: Claims | null, db: DB): Session | null {
  if (!claims) return null;
  if (claims.role === "owner") return { name: claims.name, role: "owner" };
  const u = db.users.find((x) => x.id === claims.userId);
  if (!u || !u.active || u.sessionVersion !== claims.ver) return null;
  return { name: u.name, role: "manager", userId: u.id };
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};
