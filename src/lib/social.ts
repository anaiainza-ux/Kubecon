import type { Attendee, Session } from "./types";
import { conference, roomById, sessions, zoneById } from "./data";
import { at, dayEnd, fmtTime, MIN, ms } from "./time";
import { blockSlot, freeWindows, sessionSlot, sortSlots, type Slot } from "./scheduler/feasibility";

const byId = new Map(sessions.map((s) => [s.id, s]));

export type ShareView = Pick<Attendee, "userId" | "name" | "interests" | "lunchOptIn" | "lunchTheme" | "plans" | "blocks">;

export type Meetup =
  | { type: "same-session"; day: number; start: number; sessionId: string; text: string }
  | { type: "both-free"; day: number; start: number; end: number; place: string; text: string }
  | { type: "same-area"; day: number; start: number; place: string; text: string };

export type LunchMatch = { day: number; topic: string; sessionId: string; text: string };

const daysIn = (scope: "day" | "event", today: number) => (scope === "day" ? [today] : conference.days.map((d) => d.day));

export function commonSessions(a: ShareView, b: ShareView, days: number[]): string[] {
  return days.flatMap((d) => {
    const bs = new Set(b.plans[d]?.sessionIds ?? []);
    return (a.plans[d]?.sessionIds ?? []).filter((id) => bs.has(id));
  });
}

const slotsFor = (v: ShareView, day: number): Slot[] => [
  ...(v.plans[day]?.sessionIds ?? []).map((id) => sessionSlot(byId.get(id)!)),
  ...v.blocks.filter((b) => b.day === day).map(blockSlot),
];

/** Where two people coming from different rooms should meet. */
function meetingPlace(a?: Slot, b?: Slot): string {
  const za = a && roomById.get(a.roomId)?.zone;
  const zb = b && roomById.get(b.roomId)?.zone;
  if (za && za === zb) return `the ${zoneById.get(za)?.label} concourse`;
  return "the Hallway Track Lounge (Main Lobby)";
}

/** Future moments the two of you could meet: same talk, overlapping free time, or finishing next to each other. */
export function meetupOpportunities(a: ShareView, b: ShareView, now: number, scope: "day" | "event", today: number): Meetup[] {
  const out: Meetup[] = [];
  for (const day of daysIn(scope, today)) {
    const from = Math.max(now, at(day, "09:00"));
    const to = dayEnd(day);
    if (from >= to) continue;
    for (const id of commonSessions(a, b, [day])) {
      const s = byId.get(id)!;
      if (ms(s.start) >= now) out.push({ type: "same-session", day, start: ms(s.start), sessionId: id, text: `You'll both be at "${s.title}" (${fmtTime(s.start)})` });
    }
    const sa = slotsFor(a, day), sb = slotsFor(b, day);
    const wa = freeWindows(sa, from, to, 15);
    const wb = freeWindows(sb, from, to, 15);
    for (const x of wa) for (const y of wb) {
      const start = Math.max(x.start, y.start), end = Math.min(x.end, y.end);
      if (end - start >= 15 * MIN) {
        const place = meetingPlace(x.prev, y.prev);
        out.push({ type: "both-free", day, start, end, place, text: `You're both free ${fmtTime(start)}–${fmtTime(end)} — meet at ${place}` });
      }
    }
    // finishing within 10 min of each other in the same wing → grab a coffee
    for (const x of sortSlots(sa)) for (const y of sortSlots(sb)) {
      if (x.kind !== "session" || y.kind !== "session" || x.id === y.id || x.end < now) continue;
      const za = roomById.get(x.roomId)?.zone, zb = roomById.get(y.roomId)?.zone;
      if (za && za === zb && Math.abs(x.end - y.end) <= 10 * MIN) {
        out.push({ type: "same-area", day, start: Math.max(x.end, y.end), place: zoneById.get(za)!.label, text: `You both finish in the ${zoneById.get(za)!.label} around ${fmtTime(Math.max(x.end, y.end))} — grab a coffee` });
      }
    }
  }
  return out.sort((p, q) => p.start - q.start).slice(0, 12);
}

/** Suggest a themed lunch table when both opted in and share a theme (or a top interest). */
export function lunchMatch(a: ShareView, b: ShareView, now: number, scope: "day" | "event", today: number): LunchMatch[] {
  if (!a.lunchOptIn || !b.lunchOptIn) return [];
  let topic: string | null = null;
  let why = "";
  if (a.lunchTheme && a.lunchTheme === b.lunchTheme) {
    topic = a.lunchTheme;
    why = "you both picked this lunch theme";
  } else {
    const shared = Object.keys(a.interests).filter((t) => b.interests[t]);
    shared.sort((x, y) => b.interests[y] + a.interests[y] - (a.interests[x] + b.interests[x]));
    const themed = [a.lunchTheme, b.lunchTheme].find((t) => t && shared.includes(t)) ?? shared[0];
    if (themed) { topic = themed; why = "it's an interest you share"; }
  }
  if (!topic) return [];
  const label = conference.topics.find((t) => t.id === topic)?.label ?? topic;
  const out: LunchMatch[] = [];
  for (const day of daysIn(scope, today)) {
    const lunch = sessions.find((s: Session) => s.day === day && s.activityType === "lunch" && s.topics.includes(topic!));
    if (!lunch || ms(lunch.end) < now) continue;
    const lunchSlot = sessionSlot(lunch);
    // need at least 35 free minutes inside the lunch window (a short call is fine)
    const freeMinutes = (v: ShareView) => {
      const busy = slotsFor(v, day)
        .filter((s) => s.id !== lunch.id)
        .reduce((sum, s) => sum + Math.max(0, Math.min(s.end, lunchSlot.end) - Math.max(s.start, lunchSlot.start)), 0);
      return (lunchSlot.end - lunchSlot.start - busy) / MIN;
    };
    if (freeMinutes(a) < 35 || freeMinutes(b) < 35) continue;
    out.push({ day, topic, sessionId: lunch.id, text: `Have lunch together at the ${label} table (${roomById.get(lunch.roomId)?.name ?? "lunch hall"}, ${fmtTime(lunch.start)}) — ${why}` });
  }
  return out;
}

/** What someone was doing at a given moment, used as the "where we met" context. */
export function contextAt(v: Pick<Attendee, "plans">, t: number): { sessionId?: string; label: string } {
  for (const plan of Object.values(v.plans)) {
    for (const id of plan.sessionIds) {
      const s = byId.get(id);
      if (s && ms(s.start) - 10 * MIN <= t && t <= ms(s.end) + 15 * MIN) {
        return { sessionId: s.id, label: `${s.title} · ${roomById.get(s.roomId)?.name}` };
      }
    }
  }
  return { label: "Hallway track" };
}
