import { getSession } from "@/lib/data";
import { sessionsToIcs } from "@/lib/ics";
import { getAttendee } from "@/lib/server/store";
import type { Session } from "@/lib/types";

/** .ics of a user's plan (optionally one day). Also works as a webcal:// subscription URL. */
export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const day = new URL(req.url).searchParams.get("day");
  const a = await getAttendee(userId.replace(/\.ics$/, ""));
  if (!a) return new Response("Unknown user — open the planner once so your schedule syncs.", { status: 404 });
  const days = day ? [Number(day)] : Object.keys(a.plans).map(Number);
  const items = days.flatMap((d) => a.plans[d]?.sessionIds ?? []).map((id) => getSession(id)).filter(Boolean) as Session[];
  const ics = sessionsToIcs(items, "KubeCon NA 2026 — my schedule");
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="kubecon-schedule${day ? `-day${day}` : ""}.ics"`,
    },
  });
}
