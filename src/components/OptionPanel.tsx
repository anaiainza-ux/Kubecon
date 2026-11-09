"use client";
import type { Session } from "@/lib/types";
import type { Suggestion, Suggestions } from "@/lib/scheduler/recommend";
import { getSession, roomById } from "@/lib/data";
import { dayLabel, fmtTime, ms } from "@/lib/time";
import { Button, DemandBadge, SessionMeta, TopicChip, topicColor } from "./ui";

export type BacktrackView = {
  steps: { picked: Session; displaced: Session[] }[];
  /** Swapped-out talks that repeat later and still fit. */
  repeats: { of: Session; repeat: Session }[];
};

type Props = {
  mode: "forward" | "gap" | "replace";
  focus: { start: number; end: number };
  prev: Session | null;
  replacing: Session | null;
  backtrack: BacktrackView | null;
  data: (Suggestions & { source?: string }) | null;
  loading: boolean;
  lunch: Session | null;
  onPick: (id: string) => void;
  onSkip: () => void;
  onFinish: () => void;
  onCancelReplace: () => void;
  onRemoveReplacing: () => void;
  onUndoLast: () => void;
  onUndoAll: () => void;
  onEndBacktrack: () => void;
  onAddRepeat: (id: string) => void;
  onHover: (id: string | null) => void;
  registerCard: (key: string, el: HTMLElement | null) => void;
};

const span = (s: Session) => `${fmtTime(s.start)}–${fmtTime(s.end)}`;

/** The options "around" the highlighted slot: what fits, what you could swap in, and the backtrack trail. */
export function OptionPanel(p: Props) {
  const gap = p.mode === "gap";
  const fits = p.data ? [...p.data.recommended, ...p.data.also] : [];

  return (
    <div className="space-y-4">
      {p.backtrack && <BacktrackTrail view={p.backtrack} active={gap} onUndoLast={p.onUndoLast} onUndoAll={p.onUndoAll} onEnd={p.onEndBacktrack} onAddRepeat={p.onAddRepeat} />}

      <div>
        <div className={`text-xs font-semibold uppercase tracking-wide ${gap ? "text-amber-600" : "text-[var(--brand)]"}`}>
          {gap ? "↩ Backtracking" : p.replacing ? "Alternatives for this slot" : "What's next"}
        </div>
        <h2 className="text-lg font-bold">
          {gap ? "Fill the time you freed" : "Free"} {fmtTime(p.focus.start)} – {fmtTime(p.focus.end)}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          {gap ? (
            <>Pick something that fits, or <b>go further back</b> by swapping an earlier pick. Nothing from {fmtTime(p.focus.end)} on will change.</>
          ) : p.replacing ? (
            <>
              Replacing <b>{p.replacing.title}</b>.{" "}
              <button className="underline" onClick={p.onCancelReplace}>Keep it</button> ·{" "}
              <button className="underline" onClick={p.onRemoveReplacing}>Remove it</button>
            </>
          ) : p.prev ? (
            <>After <b>{p.prev.title}</b> in {roomById.get(p.prev.roomId)?.name}. Walking time is already accounted for. Talks marked ↺ clash with a pick, so choosing one swaps it out.</>
          ) : (
            <>Pick your first session of the day.</>
          )}
        </p>
      </div>

      {p.loading && <div className="animate-pulse rounded-2xl bg-white p-6 text-sm text-[var(--muted)]">Searching with Elasticsearch…</div>}

      {!p.loading && p.data && (
        <>
          <div className="space-y-3">
            {p.data.recommended.length > 0 && (
              <div className="text-xs font-semibold text-[var(--muted)]">{gap ? "Fits in the gap, no other changes" : "Best next picks"}</div>
            )}
            {p.data.recommended.map((s, i) => (
              <SuggestionCard key={s.sessionId} s={s} rank={i} onPick={p.onPick} onHover={p.onHover} cardRef={(el) => p.registerCard(`rec-${i}`, el)} />
            ))}
            {p.data.recommended.length === 0 && (
              <div className="rounded-2xl bg-white p-4 text-sm text-[var(--muted)]">
                {gap ? `Nothing fits exactly in ${fmtTime(p.focus.start)}–${fmtTime(p.focus.end)}. Go further back below, or keep it free.` : "Nothing else fits in this gap. Enjoy the hallway track!"}
              </div>
            )}
          </div>

          {p.lunch && (
            <div ref={(el) => p.registerCard("lunch", el)} className="flex items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-3">
              <div className="text-sm">
                <div className="font-semibold">🍽️ {p.lunch.title}</div>
                <div className="text-xs text-teal-800">{span(p.lunch)} · {roomById.get(p.lunch.roomId)?.name}</div>
              </div>
              <Button variant="secondary" onClick={() => p.onPick(p.lunch!.id)}>Add lunch</Button>
            </div>
          )}

          {gap ? (
            <>
              {p.data.also.length > 0 && (
                <OptionGroup title={`Also fits in ${fmtTime(p.focus.start)}–${fmtTime(p.focus.end)}`} items={p.data.also} kind="fit" onPick={p.onPick} onHover={p.onHover} cardRef={(el) => p.registerCard("also", el)} />
              )}
              {p.data.swaps.length > 0 && (
                <OptionGroup
                  title="Go further back"
                  subtitle="These start earlier and replace the pick before the gap. Choosing one frees the time before it, so you can keep going back."
                  items={p.data.swaps}
                  kind="swap"
                  onPick={p.onPick}
                  onHover={p.onHover}
                  cardRef={(el) => p.registerCard("swaps", el)}
                />
              )}
            </>
          ) : (
            (fits.length > 3 || p.data.swaps.length > 0 || p.data.blocked.length > 0) && (
              <OptionGroup
                title="Every option around this time"
                subtitle="✓ fits · ↺ clashes with a pick (choose it to swap) · 🔒 overlaps a locked commitment"
                items={[...p.data.also, ...p.data.swaps, ...p.data.blocked]}
                kind="mixed"
                onPick={p.onPick}
                onHover={p.onHover}
                cardRef={(el) => p.registerCard("all", el)}
              />
            )
          )}
          {p.data.source === "local" && <p className="text-xs text-amber-700">Elasticsearch unavailable, using local ranking.</p>}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {gap ? (
          <Button variant="secondary" onClick={p.onSkip}>Keep {fmtTime(p.focus.start)}–{fmtTime(p.focus.end)} free</Button>
        ) : (
          !p.replacing && <Button variant="secondary" onClick={p.onSkip}>Leave this free (hallway track)</Button>
        )}
        {!gap && <Button variant="ghost" onClick={p.onFinish}>I&apos;m done for today</Button>}
      </div>
    </div>
  );
}

function BacktrackTrail({ view, active, onUndoLast, onUndoAll, onEnd, onAddRepeat }: { view: BacktrackView; active: boolean; onUndoLast: () => void; onUndoAll: () => void; onEnd: () => void; onAddRepeat: (id: string) => void }) {
  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-amber-900">
          {active ? "Your changes so far" : `Done: ${view.steps.length} change${view.steps.length === 1 ? "" : "s"}, the rest of your day is untouched`}
        </div>
        {!active && <button className="text-xs text-amber-800 underline" onClick={onEnd}>Hide</button>}
      </div>
      <ol className="mt-2 space-y-1.5">
        {view.steps.map((st, i) => (
          <li key={i} className="flex gap-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-200 text-[11px] font-bold text-amber-900">{i + 1}</span>
            <span>
              {st.displaced.length ? (
                <>
                  <span className="text-gray-500 line-through">{st.displaced.map((d) => `${d.title} (${span(d)})`).join(", ")}</span>
                  <span className="mx-1">→</span>
                </>
              ) : (
                <span className="text-gray-500">Filled with </span>
              )}
              <b>{st.picked.title}</b> <span className="text-xs text-gray-600">({span(st.picked)})</span>
            </span>
          </li>
        ))}
      </ol>
      {view.repeats.map(({ of, repeat }) => (
        <div key={repeat.id} className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5 text-xs">
          <span>↻ <b>{of.title}</b> repeats {dayLabel(repeat.day)} {fmtTime(repeat.start)}</span>
          <button className="shrink-0 font-semibold text-[var(--brand)] underline" onClick={() => onAddRepeat(repeat.id)}>Add it there</button>
        </div>
      ))}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onUndoLast} className="!px-3 !py-1.5 text-xs">↶ Undo last change</Button>
        <Button variant="secondary" onClick={onUndoAll} className="!px-3 !py-1.5 text-xs">Restore my original plan</Button>
        {active && <Button variant="ghost" onClick={onEnd} className="!px-3 !py-1.5 text-xs">Stop backtracking</Button>}
      </div>
    </div>
  );
}

function OptionGroup({
  title,
  subtitle,
  items,
  kind,
  onPick,
  onHover,
  cardRef,
}: {
  title: string;
  subtitle?: string;
  items: Suggestion[];
  kind: "fit" | "swap" | "mixed";
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
  cardRef: (el: HTMLElement | null) => void;
}) {
  const groups = new Map<number, Suggestion[]>();
  for (const s of items) {
    const t = ms(getSession(s.sessionId)!.start);
    groups.set(t, [...(groups.get(t) ?? []), s]);
  }
  const sorted = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  return (
    <div ref={cardRef} className={`rounded-2xl border bg-white p-3 ${kind === "swap" ? "border-orange-200" : "border-[var(--line)]"}`}>
      <div className="text-sm font-semibold">{title}</div>
      {subtitle && <div className="mb-2 text-[11px] text-[var(--muted)]">{subtitle}</div>}
      <div className="space-y-3">
        {sorted.map(([start, list]) => (
          <div key={start}>
            <div className="text-[11px] font-semibold text-[var(--muted)]">{fmtTime(start)}</div>
            {list.map((s) => {
              const ses = getSession(s.sessionId)!;
              const blocked = Boolean(s.blockedBy);
              const swap = s.replaces.length > 0;
              return (
                <button
                  key={s.sessionId}
                  disabled={blocked}
                  onClick={() => onPick(s.sessionId)}
                  onMouseEnter={() => onHover(s.sessionId)}
                  onMouseLeave={() => onHover(null)}
                  className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${blocked ? "cursor-not-allowed opacity-50" : swap ? "hover:bg-orange-50" : "hover:bg-gray-50"}`}
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: topicColor(ses) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{ses.title}</span>
                    <span className="block text-[11px] text-[var(--muted)]">
                      {span(ses)} · {roomById.get(ses.roomId)?.name}
                      {!swap && !blocked && s.walkMinutes > 0 && <> · 🚶{s.walkMinutes}′</>}
                    </span>
                    {swap && (
                      <span className="block text-[11px] font-medium text-orange-700">
                        ↺ replaces {s.replaces.map((id) => { const r = getSession(id); return r ? `"${r.title}" (${span(r)})` : "a pick"; }).join(", ")}
                      </span>
                    )}
                    {blocked && <span className="block text-[11px] text-gray-600">🔒 overlaps your &quot;{s.blockedBy}&quot;</span>}
                  </span>
                  {!swap && !blocked && <span className="shrink-0 rounded-full bg-green-50 px-1.5 text-[10px] font-semibold text-green-700">✓ fits</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({ s, rank, onPick, onHover, cardRef }: { s: Suggestion; rank: number; onPick: (id: string) => void; onHover: (id: string | null) => void; cardRef: (el: HTMLElement | null) => void }) {
  const ses = getSession(s.sessionId)!;
  return (
    <div
      ref={cardRef}
      onMouseEnter={() => onHover(s.sessionId)}
      onMouseLeave={() => onHover(null)}
      className="rounded-2xl border-2 bg-white p-3 shadow-sm transition hover:shadow-md"
      style={{ borderColor: rank === 0 ? topicColor(ses) : "var(--line)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {rank === 0 && <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: topicColor(ses) }}>Best pick</div>}
          <div className="font-semibold leading-snug">{ses.title}</div>
          <SessionMeta s={ses} />
        </div>
        <Button onClick={() => onPick(s.sessionId)} className="shrink-0">Pick</Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {ses.topics.map((t) => <TopicChip key={t} id={t} />)}
        <DemandBadge demand={s.demand} />
        {ses.kind === "workshop" && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px]">Hands-on</span>}
      </div>
      {s.reasons.length > 0 && <div className="mt-2 text-xs text-[var(--muted)]">{s.reasons.join(" · ")}</div>}
    </div>
  );
}
