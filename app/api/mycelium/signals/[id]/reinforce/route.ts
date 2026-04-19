import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const id = ctx.params.id;
  const db = supabaseService();
  const { data: row, error } = await db
    .from("signals")
    .select("strength")
    .eq("id", id)
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { data, error: updErr } = await db
    .from("signals")
    .update({ strength: Number(row.strength) + 1, last_touched: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ signal: data });
}
