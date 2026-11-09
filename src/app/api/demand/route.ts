import { NextResponse } from "next/server";
import { getDemand, getFullSessionIds } from "@/lib/server/store";

export async function GET() {
  try {
    const [demand, full] = await Promise.all([getDemand(), getFullSessionIds()]);
    return NextResponse.json({ demand, full });
  } catch {
    return NextResponse.json({ demand: {}, full: [] });
  }
}
