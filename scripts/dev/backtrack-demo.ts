/** Walks the backtracking flow against the running API with real Tuesday sessions. */
import { getSession, sessions } from "../../src/lib/data";
import { at, fmtTime, ms } from "../../src/lib/time";
import { placeWithSwap } from "../../src/lib/scheduler/backtrack";

const B = "http://localhost:3000";
const byId = (id: string) => getSession(id)!;
const show = (id: string) => { const s = byId(id); return `${fmtTime(s.start)}–${fmtTime(s.end)} ${s.title.slice(0, 60)}`; };
const rec = async (plan: string[], window: { start: number; end: number }, mode: "forward" | "gap", likeIds?: string[]) =>
  (await fetch(`${B}/api/recommend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day: 1, window, interests: { security: 2, agentic: 1 }, favoriteSpeakers: [], plan, taken: plan, blocks: [], mode, likeIds }) })).json();

async function main() {
  const tue = sessions.filter((s) => s.day === 1 && s.kind === "talk");
  const t1 = tue.find((s) => s.start.includes("T11:30") && s.topics.includes("security"))!;
  const t2 = tue.find((s) => s.start.includes("T12:20") && s.topics.includes("security"))!;
  let plan = ["k1", t1.id, t2.id];
  console.log("PLAN:", plan.map(show));
  const f = await rec(plan, { start: ms(t2.end), end: at(1, "19:30") }, "forward");
  console.log(`\nFORWARD from ${fmtTime(t2.end)} (${f.source}): ${f.recommended.length} recommended, ${f.also.length} also, ${f.swaps.length} swaps`);
  for (const s of f.swaps.slice(0, 6)) console.log("  ↺", show(s.sessionId), "replaces", s.replaces.map(show));
  const x = f.swaps.find((s: { sessionId: string; replaces: string[] }) => s.replaces.includes(t2.id) && ms(byId(s.sessionId).start) > ms(t2.start));
  if (!x) return console.log("no later-starting swap for T2");
  const r1 = placeWithSwap(1, plan, [], x.sessionId, byId);
  if (r1.status !== "ok") return;
  plan = r1.plan;
  console.log(`\nPICK ${show(x.sessionId)} → swapped out ${r1.displaced.map(show)}; freed ${r1.gapBefore && fmtTime(r1.gapBefore.start) + "–" + fmtTime(r1.gapBefore.end)}`);
  const g = await rec(plan, { start: r1.gapBefore!.start, end: r1.gapBefore!.end }, "gap", r1.displaced);
  console.log(`GAP options: fits=${[...g.recommended, ...g.also].map((s: { sessionId: string }) => show(s.sessionId)).join(" | ")}`);
  for (const s of g.swaps.slice(0, 6)) console.log("  go back ↺", show(s.sessionId), "replaces", s.replaces.map(show));
  const y = g.swaps.find((s: { sessionId: string }) => ms(byId(s.sessionId).start) > ms(t1.start)) ?? g.swaps[0];
  if (!y) return;
  const r2 = placeWithSwap(1, plan, [], y.sessionId, byId);
  if (r2.status !== "ok") return;
  console.log(`\nPICK ${show(y.sessionId)} → swapped out ${r2.displaced.map(show)}; freed ${r2.gapBefore && fmtTime(r2.gapBefore.start) + "–" + fmtTime(r2.gapBefore.end)}`);
  console.log("PLAN NOW:", r2.plan.map(show));
}
main();
