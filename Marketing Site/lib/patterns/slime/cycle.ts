import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseService } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { runWithConcurrency } from "@/lib/patterns/colony/semaphore";
import { judge } from "./judge";
import { parseTam, prune, nextResourceShare } from "./prune";
import { Criteria, HypothesisContext, SeedHypothesis } from "./types";

const JUDGE_CONCURRENCY = 5;

type Fixture = {
  criteria: Criteria;
  criteria_notes: Record<string, string>;
  hypotheses: SeedHypothesis[];
};

let _fixture: Fixture | null = null;
export function loadFixture(): Fixture {
  if (_fixture) return _fixture;
  const raw = readFileSync(join(process.cwd(), "fixtures/slime-seed.json"), "utf8");
  _fixture = JSON.parse(raw);
  return _fixture!;
}

export async function createRun(criteria: Criteria, cycles_planned = 3) {
  const db = supabaseService();
  const fix = loadFixture();
  const { data: run, error } = await db
    .from("selection_runs")
    .insert({ criteria: criteria as never, cycles_planned, status: "running" })
    .select("*")
    .single();
  if (error || !run) throw error ?? new Error("run insert failed");

  const rows = fix.hypotheses.map((h) => ({
    run_id: run.id,
    hypothesis: h.hypothesis,
    context: h.context as never,
    resource_share: 1.0,
    alive: true,
  }));
  const { error: cErr } = await db.from("candidates").insert(rows);
  if (cErr) throw cErr;

  return run.id;
}

export async function runCycle(run_id: string) {
  const log = logger.scoped({ pattern: "slime", run_id });
  const db = supabaseService();

  const { data: run } = await db.from("selection_runs").select("*").eq("id", run_id).maybeSingle();
  if (!run) throw new Error("run not found");
  if (run.status !== "running") return { status: run.status, cycle: run.current_cycle };

  const criteria = Criteria.parse(run.criteria);
  const nextCycle = run.current_cycle + 1;

  const { data: alive } = await db
    .from("candidates")
    .select("id,hypothesis,context,resource_share")
    .eq("run_id", run_id)
    .eq("alive", true);
  if (!alive || alive.length === 0) {
    await db.from("selection_runs").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", run_id);
    return { status: "succeeded", cycle: nextCycle };
  }

  // Judge all alive candidates in parallel (bounded).
  const scored = await runWithConcurrency(alive, JUDGE_CONCURRENCY, async (c) => {
    const ctx = HypothesisContext.parse(c.context);
    try {
      const out = await judge(c.hypothesis, ctx, criteria);
      return { id: c.id, out, tiebreak: parseTam(ctx.tam_usd), ok: true as const };
    } catch (e) {
      log.warn("judge failed", { id: c.id, err: String(e) });
      return { id: c.id, ok: false as const };
    }
  });

  // Persist score_events and update current_score
  for (const r of scored) {
    if (!r.ok) continue;
    await db.from("score_events").insert({
      candidate_id: r.id,
      cycle: nextCycle,
      score: r.out.score_0_100,
      reasoning: r.out.reasoning,
      criteria_breakdown: r.out.per_criterion as never,
    });
    await db.from("candidates").update({ current_score: r.out.score_0_100 }).eq("id", r.id);
  }

  // Prune
  const pruneInput = scored
    .filter((r) => r.ok)
    .map((r) => ({ id: r.id, score: r.out.score_0_100, tiebreak: r.tiebreak }));
  const { keep, eliminate } = prune(pruneInput);

  // Double resource share on survivors
  for (const id of keep) {
    const cur = alive.find((c) => c.id === id);
    if (!cur) continue;
    await db
      .from("candidates")
      .update({ resource_share: nextResourceShare(Number(cur.resource_share)) })
      .eq("id", id);
  }
  // Eliminate losers
  for (const id of eliminate) {
    await db
      .from("candidates")
      .update({ alive: false, eliminated_at_cycle: nextCycle })
      .eq("id", id);
  }

  // Advance cycle
  const done = nextCycle >= run.cycles_planned || keep.length <= 1;
  await db
    .from("selection_runs")
    .update({
      current_cycle: nextCycle,
      status: done ? "succeeded" : "running",
      completed_at: done ? new Date().toISOString() : null,
    })
    .eq("id", run_id);

  log.info("cycle done", { cycle: nextCycle, kept: keep.length, eliminated: eliminate.length, done });
  return { status: done ? "succeeded" : "running", cycle: nextCycle, kept: keep, eliminated: eliminate };
}
