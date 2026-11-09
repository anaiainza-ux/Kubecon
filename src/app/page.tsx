"use client";
import Link from "next/link";
import { conference } from "@/lib/data";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/client";

/** Screen 1: what the conference is about and its main topic areas. */
export default function Home() {
  const hydrated = useHydrated();
  const onboarded = useStore((s) => s.onboarded);

  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#1e3a8a] via-[#326ce5] to-[#7c3aed] p-8 text-white sm:p-12">
        <p className="text-sm uppercase tracking-widest text-white/70">
          {conference.city} · {conference.days[0].label} – {conference.days.at(-1)!.label}
        </p>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight sm:text-5xl">{conference.name}</h1>
        <p className="mt-4 max-w-2xl text-white/85">{conference.tagline}</p>
        <p className="mt-2 max-w-2xl text-sm text-white/70">{conference.about}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/onboarding" className="rounded-xl bg-white px-5 py-3 font-semibold text-[#1e3a8a] hover:bg-white/90">
            {hydrated && onboarded ? "Edit my interests" : "Plan my KubeCon →"}
          </Link>
          {hydrated && onboarded && (
            <Link href="/plan/1" className="rounded-xl border border-white/40 px-5 py-3 font-semibold hover:bg-white/10">
              Continue my schedule
            </Link>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">What's on</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Ten tracks across three days, plus the expo, project pavilion and lots of hallway track.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {conference.topics.map((t) => (
            <div key={t.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                <h3 className="font-semibold">{t.label}</h3>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{t.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["🧭", "Talks that fit", "Suggestions account for walking time between rooms."],
          ["🔁", "See every option", "Even clashing talks: swap one in and backtrack only as far as you choose."],
          ["⚡", "Live re-plans", "Missed a talk or room full? Get options that fit the gap."],
          ["🤝", "Hallway track", "Scan someone to find shared talks, meetups and themed lunches."],
        ].map(([icon, title, text]) => (
          <div key={title} className="rounded-2xl bg-white p-4 text-sm">
            <div className="text-2xl">{icon}</div>
            <div className="mt-2 font-semibold">{title}</div>
            <div className="text-[var(--muted)]">{text}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
