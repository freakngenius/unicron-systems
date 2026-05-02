import { NextResponse } from "next/server";
import { z } from "zod";
import { createJob } from "@/lib/patterns/colony/dispatch";

export const runtime = "nodejs";

const Body = z.object({
  market_query: z.string().min(1),
  target_count: z.number().int().positive().max(50).default(50),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  try {
    const job_id = await createJob(parsed.data.market_query, parsed.data.target_count);
    return NextResponse.json({ job_id }, { status: 202 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
