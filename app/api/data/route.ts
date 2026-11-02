import { NextResponse } from "next/server";
import { loadDB, storageName, StorageNotConfigured } from "@/lib/store";
import { publicView } from "@/lib/actions";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [db, admin] = await Promise.all([loadDB(), currentAdmin()]);
    return NextResponse.json(
      { db: admin ? db : publicView(db), admin, storage: storageName() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error(e);
    const msg = e instanceof StorageNotConfigured ? e.message : "Could not load data. Please try again in a minute.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
