import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { es, INDEX } from "../../src/lib/es";
import { buildRecommendQuery } from "../../src/lib/scheduler/recommend";
import { at } from "../../src/lib/time";

async function main() {
  const q = buildRecommendQuery({ day: 1, window: { start: at(1, "11:30"), end: at(1, "12:30") }, interests: { security: 2, platform: 1 }, favoriteSpeakers: ["Priya Petrova"], likeIds: ["t001"], excludeIds: ["t001"] }, INDEX.sessions);
  const r = await es().search({ index: INDEX.sessions, ...(q as object) });
  for (const h of r.hits.hits.slice(0, 8)) {
    const s = h._source as { title: string; start: string; roomId: string };
    console.log(h._score?.toFixed(2), s.start.slice(11, 16), s.roomId, s.title, h.matched_queries);
  }
}
main().catch((e) => { console.error(e.meta?.body?.error ?? e); process.exit(1); });
