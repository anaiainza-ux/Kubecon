import { NextResponse } from "next/server";
import { es, INDEX } from "@/lib/es";
import { getFullSessionIds } from "@/lib/server/store";

/** Mark a session full (or open again). In a real deployment room staff or door counters would call this. */
export async function POST(req: Request) {
  const { sessionId, status } = (await req.json()) as { sessionId: string; status: "full" | "open" };
  try {
    await es().update({ index: INDEX.sessions, id: sessionId, doc: { status }, refresh: "wait_for" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}

export async function GET() {
  try {
    return NextResponse.json({ full: await getFullSessionIds() });
  } catch {
    return NextResponse.json({ full: [] });
  }
}
