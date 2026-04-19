import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { runPipeline } from "@/lib/patterns/beehive/run";
import { writeNotionRun } from "@/lib/patterns/beehive/notion";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  input_url: z.string().min(4).max(200),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const db = supabaseService();
  const { data: run, error } = await db
    .from("pipeline_runs")
    .insert({ input_url: parsed.data.input_url, status: "running" })
    .select("*")
    .single();
  if (error || !run) {
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  }

  // Fire-and-forget: we already wrote the run row, client polls GET /runs/:id.
  runPipeline(run.id, parsed.data.input_url)
    .then(async (r) => {
      if (r.status === "succeeded" && r.final_output) {
        await writeNotionRun(run.id, parsed.data.input_url, r.final_output).catch(() => void 0);
      }
    })
    .catch((e) => {
      logger.error("beehive pipeline failed", { run_id: run.id, err: String(e) });
    });

  return NextResponse.json({ run_id: run.id }, { status: 202 });
}
