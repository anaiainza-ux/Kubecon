import type { Session } from "./types";
import { conference, roomById } from "./data";

/** "Add to Google Calendar" link for a single session. */
export function googleCalendarLink(s: Session): string {
  const fmt = (t: string) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: s.title,
    dates: `${fmt(s.start)}/${fmt(s.end)}`,
    details: s.abstract,
    location: `${roomById.get(s.roomId)?.name ?? s.roomId}, ${conference.venue}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
