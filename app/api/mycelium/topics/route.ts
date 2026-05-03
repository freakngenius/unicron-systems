import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseService();
  const { data, error } = await db
    .from("signals")
    .select("topic,strength")
    .eq("archived", false);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const agg = new Map<string, { topic: string; total: number; count: number }>();
  for (const row of data ?? []) {
    const key = row.topic;
    const cur = agg.get(key) ?? { topic: key, total: 0, count: 0 };
    cur.total += Number(row.strength);
    cur.count += 1;
    agg.set(key, cur);
  }
  const topics = Array.from(agg.values()).sort((a, b) => b.total - a.total);
  return NextResponse.json({ topics });
}
