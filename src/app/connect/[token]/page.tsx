"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSession } from "@/lib/data";
import { useStore } from "@/lib/store";
import { api, syncNow, useHydrated, useNow } from "@/lib/client";
import { dayLabel, fmtTime } from "@/lib/time";
import type { LunchMatch, Meetup } from "@/lib/social";
import { Button, Card, SessionMeta } from "@/components/ui";

type CardInfo = { userId: string; name: string; linkedin: string; role: string; company: string };
type Result =
  | { kind: "contact"; card: CardInfo; context: string }
  | { kind: "schedule"; card: CardInfo; scope: "day" | "event"; days: number[]; theirPlans: Record<number, string[]>; common: string[]; meetups: Meetup[]; lunch: LunchMatch[]; context: string };

/** Landing page after scanning someone's QR code. */
export default function Connect() {
  const hydrated = useHydrated();
  const { token } = useParams<{ token: string }>();
  const now = useNow();
  const profile = useStore((s) => s.profile);
  const update = useStore((s) => s.updateProfile);
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  // returning users with a name connect straight away; new users fill in the form first
  useEffect(() => {
    if (hydrated && useStore.getState().profile.name) setReady(true);
  }, [hydrated]);

  useEffect(() => {
    if (!ready || result) return;
    (async () => {
      try {
        await syncNow();
        setResult(await api<Result>("/api/connect", { token, userId: profile.userId, now }));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!hydrated) return null;

  if (!ready) {
    return (
      <Card className="mx-auto max-w-md space-y-3">
        <h1 className="text-lg font-bold">Who are you?</h1>
        <p className="text-sm text-[var(--muted)]">So the other person knows who they met.</p>
        <input className="w-full rounded-lg border border-[var(--line)] p-2" placeholder="Your name" value={profile.name} onChange={(e) => update({ name: e.target.value })} />
        <input className="w-full rounded-lg border border-[var(--line)] p-2" placeholder="LinkedIn URL (optional)" value={profile.linkedin} onChange={(e) => update({ linkedin: e.target.value })} />
        <Button disabled={!profile.name} onClick={() => setReady(true)}>Connect</Button>
      </Card>
    );
  }

  if (error) return <Card className="mx-auto max-w-md text-sm text-red-700">{error}</Card>;
  if (!result) return <div className="text-center text-sm text-[var(--muted)]">Connecting…</div>;

  const card = result.card;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="flex items-center gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-xl font-bold text-white">{card.name.slice(0, 1)}</div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold">{card.name}</div>
          <div className="text-sm text-[var(--muted)]">{[card.role, card.company].filter(Boolean).join(" · ")}</div>
          <div className="text-xs text-[var(--muted)]">Met during: {result.context}</div>
        </div>
        {card.linkedin && <a href={card.linkedin} target="_blank" rel="noreferrer"><Button variant="secondary">in Connect</Button></a>}
      </Card>

      {result.kind === "contact" ? (
        <Card className="text-sm">
          ✅ Saved to <Link href="/people" className="underline">People I met</Link>. They got your card too.
        </Card>
      ) : (
        <>
          {result.lunch.length > 0 && (
            <Card className="border-2 border-teal-300 bg-teal-50">
              <div className="font-semibold">🍽️ Lunch together?</div>
              <ul className="mt-1 space-y-1 text-sm">{result.lunch.map((l) => <li key={l.day}><b>{dayLabel(l.day)}:</b> {l.text}</li>)}</ul>
            </Card>
          )}
          <Card>
            <div className="font-semibold">🎤 Talks you both picked ({result.common.length})</div>
            <div className="mt-2 space-y-2">
              {result.common.map((id) => {
                const s = getSession(id)!;
                return <div key={id}><div className="text-sm font-medium">{s.title}</div><div className="text-xs text-[var(--muted)]">{dayLabel(s.day)}</div><SessionMeta s={s} /></div>;
              })}
              {result.common.length === 0 && <p className="text-sm text-[var(--muted)]">None yet. Maybe one of you should switch?</p>}
            </div>
          </Card>
          <Card>
            <div className="font-semibold">🤝 Where you could meet up</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {result.meetups.map((m, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-24 shrink-0 text-xs text-[var(--muted)]">{dayLabel(m.day).split(",")[0]} {fmtTime(m.start)}</span>
                  <span>{m.type === "same-session" ? "🎤" : m.type === "both-free" ? "☕" : "📍"} {m.text}</span>
                </li>
              ))}
              {result.meetups.length === 0 && <li className="text-[var(--muted)]">No overlapping free time left {result.scope === "day" ? "today" : "this week"}.</li>}
            </ul>
          </Card>
          <p className="text-center text-xs text-[var(--muted)]">
            {card.name} shared {result.scope === "day" ? "today's schedule" : "their whole conference schedule"}. Saved to <Link href="/people" className="underline">People</Link>.
          </p>
        </>
      )}
    </div>
  );
}
