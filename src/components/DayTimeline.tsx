"use client";
import { forwardRef } from "react";
import type { Block, Session } from "@/lib/types";
import { roomById } from "@/lib/data";
import { dayEnd, dayStart, fmtTime, MIN, ms } from "@/lib/time";
import { travelMinutes } from "@/lib/venue";
import type { Window } from "@/lib/scheduler/feasibility";
import { topicColor } from "./ui";

export const PX_PER_MIN = 1.6;

export type TimelineOption = { session: Session; type: "fit" | "swap" | "blocked"; replaces: string[] };

type Props = {
  day: number;
  sessions: Session[];
  anchorIds: string[];
  blocks: Block[];
  windows: Window[];
  focus: { start: number; end: number; mode: "forward" | "gap" | "replace" } | null;
  replacingId: string | null;
  /** Talks swapped out during the current backtrack, shown as ghosts where they were. */
  ghosts: Session[];
  /** Every option for the highlighted slot, drawn at its real time next to your day. */
  options: TimelineOption[];
  hoverId: string | null;
  onHover: (id: string | null) => void;
  onPick: (id: string) => void;
  onFocusWindow: (w: Window) => void;
  onReplace: (id: string) => void;
  onRemove: (id: string) => void;
  onAcceptAnchor: (id: string) => void;
};

const MAX_LANES = 3;

/** Greedy lane assignment so overlapping options sit side by side. */
function layoutLanes(options: TimelineOption[]) {
  const lanes: number[] = [];
  const placed: { o: TimelineOption; lane: number }[] = [];
  for (const o of [...options].sort((a, b) => ms(a.session.start) - ms(b.session.start))) {
    const lane = lanes.findIndex((end) => end <= ms(o.session.start));
    if (lane >= 0) { lanes[lane] = ms(o.session.end); placed.push({ o, lane }); }
    else if (lanes.length < MAX_LANES) { lanes.push(ms(o.session.end)); placed.push({ o, lane: lanes.length - 1 }); }
  }
  return { placed, count: Math.max(1, lanes.length) };
}

/** Vertical day calendar: your plan on the left, the options for the highlighted slot on the right. */
export const DayTimeline = forwardRef<HTMLDivElement, Props>(function DayTimeline(p, focusRef) {
  const t0 = dayStart(p.day);
  const t1 = dayEnd(p.day);
  const y = (t: number) => ((t - t0) / MIN) * PX_PER_MIN;
  const height = y(t1);
  const hours: number[] = [];
  for (let t = t0; t <= t1; t += 60 * MIN) hours.push(t);

  const sorted = [...p.sessions].sort((a, b) => ms(a.start) - ms(b.start));
  const hovered = p.options.find((o) => o.session.id === p.hoverId);
  const willReplace = new Set(hovered?.type === "swap" ? hovered.replaces : []);
  const { placed, count } = layoutLanes(p.options);
  const gapMode = p.focus?.mode === "gap";

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white">
      <div className="hidden border-b border-[var(--line)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)] lg:flex">
        <span className="w-[62%] pl-10">My day</span>
        <span className="flex-1">Options for the highlighted time</span>
      </div>
      <div className="relative" style={{ height: height + 16 }}>
        <div className="absolute inset-x-0 top-2" style={{ height }}>
          {hours.map((h) => (
            <div key={h} className="absolute inset-x-0 border-t border-dashed border-gray-100" style={{ top: y(h) }}>
              <span className="absolute -top-2 left-2 bg-white px-1 text-[10px] text-gray-400">{fmtTime(h)}</span>
            </div>
          ))}
          <div className="absolute bottom-0 top-0 hidden border-l border-dashed border-gray-200 lg:block" style={{ left: "62%" }} />

          {/* free windows: tap to fill */}
          {p.windows.map((w) => (
            <button
              key={w.start}
              onClick={() => p.onFocusWindow(w)}
              className="absolute left-12 right-2 rounded-xl border border-dashed border-transparent text-xs text-transparent transition hover:border-[var(--brand)] hover:text-[var(--brand)] lg:right-[39%]"
              style={{ top: y(w.start) + 1, height: Math.max(18, y(w.end) - y(w.start) - 2) }}
            >
              + fill {fmtTime(w.start)}–{fmtTime(w.end)}
            </button>
          ))}

          {p.focus && (
            <div
              ref={focusRef}
              className={`pulse-ring pointer-events-none absolute left-12 right-2 rounded-xl border-2 lg:right-[39%] ${gapMode ? "border-amber-500 bg-amber-100/60" : "border-[var(--brand)] bg-[var(--brand)]/10"}`}
              style={{ top: y(p.focus.start), height: Math.max(24, y(p.focus.end) - y(p.focus.start)) }}
            >
              <span className={`absolute right-2 top-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${gapMode ? "bg-amber-600" : "bg-[var(--brand)]"}`}>
                {gapMode ? `Freed · fill ${fmtTime(p.focus.start)}–${fmtTime(p.focus.end)}` : p.focus.mode === "replace" ? "Swap this slot" : `Next up · ${fmtTime(p.focus.start)}`}
              </span>
            </div>
          )}

          {p.blocks.map((b) => (
            <div key={b.id} className="hatched absolute left-12 right-2 overflow-hidden rounded-xl border border-gray-300 px-2 py-1 text-xs text-gray-700 lg:right-[39%]" style={{ top: y(ms(b.start)), height: Math.max(20, y(ms(b.end)) - y(ms(b.start))) }}>
              🔒 <b>{b.title}</b> · {fmtTime(b.start)}–{fmtTime(b.end)}
            </div>
          ))}

          {p.ghosts.map((s) => (
            <div
              key={`ghost-${s.id}`}
              className="pointer-events-none absolute left-12 overflow-hidden rounded-xl border border-dashed border-gray-400 bg-gray-50/80 px-2 py-0.5 text-[11px] text-gray-500"
              style={{ top: y(ms(s.start)) + 1, height: Math.max(20, y(ms(s.end)) - y(ms(s.start)) - 2), width: "22%" }}
              title={`Swapped out: ${s.title}`}
            >
              <div className="truncate line-through">{s.title}</div>
              <div className="text-[10px] no-underline">swapped out</div>
            </div>
          ))}

          {sorted.map((s, i) => {
            const anchor = p.anchorIds.includes(s.id);
            const color = topicColor(s);
            const prev = sorted[i - 1];
            const walk = prev ? travelMinutes(prev.roomId, s.roomId) : 0;
            const h = Math.max(22, y(ms(s.end)) - y(ms(s.start)) - 2);
            const doomed = willReplace.has(s.id);
            return (
              <div key={s.id}>
                {prev && walk > 0 && ms(s.start) - ms(prev.end) < 30 * MIN && (
                  <div className="absolute left-14 z-10 text-[10px] text-gray-500" style={{ top: y(ms(prev.end)) - 1 }}>
                    🚶 {walk} min
                  </div>
                )}
                <div
                  className={`group absolute right-2 overflow-hidden rounded-xl px-2 py-1 text-xs transition lg:right-[39%] ${p.ghosts.length ? "left-[calc(22%+3.25rem)]" : "left-12"} ${p.replacingId === s.id ? "opacity-40" : ""} ${doomed ? "ring-2 ring-red-500 ring-offset-1" : ""}`}
                  style={{
                    top: y(ms(s.start)) + 1,
                    height: h,
                    background: doomed ? "#fee2e2" : `${color}${anchor ? "10" : "1f"}`,
                    border: `${anchor ? "2px dashed" : "1px solid"} ${color}`,
                  }}
                >
                  <button className="block w-full text-left" onClick={() => p.onReplace(s.id)} title="Tap to see alternatives for this slot">
                    <div className={`truncate font-semibold ${doomed ? "line-through" : ""}`} style={{ color: doomed ? "#b91c1c" : color }}>
                      {anchor && "★ "}
                      {s.title}
                    </div>
                    {h > 34 && (
                      <div className="truncate text-gray-600">
                        {doomed ? "↺ would be swapped out" : `${fmtTime(s.start)}–${fmtTime(s.end)} · ${roomById.get(s.roomId)?.name}`}
                      </div>
                    )}
                  </button>
                  <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                    {anchor && (
                      <button className="rounded bg-white px-1.5 text-[10px] shadow" onClick={() => p.onAcceptAnchor(s.id)}>
                        Keep ✓
                      </button>
                    )}
                    <button className="rounded bg-white px-1.5 text-[10px] shadow" onClick={() => p.onRemove(s.id)}>
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* options lane: every option at its real time, clashes visibly overlap what they'd replace */}
          <div className="absolute bottom-0 top-0 hidden lg:block" style={{ left: "calc(62% + 6px)", right: 8 }}>
            {placed.map(({ o, lane }) => {
              const s = o.session;
              const color = o.type === "blocked" ? "#9ca3af" : topicColor(s);
              const h = Math.max(18, y(ms(s.end)) - y(ms(s.start)) - 2);
              const hover = p.hoverId === s.id;
              return (
                <button
                  key={s.id}
                  disabled={o.type === "blocked"}
                  onClick={() => p.onPick(s.id)}
                  onMouseEnter={() => p.onHover(s.id)}
                  onMouseLeave={() => p.onHover(null)}
                  title={`${s.title} · ${fmtTime(s.start)}–${fmtTime(s.end)}${o.type === "swap" ? " · swaps out an earlier pick" : ""}`}
                  className={`absolute overflow-hidden rounded-lg px-1.5 py-0.5 text-left text-[10px] leading-tight transition ${hover ? "z-20 shadow-lg" : "z-10"} ${o.type === "blocked" ? "cursor-not-allowed opacity-50" : "hover:brightness-95"}`}
                  style={{
                    top: y(ms(s.start)) + 1,
                    height: h,
                    left: `${(lane / count) * 100}%`,
                    width: `calc(${100 / count}% - 4px)`,
                    background: o.type === "swap" ? "repeating-linear-gradient(135deg, #fff7ed 0 6px, #ffedd5 6px 12px)" : "white",
                    border: `${o.type === "fit" ? "1.5px solid" : "1.5px dashed"} ${o.type === "swap" ? "#f97316" : color}`,
                  }}
                >
                  <div className="truncate font-semibold" style={{ color: o.type === "swap" ? "#c2410c" : color }}>
                    {o.type === "swap" ? "↺ " : o.type === "blocked" ? "🔒 " : ""}
                    {s.title}
                  </div>
                  {h > 28 && <div className="truncate text-gray-500">{fmtTime(s.start)}–{fmtTime(s.end)}</div>}
                </button>
              );
            })}
          </div>

          {hovered && hovered.type !== "blocked" && (
            <div
              className="pointer-events-none absolute left-16 right-4 z-30 rounded-xl border-2 border-dashed bg-white/90 px-2 py-1 text-xs lg:right-[41%]"
              style={{ top: y(ms(hovered.session.start)), height: Math.max(20, y(ms(hovered.session.end)) - y(ms(hovered.session.start))), borderColor: hovered.type === "swap" ? "#f97316" : topicColor(hovered.session) }}
            >
              <b>{hovered.session.title}</b>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
