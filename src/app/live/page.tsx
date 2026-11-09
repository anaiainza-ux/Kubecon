"use client";
import { useState } from "react";
import Link from "next/link";
import { conference, getSession, roomById } from "@/lib/data";
import { useStore } from "@/lib/store";
import { api, useHydrated, useNow } from "@/lib/client";
import { at, dayOf, fmtDayTime, fmtTime, MIN, minutesBetween, ms } from "@/lib/time";
import { directions, ENTRANCE } from "@/lib/venue";
import type { GapSuggestion } from "@/lib/scheduler/gapfill";
import type { Session } from "@/lib/types";
import { Button, Card, SessionMeta, topicColor } from "@/components/ui";
import { VenueMap } from "@/components/VenueMap";

type GapResult = { window: { start: number; end: number }; suggestions: GapSuggestion[]; source: string };

/** Day-of mode: where you should be, how to get there, and re-planning when things go wrong. */
export default function Live() {
  const hydrated = useHydrated();
  const now = useNow();
  const plans = useStore((s) => s.plans);
  const blocks = useStore((s) => s.blocks);
  const profile = useStore((s) => s.profile);
  const { applyPlans } = useStore.getState();
  const [gap, setGap] = useState<{ reason: string; missed: Session; result: GapResult } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!hydrated) return null;
  const day = dayOf(now) ?? null;
  const items = day ? (plans[day]?.sessionIds ?? []).map((id) => getSession(id)!).filter(Boolean).sort((a, b) => ms(a.start) - ms(b.start)) : [];
  const current = items.find((s) => ms(s.start) <= now && now < ms(s.end));
  const next = items.find((s) => ms(s.start) > now);
  const before = [...items].reverse().find((s) => ms(s.end) <= now);
  const hereRoom = current?.roomId ?? before?.roomId ?? ENTRANCE;
  const target = current && now < ms(current.start) + 10 * MIN ? current : next;
  const route = target ? directions(current && target === current ? before?.roomId ?? ENTRANCE : hereRoom, target.roomId) : null;
  const leaveBy = target && route ? ms(target.start) - route.minutes * MIN : null;
  const blockNow = blocks.find((b) => b.day === day && ms(b.start) <= now && now < ms(b.end));

  const replan = async (s: Session, reason: "missed" | "full") => {
    setBusy(true);
    try {
      if (reason === "full") await api("/api/session-status", { sessionId: s.id, status: "full" });
      const following = items.find((x) => ms(x.start) >= ms(s.end) - 5 * MIN && x.id !== s.id);
      const result = await api<GapResult>("/api/live/gapfill", {
        day,
        now,
        currentRoom: reason === "full" ? s.roomId : hereRoom,
        nextId: following?.id ?? null,
        excludeIds: [s.id, ...Object.values(plans).flatMap((p) => p.sessionIds)],
        interests: profile.interests,
        lunchTheme: profile.lunchTheme,
      });
      setGap({ reason: reason === "full" ? `"${s.title}" is full` : `You missed "${s.title}"`, missed: s, result });
    } finally {
      setBusy(false);
    }
  };

  const take = (g: GapSuggestion) => {
    if (!gap || !day) return;
    const s = getSession(g.sessionId)!;
    const ids = (plans[day]?.sessionIds ?? []).filter((id) => id !== gap.missed.id);
    applyPlans({ [day]: s.kind === "activity" ? ids : [...ids, s.id] });
    setGap(null);
  };

  return (
    <div className="space-y-5">
      <TimeTravel now={now} />

      {!day ? (
        <Card>
          <h1 className="text-lg font-bold">The conference hasn&apos;t started (or is over)</h1>
          <p className="text-sm text-[var(--muted)]">Use the demo clock above to jump into a conference day.</p>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <h1 className="text-lg font-bold">No plan for {conference.days.find((d) => d.day === day)?.label} yet</h1>
          <Link href={`/plan/${day}`}><Button className="mt-3">Build it now</Button></Link>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <Card className="border-2" >
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Right now · {fmtTime(now)}</div>
              {blockNow ? (
                <div className="mt-1 text-lg font-bold">🔒 {blockNow.title}</div>
              ) : current ? (
                <>
                  <div className="mt-1 text-lg font-bold" style={{ color: topicColor(current) }}>{current.title}</div>
                  <SessionMeta s={current} />
                  <div className="mt-1 text-xs text-[var(--muted)]">Ends in {minutesBetween(now, ms(current.end))} min</div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="danger" disabled={busy} onClick={() => replan(current, "full")}>Room is full</Button>
                    <Button variant="secondary" disabled={busy} onClick={() => replan(current, "missed")}>I missed it</Button>
                  </div>
                </>
              ) : (
                <div className="mt-1 text-lg font-bold">Free time — hallway track ☕</div>
              )}
            </Card>

            {target && target !== current && (
              <Card>
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Next</div>
                <div className="mt-1 text-lg font-bold" style={{ color: topicColor(target) }}>{target.title}</div>
                <SessionMeta s={target} />
                {leaveBy && (
                  <div className={`mt-3 rounded-xl p-3 text-sm font-semibold ${leaveBy - now <= 5 * MIN ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-800"}`}>
                    {leaveBy <= now ? "Leave now!" : `Leave by ${fmtTime(leaveBy)} (in ${minutesBetween(now, leaveBy)} min)`} · {route?.minutes} min walk
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <Button variant="danger" disabled={busy} onClick={() => replan(target, "full")}>It&apos;s full</Button>
                  <Button variant="secondary" disabled={busy} onClick={() => replan(target, "missed")}>I&apos;ll miss it</Button>
                </div>
              </Card>
            )}

            {gap && (
              <Card className="border-2 border-amber-300">
                <div className="text-sm font-semibold text-amber-800">{gap.reason}. Here&apos;s what fits until {fmtTime(gap.result.window.end)}:</div>
                <div className="mt-3 space-y-2">
                  {gap.result.suggestions.map((g) => {
                    const s = getSession(g.sessionId)!;
                    return (
                      <div key={g.sessionId} className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-2">
                        <span className="text-xl">{g.kind === "activity" ? activityIcon(s.activityType) : g.kind === "join-late" ? "🏃" : "🎤"}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{s.title}</div>
                          <div className="text-[11px] text-[var(--muted)]">{roomById.get(s.roomId)?.name} · 🚶 {g.walkMinutes} min · {g.note}</div>
                        </div>
                        <Button variant="secondary" onClick={() => take(g)}>Go</Button>
                      </div>
                    );
                  })}
                  {gap.result.suggestions.length === 0 && <p className="text-sm text-[var(--muted)]">Nothing fits. Recharge in the Hallway Track Lounge.</p>}
                </div>
                <button className="mt-2 text-xs text-[var(--muted)] underline" onClick={() => setGap(null)}>Dismiss</button>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            {route && target && (
              <Card>
                <div className="text-sm font-semibold">Directions to {roomById.get(target.roomId)?.name}</div>
                <VenueMap route={route.zones} here={route.zones[0]} there={route.zones.at(-1)} />
                <ol className="mt-3 list-inside list-decimal space-y-1 text-sm">
                  {route.steps.map((s) => <li key={s}>{s}</li>)}
                </ol>
              </Card>
            )}
            <Card>
              <div className="mb-2 text-sm font-semibold">Today</div>
              <ul className="space-y-1 text-sm">
                {items.map((s) => (
                  <li key={s.id} className={`flex gap-2 ${ms(s.end) < now ? "text-gray-400 line-through" : ""} ${s === current ? "font-semibold" : ""}`}>
                    <span className="w-12 shrink-0 tabular-nums">{fmtTime(s.start)}</span>
                    <span className="truncate">{s.title}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

const activityIcon = (t?: string) => ({ merch: "🛍️", food: "☕", lunch: "🍽️", expo: "🏢", social: "🎉" })[t ?? ""] ?? "✨";

/** Demo clock so you can rehearse the live experience on any day. */
function TimeTravel({ now }: { now: number }) {
  const demoNow = useStore((s) => s.demoNow);
  const setDemoNow = useStore((s) => s.setDemoNow);
  const day = dayOf(now) ?? 1;
  const minutes = Math.round((now - at(day, "00:00")) / MIN);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-purple-300 bg-purple-50 p-3 text-sm">
      <span className="font-semibold text-purple-900">⏱ Demo clock</span>
      <select className="rounded-lg border border-purple-200 bg-white p-1" value={dayOf(now) ?? ""} onChange={(e) => setDemoNow(at(Number(e.target.value), fmtTime(now)))}>
        {dayOf(now) === null && <option value="">(real time)</option>}
        {conference.days.map((d) => <option key={d.day} value={d.day}>{d.label}</option>)}
      </select>
      <input type="range" min={7 * 60 + 30} max={19 * 60} step={5} value={Math.min(Math.max(minutes, 450), 1140)} onChange={(e) => setDemoNow(at(day, "00:00") + Number(e.target.value) * MIN)} className="flex-1" />
      <span className="w-20 font-mono">{fmtDayTime(now)}</span>
      <Button variant="ghost" onClick={() => setDemoNow((demoNow ?? now) + 15 * MIN)}>+15m</Button>
      {demoNow && <Button variant="ghost" onClick={() => setDemoNow(null)}>Real time</Button>}
    </div>
  );
}
