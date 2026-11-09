import type { Interests, Session } from "../types";
import { topicById } from "../data";
import { MIN, ms } from "../time";
import { travelMinutes } from "../venue";
import { conflictsWith, lateBy, LATE_TOLERANCE_MIN, sessionSlot, type Slot, type Window } from "./feasibility";

/** How far past the window start we look for the "next" talk. */
export const HORIZON_MIN = 120;
/** Recommendations must start within this many minutes of the window start. */
export const NEXT_WITHIN_MIN = 45;

export type RecommendInput = {
  day: number;
  window: { start: number; end: number };
  interests: Interests;
  favoriteSpeakers: string[];
  /** Sessions already picked; the most recent one drives "more like this". */
  likeIds: string[];
  excludeIds: string[];
};

/**
 * Elasticsearch query: filter to sessions around the free window, then score by
 * interests (per-topic boosts), similarity to the last talk (more_like_this),
 * favorite speakers, and closeness to the window start (gauss decay).
 * Named queries (_name) come back as matched_queries so we can explain "why".
 */
export function buildRecommendQuery(input: RecommendInput, index = "sessions") {
  const from = new Date(input.window.start - 45 * MIN).toISOString();
  const to = new Date(Math.min(input.window.end, input.window.start + HORIZON_MIN * MIN)).toISOString();
  const should: object[] = [
    ...Object.entries(input.interests).map(([topic, w]) => ({
      term: { topics: { value: topic, boost: 2 * w, _name: `topic:${topic}` } },
    })),
    ...input.favoriteSpeakers.map((name) => ({
      match_phrase: { "speakers.name": { query: name, boost: 4, _name: `speaker:${name}` } },
    })),
    { match_all: { boost: 0.2 } },
  ];
  if (input.likeIds.length) {
    should.push({
      more_like_this: {
        fields: ["title", "keywords"],
        like: input.likeIds.slice(-2).map((id) => ({ _index: index, _id: id })),
        min_term_freq: 1,
        min_doc_freq: 1,
        max_query_terms: 30,
        minimum_should_match: "20%",
        boost: 1.5,
        _name: "mlt",
      },
    });
  }
  return {
    size: 100,
    query: {
      function_score: {
        query: {
          bool: {
            filter: [
              { term: { day: input.day } },
              { terms: { kind: ["talk", "workshop", "keynote"] } },
              { range: { start: { gte: from, lte: to } } },
            ],
            must_not: [{ ids: { values: input.excludeIds } }],
            should,
          },
        },
        functions: [
          { gauss: { start: { origin: new Date(input.window.start).toISOString(), scale: "25m", offset: "5m", decay: 0.5 } } },
        ],
        boost_mode: "multiply",
      },
    },
  };
}

export type Candidate = { session: Session; score: number; matched: string[] };

export type Suggestion = {
  sessionId: string;
  score: number;
  reasons: string[];
  walkMinutes: number;
  lateBy: number;
  /** Earlier picks this would replace (swap options only). */
  replaces: string[];
  /** Locked personal block it overlaps (blocked options only). */
  blockedBy?: string;
  demand?: number;
};

/**
 * recommended: top 3 that fit with no changes · also: everything else that fits ·
 * swaps: talks that clash with picks you could swap out · blocked: overlap a locked personal block.
 */
export type Suggestions = { recommended: Suggestion[]; also: Suggestion[]; swaps: Suggestion[]; blocked: Suggestion[] };

/** How well a session matches your interests (sum of topic weights). */
export function interestScore(s: Session, interests: Interests) {
  return s.topics.reduce((sum, t) => sum + (interests[t] ?? 0), 0);
}

/** Simple keyword overlap between two sessions (0..1). Used when ES is unavailable. */
export function keywordSimilarity(a: Session, b: Session): number {
  const words = (s: Session) => new Set(`${s.keywords} ${s.title}`.toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length > 2));
  const wa = words(a), wb = words(b);
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  const topicShared = a.topics.filter((t) => b.topics.includes(t)).length;
  return Math.min(1, shared / Math.max(4, Math.min(wa.size, wb.size)) + 0.25 * topicShared);
}

/** Local scoring that mirrors the ES query; used as a fallback so the demo never breaks. */
export function localCandidates(all: Session[], input: RecommendInput): Candidate[] {
  const from = input.window.start - 45 * MIN;
  const to = Math.min(input.window.end, input.window.start + HORIZON_MIN * MIN);
  const like = input.likeIds.slice(-2).map((id) => all.find((s) => s.id === id)).filter(Boolean) as Session[];
  return all
    .filter((s) => s.day === input.day && s.kind !== "activity" && !input.excludeIds.includes(s.id))
    .filter((s) => ms(s.start) >= from && ms(s.start) <= to)
    .map((s) => {
      const matched: string[] = [];
      let score = 0.2;
      for (const t of s.topics) if (input.interests[t]) { score += 2 * input.interests[t]; matched.push(`topic:${t}`); }
      for (const name of input.favoriteSpeakers) if (s.speakers.some((p) => p.name.toLowerCase() === name.toLowerCase())) { score += 4; matched.push(`speaker:${name}`); }
      const sim = Math.max(0, ...like.map((l) => keywordSimilarity(l, s)));
      if (sim > 0.3) { score += 1.5 * sim * 3; matched.push("mlt"); }
      const gap = Math.max(0, (ms(s.start) - input.window.start) / MIN - 5);
      score *= Math.pow(0.5, (gap / 25) ** 2);
      return { session: s, score, matched };
    });
}

/**
 * Re-rank ES candidates against the actual timeline: drop what you can't reach,
 * penalise idle gaps / late arrival / likely-full rooms, and sort every option into
 * fits / swap (replaces earlier picks) / blocked. Talks that would replace a protected
 * pick (anything at or after a gap you're backtracking into) are left out.
 */
export function rankCandidates(
  candidates: Candidate[],
  ctx: {
    slots: Slot[];
    window: Window;
    prev?: Slot;
    demand?: Record<string, number>;
    prevTitle?: string;
    /** Picks that must not be swapped out (backtracking never touches what comes after the gap). */
    protectedIds?: Set<string>;
    /** "gap" = filling time freed by a swap; swap options must reach into the gap. */
    mode?: "forward" | "gap";
  },
): Suggestions {
  const maxScore = Math.max(1e-6, ...candidates.map((c) => c.score));
  const out: Suggestions = { recommended: [], also: [], swaps: [], blocked: [] };
  const fitting: Suggestion[] = [];

  for (const c of candidates) {
    const slot = sessionSlot(c.session);
    const conflicts = conflictsWith(ctx.slots, slot);
    const startsIn = (slot.start - ctx.window.start) / MIN;
    const walk = ctx.prev && !conflicts.some((x) => x.id === ctx.prev!.id) ? travelMinutes(ctx.prev.roomId, slot.roomId) : 0;
    const late = ctx.prev && !conflicts.length ? Math.max(0, lateBy(ctx.prev, slot)) : 0;
    const demand = ctx.demand?.[c.session.id];

    let score = (c.score / maxScore) * 10;
    score -= Math.max(0, startsIn) * 0.03;
    score -= late * 0.4;
    if (demand && demand > 1) score -= 1.5;

    const reasons: string[] = [];
    for (const m of c.matched) {
      if (m.startsWith("topic:")) reasons.push(`Matches ${topicById.get(m.slice(6))?.label ?? m.slice(6)}`);
      else if (m.startsWith("speaker:")) reasons.push(`You follow ${m.slice(8)}`);
      else if (m === "mlt") reasons.push(ctx.prevTitle ? `Similar to "${ctx.prevTitle}"` : "Similar to your picks");
    }
    if (walk) reasons.push(`${walk} min walk`);
    if (late > 0 && late <= LATE_TOLERANCE_MIN) reasons.push(`You'd arrive ~${late} min late`);
    if (demand && demand > 0.9) reasons.push("Likely to fill up — arrive early");

    const sug: Suggestion = {
      sessionId: c.session.id,
      score: Math.round(score * 100) / 100,
      reasons,
      walkMinutes: walk,
      lateBy: late,
      replaces: [],
      demand,
    };
    if (!conflicts.length) {
      if (slot.start >= ctx.window.start - LATE_TOLERANCE_MIN * MIN && slot.end <= ctx.window.end + LATE_TOLERANCE_MIN * MIN) {
        fitting.push({ ...sug, score: startsIn <= NEXT_WITHIN_MIN ? sug.score : sug.score - 3 });
      }
      continue;
    }
    const locked = conflicts.find((x) => x.locked);
    if (locked) {
      out.blocked.push({ ...sug, blockedBy: locked.title });
      continue;
    }
    if (conflicts.some((x) => ctx.protectedIds?.has(x.id))) continue;
    // going further back: the swap must end near (or inside) the gap, otherwise it frees nothing useful
    if (ctx.mode === "gap" && slot.end < ctx.window.start - 20 * MIN) continue;
    out.swaps.push({ ...sug, replaces: conflicts.map((x) => x.id) });
  }

  fitting.sort((a, b) => b.score - a.score);
  out.recommended = fitting.slice(0, 3);
  out.also = fitting.slice(3);
  // Keep a spread of start times (same-time alternatives AND the ones starting later), not just the top scores.
  out.swaps.sort((a, b) => b.score - a.score);
  const perStart = new Map<number, number>();
  out.swaps = out.swaps.filter((s) => {
    const t = ms(candidates.find((c) => c.session.id === s.sessionId)!.session.start);
    const n = perStart.get(t) ?? 0;
    perStart.set(t, n + 1);
    return n < 4;
  }).slice(0, 20);
  out.blocked = out.blocked.slice(0, 4);
  return out;
}
