"use client";
import type { ReactNode } from "react";
import type { Session } from "@/lib/types";
import { roomById, topicById } from "@/lib/data";
import { fmtTime } from "@/lib/time";

export const topicColor = (s: Pick<Session, "topics" | "kind">) =>
  s.kind === "keynote" ? "#326ce5" : s.kind === "activity" ? "#0f766e" : topicById.get(s.topics[0])?.color ?? "#64748b";

export function TopicChip({ id }: { id: string }) {
  const t = topicById.get(id);
  if (!t) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${t.color}1a`, color: t.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />
      {t.label}
    </span>
  );
}

export function DemandBadge({ demand }: { demand?: number }) {
  if (!demand || demand < 0.75) return null;
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800" title={`${Math.round(demand * 100)}% of seats already planned`}>
      {demand >= 1 ? "Likely full" : "Filling up"} · {Math.round(demand * 100)}%
    </span>
  );
}

export function SessionMeta({ s }: { s: Session }) {
  return (
    <div className="text-xs text-[var(--muted)]">
      {fmtTime(s.start)}–{fmtTime(s.end)} · {roomById.get(s.roomId)?.name}
      {s.speakers.length > 0 && s.kind !== "keynote" && <> · {s.speakers.map((p) => p.name).join(", ")}</>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm ${className}`}>{children}</div>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  className = "",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-[var(--brand)] text-white hover:brightness-110",
    secondary: "border border-[var(--line)] bg-white hover:bg-gray-50",
    ghost: "text-[var(--muted)] hover:bg-gray-100",
    danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  }[variant];
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
