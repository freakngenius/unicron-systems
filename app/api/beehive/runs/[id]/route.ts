import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const db = supabaseService();
  const { data: run, error } = await db
    .from("pipeline_runs")
    .select("*")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: stages } = await db
    .from("pipeline_stages")
    .select("*")
    .eq("run_id", ctx.params.id)
    .order("started_at", { ascending: true });
  return NextResponse.json({ run, stages: stages ?? [] });
}
