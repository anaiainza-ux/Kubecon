"use client";
import { venue, zoneById } from "@/lib/data";

/** Schematic venue map with the walking route highlighted. */
export function VenueMap({ route, here, there }: { route: string[]; here?: string; there?: string }) {
  const pt = (id: string) => zoneById.get(id)!;
  const onRoute = (a: string, b: string) => route.some((z, i) => i > 0 && ((route[i - 1] === a && z === b) || (route[i - 1] === b && z === a)));
  return (
    <svg viewBox="0 0 100 100" className="h-56 w-full rounded-2xl bg-slate-50">
      {venue.paths.map((p) => {
        const a = pt(p.a), b = pt(p.b);
        const hot = onRoute(p.a, p.b);
        return <line key={`${p.a}-${p.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hot ? "#326ce5" : "#cbd5e1"} strokeWidth={hot ? 2.2 : 1.2} strokeDasharray={hot ? "3 2" : undefined} />;
      })}
      {venue.zones.map((z) => {
        const isHere = z.id === here, isThere = z.id === there;
        return (
          <g key={z.id}>
            <rect x={z.x - 13} y={z.y - 6} width={26} height={12} rx={3} fill={isThere ? "#326ce5" : isHere ? "#0f766e" : "white"} stroke="#94a3b8" strokeWidth={0.4} />
            <text x={z.x} y={z.y + 1.5} textAnchor="middle" fontSize={3.6} fill={isThere || isHere ? "white" : "#334155"}>
              {z.label.replace(" (A-E)", "")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
