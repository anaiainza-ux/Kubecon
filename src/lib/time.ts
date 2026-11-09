import { formatInTimeZone } from "date-fns-tz";
import { conference } from "./data";

export const MIN = 60_000;
export const ms = (iso: string) => Date.parse(iso);

/** Epoch ms for a conference-local "HH:mm" on the given day number. */
export function at(day: number, hhmm: string): number {
  const d = conference.days.find((x) => x.day === day) ?? conference.days[0];
  return Date.parse(`${d.date}T${hhmm}:00${conference.utcOffset}`);
}
export const dayStart = (day: number) => at(day, conference.dayStart);
export const dayEnd = (day: number) => at(day, conference.dayEnd);

/** Which conference day (1..n) an instant falls on, or null. */
export function dayOf(t: number): number | null {
  for (const d of conference.days) if (t >= at(d.day, "00:00") && t < at(d.day, "23:59") + MIN) return d.day;
  return null;
}

export const fmtTime = (t: number | string) => formatInTimeZone(typeof t === "string" ? ms(t) : t, conference.timezone, "HH:mm");
export const fmtDayTime = (t: number | string) => formatInTimeZone(typeof t === "string" ? ms(t) : t, conference.timezone, "EEE HH:mm");
export const dayLabel = (day: number) => conference.days.find((d) => d.day === day)?.label ?? `Day ${day}`;
export const minutesBetween = (a: number, b: number) => Math.round((b - a) / MIN);
