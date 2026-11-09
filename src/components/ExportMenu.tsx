"use client";
import { useState } from "react";
import { getSession } from "@/lib/data";
import { googleCalendarLink } from "@/lib/calendar-links";
import { baseUrl, syncNow } from "@/lib/client";
import { useStore } from "@/lib/store";
import { fmtDayTime } from "@/lib/time";
import type { Session } from "@/lib/types";
import { Button, Modal } from "./ui";

/** Export to Outlook / Apple (.ics), Google (per-event links or import), or subscribe via webcal. */
export function ExportMenu({ day }: { day?: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const userId = useStore((s) => s.profile.userId);
  const plans = useStore((s) => s.plans);
  const days = day ? [day] : Object.keys(plans).map(Number);
  const items = days.flatMap((d) => plans[d]?.sessionIds ?? []).map((id) => getSession(id)).filter(Boolean) as Session[];

  const download = async (forDay?: number) => {
    await syncNow();
    window.location.href = `/api/export/${userId}${forDay ? `?day=${forDay}` : ""}`;
  };
  const webcal = `${baseUrl().replace(/^https?:/, "webcal:")}/api/export/${userId}`;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>📤 Export</Button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <h2 className="text-lg font-bold">Add to your calendar</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-2xl border border-[var(--line)] p-3">
              <div className="font-semibold">Outlook · Apple Calendar</div>
              <p className="text-[var(--muted)]">Download an .ics file and open it.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {day && <Button onClick={() => download(day)}>This day (.ics)</Button>}
                <Button variant={day ? "secondary" : "primary"} onClick={() => download()}>All days (.ics)</Button>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] p-3">
              <div className="font-semibold">Google Calendar</div>
              <p className="text-[var(--muted)]">Add talks one by one, or import the .ics via Settings → Import &amp; export.</p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {items.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{fmtDayTime(s.start)} · {s.title}</span>
                    <a className="shrink-0 text-[var(--brand)] underline" href={googleCalendarLink(s)} target="_blank" rel="noreferrer">Add</a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-[var(--line)] p-3">
              <div className="font-semibold">Live subscription</div>
              <p className="text-[var(--muted)]">Subscribe once; changes you make here appear in your calendar automatically (needs a public URL).</p>
              <div className="mt-2 flex gap-2">
                <input readOnly value={webcal} className="flex-1 rounded-lg border border-[var(--line)] bg-gray-50 p-1.5 text-xs" />
                <Button variant="secondary" onClick={() => { void syncNow(); navigator.clipboard?.writeText(webcal); setCopied(true); }}>{copied ? "Copied" : "Copy"}</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
