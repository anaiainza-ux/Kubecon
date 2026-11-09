import { NextResponse } from "next/server";
import { es, INDEX } from "@/lib/es";
import { sessions } from "@/lib/data";
import type { Session } from "@/lib/types";

/** Talk + speaker search: fuzzy multi_match plus search_as_you_type prefix matching, with highlights. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ sessions: [], speakers: [] });
  try {
    const r = await es().search<Session>({
      index: INDEX.sessions,
      size: 12,
      query: {
        bool: {
          must_not: [{ term: { kind: "activity" } }],
          should: [
            { multi_match: { query: q, fields: ["title^3", "speakers.name^4", "keywords^2", "abstract", "speakers.company"], fuzziness: "AUTO" } },
            { multi_match: { query: q, type: "bool_prefix", fields: ["title.suggest", "title.suggest._2gram", "speakers.name.suggest", "speakers.name.suggest._2gram"], boost: 2 } },
          ],
          minimum_should_match: 1,
        },
      },
      highlight: { fields: { title: {}, "title.suggest": {}, "speakers.name": {} }, pre_tags: ["<mark>"], post_tags: ["</mark>"] },
    });
    const speakers = new Set<string>();
    const out = r.hits.hits.map((h) => {
      for (const frag of h.highlight?.["speakers.name"] ?? []) {
        const plain = frag.replace(/<\/?mark>/g, "");
        if (h._source!.speakers.some((s) => s.name === plain)) speakers.add(plain);
      }
      return { id: h._source!.id, titleHtml: h.highlight?.title?.[0] ?? h.highlight?.["title.suggest"]?.[0] ?? null };
    });
    return NextResponse.json({ sessions: out, speakers: [...speakers], source: "elasticsearch" });
  } catch {
    // Fallback: substring match so the demo still works without ES
    const lc = q.toLowerCase();
    const hits = sessions.filter((s) => s.kind !== "activity" && (s.title.toLowerCase().includes(lc) || s.speakers.some((p) => p.name.toLowerCase().includes(lc))));
    const speakers = [...new Set(hits.flatMap((s) => s.speakers.map((p) => p.name)).filter((n) => n.toLowerCase().includes(lc)))];
    return NextResponse.json({ sessions: hits.slice(0, 12).map((s) => ({ id: s.id, titleHtml: null })), speakers, source: "local" });
  }
}
