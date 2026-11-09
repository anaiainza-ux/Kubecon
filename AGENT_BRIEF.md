# Agent brief: KubeCon Companion (hackathon project)

You're joining a project in progress. Read this fully before touching code.

## What we're building and why
A team is competing in a **KubeCon + CloudNativeCon North America 2026 hackathon** (Salt Lake City; hackathon Nov 9, conference Nov 10–12, 2026). The challenge is to make conferences easier to navigate:
- talks clash
- rooms fill up
- the best conversations happen in the hallways
- people go home with contacts they can't place

We're entering the **Elasticsearch sponsored track**, so Elasticsearch must visibly power the core features.

The user has their own vision for the overall app. This repo is **the scheduler part**: a functional, prototype-level web app the team can demo and later fold into their app shell. It must work in a live demo, but it doesn't need to be production-grade.

## Working agreements (important)
- **Only change what the user explicitly asks for.** They consider the current app a good base. If a requested change forces a ripple elsewhere, keep it minimal and say what else changed and why.
- Keep the scheduler logic as **pure functions** in `src/lib/scheduler/`, so it can move into the team's own app.
- Keep the demo safe. Search, recommendations and gap fill fall back to local logic if Elasticsearch is down, so preserve that.
- Use **real event data**. Don't invent sessions. The one exception is themed lunch tables, a Companion feature added during each real lunch break.
- Refer to people (users, speakers) with they/them unless told otherwise.

## The user's intended UX flow
1. **Screen 1:** what the conference is about and its topic areas.
2. **Screen 2:** pick interest areas, then search specific talks or speakers (must-sees), then import non-negotiables from a personal calendar.
3. **Screen 3, day builder:** one day at a time. Calendar blocks are locked, and must-sees are pre-placed as anchors. You pick a talk; the app then suggests the next ones based on interests, the last talk's end time, and walking time between rooms. The next free slot is highlighted, with arrows to the options.
4. **Clashes and backtracking** (the user's current focus):
   - Show every option, including clashing ones.
   - Example: you have 9:00–9:30 and 9:30–10:30. You pick a 9:45 talk, so the 9:30 pick is swapped out and **9:30–9:45** is freed and highlighted.
   - The app offers talks that fit the gap, or **going further back**: a 9:20 talk that replaces the 9:00 pick, which then frees 9:00–9:20, and so on.
   - Nothing at or after the new pick changes. Every step can be undone.
5. When a day is finished, it asks: "Build the next day now" or "Save & finish later". Export goes to Outlook, Apple and Google (`.ics`, per-event Google links, webcal subscription).
6. **Live mode (day of):** where you should be now, a "leave by" time, directions and a map. "Room is full" or "I missed it" brings up options that fit the gap (talks you can still join, merch, expo, lounge).
7. **Social:**
   - QR schedule share (today or the whole event): talks in common, upcoming free time you share with a meeting spot, and a themed-lunch match when both opted in to the same theme or share an interest.
   - QR contact exchange: name, LinkedIn, role and company, only the fields each person ticked.
   - **People I met** page: what you were attending when you met, and a LinkedIn link.

## Status: all of the above is built and working
- Stack: Next.js 15 (App Router), React 19, TypeScript 5.9, Tailwind 4, zustand (persisted to localStorage, synced to ES), Elasticsearch 9.5.3 in Docker (`@elastic/elasticsearch` 9.5.1), node-ical, ics, qrcode.react, vitest.
- `npm test`: 14 passing tests covering feasibility, the backtracking story, gap fill and social.
- **The UI has never been visually checked by an agent** (Claude in Chrome wasn't connected). Logic was verified with tests and API scripts, and the user reviews screens in their browser.

## Repo map (`C:\Users\aiain\Kubecon`, not a git repo)
- `data/`
  - `kubecon-na-2026-schedule.md`: snapshot of the official machine-readable schedule
  - `sessions.json`: 503 imported sessions, Tue–Thu = day 1–3
  - `venue.json`: real rooms; zones, walking times and capacities are **estimates**
  - `conference.json`: dates, America/Denver (UTC-7) timezone, the 10 real content tracks as topics
  - `sample-personal.ics`: demo calendar
- `scripts/`
  - `import-schedule.ts` (`npm run data:import [-- --fetch]`): parses the schedule mirror. Groups keynotes into one block per morning; skips registration, co-located events and items under 5 minutes; adds lunch tables.
  - `seed.ts` (`npm run seed`): creates the ES indices; loads sessions, 600 simulated attendees (for demand stats) and demo attendee **Jordan Rivera** (QR tokens `demo-jordan`, `demo-jordan-card`).
  - `dev/*`: API smoke and backtracking simulation scripts.
- `src/lib/`
  - `scheduler/feasibility.ts`
    - `Slot`; `clashes` (overlap or walk too long; 5 minutes late allowed; activities like lunch allow 30)
    - `freeWindows`
  - `scheduler/recommend.ts`
    - `buildRecommendQuery`: ES `function_score` with per-topic interest boosts, `more_like_this`, followed speakers and a `gauss` time decay. Named queries give the "why" chips.
    - `rankCandidates`: sorts options into `recommended / also / swaps / blocked`. In gap mode, options that would swap out anything at or after the gap are excluded.
  - `scheduler/backtrack.ts`: `placeWithSwap` (returns displaced picks, `gapBefore` and `gapAfter`), `leftoverGaps`, `repeatThatFits`.
  - `scheduler/gapfill.ts`: live-mode window and the ES query.
  - `social.ts`: common talks, meetups, lunch match, meeting context.
  - `venue.ts`: travel time model and directions.
  - `ics.ts` (server only, uses node-ical) and `calendar-links.ts` (client-safe Google links).
  - `store.ts`: zustand; persist version 2 drops unknown session ids.
  - `es.ts`, `indices.ts`, `server/store.ts`: ES client, mappings, attendee/demand helpers.
- `src/app/`
  - pages: `/`, `/onboarding`, `/plan/[day]`, `/live`, `/share`, `/connect/[token]`, `/people`
  - `api/`: `search`, `recommend`, `demand`, `import-ics`, `export/[userId]`, `me`, `live/gapfill`, `session-status`, `connect`, `connections`
- `src/components/`
  - `DayTimeline.tsx`: your plan, plus an options lane where clashes (orange ↺) appear beside the pick they'd replace, plus ghosts of swapped-out talks
  - `OptionPanel.tsx`: recommended cards, grouped option lists, the backtrack trail with undo
  - `VenueMap`, `ExportMenu`, `ui.tsx`
- The day builder's state machine is in `src/app/plan/[day]/page.tsx`.
  - Focus modes: `forward` (next free window after the cursor), `gap` (backtracking into freed time) and `replace` (the user tapped a picked talk).
  - A `Backtrack` object holds the steps, a queue of gaps and an undo stack of plan snapshots.

Elasticsearch indices: `kubecon-sessions` (search_as_you_type on title and speaker names, english analyzers), `kubecon-attendees` (profile in `_source`; `scheduleIds` indexed for the demand `terms` aggregation), `kubecon-connections`.

## Running it
```bash
docker compose up -d     # Elasticsearch on :9200
npm run seed             # (re)index real data + simulated attendees
npm run dev              # http://localhost:3000  (npm run dev:lan + NEXT_PUBLIC_BASE_URL for phones)
npm test
```
`ES_URL` / `ES_API_KEY` in `.env.local` switch to Elastic Cloud.

**Gotchas**
- The machine has hit **low memory**; Claude Code has already killed the dev server once. Don't start long-running processes unless asked.
- `next build` overwrites the dev server's `.next`, so stop the dev server first.
- Stopping a background `npx next dev` task can leave an orphaned `node ... next\dist\server\lib\start-server.js` holding port 3000. Check that its command line is under `C:\Users\aiain\Kubecon` before stopping it.

## Known limitations
- Walking times and room capacities are estimates.
- Monday co-located events are excluded.
- The real schedule has almost no repeat sessions, so the "add it at its repeat" option rarely shows.
- There's no auth: `userId` lives in localStorage.
- "Tap phones" is a QR code that opens a URL (Web NFC is a stretch goal).
- The webcal subscription needs a public URL.

The README has a demo script that walks the backtracking story on real Tuesday talks (11:30 → 12:20 → pick 12:32 → freed 12:00–12:32 → go back to 11:47 → freed 10:46–11:47).
