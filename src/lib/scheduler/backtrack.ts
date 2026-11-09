import type { Block, Session } from "../types";
import { dayEnd, dayStart, MIN, ms } from "../time";
import { blockSlot, clashes, fits, freeWindows, sessionSlot, type Window } from "./feasibility";

/**
 * Backtracking: when you pick a talk that clashes with earlier picks, those picks are swapped out
 * and the time they freed BEFORE the new talk becomes the next thing to fill. From there you can
 * fill the gap, or go further back (pick something that replaces the pick before it), which frees
 * the next gap, and so on. Nothing at or after the talk you just picked is ever touched, so the
 * rest of a built schedule never unravels.
 */

/** Freed gaps shorter than this aren't worth filling. */
export const MIN_GAP_MIN = 10;

export type SwapResult =
  | { status: "blocked"; blockedBy: { id: string; title: string } }
  | {
      status: "ok";
      plan: string[];
      /** Earlier picks removed to make room. */
      displaced: string[];
      /** Free time right before the new pick that the swap opened up (fill this next). */
      gapBefore: Window | null;
      /** Free time right after the new pick, up to your next planned item. */
      gapAfter: Window | null;
    };

const windowsFor = (day: number, plan: string[], blocks: Block[], byId: (id: string) => Session) =>
  freeWindows([...plan.map((id) => sessionSlot(byId(id))), ...blocks.filter((b) => b.day === day).map(blockSlot)], dayStart(day), dayEnd(day), MIN_GAP_MIN);

/**
 * Put `newId` into the day's plan, swapping out whatever it clashes with (plus `forceOut`, e.g. the
 * talk you tapped to replace). Locked personal blocks never move.
 */
export function placeWithSwap(day: number, plan: string[], blocks: Block[], newId: string, byId: (id: string) => Session, forceOut: string[] = []): SwapResult {
  const x = byId(newId);
  const xs = sessionSlot(x);
  const blocker = blocks.filter((b) => b.day === day).map(blockSlot).find((b) => clashes(b, xs));
  if (blocker) return { status: "blocked", blockedBy: { id: blocker.id, title: blocker.title } };

  const displaced = plan.filter((id) => id !== newId && (forceOut.includes(id) || clashes(sessionSlot(byId(id)), xs)));
  const next = [...plan.filter((id) => id !== newId && !displaced.includes(id)), newId];
  const windows = windowsFor(day, next, blocks, byId);
  const freedBefore = displaced.some((id) => ms(byId(id).start) < xs.start);
  const freedAfter = displaced.some((id) => ms(byId(id).end) > xs.end);
  return {
    status: "ok",
    plan: next,
    displaced,
    gapBefore: freedBefore ? windows.find((w) => w.end === xs.start) ?? null : null,
    gapAfter: freedAfter ? windows.find((w) => w.start === xs.end && w.next) ?? null : null,
  };
}

/** Free time left inside `within` on either side of a session you just placed there. */
export function leftoverGaps(day: number, plan: string[], blocks: Block[], placed: Session, within: { start: number; end: number }, byId: (id: string) => Session) {
  const windows = windowsFor(day, plan, blocks, byId).filter((w) => w.start >= within.start - MIN && w.end <= within.end + MIN);
  return {
    before: windows.find((w) => w.end === ms(placed.start)) ?? null,
    after: windows.find((w) => w.start === ms(placed.end)) ?? null,
  };
}

/** A repeat of this session (same title, another time) that fits your plan without changes. */
export function repeatThatFits(s: Session, plans: Record<number, string[]>, blocks: Block[], all: Session[]): Session | null {
  const taken = new Set(Object.values(plans).flat());
  for (const r of all) {
    if (r.id === s.id || r.seriesId !== s.seriesId || taken.has(r.id)) continue;
    const slots = [...(plans[r.day] ?? []).map((id) => sessionSlot(all.find((x) => x.id === id)!)), ...blocks.filter((b) => b.day === r.day).map(blockSlot)];
    if (fits(slots, sessionSlot(r))) return r;
  }
  return null;
}
