import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const db = supabaseService();
  const { data: run, error } = await db
    .from("selection_runs")
    .select("*")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: candidates } = await db
    .from("candidates")
    .select("*")
    .eq("run_id", ctx.params.id)
    .order("current_score", { ascending: false });
  const ids = (candidates ?? []).map((c) => c.id);
  const events = ids.length
    ? (await db.from("score_events").select("*").in("candidate_id", ids).order("cycle", { ascending: true })).data ?? []
    : [];
  return NextResponse.json({ run, candidates: candidates ?? [], events });
}
