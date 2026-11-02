import { NextResponse } from "next/server";
import { loadDB, storageName } from "@/lib/store";
import { adminPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Setup check: open /api/health after deploying to confirm everything is connected. */
export async function GET() {
  const storage = storageName();
  let database = "ok";
  try {
    await loadDB();
  } catch (e) {
    database = e instanceof Error ? e.message : "error";
  }
  const adminPasswordSet = !!process.env.ADMIN_PASSWORD;
  const ok = database === "ok" && (storage === "redis" || !process.env.VERCEL) && !!adminPassword();
  return NextResponse.json(
    {
      ok,
      storage: storage === "redis" ? "Upstash Redis (connected)" : storage === "file" ? "Local file (development only)" : "NOT CONNECTED",
      database,
      adminPassword: adminPasswordSet ? "set" : process.env.NODE_ENV === "production" ? "MISSING — add ADMIN_PASSWORD" : "not set (dev default: admin)",
    },
    { status: ok ? 200 : 500, headers: { "Cache-Control": "no-store" } },
  );
}
