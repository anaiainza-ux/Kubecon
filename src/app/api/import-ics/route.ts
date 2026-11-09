import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { icsToBlocks } from "@/lib/ics";

/** Accepts multipart (file), JSON { url } for an iCal subscription link, or { sample: true } for the demo calendar. */
export async function POST(req: Request) {
  try {
    let text: string;
    let hideTitles = false;
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      text = await file.text();
      hideTitles = form.get("hideTitles") === "true";
    } else {
      const body = (await req.json()) as { url?: string; sample?: boolean; hideTitles?: boolean };
      hideTitles = Boolean(body.hideTitles);
      if (body.sample) {
        text = await fs.readFile(path.join(process.cwd(), "data", "sample-personal.ics"), "utf8");
      } else if (body.url) {
        const res = await fetch(body.url.replace(/^webcal:/, "https:"));
        if (!res.ok) return NextResponse.json({ error: `Could not fetch calendar (${res.status})` }, { status: 400 });
        text = await res.text();
      } else {
        return NextResponse.json({ error: "Provide a file, url or sample" }, { status: 400 });
      }
    }
    return NextResponse.json({ blocks: icsToBlocks(text, { hideTitles }) });
  } catch (e) {
    return NextResponse.json({ error: `Could not read calendar: ${(e as Error).message}` }, { status: 400 });
  }
}
