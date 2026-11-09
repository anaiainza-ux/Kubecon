import { NextResponse } from "next/server";
import { es, INDEX } from "@/lib/es";
import { getSession, sessions, withSeries } from "@/lib/data";
import { dayEnd, ms } from "@/lib/time";
import { buildGapfillQuery, gapWindow, rankGapfill } from "@/lib/scheduler/gapfill";
import type { Interests, Session } from "@/lib/types";

type Body = {
  day: number;
  now: number;
  currentRoom: string;
  nextId?: string | null;
  excludeIds: string[];
  interests: Interests;
  lunchTheme?: string | null;
};

/** Fill the gap after a missed or full session: joinable talks + open activities, ranked by interest and distance. */
export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  body.excludeIds = withSeries(body.excludeIds);
  const next = body.nextId ? getSession(body.nextId) : undefined;
  const window = gapWindow(body.now, next ? { start: ms(next.start), roomId: next.roomId } : undefined, body.currentRoom, dayEnd(body.day));

  let candidates: Session[];
  let full = new Set<string>();
  let source = "elasticsearch";
  try {
    const q = buildGapfillQuery(body.day, window, body.excludeIds);
    const r = await es().search<Session>({ index: INDEX.sessions, ...(q as object) });
    candidates = r.hits.hits.map((h) => getSession(h._id!)!).filter(Boolean);
  } catch {
    source = "local";
    candidates = sessions.filter((s) => s.day === body.day && !body.excludeIds.includes(s.id));
    full = new Set();
  }
  const suggestions = rankGapfill(candidates, { now: body.now, window, currentRoom: body.currentRoom, interests: body.interests, full, lunchTheme: body.lunchTheme });
  return NextResponse.json({ window, suggestions, source });
}
