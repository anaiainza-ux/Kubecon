import type { Block, Session } from "../types";
import { MIN, ms } from "../time";
import { ANYWHERE, OFFSITE, travelMinutes } from "../venue";

/** Arriving up to this many minutes late is allowed, but flagged in the UI. */
export const LATE_TOLERANCE_MIN = 5;
/** Activities (lunch, expo…) are drop-in: arriving or leaving up to this late is fine. */
export const FLEXIBLE_TOLERANCE_MIN = 30;
/** Free windows shorter than this are not worth filling. */
export const MIN_WINDOW_MIN = 15;

/** Everything the scheduler places on a timeline: talks, tutorials and personal blocks. */
export type Slot = {
  id: string;
  start: number;
  end: number;
  roomId: string;
  locked: boolean;
  kind: "session" | "block";
  title: string;
  /** Drop-in activity with soft start/end times. */
  flexible?: boolean;
};

export const sessionSlot = (s: Session): Slot => ({
  id: s.id,
  start: ms(s.start),
  end: ms(s.end),
  roomId: s.roomId,
  locked: false,
  kind: "session",
  title: s.title,
  flexible: s.kind === "activity",
});

export const blockSlot = (b: Block): Slot => ({
  id: b.id,
  start: ms(b.start),
  end: ms(b.end),
  roomId: b.offsite ? OFFSITE : ANYWHERE,
  locked: true,
  kind: "block",
  title: b.title,
});

/** Minutes late you'd be for `next` after leaving `prev` (negative = early). */
export function lateBy(prev: Slot, next: Slot): number {
  const arrive = prev.end + travelMinutes(prev.roomId, next.roomId) * MIN;
  return Math.round((arrive - next.start) / MIN);
}

/** True when two slots overlap, or there is not enough time to walk between them. */
export function clashes(a: Slot, b: Slot): boolean {
  if (a.id === b.id) return false;
  const [first, second] = a.start <= b.start ? [a, b] : [b, a];
  if (first.flexible || second.flexible) return lateBy(first, second) > FLEXIBLE_TOLERANCE_MIN;
  if (second.start < first.end) return true;
  return lateBy(first, second) > LATE_TOLERANCE_MIN;
}

export const conflictsWith = (slots: Slot[], s: Slot) => slots.filter((x) => clashes(x, s));
export const fits = (slots: Slot[], s: Slot) => conflictsWith(slots, s).length === 0;

export const sortSlots = (slots: Slot[]) => [...slots].sort((a, b) => a.start - b.start || a.end - b.end);

export type Window = { start: number; end: number; prev?: Slot; next?: Slot };

/** Gaps between scheduled slots within [from, to], at least `minMinutes` long. */
export function freeWindows(slots: Slot[], from: number, to: number, minMinutes = MIN_WINDOW_MIN): Window[] {
  const sorted = sortSlots(slots);
  const windows: Window[] = [];
  let cursor = from;
  let prev: Slot | undefined;
  for (const s of sorted) {
    if (s.end <= from) { prev = s; continue; }
    if (s.start >= to) break;
    if (s.start - cursor >= minMinutes * MIN) windows.push({ start: cursor, end: s.start, prev, next: s });
    if (s.end > cursor) { cursor = s.end; prev = s; }
  }
  if (to - cursor >= minMinutes * MIN) windows.push({ start: cursor, end: to, prev });
  return windows;
}

/** The slot just before time t (by end time), if any. */
export function slotBefore(slots: Slot[], t: number): Slot | undefined {
  return sortSlots(slots).filter((s) => s.end <= t).at(-1);
}
