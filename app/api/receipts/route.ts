import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { saveReceipt } from "@/lib/store";

const MAX = 900_000; // ~650 KB image after base64

export async function POST(req: Request) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Please log in again" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { dataUrl?: string };
  const dataUrl = String(body.dataUrl ?? "");
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    return NextResponse.json({ error: "Please upload a photo (JPG/PNG)" }, { status: 400 });
  }
  if (dataUrl.length > MAX) return NextResponse.json({ error: "Photo is too large" }, { status: 413 });
  const id = crypto.randomUUID();
  await saveReceipt(id, dataUrl);
  return NextResponse.json({ id });
}
