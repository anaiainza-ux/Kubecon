"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { conference, getSession } from "@/lib/data";
import { useStore } from "@/lib/store";
import { api, useHydrated } from "@/lib/client";
import { dayLabel, fmtTime } from "@/lib/time";
import type { Block } from "@/lib/types";
import { Button, Card, SessionMeta, TopicChip } from "@/components/ui";

const STEPS = ["Your interests", "Must-see talks & speakers", "Your non-negotiables"];

/** Screen 2: pick interest areas → search specific talks/speakers → import personal calendar. */
export default function Onboarding() {
  const hydrated = useHydrated();
  const [step, setStep] = useState(0);
  const router = useRouter();
  const setOnboarded = useStore((s) => s.setOnboarded);
  const interests = useStore((s) => s.profile.interests);

  if (!hydrated) return null;
  const finish = () => {
    const { profile, updateProfile } = useStore.getState();
    if (profile.lunchOptIn && !profile.lunchTheme) {
      const top = Object.keys(interests).sort((a, b) => interests[b] - interests[a])[0];
      if (top) updateProfile({ lunchTheme: top });
    }
    setOnboarded(true);
    router.push("/plan/1");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-6 flex gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <button onClick={() => setStep(i)} className="w-full text-left">
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-[var(--brand)]" : "bg-gray-200"}`} />
              <div className={`mt-1.5 ${i === step ? "font-semibold" : "text-[var(--muted)]"}`}>
                {i + 1}. {label}
              </div>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && <InterestsStep />}
      {step === 1 && <SearchStep />}
      {step === 2 && <CalendarStep />}

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={() => (step === 0 ? router.push("/") : setStep(step - 1))}>
          ← Back
        </Button>
        {step < 2 ? (
          <Button onClick={() => setStep(step + 1)} disabled={step === 0 && Object.keys(interests).length === 0}>
            Next →
          </Button>
        ) : (
          <Button onClick={finish}>Build my schedule →</Button>
        )}
      </div>
    </div>
  );
}

function InterestsStep() {
  const profile = useStore((s) => s.profile);
  const setInterest = useStore((s) => s.setInterest);
  const updateProfile = useStore((s) => s.updateProfile);
  const picked = Object.keys(profile.interests);
  const topInterest = picked.sort((a, b) => profile.interests[b] - profile.interests[a])[0] ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">What are you here for?</h1>
        <p className="text-sm text-[var(--muted)]">Tap once for interested, twice for very interested ★.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {conference.topics.map((t) => {
          const w = profile.interests[t.id] ?? 0;
          return (
            <button
              key={t.id}
              onClick={() => setInterest(t.id, (w + 1) % 3)}
              className="rounded-2xl border-2 bg-white p-4 text-left transition"
              style={{ borderColor: w ? t.color : "var(--line)", background: w === 2 ? `${t.color}12` : "white" }}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{t.label}</span>
                <span className="text-sm" style={{ color: t.color }}>{w === 2 ? "★ Very interested" : w === 1 ? "✓ Interested" : ""}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">{t.blurb}</p>
            </button>
          );
        })}
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">🍽️ Themed lunches</div>
            <div className="text-sm text-[var(--muted)]">Sit with people who share a topic. We&apos;ll also suggest lunch with people you meet.</div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={profile.lunchOptIn} onChange={(e) => updateProfile({ lunchOptIn: e.target.checked })} />
            Count me in
          </label>
        </div>
        {profile.lunchOptIn && (
          <select
            className="w-full rounded-xl border border-[var(--line)] p-2 text-sm"
            value={profile.lunchTheme ?? topInterest ?? ""}
            onChange={(e) => updateProfile({ lunchTheme: e.target.value })}
          >
            <option value="">Pick a lunch theme…</option>
            {conference.topics.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        )}
      </Card>

      <Card className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Your name <span className="text-[var(--muted)]">(for sharing, optional)</span>
          <input className="mt-1 w-full rounded-xl border border-[var(--line)] p-2" value={profile.name} onChange={(e) => updateProfile({ name: e.target.value })} placeholder="Alex Kim" />
        </label>
        <label className="text-sm">
          LinkedIn URL <span className="text-[var(--muted)]">(optional)</span>
          <input className="mt-1 w-full rounded-xl border border-[var(--line)] p-2" value={profile.linkedin} onChange={(e) => updateProfile({ linkedin: e.target.value })} placeholder="https://linkedin.com/in/…" />
        </label>
      </Card>
    </div>
  );
}

type SearchResult = { sessions: { id: string; titleHtml: string | null }[]; speakers: string[]; source?: string };

function SearchStep() {
  const profile = useStore((s) => s.profile);
  const toggleSession = useStore((s) => s.toggleFavoriteSession);
  const toggleSpeaker = useStore((s) => s.toggleFavoriteSpeaker);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResult | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const r = await api<SearchResult>(`/api/search?q=${encodeURIComponent(q)}`).catch(() => null);
      if (n === seq.current) setRes(r);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Anything you can&apos;t miss?</h1>
        <p className="text-sm text-[var(--muted)]">Search talks, topics or speaker names (typos are fine). Starred talks and followed speakers become anchors in your schedule.</p>
      </div>
      <input
        autoFocus
        className="w-full rounded-2xl border border-[var(--line)] bg-white p-4 text-lg shadow-sm outline-none focus:border-[var(--brand)]"
        placeholder="e.g. opentelemetry, kyverno, Priya Petrova…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {res?.speakers.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--muted)]">Speakers:</span>
          {res.speakers.map((name) => (
            <button
              key={name}
              onClick={() => toggleSpeaker(name)}
              className={`rounded-full border px-3 py-1 text-sm ${profile.favoriteSpeakers.includes(name) ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-[var(--line)] bg-white"}`}
            >
              {profile.favoriteSpeakers.includes(name) ? "✓ Following" : "+ Follow"} {name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="space-y-2">
        {res?.sessions.map((r) => {
          const s = getSession(r.id);
          if (!s) return null;
          const fav = profile.favoriteSessionIds.includes(s.id);
          return (
            <div key={s.id} className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-white p-3">
              <button onClick={() => toggleSession(s.id)} className={`mt-0.5 text-xl ${fav ? "text-amber-500" : "text-gray-300 hover:text-amber-400"}`} title="Must see">
                ★
              </button>
              <div className="min-w-0 flex-1">
                <div className="font-medium" dangerouslySetInnerHTML={{ __html: r.titleHtml ?? s.title }} />
                <div className="text-xs text-[var(--muted)]">{dayLabel(s.day)} · </div>
                <SessionMeta s={s} />
                <div className="mt-1 flex flex-wrap gap-1">{s.topics.map((t) => <TopicChip key={t} id={t} />)}</div>
              </div>
            </div>
          );
        })}
        {res && res.sessions.length === 0 && <p className="text-sm text-[var(--muted)]">No matches.</p>}
        {res?.source === "local" && <p className="text-xs text-amber-700">Elasticsearch unavailable, using basic search.</p>}
      </div>

      {(profile.favoriteSessionIds.length > 0 || profile.favoriteSpeakers.length > 0) && (
        <Card>
          <div className="text-sm font-semibold">Your must-sees</div>
          <ul className="mt-2 space-y-1 text-sm">
            {profile.favoriteSessionIds.map((id) => {
              const s = getSession(id)!;
              return (
                <li key={id} className="flex justify-between gap-2">
                  <span>★ {s.title} <span className="text-[var(--muted)]">· {dayLabel(s.day)} {fmtTime(s.start)}</span></span>
                  <button className="text-[var(--muted)]" onClick={() => toggleSession(id)}>✕</button>
                </li>
              );
            })}
            {profile.favoriteSpeakers.map((n) => (
              <li key={n} className="flex justify-between">
                <span>👤 {n}</span>
                <button className="text-[var(--muted)]" onClick={() => toggleSpeaker(n)}>✕</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function CalendarStep() {
  const blocks = useStore((s) => s.blocks);
  const setBlocks = useStore((s) => s.setBlocks);
  const removeBlock = useStore((s) => s.removeBlock);
  const [url, setUrl] = useState("");
  const [hide, setHide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState({ day: 1, start: "13:00", end: "13:30", title: "", offsite: false });

  const merge = (incoming: Block[]) => {
    const byId = new Map([...blocks, ...incoming].map((b) => [b.id, b]));
    setBlocks([...byId.values()]);
  };
  const run = async (fn: () => Promise<{ blocks: Block[] }>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      merge(r.blocks);
      if (!r.blocks.length) setError("No events found on conference days.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const upload = (file: File) =>
    run(async () => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("hideTitles", String(hide));
      const res = await fetch("/api/import-ics", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      return json;
    });
  const addManual = () => {
    const d = conference.days.find((x) => x.day === manual.day)!;
    const iso = (hhmm: string) => `${d.date}T${hhmm}:00${conference.utcOffset}`;
    merge([{ id: `manual-${Date.now()}`, title: manual.title || "Busy", start: iso(manual.start), end: iso(manual.end), day: manual.day, offsite: manual.offsite }]);
    setManual({ ...manual, title: "" });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">What can&apos;t move?</h1>
        <p className="text-sm text-[var(--muted)]">
          Import calls, meetings and dinners from your calendar. They&apos;re locked in your schedule and nothing gets planned on top of them.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--line)] p-5 text-center text-sm hover:border-[var(--brand)]">
            <span className="text-2xl">📅</span>
            <span className="mt-1 font-medium">Upload .ics file</span>
            <span className="text-xs text-[var(--muted)]">Export from Google, Outlook or Apple Calendar</span>
            <input type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          <div className="space-y-2 text-sm">
            <div className="font-medium">…or paste a calendar link</div>
            <input className="w-full rounded-xl border border-[var(--line)] p-2" placeholder="Google 'secret iCal address' / Outlook publish link" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Button variant="secondary" disabled={!url || busy} onClick={() => run(() => api("/api/import-ics", { url, hideTitles: hide }))}>
              Import link
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} /> Hide event titles (show as &quot;Busy&quot;)
          </label>
          <Button variant="ghost" disabled={busy} onClick={() => run(() => api("/api/import-ics", { sample: true, hideTitles: hide }))}>
            Use demo calendar
          </Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </Card>

      <Card className="space-y-2">
        <div className="text-sm font-semibold">Add one by hand</div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select className="rounded-lg border border-[var(--line)] p-1.5" value={manual.day} onChange={(e) => setManual({ ...manual, day: Number(e.target.value) })}>
            {conference.days.map((d) => <option key={d.day} value={d.day}>{d.label}</option>)}
          </select>
          <input type="time" className="rounded-lg border border-[var(--line)] p-1.5" value={manual.start} onChange={(e) => setManual({ ...manual, start: e.target.value })} />
          <span>–</span>
          <input type="time" className="rounded-lg border border-[var(--line)] p-1.5" value={manual.end} onChange={(e) => setManual({ ...manual, end: e.target.value })} />
          <input className="min-w-32 flex-1 rounded-lg border border-[var(--line)] p-1.5" placeholder="What is it?" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} />
          <label className="flex items-center gap-1"><input type="checkbox" checked={manual.offsite} onChange={(e) => setManual({ ...manual, offsite: e.target.checked })} /> Outside the venue</label>
          <Button variant="secondary" onClick={addManual}>Add</Button>
        </div>
      </Card>

      {blocks.length > 0 && (
        <Card>
          <div className="text-sm font-semibold">Locked in your schedule</div>
          <ul className="mt-2 divide-y divide-[var(--line)] text-sm">
            {[...blocks].sort((a, b) => a.start.localeCompare(b.start)).map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2">
                <span>
                  🔒 <b>{b.title}</b> · {dayLabel(b.day)} {fmtTime(b.start)}–{fmtTime(b.end)}
                  <span className="ml-1 text-xs text-[var(--muted)]">{b.offsite ? "(outside venue, +15 min travel)" : "(take it from anywhere)"}</span>
                </span>
                <button className="text-[var(--muted)]" onClick={() => removeBlock(b.id)}>✕</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
