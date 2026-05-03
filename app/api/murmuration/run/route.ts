import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseService } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  prompt: z.string().min(5).max(600),
  peer_n: z.number().int().positive().max(7).default(3),
  cycles: z.number().int().positive().max(10).default(5),
  agent_count: z.number().int().positive().max(12).default(7),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const db = supabaseService();
  const { data: run, error } = await db
    .from("flock_runs")
    .insert({
      prompt: parsed.data.prompt,
      peer_n: parsed.data.peer_n,
      cycles: parsed.data.cycles,
      agent_count: parsed.data.agent_count,
      status: "running",
    })
    .select("*")
    .single();
  if (error || !run) return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  return NextResponse.json({ run_id: run.id }, { status: 202 });
}
