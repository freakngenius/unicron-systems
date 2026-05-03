import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { runFlock } from "@/lib/patterns/murmuration/flock";
import { writeNotionFlock } from "@/lib/patterns/murmuration/notion";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({ run_id: z.string().uuid() });

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const db = supabaseService();
  const { data: run } = await db.from("flock_runs").select("*").eq("id", parsed.data.run_id).maybeSingle();
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
  if (run.status !== "running") return NextResponse.json({ already: true, status: run.status });

  try {
    await runFlock(run.id, run.prompt, run.agent_count, run.peer_n, run.cycles);
    writeNotionFlock(run.id).catch(() => void 0);
    return NextResponse.json({ status: "succeeded" });
  } catch (e) {
    logger.error("murmuration execute failed", { run_id: run.id, err: String(e) });
    await db.from("flock_runs").update({ status: "failed" }).eq("id", run.id);
    return NextResponse.json({ status: "failed" }, { status: 500 });
  }
}
