"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/plan/1", match: "/plan", label: "Plan" },
  { href: "/live", match: "/live", label: "Live" },
  { href: "/share", match: "/share", label: "Share" },
  { href: "/people", match: "/people", label: "People" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand)] text-sm text-white">⎈</span>
          <span className="hidden sm:inline">KubeCon Companion</span>
        </Link>
        <nav className="ml-auto flex gap-1 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 ${path.startsWith(l.match) ? "bg-[var(--brand)] text-white" : "text-[var(--muted)] hover:bg-gray-100"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
