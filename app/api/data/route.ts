import { NextResponse } from "next/server";
import { storageName, StorageNotConfigured } from "@/lib/store";
import { getSession, viewFor } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db, session } = await getSession();
    return NextResponse.json(
      { db: viewFor(db, session), admin: session?.name ?? null, role: session?.role ?? null, storage: storageName() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error(e);
    const msg = e instanceof StorageNotConfigured ? e.message : "Could not load data. Please try again in a minute.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
