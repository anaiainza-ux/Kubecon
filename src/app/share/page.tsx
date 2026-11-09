"use client";
import { useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useStore } from "@/lib/store";
import { baseUrl, useHydrated } from "@/lib/client";
import { Card } from "@/components/ui";

/** Your two QR codes: share schedule (find overlap) and exchange contact (name + LinkedIn). */
export default function Share() {
  const hydrated = useHydrated();
  const profile = useStore((s) => s.profile);
  const update = useStore((s) => s.updateProfile);
  const [tab, setTab] = useState<"schedule" | "contact">("schedule");
  if (!hydrated) return null;

  const url = `${baseUrl()}/connect/${tab === "schedule" ? profile.shareToken : profile.contactToken}`;
  const field = (key: "name" | "linkedin" | "role" | "company", label: string, placeholder: string) => (
    <div className="flex items-center gap-2">
      <input type="checkbox" checked={profile.shareFields[key]} onChange={(e) => update({ shareFields: { ...profile.shareFields, [key]: e.target.checked } })} title="Share this" />
      <label className="flex-1 text-sm">
        <span className="text-xs text-[var(--muted)]">{label}</span>
        <input className="w-full rounded-lg border border-[var(--line)] p-1.5" value={profile[key]} placeholder={placeholder} onChange={(e) => update({ [key]: e.target.value })} />
      </label>
    </div>
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex rounded-xl border border-[var(--line)] bg-white p-1 text-sm">
        {(["schedule", "contact"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 ${tab === t ? "bg-[var(--brand)] text-white" : "text-[var(--muted)]"}`}>
            {t === "schedule" ? "📅 Share schedule" : "🤝 Exchange contact"}
          </button>
        ))}
      </div>

      <Card className="flex flex-col items-center gap-3 text-center">
        <QRCodeSVG value={url} size={220} level="M" />
        <p className="text-sm text-[var(--muted)]">
          {tab === "schedule"
            ? "Let someone scan this to see the talks you share, when you can meet up, and whether you'd enjoy the same themed lunch."
            : "Let someone scan this to swap names and LinkedIn. You'll both remember where you met."}
        </p>
        <code className="max-w-full truncate rounded bg-gray-50 px-2 py-1 text-[11px] text-[var(--muted)]">{url}</code>
      </Card>

      {tab === "schedule" ? (
        <Card className="space-y-2 text-sm">
          <div className="font-semibold">What to share</div>
          <label className="flex items-center gap-2"><input type="radio" checked={profile.shareScope === "day"} onChange={() => update({ shareScope: "day" })} /> Today only</label>
          <label className="flex items-center gap-2"><input type="radio" checked={profile.shareScope === "event"} onChange={() => update({ shareScope: "event" })} /> The whole conference</label>
        </Card>
      ) : (
        <Card className="space-y-3">
          <div className="text-sm font-semibold">Your card <span className="font-normal text-[var(--muted)]">(ticked fields are shared)</span></div>
          {field("name", "Name", "Alex Kim")}
          {field("linkedin", "LinkedIn", "https://linkedin.com/in/…")}
          {field("role", "Role", "Platform Engineer")}
          {field("company", "Company", "Acme")}
        </Card>
      )}

      <p className="text-center text-xs text-[var(--muted)]">
        Demo with one device: open{" "}
        <Link className="underline" href="/connect/demo-jordan">Jordan&apos;s schedule code</Link> or{" "}
        <Link className="underline" href="/connect/demo-jordan-card">Jordan&apos;s contact code</Link>.
      </p>
    </div>
  );
}
