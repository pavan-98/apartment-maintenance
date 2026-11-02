import { NextResponse } from "next/server";
import { loadDB, storageName } from "@/lib/store";
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
    return NextResponse.json({ error: "Could not load data. Storage is not set up yet." }, { status: 500 });
  }
}
