import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { runPipeline } from "@/lib/patterns/beehive/run";
import { writeNotionRun } from "@/lib/patterns/beehive/notion";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  run_id: z.string().uuid(),
  input_url: z.string().min(4).max(200),
});

/**
 * Phase 2: client fires this after /api/beehive/run returns run_id.
 * Runs the pipeline synchronously in this function's lifetime so Vercel's
 * serverless host keeps the instance alive until the work completes.
 * Meanwhile the client polls /api/beehive/runs/:id to see stages fill in.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { run_id, input_url } = parsed.data;

  // Verify the run exists and is in running state (idempotency).
  const db = supabaseService();
  const { data: run } = await db.from("pipeline_runs").select("*").eq("id", run_id).maybeSingle();
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
  if (run.status !== "running") {
    return NextResponse.json({ status: run.status, already: true });
  }

  try {
    const r = await runPipeline(run_id, input_url);
    if (r.status === "succeeded" && r.final_output) {
      await writeNotionRun(run_id, input_url, r.final_output).catch(() => void 0);
    }
    return NextResponse.json({ status: r.status });
  } catch (e) {
    logger.error("beehive execute failed", { run_id, err: String(e) });
    return NextResponse.json({ status: "failed" }, { status: 500 });
  }
}
