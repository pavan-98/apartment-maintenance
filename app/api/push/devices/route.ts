import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listDevices, removeDevice, restoreDevice, vapidKeys } from "@/lib/pushSend";

export const dynamic = "force-dynamic";

/** Admin: subscribed devices, and devices an admin removed. */
export async function GET() {
  const { session } = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again" }, { status: 401 });
  try {
    return NextResponse.json({ enabled: !!vapidKeys(), ...(await listDevices()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not load. Please try again." }, { status: 500 });
  }
}

async function readId(req: Request, field: "id" | "restore"): Promise<string | null> {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = body?.[field];
  return typeof id === "string" && id.length <= 64 ? id : null;
}

/** Admin: stop sending to a device. It moves to the removed list and can be added back. */
export async function DELETE(req: Request) {
  const { session } = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again" }, { status: 401 });
  const id = await readId(req, "id");
  if (!id) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!(await removeDevice(id))) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Admin: add a removed device back ({ restore: id }). */
export async function POST(req: Request) {
  const { session } = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again" }, { status: 401 });
  const id = await readId(req, "restore");
  if (!id) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!(await restoreDevice(id))) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
