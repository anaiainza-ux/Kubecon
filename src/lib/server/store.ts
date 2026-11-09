import "server-only";
import { es, INDEX } from "../es";
import { roomById, sessionById } from "../data";
import type { Attendee } from "../types";

export async function getAttendee(userId: string): Promise<Attendee | null> {
  try {
    const r = await es().get<Attendee>({ index: INDEX.attendees, id: userId });
    return r._source ?? null;
  } catch {
    return null;
  }
}

export async function findAttendeeByToken(token: string): Promise<{ attendee: Attendee; kind: "schedule" | "contact" } | null> {
  const r = await es().search<Attendee>({
    index: INDEX.attendees,
    size: 1,
    query: { bool: { should: [{ term: { shareToken: token } }, { term: { contactToken: token } }], minimum_should_match: 1 } },
  });
  const a = r.hits.hits[0]?._source;
  if (!a) return null;
  return { attendee: a, kind: a.contactToken === token ? "contact" : "schedule" };
}

export async function saveAttendee(a: Attendee) {
  await es().index({
    index: INDEX.attendees,
    id: a.userId,
    document: {
      ...a,
      scheduleIds: Object.values(a.plans ?? {}).flatMap((p) => p.sessionIds),
      interestTopics: Object.keys(a.interests ?? {}),
      fake: false,
    },
    refresh: "wait_for",
  });
}

let demandCache: { at: number; value: Record<string, number> } | null = null;

/**
 * Predicted demand per session = attendees who planned it / room capacity.
 * A terms aggregation over every attendee's schedule (600 simulated + real users).
 */
export async function getDemand(): Promise<Record<string, number>> {
  if (demandCache && Date.now() - demandCache.at < 30_000) return demandCache.value;
  const r = await es().search({
    index: INDEX.attendees,
    size: 0,
    aggs: { planned: { terms: { field: "scheduleIds", size: 500 } } },
  });
  const buckets = (r.aggregations?.planned as { buckets: { key: string; doc_count: number }[] }).buckets;
  const value: Record<string, number> = {};
  for (const b of buckets) {
    const s = sessionById.get(b.key);
    const cap = s ? roomById.get(s.roomId)?.capacity : undefined;
    if (cap) value[b.key] = Math.round((b.doc_count / cap) * 100) / 100;
  }
  demandCache = { at: Date.now(), value };
  return value;
}

export async function getFullSessionIds(): Promise<string[]> {
  const r = await es().search<{ id: string }>({ index: INDEX.sessions, size: 200, _source: ["id"], query: { term: { status: "full" } } });
  return r.hits.hits.map((h) => h._source!.id);
}
