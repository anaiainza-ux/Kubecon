import type { Interests, Session } from "../types";
import { MIN, ms } from "../time";
import { travelMinutes } from "../venue";
import { interestScore } from "./recommend";

/** You can still slip into a talk that started this many minutes ago. */
export const JOIN_LATE_MIN = 10;
/** Don't suggest anything that leaves you less than this long there. */
const MIN_STAY_MIN = 10;

export type GapWindow = { start: number; end: number };

export type GapSuggestion = {
  sessionId: string;
  kind: "join-late" | "talk" | "activity";
  score: number;
  walkMinutes: number;
  /** When you'd get there and how long you could stay. */
  arriveAt: number;
  stayMinutes: number;
  note: string;
};

/**
 * Window to fill after missing a session (or finding it full): from now until
 * you must leave for your next planned item.
 */
export function gapWindow(now: number, next: { start: number; roomId: string } | undefined, currentRoom: string, dayEndMs: number): GapWindow {
  if (!next) return { start: now, end: dayEndMs };
  return { start: now, end: next.start - travelMinutes(currentRoom, next.roomId) * MIN };
}

/** ES filter for gap-fill candidates (talks joinable now or fitting the window, plus open activities). */
export function buildGapfillQuery(day: number, window: GapWindow, excludeIds: string[]) {
  const iso = (t: number) => new Date(t).toISOString();
  return {
    size: 100,
    query: {
      bool: {
        filter: [{ term: { day } }],
        must_not: [{ ids: { values: excludeIds } }, { term: { status: "full" } }],
        should: [
          // talks you can still join, or that start and finish inside the window
          {
            bool: {
              filter: [
                { terms: { kind: ["talk", "workshop", "keynote"] } },
                { range: { start: { gte: iso(window.start - JOIN_LATE_MIN * MIN), lte: iso(window.end - 15 * MIN) } } },
                { range: { end: { lte: iso(window.end + 5 * MIN) } } },
              ],
            },
          },
          // activities open during the window
          {
            bool: {
              filter: [
                { term: { kind: "activity" } },
                { range: { start: { lt: iso(window.end) } } },
                { range: { end: { gt: iso(window.start + MIN_STAY_MIN * MIN) } } },
              ],
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
  };
}

const FUN: Record<string, number> = { social: 1.5, merch: 1.2, expo: 1.3, food: 1, lunch: 1.4 };

export function rankGapfill(
  candidates: Session[],
  ctx: { now: number; window: GapWindow; currentRoom: string; interests: Interests; full: Set<string>; lunchTheme?: string | null },
): GapSuggestion[] {
  const out: GapSuggestion[] = [];
  for (const s of candidates) {
    if (ctx.full.has(s.id)) continue;
    const walk = travelMinutes(ctx.currentRoom, s.roomId);
    const arriveAt = ctx.now + walk * MIN;
    const start = ms(s.start), end = ms(s.end);
    const stayEnd = Math.min(end, ctx.window.end);
    const stay = Math.round((stayEnd - Math.max(arriveAt, start)) / MIN);
    if (stay < MIN_STAY_MIN) continue;

    let kind: GapSuggestion["kind"];
    let note: string;
    let score: number;
    const interest = interestScore(s, ctx.interests);
    if (s.kind === "activity") {
      // only things open now or opening within ~20 min of arriving
      if (start > arriveAt + 20 * MIN || end < arriveAt) continue;
      kind = "activity";
      note = `Open now · ${stay} min before you need to leave`;
      score = 2 + (FUN[s.activityType ?? ""] ?? 1) + interest * (s.activityType === "lunch" ? 1.5 : 0);
      if (s.activityType === "lunch" && ctx.lunchTheme && s.topics.includes(ctx.lunchTheme)) score += 3;
    } else if (start < arriveAt) {
      const lateMin = Math.round((arriveAt - start) / MIN);
      if (lateMin > JOIN_LATE_MIN || end > ctx.window.end + 5 * MIN) continue;
      kind = "join-late";
      note = `Started ${lateMin} min before you'd arrive — you can still slip in`;
      score = 3 + interest * 2 - lateMin * 0.2;
    } else {
      if (end > ctx.window.end + 5 * MIN) continue;
      kind = "talk";
      note = `Starts in ${Math.round((start - ctx.now) / MIN)} min`;
      score = 3 + interest * 2 - ((start - arriveAt) / MIN) * 0.05;
    }
    score -= walk * 0.15;
    out.push({ sessionId: s.id, kind, score: Math.round(score * 100) / 100, walkMinutes: walk, arriveAt, stayMinutes: stay, note });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}
