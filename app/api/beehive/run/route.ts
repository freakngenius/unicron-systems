import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

const Body = z.object({
  input_url: z.string().min(4).max(200),
});

// Phase 1: create run row and return run_id so the client can start polling.
// Phase 2 is /api/beehive/run/execute (client fires in parallel).
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
  return NextResponse.json({ run_id: run.id }, { status: 202 });
}
