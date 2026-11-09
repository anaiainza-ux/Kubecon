import { NextResponse } from "next/server";
import { es, INDEX } from "@/lib/es";
import { getSession, sessions, withSeries } from "@/lib/data";
import { ms } from "@/lib/time";
import { blockSlot, sessionSlot, slotBefore } from "@/lib/scheduler/feasibility";
import { buildRecommendQuery, localCandidates, rankCandidates, type Candidate } from "@/lib/scheduler/recommend";
import { getDemand } from "@/lib/server/store";
import type { Block, Interests, Session } from "@/lib/types";

type Body = {
  day: number;
  window: { start: number; end: number };
  interests: Interests;
  favoriteSpeakers: string[];
  plan: string[];
  /** Picks on all days. */
  taken?: string[];
  blocks: Block[];
  /** "gap" when backtracking into time freed by a swap. */
  mode?: "forward" | "gap";
  /** Talks to find similar options to (in gap mode: the ones you just swapped out). */
  likeIds?: string[];
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const slots = [...body.plan.map((id) => sessionSlot(getSession(id)!)), ...body.blocks.filter((b) => b.day === body.day).map(blockSlot)];
  const prev = slotBefore(slots, body.window.start + 60_000);
  const prevSession = prev?.kind === "session" ? getSession(prev.id) : undefined;
  const likeIds = body.likeIds?.length ? body.likeIds : prevSession ? [prevSession.id] : [];
  const input = {
    day: body.day,
    window: body.window,
    interests: body.interests,
    favoriteSpeakers: body.favoriteSpeakers,
    likeIds,
    // skip anything already picked on any day, including repeats of it
    excludeIds: withSeries([...body.plan, ...(body.taken ?? [])]),
  };
  // Backtracking never swaps out what's at or after the gap.
  const protectedIds = body.mode === "gap" ? new Set(body.plan.filter((id) => ms(getSession(id)!.start) >= body.window.end)) : undefined;

  let candidates: Candidate[];
  let source = "elasticsearch";
  let demand: Record<string, number> = {};
  try {
    const q = buildRecommendQuery(input, INDEX.sessions);
    const [r, d] = await Promise.all([es().search<Session>({ index: INDEX.sessions, ...(q as object) }), getDemand()]);
    demand = d;
    candidates = r.hits.hits.map((h) => ({
      session: getSession(h._id!)!,
      score: h._score ?? 0,
      matched: Array.isArray(h.matched_queries) ? h.matched_queries : Object.keys(h.matched_queries ?? {}),
    }));
  } catch {
    source = "local";
    candidates = localCandidates(sessions, input);
  }

  const likeTitle = body.likeIds?.length ? getSession(body.likeIds[0])?.title : prevSession?.title;
  const window = { start: body.window.start, end: body.window.end, prev };
  const result = rankCandidates(candidates.filter((c) => c.session), { slots, window, prev, demand, prevTitle: likeTitle, protectedIds, mode: body.mode });
  return NextResponse.json({ ...result, source, prevId: prev?.id ?? null });
}
