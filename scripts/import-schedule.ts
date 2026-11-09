/**
 * Imports the real KubeCon + CloudNativeCon NA 2026 schedule into data/sessions.json and data/venue.json.
 * Source: the official machine-readable schedule mirror (events.linuxfoundation.org/.../program/schedule.md).
 *
 *   npm run data:import            # from the local snapshot data/kubecon-na-2026-schedule.md
 *   npm run data:import -- --fetch # refresh the snapshot from the website first
 *
 * Covers the main conference days (Tue–Thu). Keynotes are grouped into one block per morning.
 * Room walking times and capacities are estimates (see data/venue.json).
 */
import fs from "node:fs";
import path from "node:path";
import conference from "../data/conference.json";

const SOURCE_URL = "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/schedule.md";
const SNAPSHOT = path.join(__dirname, "..", "data", "kubecon-na-2026-schedule.md");

type Raw = { date: string; start: string; end: string; title: string; fields: Record<string, string>; description: string };

const MONTHS: Record<string, string> = { November: "11" };
const DAY_BY_DATE = new Map(conference.days.map((d) => [d.date, d.day]));

function to24(t: string): string {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) throw new Error(`Bad time "${t}"`);
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function parse(md: string): Raw[] {
  const out: Raw[] = [];
  let date = "";
  let cur: Raw | null = null;
  let inFields = false;
  const flush = () => {
    if (cur) { cur.description = cur.description.trim(); out.push(cur); }
    cur = null;
  };
  for (const line of md.split(/\r?\n/)) {
    const day = line.match(/^## \w+, (\w+) (\d+), (\d{4})$/);
    if (day) { flush(); date = `${day[3]}-${MONTHS[day[1]]}-${day[2].padStart(2, "0")}`; continue; }
    const head = line.match(/^### (.+?)–(.+?) · (.+)$/);
    if (head && date) {
      flush();
      cur = { date, start: to24(head[1]), end: to24(head[2]), title: head[3].trim(), fields: {}, description: "" };
      inFields = true;
      continue;
    }
    if (!cur) continue;
    const field = inFields && line.match(/^- ([A-Za-z][A-Za-z ]*): (.*)$/);
    if (field) { cur.fields[field[1]] = field[2].trim(); continue; }
    // fields follow the heading after a blank line; the next blank line ends them
    if (inFields && line.trim() === "") { if (Object.keys(cur.fields).length) inFields = false; continue; }
    if (!inFields) cur.description += `${line}\n`;
  }
  flush();
  return out;
}

// --- topics -----------------------------------------------------------------
const TRACK_TOPIC: Record<string, string> = {
  "AI Inference + Agentic": "agentic",
  "Platform Engineering": "platform",
  Observability: "observability",
  "Operations + Performance": "ops",
  Security: "security",
  "Application Development + Delivery": "appdev",
  "Cloud Native Experience": "experience",
  Connectivity: "connectivity",
  "Data Processing + Storage": "data",
  "Emerging + Advanced": "emerging",
  "Cloud Native Novice": "experience",
  "Inclusion + Accessibility": "experience",
};

const KEYWORDS: Record<string, RegExp> = {
  agentic: /\b(agents?|agentic|llms?|inference|ai|gpus?|models?|mcp|genai|vllm|kserve|llm-d|rag|machine learning|ml|training|kubeflow|ray|kuberay|tokens?)\b/gi,
  security: /\b(security|secure|securing|supply chain|sbom|vulnerabilit\w*|cves?|policy|policies|opa|kyverno|falco|identity|spiffe|spire|zero trust|rbac|secrets?|compliance|threats?|sigstore|attestations?|sandbox\w*|isolation)\b/gi,
  platform: /\b(platform|platforms|backstage|golden paths?|developer portal|idp|gitops|argo|argo ?cd|flux|crossplane|self-service|internal developer)\b/gi,
  observability: /\b(observability|opentelemetry|otel|prometheus|metrics|tracing|traces|logs|logging|monitoring|profiling|slos?|jaeger|grafana|telemetry)\b/gi,
  ops: /\b(operations|upgrades?|autoscal\w*|karpenter|reliability|sre|incidents?|cost|finops|performance|scaling|etcd|scheduler|scheduling|kueue|resources?|nodes?|day-2|kubelet)\b/gi,
  connectivity: /\b(network\w*|gateway api|gateway|service mesh|istio|envoy|cilium|ebpf|linkerd|dns|ingress|traffic|multi-cluster)\b/gi,
  data: /\b(storage|database\w*|postgres\w*|data|stateful\w*|kafka|volumes?|csi|backups?|vector|etl|streaming)\b/gi,
  appdev: /\b(developers?|applications?|apps?|wasm|webassembly|serverless|knative|dapr|ci\/cd|delivery|builds?|buildpacks|helm|operators?|controllers?|apis?)\b/gi,
  experience: /\b(community|contributors?|contributing|maintainers?|careers?|novice|beginners?|first[- ]time|mentor\w*|inclusion|accessib\w*|education|learning|documentation|governance)\b/gi,
  emerging: /\b(edge|sustainab\w*|carbon|energy|quantum|robotics|physical ai|confidential|emerging|wasi|satellites?)\b/gi,
};

function classify(text: string): [string, number][] {
  return Object.entries(KEYWORDS)
    .map(([topic, re]) => [topic, (text.match(re) ?? []).length] as [string, number])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
}

function topicsFor(r: Raw): string[] {
  const track = r.fields.Track ?? "";
  const scores = classify(`${r.title} ${r.title} ${r.description}`);
  const primary = TRACK_TOPIC[track] ?? scores[0]?.[0];
  const secondary = scores.find(([t, n]) => t !== primary && n >= 2)?.[0];
  return [primary, secondary].filter(Boolean) as string[];
}

function keywordsFor(text: string): string {
  const words = new Set<string>();
  for (const re of Object.values(KEYWORDS)) for (const m of text.match(re) ?? []) words.add(m.toLowerCase());
  return [...words].slice(0, 12).join(" ");
}

// --- rooms + zones ----------------------------------------------------------
type Room = { id: string; name: string; zone: string; floor: number; capacity: number };
const rooms = new Map<string, Room>();

function zoneFor(room: string): string {
  if (/off-site/i.test(room)) return "offsite";
  if (/hyatt/i.test(room)) return "hyatt";
  if (/200 South Entrance|East Registration|Upper Mezzanine/i.test(room)) return "entrance";
  if (/Level 2 \| 255/.test(room)) return "sp-255";
  if (/Level 2/.test(room)) return "sp-250";
  if (/Grand Ballroom|\| 151/.test(room)) return "sp-ballrooms";
  return "sp-halls";
}

function capacityFor(name: string): number {
  if (/Hall DE/.test(name)) return 8000;
  if (/Halls A-C/.test(name)) return 5000;
  if (/Pavilion/.test(name)) return 300;
  if (/Solutions Showcase|Theater|Nook/.test(name)) return 120;
  if (/Grand Ballroom (ACE|BDF)/.test(name)) return 1200;
  if (/Grand Ballroom|Regency Ballroom B-D/.test(name)) return 800;
  if (/250 A-C/.test(name)) return 700;
  if (/250 D-F|Regency Ballroom CD|Salt Lake Ballroom DE/.test(name)) return 500;
  if (/251|255 BC|255 EF|151|Salt Lake Ballroom C|Regency Ballroom [AB]\b/.test(name)) return 350;
  if (/254/.test(name)) return 250;
  if (/255 [AD]\b/.test(name)) return 150;
  return 100;
}

function roomFor(raw: string): string {
  const id = raw.toLowerCase().replace(/salt palace/g, "sp").replace(/hyatt regency/g, "hyatt").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!rooms.has(id)) {
    const parts = raw.split("|").map((p) => p.trim());
    const building = parts[0];
    const level = parts.find((p) => /^Level \d/.test(p));
    const rest = parts.slice(1).filter((p) => p !== level && !/Zone$/.test(p));
    let name = rest.length ? rest.join(" · ") : building;
    if (/hyatt/i.test(building) && rest.length) name += " (Hyatt)";
    rooms.set(id, { id, name, zone: zoneFor(raw), floor: level ? Number(level.match(/\d+/)![0]) : 1, capacity: capacityFor(raw) });
  }
  return id;
}

// --- kinds ------------------------------------------------------------------
const SKIP_TRACKS = /Registration|Co-located Events/;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

function kindFor(r: Raw): { kind: "talk" | "workshop" | "keynote" | "activity"; activityType?: string } {
  const track = r.fields.Track ?? "";
  const long = minutes(r.end) - minutes(r.start) > 150;
  if (track === "Keynote Sessions") return { kind: "keynote" };
  if (track === "Breaks") return { kind: "activity", activityType: "food" };
  if (/Tutorials|Contribfest/.test(track)) return { kind: "workshop" };
  if (/Crawl|Fest|Trivia/i.test(r.title)) return { kind: "activity", activityType: "social" };
  if (track === "Solutions Showcase" && (long || /In-Booth Demos/.test(r.title))) return { kind: "activity", activityType: "expo" };
  if (/Pavilion Tours|Poster Sessions|Project Pavilion Stage|Project Opportunities/.test(track) || long) return { kind: "activity", activityType: "expo" };
  if (track === "Experiences" && /meetup|pup|yoga|run|walk|photo|game|crawl/i.test(r.title)) return { kind: "activity", activityType: "social" };
  return { kind: "talk" };
}

// --- main -------------------------------------------------------------------
async function main() {
  if (process.argv.includes("--fetch")) {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    fs.writeFileSync(SNAPSHOT, await res.text());
    console.log(`Refreshed snapshot from ${SOURCE_URL}`);
  }
  const raws = parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const offset = conference.utcOffset;
  const iso = (date: string, hhmm: string) => `${date}T${hhmm}:00${offset}`;
  const dayStart = minutes(conference.dayStart), dayEnd = minutes(conference.dayEnd);

  const sessions: Record<string, unknown>[] = [];
  const keynotesByDay = new Map<string, Raw[]>();
  let skipped = 0;

  for (const r of raws) {
    const day = DAY_BY_DATE.get(r.date);
    const track = r.fields.Track ?? "";
    const labels = r.fields.Labels ?? "";
    if (!day || SKIP_TRACKS.test(track) || /Separate Registration Required/.test(labels)) { skipped++; continue; }
    if (minutes(r.start) < dayStart || minutes(r.end) > dayEnd) { skipped++; continue; }
    const { kind, activityType } = kindFor(r);
    if (kind !== "keynote" && minutes(r.end) - minutes(r.start) < 5) { skipped++; continue; } // 1-minute remarks etc.
    if (kind === "keynote") { keynotesByDay.set(r.date, [...(keynotesByDay.get(r.date) ?? []), r]); continue; }
    const id = `s${r.fields.Link?.match(/id=(\d+)/)?.[1] ?? sessions.length}`;
    const text = `${r.title} ${r.description}`;
    sessions.push({
      id,
      kind,
      ...(activityType ? { activityType } : {}),
      title: r.title,
      abstract: r.description.slice(0, 1500),
      keywords: keywordsFor(text),
      speakers: (r.fields.Speakers ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((name) => ({ name, company: "" })),
      topics: kind === "activity" ? [] : topicsFor(r),
      level: /Beginner/.test(labels) ? "Beginner" : /Advanced/.test(labels) ? "Advanced" : "Any Level",
      track,
      day,
      start: iso(r.date, r.start),
      end: iso(r.date, r.end),
      roomId: roomFor(r.fields.Room ?? "Salt Palace"),
      seriesId: r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      link: r.fields.Link,
    });
  }

  // One block per run of back-to-back keynotes.
  for (const [date, list] of keynotesByDay) {
    list.sort((a, b) => minutes(a.start) - minutes(b.start));
    const groups: Raw[][] = [];
    for (const k of list) {
      const g = groups.at(-1);
      if (g && minutes(k.start) - minutes(g.at(-1)!.end) <= 15) g.push(k);
      else groups.push([k]);
    }
    groups.forEach((g, i) => {
      const day = DAY_BY_DATE.get(date)!;
      const lineup = g.filter((k) => !/Remarks/.test(k.title));
      sessions.push({
        id: `k${day}${i ? `-${i}` : ""}`,
        kind: "keynote",
        title: `Keynotes · ${conference.days.find((d) => d.day === day)!.label.split(",")[0]}${groups.length > 1 ? ` (${i === 0 ? "morning" : "afternoon"})` : ""}`,
        abstract: lineup.map((k) => `${k.start} ${k.title}${k.fields.Speakers ? ` — ${k.fields.Speakers}` : ""}`).join("\n"),
        keywords: keywordsFor(lineup.map((k) => `${k.title} ${k.description}`).join(" ")),
        speakers: [...new Set(lineup.flatMap((k) => (k.fields.Speakers ?? "").split(",").map((s) => s.trim()).filter(Boolean)))].map((name) => ({ name, company: "" })),
        topics: [...new Set(lineup.flatMap((k) => topicsFor(k)))].slice(0, 4),
        level: "Any Level",
        track: "Keynote Sessions",
        day,
        start: iso(date, g[0].start),
        end: iso(date, g.reduce((m, k) => (minutes(k.end) > minutes(m) ? k.end : m), g[0].end)),
        roomId: roomFor(g[0].fields.Room ?? "Salt Palace | Level 1 | Hall DE"),
        seriesId: `keynotes-${date}-${i}`,
        link: g[0].fields.Link,
      });
    });
  }

  // Companion feature (not part of the official schedule): themed lunch tables during each real lunch break.
  const lunchRoom = roomFor("Salt Palace | Level 1 | Halls A-C, Halls 1-5");
  for (const lunch of sessions.filter((s) => /Lunch/.test(s.title as string))) {
    const start = lunch.start as string;
    const endMin = minutes(start.slice(11, 16)) + 60;
    const endLocal = iso(start.slice(0, 10), `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`);
    for (const t of conference.topics) {
      sessions.push({
        id: `lunch-${lunch.day}-${t.id}`,
        kind: "activity",
        activityType: "lunch",
        title: `Themed Lunch Table: ${t.label}`,
        abstract: `Companion meetup: eat lunch with people who care about ${t.label}. Look for the ${t.label} sign in the lunch hall.`,
        keywords: "lunch",
        speakers: [],
        topics: [t.id],
        level: "Any Level",
        track: "Companion",
        day: lunch.day,
        start,
        end: endLocal,
        roomId: lunchRoom,
        seriesId: `lunch-${t.id}`,
      });
    }
  }

  sessions.sort((a, b) => (a.start as string).localeCompare(b.start as string));
  fs.writeFileSync(path.join(__dirname, "..", "data", "sessions.json"), JSON.stringify(sessions, null, 1));

  const venuePath = path.join(__dirname, "..", "data", "venue.json");
  const venue = JSON.parse(fs.readFileSync(venuePath, "utf8"));
  venue.rooms = [...rooms.values()].sort((a, b) => a.zone.localeCompare(b.zone) || a.name.localeCompare(b.name));
  fs.writeFileSync(venuePath, JSON.stringify(venue, null, 2));

  const counts = sessions.reduce<Record<string, number>>((acc, s) => ((acc[s.kind as string] = (acc[s.kind as string] ?? 0) + 1), acc), {});
  console.log(`Imported ${sessions.length} sessions (${JSON.stringify(counts)}), ${rooms.size} rooms; skipped ${skipped} (other days, registration, co-located, outside ${conference.dayStart}–${conference.dayEnd}).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
