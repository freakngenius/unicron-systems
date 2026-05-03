import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { decayStrength } from "@/lib/patterns/mycelium/decay";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function runDecay() {
  const log = logger.scoped({ pattern: "mycelium", job: "decay" });
  const db = supabaseService();
  const now = new Date();
  let processed = 0;
  let archived = 0;
  let touched = 0;

  // Iterate active signals in pages of 500.
  const pageSize = 500;
  let page = 0;
  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await db
      .from("signals")
      .select("id,strength,last_touched,ttl_days")
      .eq("archived", false)
      .range(from, to);
    if (error) {
      log.error("decay page read failed", { err: error.message, page });
      return { ok: false, err: error.message };
    }
    if (!data || data.length === 0) break;

    const updates = data.map((s) => {
      const r = decayStrength({
        strength: Number(s.strength),
        last_touched: s.last_touched,
        ttl_days: s.ttl_days,
        now,
      });
      return { id: s.id, strength: r.strength, archived: r.archived };
    });

    for (const u of updates) {
      if (u.archived) {
        await db.from("signals").update({ strength: u.strength, archived: true }).eq("id", u.id);
        archived += 1;
      } else {
        await db.from("signals").update({ strength: u.strength }).eq("id", u.id);
        touched += 1;
      }
      processed += 1;
    }

    if (data.length < pageSize) break;
    page += 1;
  }

  log.info("decay complete", { processed, archived, touched });
  return { ok: true, processed, archived, touched };
}

export async function GET() {
  return NextResponse.json(await runDecay());
}

export async function POST() {
  return NextResponse.json(await runDecay());
}
