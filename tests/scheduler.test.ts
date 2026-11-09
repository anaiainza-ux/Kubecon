import { describe, expect, it } from "vitest";
import { sessions } from "@/lib/data";
import { at, MIN, ms } from "@/lib/time";
import { travelMinutes } from "@/lib/venue";
import { clashes, freeWindows, sessionSlot, blockSlot, type Slot } from "@/lib/scheduler/feasibility";
import { leftoverGaps, placeWithSwap, repeatThatFits } from "@/lib/scheduler/backtrack";
import { rankCandidates } from "@/lib/scheduler/recommend";
import { gapWindow, rankGapfill } from "@/lib/scheduler/gapfill";
import { commonSessions, lunchMatch, meetupOpportunities, type ShareView } from "@/lib/social";
import type { Block, Session } from "@/lib/types";

const R250 = "sp-level-2-250-a-c";
const R251 = "sp-level-2-251-a-c";
const BALLROOM = "sp-level-1-grand-ballroom-ace";
const HYATT = "hyatt-level-4-regency-ballroom-cd";
const HALLS = "sp-level-1-halls-a-c-halls-1-5";

const slot = (id: string, day: number, s: string, e: string, roomId: string): Slot => ({ id, start: at(day, s), end: at(day, e), roomId, locked: false, kind: "session", title: id });

/** A synthetic talk on day 1 (all in one room, so walking time is zero unless stated). */
const talk = (id: string, s: string, e: string, extra: Partial<Session> = {}): Session => ({
  id, kind: "talk", title: id, abstract: "", keywords: "", speakers: [], topics: ["security"], level: "Any Level",
  day: 1, start: new Date(at(1, s)).toISOString(), end: new Date(at(1, e)).toISOString(), roomId: R250, seriesId: id, ...extra,
});

describe("travel + feasibility (real venue)", () => {
  it("walks across buildings take longer than within a wing", () => {
    expect(travelMinutes(R250, R251)).toBeLessThan(travelMinutes(R250, HYATT));
    expect(travelMinutes(R250, R250)).toBe(0);
  });

  it("rejects a back-to-back pair between the Salt Palace and the Hyatt", () => {
    expect(clashes(slot("a", 1, "11:00", "11:30", BALLROOM), slot("b", 1, "11:30", "12:00", HYATT))).toBe(true);
  });

  it("allows back-to-back talks next door", () => {
    expect(clashes(slot("a", 1, "11:00", "11:30", R250), slot("b", 1, "11:30", "12:00", R251))).toBe(false);
  });

  it("treats drop-in activities like lunch as flexible, but not open-all-day ones", () => {
    const t = slot("t", 1, "12:20", "12:50", "sp-level-2-255-bc");
    const lunch = { ...slot("l", 1, "12:50", "13:50", HALLS), flexible: true };
    const showcase = { ...slot("m", 1, "10:45", "17:15", HALLS), flexible: true };
    expect(clashes(t, slot("x", 1, "12:50", "13:20", HYATT))).toBe(true);
    expect(clashes(t, lunch)).toBe(false);
    expect(clashes(showcase, t)).toBe(true);
  });

  it("finds free windows between items", () => {
    const slots = [slot("a", 1, "09:00", "10:30", BALLROOM), slot("b", 1, "11:00", "11:30", BALLROOM)];
    const w = freeWindows(slots, at(1, "08:00"), at(1, "12:30"));
    expect(w.map((x) => [x.start, x.end])).toEqual([
      [at(1, "08:00"), at(1, "09:00")],
      [at(1, "10:30"), at(1, "11:00")],
      [at(1, "11:30"), at(1, "12:30")],
    ]);
  });
});

describe("backtracking (the 9:00 / 9:30 / 9:45 / 9:20 story)", () => {
  // T1 9:00–9:30, T2 9:30–10:30 are picked. X (9:45) clashes with T2. Y (9:20) would clash with T1.
  const T1 = talk("T1", "09:00", "09:30");
  const T2 = talk("T2", "09:30", "10:30");
  const T3 = talk("T3", "11:00", "11:30");
  const X = talk("X", "09:45", "10:15");
  const Y = talk("Y", "09:20", "09:40");
  const F = talk("F", "09:31", "09:43");
  const all = [T1, T2, T3, X, Y, F];
  const byId = (id: string) => all.find((s) => s.id === id)!;

  it("picking a clashing 9:45 talk swaps out T2 and frees 9:30–9:45 to fill", () => {
    const r = placeWithSwap(1, ["T1", "T2", "T3"], [], "X", byId);
    if (r.status !== "ok") throw new Error("blocked");
    expect(r.displaced).toEqual(["T2"]);
    expect(r.plan.sort()).toEqual(["T1", "T3", "X"]);
    expect([r.gapBefore?.start, r.gapBefore?.end]).toEqual([at(1, "09:30"), at(1, "09:45")]);
    // nothing after the new pick is touched
    expect(r.plan).toContain("T3");
  });

  it("going further back to 9:20 swaps out T1 and frees the time before it", () => {
    const r = placeWithSwap(1, ["T1", "X", "T3"], [], "Y", byId);
    if (r.status !== "ok") throw new Error("blocked");
    expect(r.displaced).toEqual(["T1"]);
    expect(r.gapBefore?.end).toBe(at(1, "09:20"));
    expect(r.plan.sort()).toEqual(["T3", "X", "Y"]);
  });

  it("filling the gap without a swap leaves no change elsewhere", () => {
    const r = placeWithSwap(1, ["T1", "X", "T3"], [], "F", byId);
    if (r.status !== "ok") throw new Error("blocked");
    expect(r.displaced).toEqual([]);
    const left = leftoverGaps(1, r.plan, [], F, { start: at(1, "09:30"), end: at(1, "09:45") }, byId);
    expect(left.before).toBeNull(); // 1 minute isn't worth filling
  });

  it("never moves a locked personal block", () => {
    const block: Block = { id: "call", title: "Team call", start: X.start, end: X.end, day: 1, offsite: false };
    const r = placeWithSwap(1, ["T1", "T2"], [block], "X", byId);
    expect(r.status).toBe("blocked");
  });

  it("in a backtrack gap, options never swap out what's after the gap", () => {
    const slots = ["T1", "X", "T3"].map((id) => sessionSlot(byId(id)));
    const window = { start: at(1, "09:30"), end: at(1, "09:45") };
    const later = talk("L", "09:40", "10:00"); // would clash with X (protected)
    const out = rankCandidates(
      [Y, F, later].map((s) => ({ session: s, score: 1, matched: [] })),
      { slots, window, protectedIds: new Set(["X", "T3"]), mode: "gap" },
    );
    expect(out.recommended.map((s) => s.sessionId)).toEqual(["F"]);
    expect(out.swaps.map((s) => [s.sessionId, s.replaces])).toEqual([["Y", ["T1"]]]);
  });

  it("offers a repeat of a swapped-out talk when it fits", () => {
    const encore = talk("T2b", "14:00", "15:00", { seriesId: "T2" });
    const repeat = repeatThatFits(T2, { 1: ["T1", "X"] }, [], [...all, encore]);
    expect(repeat?.id).toBe("T2b");
  });
});

describe("gap fill (real data)", () => {
  it("only suggests things that fit before you must leave, skipping full sessions", () => {
    const now = at(1, "11:35");
    const next = { start: at(1, "12:20"), roomId: R250 };
    const w = gapWindow(now, next, BALLROOM, at(1, "19:30"));
    expect(w.end).toBe(at(1, "12:20") - travelMinutes(BALLROOM, R250) * MIN);
    const cands = sessions.filter((s) => s.day === 1);
    const showcase = cands.find((s) => s.title === "Solutions Showcase")!;
    const out = rankGapfill(cands, { now, window: w, currentRoom: BALLROOM, interests: { security: 2 }, full: new Set([showcase.id]) });
    expect(out.length).toBeGreaterThan(0);
    for (const g of out) {
      const s = sessions.find((x) => x.id === g.sessionId)!;
      expect(s.id).not.toBe(showcase.id);
      if (s.kind !== "activity") expect(ms(s.end)).toBeLessThanOrEqual(w.end + 5 * MIN);
    }
  });
});

describe("social (real data)", () => {
  const day2 = sessions.filter((s) => s.day === 2 && s.kind === "talk").sort((a, b) => ms(a.start) - ms(b.start));
  const shared = day2.find((s) => ms(s.start) >= at(2, "11:00"))!;
  const view = (id: string, ids: string[], lunchTheme: string, interests: Record<string, number>): ShareView => ({
    userId: id, name: id, interests, lunchOptIn: true, lunchTheme, blocks: [],
    plans: { 2: { sessionIds: ids, anchorIds: [], cursor: null, done: true } },
  });
  const a = view("a", [shared.id], "security", { security: 2, platform: 1 });
  const b = view("b", [shared.id], "security", { security: 1 });

  it("finds talks in common and meetup windows", () => {
    expect(commonSessions(a, b, [2])).toEqual([shared.id]);
    const m = meetupOpportunities(a, b, at(2, "08:00"), "day", 2);
    expect(m.some((x) => x.type === "same-session")).toBe(true);
    expect(m.some((x) => x.type === "both-free")).toBe(true);
  });

  it("suggests a themed lunch when both opted in with the same theme", () => {
    const l = lunchMatch(a, b, at(2, "08:00"), "day", 2);
    expect(l[0]?.topic).toBe("security");
  });
});
