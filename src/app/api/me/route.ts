import { NextResponse } from "next/server";
import { getAttendee, saveAttendee } from "@/lib/server/store";
import type { Attendee } from "@/lib/types";

export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  return NextResponse.json({ attendee: await getAttendee(userId) });
}

export async function PUT(req: Request) {
  const a = (await req.json()) as Attendee;
  if (!a.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  try {
    await saveAttendee(a);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
