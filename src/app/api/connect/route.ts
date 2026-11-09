import { NextResponse } from "next/server";
import { es, INDEX } from "@/lib/es";
import { conference } from "@/lib/data";
import { dayOf } from "@/lib/time";
import { commonSessions, contextAt, lunchMatch, meetupOpportunities } from "@/lib/social";
import { findAttendeeByToken, getAttendee } from "@/lib/server/store";
import type { Attendee } from "@/lib/types";

/** Only the fields a person chose to share. */
function cardOf(a: Attendee) {
  const f = a.shareFields;
  return {
    userId: a.userId,
    name: f.name ? a.name : "Anonymous attendee",
    linkedin: f.linkedin ? a.linkedin : "",
    role: f.role ? a.role : "",
    company: f.company ? a.company : "",
  };
}

/**
 * Called when someone scans a QR code. Creates a mutual connection and returns
 * what the two of you have in common (schedule share) or the exchanged contact card.
 */
export async function POST(req: Request) {
  const { token, userId, now } = (await req.json()) as { token: string; userId: string; now: number };
  const [found, me] = await Promise.all([findAttendeeByToken(token), getAttendee(userId)]);
  if (!found) return NextResponse.json({ error: "This code isn't valid any more." }, { status: 404 });
  if (!me) return NextResponse.json({ error: "Set up your profile first." }, { status: 400 });
  const other = found.attendee;
  if (other.userId === me.userId) return NextResponse.json({ error: "That's your own code 🙂" }, { status: 400 });

  const ctx = contextAt(me, now).sessionId ? contextAt(me, now) : contextAt(other, now);
  const base = { type: found.kind, at: new Date(now).toISOString(), contextSessionId: ctx.sessionId ?? null, contextLabel: ctx.label };
  await es().bulk({
    refresh: "wait_for",
    operations: [
      { index: { _index: INDEX.connections, _id: `${me.userId}:${other.userId}:${found.kind}` } },
      { ...base, owner: me.userId, other: other.userId, card: cardOf(other) },
      { index: { _index: INDEX.connections, _id: `${other.userId}:${me.userId}:${found.kind}` } },
      { ...base, owner: other.userId, other: me.userId, card: cardOf(me) },
    ],
  });

  if (found.kind === "contact") {
    return NextResponse.json({ kind: "contact", card: cardOf(other), context: ctx.label });
  }

  const today = dayOf(now) ?? conference.days[0].day;
  const scope = other.shareScope;
  const days = scope === "day" ? [today] : conference.days.map((d) => d.day);
  return NextResponse.json({
    kind: "schedule",
    card: cardOf(other),
    scope,
    days,
    theirPlans: Object.fromEntries(days.map((d) => [d, other.plans[d]?.sessionIds ?? []])),
    common: commonSessions(me, other, days),
    meetups: meetupOpportunities(me, other, now, scope, today),
    lunch: lunchMatch(me, other, now, scope, today),
    context: ctx.label,
  });
}
