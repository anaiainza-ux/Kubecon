import { NextResponse } from "next/server";
import { es, INDEX } from "@/lib/es";
import type { Connection } from "@/lib/types";

export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ connections: [] });
  try {
    const r = await es().search<Connection>({ index: INDEX.connections, size: 200, query: { term: { owner: userId } }, sort: [{ at: "desc" }] });
    return NextResponse.json({ connections: r.hits.hits.map((h) => h._source) });
  } catch {
    return NextResponse.json({ connections: [] });
  }
}
