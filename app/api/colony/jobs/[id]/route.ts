import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const db = supabaseService();
  const { data: job, error } = await db
    .from("swarm_jobs")
    .select("*")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: workers } = await db
    .from("swarm_workers")
    .select("id,status,output_json,runtime_ms,target_ref,created_at")
    .eq("job_id", ctx.params.id)
    .order("created_at", { ascending: true });
  const { data: clusters } = await db
    .from("swarm_clusters")
    .select("*")
    .eq("job_id", ctx.params.id)
    .order("size", { ascending: false });
  return NextResponse.json({ job, workers: workers ?? [], clusters: clusters ?? [] });
}
