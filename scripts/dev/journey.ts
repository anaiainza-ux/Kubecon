/** End-to-end API journey: profile → plan with repair → export → live gap fill → scan Jordan → people. */
import { sessions } from "../../src/lib/data";
import { at } from "../../src/lib/time";
import { clashes, sessionSlot } from "../../src/lib/scheduler/feasibility";

const B = process.argv[2] ?? "http://localhost:3000";
const post = async (p: string, body: unknown, method = "POST") => {
  const r = await fetch(B + p, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${p} ${r.status} ${JSON.stringify(j)}`);
  return j;
};

async function main() {
  const userId = "u-journey";
  const interests = { security: 2, platform: 1 };
  const blocks = (await post("/api/import-ics", { sample: true })).blocks;
  console.log("blocks", blocks.length);

  // Encore scenario: plan has the original talk; pick something clashing with it.
  const encore = sessions.find((s) => s.encore && s.title.startsWith("Policy"))!;
  const original = sessions.find((s) => s.id === encore.seriesId)!;
  const x = sessions.find((s) => s.day === original.day && s.kind === "talk" && s.seriesId !== original.seriesId && clashes(sessionSlot(s), sessionSlot(original)))!;
  const plans: Record<number, string[]> = { 1: [], 2: [], 3: [] };
  plans[original.day] = [original.id];
  const res = await post("/api/resolve", { plans, blocks, newId: x.id, interests });
  console.log(`resolve: picking "${x.title}" vs "${original.title}" → ${res.status} (${res.source})`);
  for (const o of res.options) console.log("  -", o.title, "|", o.detail.join("; "));
  const chosen = res.options[0].plans;

  const profile = {
    userId, name: "Alex Journey", linkedin: "https://linkedin.com/in/example-alex", role: "SRE", company: "Acme",
    interests, favoriteSessionIds: [], favoriteSpeakers: [], lunchOptIn: true, lunchTheme: "security", shareScope: "event",
    shareFields: { name: true, linkedin: true, role: true, company: true }, shareToken: "s-journey", contactToken: "c-journey",
    blocks, plans: Object.fromEntries(Object.entries(chosen).map(([d, ids]) => [d, { sessionIds: ids, anchorIds: [], cursor: null, done: true }])),
  };
  await post("/api/me", profile, "PUT");

  const ics = await (await fetch(`${B}/api/export/${userId}`)).text();
  console.log("export: events =", (ics.match(/BEGIN:VEVENT/g) ?? []).length, ics.includes("DTSTART:2026") ? "UTC ok" : "?");

  const day = original.day;
  const missed = sessions.find((s) => s.id === chosen[day].find((id: string) => id === x.id))!;
  const gap = await post("/api/live/gapfill", { day, now: Date.parse(missed.start) + 2 * 60000, currentRoom: "lounge", nextId: null, excludeIds: Object.values(chosen).flat(), interests, lunchTheme: "security" });
  console.log(`gapfill (${gap.source}):`, gap.suggestions.slice(0, 4).map((g: { sessionId: string; kind: string; note: string }) => `${g.kind}:${sessions.find((s) => s.id === g.sessionId)!.title}`).join(" | "));

  const conn = await post("/api/connect", { token: "demo-jordan", userId, now: at(day, "10:45") });
  console.log(`connect: ${conn.card.name}, common=${conn.common.length}, meetups=${conn.meetups.length}, lunch=${conn.lunch.map((l: { text: string }) => l.text).join(" / ")}`);
  console.log("  first meetups:", conn.meetups.slice(0, 3).map((m: { text: string }) => m.text));
  const card = await post("/api/connect", { token: "demo-jordan-card", userId, now: at(day, "11:20") });
  console.log("contact:", card.card.name, card.card.linkedin, "| met during:", card.context);
  const people = await (await fetch(`${B}/api/connections?userId=${userId}`)).json();
  console.log("people:", people.connections.map((c: { card: { name: string }; type: string; contextLabel: string }) => `${c.card.name} (${c.type}) @ ${c.contextLabel}`));
}
main().catch((e) => { console.error(e); process.exit(1); });
