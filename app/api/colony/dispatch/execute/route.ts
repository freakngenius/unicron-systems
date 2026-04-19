import { NextResponse } from "next/server";
import { z } from "zod";
import { executeJob } from "@/lib/patterns/colony/dispatch";
import { writeNotionJob } from "@/lib/patterns/colony/notion";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ job_id: z.string().uuid() });

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  try {
    await executeJob(parsed.data.job_id);
    await writeNotionJob(parsed.data.job_id).catch(() => void 0);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("colony execute failed", { err: String(e) });
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
