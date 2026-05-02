import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { SignalIn } from "@/lib/patterns/mycelium/types";
import { classifySignal } from "@/lib/patterns/mycelium/classify";
import { findReinforcement, SIMILARITY_THRESHOLD } from "@/lib/patterns/mycelium/similarity";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = SignalIn.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;
  const log = logger.scoped({ pattern: "mycelium" });

  // Classify if caller didn't provide both type + topic
  let type = input.type;
  let topic = input.topic;
  if (!type || !topic) {
    try {
      const c = await classifySignal(input.body, input.topic);
      type ??= c.type;
      topic ??= c.topic_slug;
    } catch (e) {
      log.warn("classify failed, using fallback FACT + uncategorized", { err: String(e) });
      type ??= "FACT";
      topic ??= "uncategorized";
    }
  }

  const db = supabaseService();

  // Load the 20 strongest active signals for this topic as reinforcement candidates.
  const { data: existing } = await db
    .from("signals")
    .select("id,body")
    .eq("topic", topic)
    .eq("archived", false)
    .order("strength", { ascending: false })
    .limit(20);

  let matchId: string | null = null;
  try {
    const sim = await findReinforcement(input.body, existing ?? []);
    if (sim.match_id && sim.confidence >= SIMILARITY_THRESHOLD) {
      matchId = sim.match_id;
    }
  } catch (e) {
    log.warn("similarity failed, falling back to insert", { err: String(e) });
  }

  if (matchId) {
    // Reinforce existing: strength += 1, touch.
    const { data: row, error } = await db
      .from("signals")
      .select("*")
      .eq("id", matchId)
      .single();
    if (error || !row) {
      log.warn("reinforce target missing, inserting new instead", { matchId });
    } else {
      const newStrength = Number(row.strength) + 1;
      const { data: updated, error: updErr } = await db
        .from("signals")
        .update({ strength: newStrength, last_touched: new Date().toISOString() })
        .eq("id", matchId)
        .select("*")
        .single();
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
      log.info("signal reinforced", { id: matchId, strength: newStrength, topic });
      return NextResponse.json({ signal: updated, reinforced: true });
    }
  }

  const { data: created, error } = await db
    .from("signals")
    .insert({
      topic,
      type,
      source_agent: input.source_agent,
      body: input.body,
      strength: 1.0,
      ttl_days: input.ttl_days ?? 14,
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  log.info("signal created", { id: created.id, topic, type });
  return NextResponse.json({ signal: created, reinforced: false }, { status: 201 });
}

const QuerySchema = z.object({
  topic: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = QuerySchema.safeParse({
    topic: url.searchParams.get("topic") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!q.success) {
    return NextResponse.json({ error: "invalid query" }, { status: 400 });
  }

  const db = supabaseService();
  let query = db
    .from("signals")
    .select("*")
    .eq("archived", false)
    .order("strength", { ascending: false })
    .limit(q.data.limit);
  if (q.data.topic) query = query.eq("topic", q.data.topic);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ signals: data });
}
