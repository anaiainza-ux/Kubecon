import ical from "node-ical";
import { createEvents, type EventAttributes } from "ics";
import type { Block, Session } from "./types";
import { conference } from "./data";
import { at, dayOf, ms } from "./time";
import { roomLabel } from "./venue";

const VIRTUAL = /zoom|teams|meet\.google|webex|http|call|online|virtual/i;

/** Parse an .ics calendar into locked blocks that fall on conference days (recurring events expanded). */
export function icsToBlocks(text: string, opts: { hideTitles?: boolean } = {}): Block[] {
  const data = ical.sync.parseICS(text);
  const first = conference.days[0].day;
  const last = conference.days.at(-1)!.day;
  const rangeStart = new Date(at(first, "00:00"));
  const rangeEnd = new Date(at(last, "23:59"));
  const blocks: Block[] = [];

  for (const ev of Object.values(data)) {
    if (!ev || ev.type !== "VEVENT" || !ev.start || !ev.end) continue;
    if ((ev.start as { dateOnly?: boolean }).dateOnly || ev.datetype === "date") continue; // skip all-day events
    const duration = ev.end.getTime() - ev.start.getTime();
    const starts: Date[] = ev.rrule ? ev.rrule.between(rangeStart, rangeEnd, true) : [ev.start];
    const summary = typeof ev.summary === "string" ? ev.summary : (ev.summary as { val?: string } | undefined)?.val ?? "Busy";
    const location = typeof ev.location === "string" ? ev.location : "";
    for (const st of starts) {
      const startMs = st.getTime();
      const day = dayOf(startMs);
      if (day == null) continue;
      blocks.push({
        id: `blk-${ev.uid ?? summary}-${startMs}`.replace(/[^a-zA-Z0-9-]/g, ""),
        title: opts.hideTitles ? "Busy" : summary,
        start: new Date(startMs).toISOString(),
        end: new Date(startMs + duration).toISOString(),
        day,
        offsite: Boolean(location) && !VIRTUAL.test(`${location} ${summary}`),
      });
    }
  }
  return blocks.sort((a, b) => ms(a.start) - ms(b.start));
}

/** Calendar file for Outlook / Apple / Google import. Times in UTC so every client gets them right. */
export function sessionsToIcs(items: Session[], calName: string): string {
  const events: EventAttributes[] = items.map((s) => ({
    uid: `${s.id}@kubecon-planner`,
    title: s.title,
    description: `${s.abstract}\n\nSpeakers: ${s.speakers.map((p) => `${p.name} (${p.company})`).join(", ") || "—"}`,
    location: roomLabel(s.roomId),
    start: ms(s.start),
    startInputType: "utc",
    startOutputType: "utc",
    end: ms(s.end),
    endInputType: "utc",
    endOutputType: "utc",
    categories: s.topics,
    calName,
  }));
  const { error, value } = createEvents(events);
  if (error || !value) throw error ?? new Error("Could not build calendar");
  return value;
}
