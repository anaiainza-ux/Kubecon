import sessionsJson from "@data/sessions.json";
import conferenceJson from "@data/conference.json";
import venueJson from "@data/venue.json";
import type { Session } from "./types";

export const sessions = sessionsJson as Session[];
export const conference = conferenceJson;
export const venue = venueJson;

export const sessionById = new Map(sessions.map((s) => [s.id, s]));
export const getSession = (id: string) => sessionById.get(id);
export const topicById = new Map(conference.topics.map((t) => [t.id, t]));
export const roomById = new Map(venue.rooms.map((r) => [r.id, r]));
export const zoneById = new Map(venue.zones.map((z) => [z.id, z]));

export const isTalkLike = (s: Session) => s.kind !== "activity";

/** Expand ids to every session in the same series, so an encore of a talk you already have isn't suggested again. */
export function withSeries(ids: string[]): string[] {
  const series = new Set(ids.map((id) => sessionById.get(id)?.seriesId).filter(Boolean));
  return [...new Set([...ids, ...sessions.filter((s) => s.kind !== "activity" && series.has(s.seriesId)).map((s) => s.id)])];
}
