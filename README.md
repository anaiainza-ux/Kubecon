# KubeCon Companion: smart scheduler (Elasticsearch track)

Plan KubeCon NA 2026 (Salt Lake City, Nov 10–12) without clashes, overflowing rooms or forgotten contacts.

## Quick start

```bash
npm install
cp .env.local.example .env.local      # already done locally
docker compose up -d                  # Elasticsearch 9.5 on :9200 (add --profile kibana for Kibana on :5601)
npm run seed                          # indexes the real schedule (503 sessions), 600 simulated attendees, demo attendee "Jordan Rivera"
npm run dev                           # http://localhost:3000
npm test                              # scheduler unit tests
```

**Elastic Cloud:** set `ES_URL` and `ES_API_KEY` in `.env.local`, then run `npm run seed`. No code changes are needed.
**Phones at the demo:** run `npm run dev:lan` and set `NEXT_PUBLIC_BASE_URL=http://<laptop-LAN-IP>:3000` so the QR codes point at your laptop.
**Real schedule data:** `data/sessions.json` is imported from the official KubeCon + CloudNativeCon NA 2026 schedule ([machine-readable mirror](https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/schedule.md), snapshot in `data/kubecon-na-2026-schedule.md`). Run `npm run data:import` to rebuild it, or `npm run data:import -- --fetch` to pull the latest schedule first, then `npm run seed`.
  - It covers Tue–Thu (the main conference). Keynotes are grouped into one block per morning, and registration, co-located events and 1-minute remarks are skipped.
  - Room walking times and capacities in `data/venue.json` are estimates.
  - Themed lunch tables are a Companion feature added during each real lunch break.

## Screens

| Route | What it does |
|---|---|
| `/` | Screen 1: what the conference is and its 10 topic areas |
| `/onboarding` | Screen 2: pick interests (+ themed-lunch opt-in) → search talks/speakers (ES fuzzy + autocomplete) → import calendar (.ics upload, iCal URL, demo calendar, manual) |
| `/plan/[day]` | Screen 3: day builder, described below |
| `/live` | Day-of mode: now/next, "leave by", directions + map, *Room is full* / *I missed it* → gap fill. A demo clock lets you time-travel. |
| `/share` | QR codes: **Share schedule** (today or the whole event) and **Exchange contact** (only the fields you tick) |
| `/connect/[token]` | Opens after a scan: talks in common, meet-up windows, themed-lunch match |
| `/people` | Everyone you met, with the talk/activity you were at, plus a LinkedIn button |

## How the scheduler works

All of this lives in `src/lib/scheduler/*`. These are pure functions, unit tested in `tests/scheduler.test.ts`.

1. **Travel model** (`venue.ts`): `walk(zoneA, zoneB) + 2 min per floor + 2 min buffer`.
   - Offsite calendar events add 15 minutes of travel. Video calls add none.
2. **Feasibility** (`feasibility.ts`): A then B is OK when `B.start ≥ A.end + walk`.
   - Arriving up to 5 minutes late is allowed but flagged.
   - Drop-in activities like lunch allow 30 minutes.
3. **Day builder:**
   - Locked calendar blocks and must-see anchors (★, dashed) are placed first.
   - The builder then focuses on the next free window after your last pick. That window is highlighted, and arrows point to the options:
     - **Recommended:** the top 3
     - **Also in this window**
     - **Clashes you might like**
     - **Themed lunch**
     - **Leave free**
   - Tap any picked talk to see alternatives for that slot, or tap any gap to fill it.
4. **Recommendations** (`recommend.ts` → `/api/recommend`): an Elasticsearch `function_score` query.
   - Filters: day and time window.
   - Should clauses:
     - per-topic interest boosts
     - `more_like_this` on your previous talk
     - followed speakers
   - A `gauss` decay on start time ranks smaller gaps higher.
   - Named queries (`_name` → `matched_queries`) give the "why" chips.
   - The app then re-ranks against your real timeline (reachability, lateness, predicted demand).
5. **Clashes + backtracking** (`backtrack.ts`, UI in `plan/[day]`): you can see every option, including ones that clash.
   - The options lane next to your day draws each option at its real time. A talk that clashes (↺, orange) sits right beside the pick it would replace, and hovering it outlines that pick in red.
   - **Pick a clashing talk:** it swaps out the pick(s) it overlaps. The time this frees *before* the new talk becomes the highlighted gap, e.g. pick a 9:45 talk over a 9:30–10:30 one and **9:30–9:45** opens up.
   - **In a gap you can:**
     - fill it (talks that fit, ranked by ES and similar to what you swapped out)
     - **go further back**: pick an earlier talk (e.g. 9:20) that replaces the pick before the gap, which frees **9:00–9:20** next
     - keep it free
   - Backtracking never touches anything at or after the talk you just picked, and never moves locked calendar blocks. The amber trail lists every change, with **Undo last change** and **Restore my original plan**. If a swapped-out talk repeats later, the trail offers to add it there.
6. **Demand** (`/api/demand`): a `terms` aggregation over every attendee's schedule ÷ room capacity → "Filling up / Likely full" badges.
7. **Gap fill** (`gapfill.ts` → `/api/live/gapfill`): one ES query finds:
   - talks you can still join (started ≤ 10 minutes ago)
   - talks that fit before you must leave for your next item
   - activities open now (merch, expo, lounge, themed lunch)

   It excludes rooms marked full, then ranks by interest, then walking distance.
8. **Social** (`social.ts`): talks in common, overlapping free time of 15+ minutes (with a meeting spot), finishing in the same wing, and themed-lunch matches. A connection also records what you were attending at the moment you scanned.

If Elasticsearch is unreachable, search, recommendations and gap fill fall back to local logic, so the demo keeps working.

## Demo script (about 4 minutes)

1. `/` → **Plan my KubeCon**:
   - Tap Security twice and Platform Engineering once.
   - Keep themed lunch on (Security), and enter a name.
2. Search `fabian kamel` (typo on purpose): Elasticsearch fuzzy matching finds **Fabian Kammel**. Follow them, and ★ a talk.
3. Click **Use demo calendar**. This adds a daily 13:00 Zoom standup, a Day 1 offsite dinner at 17:30, and a Day 2 offsite customer coffee. Then **Build my schedule**.
4. **Day 1 (Tue):** pick the keynote block. The highlighted slot jumps to the next talks, with arrows to the recommendations. Then pick **Securing Rural Colorado with Open Source** (11:30) and **What the Docs Don't Tell You** (12:20).
5. **Clash + backtrack** (wide window, so the options lane shows):
   1. In the options lane, the orange ↺ talks overlap your 12:20 pick. Pick **CNCF Bingo** (12:32).
   2. The 12:20 talk is swapped out (ghosted) and **12:00–12:32** is highlighted in amber. It fits 12:02, 12:05 and 12:17 talks.
   3. Under **Go further back**, pick **AI on Kubernetes Is Just a Pod With a GPU** (11:47). It replaces your 11:30 pick and opens **10:46–11:47** with more options.
   4. Use **Undo last change** or **Restore my original plan** to show nothing is lost.
6. Finish the day, choose **Build Wed now**, then **Export** (.ics / Google / webcal).
7. `/live`: set the demo clock to a day and time inside a talk, then click **Room is full**. Suggestions appear: join-late talks, merch and the lounge.
8. `/share` → **Jordan's schedule code**: talks in common, meet-up windows and *"Have lunch together at the Security table"*. Then **Jordan's contact code** → `/people` shows Jordan with "Met during …" and a LinkedIn button.

## Elasticsearch indices

| Index | Purpose |
|---|---|
| `kubecon-sessions` | talks, workshops, keynotes and activities. `title`/`speakers.name` have `search_as_you_type`; english analyzers for MLT. |
| `kubecon-attendees` | profile + plans (`_source`); `scheduleIds` is indexed for the demand aggregation and `shareToken`/`contactToken` for QR lookups |
| `kubecon-connections` | one doc per direction of each scan (owner, other, type, at, context, shared card) |

## Ideas if there's time

- `semantic_text` + ELSER on Elastic Cloud for natural-language search ("help me secure my supply chain")
- Web NFC tap-to-share on Android (QR stays as the fallback)
- Real room occupancy from door counters → `/api/session-status`
