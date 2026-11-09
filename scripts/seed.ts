/**
 * Creates the Elasticsearch indices and loads sessions, ~600 simulated attendees
 * (for "likely to fill up" demand stats) and one demo attendee to scan.
 * Run: npm run seed   (requires `docker compose up -d` or ES_URL/ES_API_KEY for Elastic Cloud)
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { es, INDEX } from "../src/lib/es";
import { attendeesMapping, connectionsMapping, sessionsMapping } from "../src/lib/indices";
import { conference, roomById, sessions } from "../src/lib/data";
import { fits, sessionSlot, type Slot } from "../src/lib/scheduler/feasibility";
import type { Attendee, DayPlan, Interests } from "../src/lib/types";

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// Popularity skew so some rooms are predicted to overflow.
const TOPIC_POPULARITY: Record<string, number> = { agentic: 3, "ai-ml": 2.2, security: 2.2, platform: 1.6, observability: 1.4, ops: 1, connectivity: 1, data: 0.8, appdev: 0.8, emerging: 0.6 };

function randomInterests(): Interests {
  const topics = Object.keys(TOPIC_POPULARITY);
  const out: Interests = {};
  const n = 2 + Math.floor(rand() * 2);
  while (Object.keys(out).length < n) {
    const total = topics.reduce((s, t) => s + TOPIC_POPULARITY[t], 0);
    let r = rand() * total;
    for (const t of topics) { r -= TOPIC_POPULARITY[t]; if (r <= 0) { out[t] = rand() < 0.4 ? 2 : 1; break; } }
  }
  return out;
}

/** Greedy plan: walk through the day, picking the most interesting talk that still fits. */
function autoPlan(day: number, interests: Interests, fill: number): DayPlan {
  const picked: Slot[] = [];
  const ids: string[] = [];
  const candidates = sessions
    .filter((s) => s.day === day && s.kind !== "activity")
    .map((s) => ({ s, score: (s.kind === "keynote" ? 1.5 : 0) + s.topics.reduce((a, t) => a + (interests[t] ?? 0), 0) + rand() * 1.5 }))
    .sort((a, b) => b.score - a.score);
  for (const { s, score } of candidates) {
    if (score < 1 || rand() > fill) continue;
    const slot = sessionSlot(s);
    if (fits(picked, slot)) { picked.push(slot); ids.push(s.id); }
  }
  return { sessionIds: ids, anchorIds: [], cursor: null, done: true };
}

function toDoc(a: Attendee, fake: boolean) {
  return {
    ...a,
    scheduleIds: Object.values(a.plans).flatMap((p) => p.sessionIds),
    interestTopics: Object.keys(a.interests),
    fake,
  };
}

async function main() {
  const client = es();
  const info = await client.info();
  console.log(`Connected to Elasticsearch ${info.version.number}`);

  for (const [name, mappings] of [
    [INDEX.sessions, sessionsMapping],
    [INDEX.attendees, attendeesMapping],
    [INDEX.connections, connectionsMapping],
  ] as const) {
    await client.indices.delete({ index: name, ignore_unavailable: true });
    await client.indices.create({ index: name, mappings: mappings as never });
  }

  const sessionDocs = sessions.flatMap((s) => {
    const room = roomById.get(s.roomId)!;
    return [{ index: { _index: INDEX.sessions, _id: s.id } }, { ...s, zone: room.zone, capacity: room.capacity, status: "open" }];
  });
  const r1 = await client.bulk({ operations: sessionDocs, refresh: true });
  if (r1.errors) throw new Error(JSON.stringify(r1.items.find((i) => i.index?.error)));
  console.log(`Indexed ${sessions.length} sessions`);

  const attendeeOps: object[] = [];
  for (let i = 0; i < 600; i++) {
    const interests = randomInterests();
    const fill = 0.55 + rand() * 0.4;
    const a: Attendee = {
      userId: `sim-${i}`,
      name: `Simulated attendee ${i}`,
      linkedin: "",
      role: "",
      company: "",
      interests,
      favoriteSessionIds: [],
      favoriteSpeakers: [],
      lunchOptIn: rand() < 0.5,
      lunchTheme: Object.keys(interests)[0],
      shareScope: "event",
      shareFields: { name: false, linkedin: false, role: false, company: false },
      shareToken: `sim-share-${i}`,
      contactToken: `sim-contact-${i}`,
      blocks: [],
      plans: Object.fromEntries(conference.days.map((d) => [d.day, autoPlan(d.day, interests, fill)])),
    };
    attendeeOps.push({ index: { _index: INDEX.attendees, _id: a.userId } }, toDoc(a, true));
  }

  // A real-looking demo attendee to scan when you only have one device.
  seed = 7;
  const jordanInterests: Interests = { security: 2, agentic: 2, platform: 1 };
  const jordan: Attendee = {
    userId: "demo-jordan",
    name: "Jordan Rivera",
    linkedin: "https://www.linkedin.com/in/example-jordan-rivera",
    role: "Staff Platform Engineer",
    company: "Northwind Cloud",
    interests: jordanInterests,
    favoriteSessionIds: [],
    favoriteSpeakers: [],
    lunchOptIn: true,
    lunchTheme: "security",
    shareScope: "event",
    shareFields: { name: true, linkedin: true, role: true, company: true },
    shareToken: "demo-jordan",
    contactToken: "demo-jordan-card",
    blocks: [],
    plans: Object.fromEntries(conference.days.map((d) => [d.day, autoPlan(d.day, jordanInterests, 0.85)])),
  };
  attendeeOps.push({ index: { _index: INDEX.attendees, _id: jordan.userId } }, toDoc(jordan, false));

  const r2 = await client.bulk({ operations: attendeeOps, refresh: true });
  if (r2.errors) throw new Error(JSON.stringify(r2.items.find((i) => i.index?.error)));
  console.log(`Indexed 600 simulated attendees + demo attendee "Jordan Rivera" (share token: demo-jordan)`);

  const count = await client.count({ index: INDEX.sessions });
  console.log(`Done. ${INDEX.sessions} has ${count.count} docs.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
