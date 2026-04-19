import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const db = supabaseService();
  const { data: run, error } = await db.from("flock_runs").select("*").eq("id", ctx.params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: outputs } = await db
    .from("flock_outputs")
    .select("*")
    .eq("run_id", ctx.params.id)
    .order("cycle", { ascending: true })
    .order("agent_idx", { ascending: true });
  return NextResponse.json({ run, outputs: outputs ?? [] });
}
