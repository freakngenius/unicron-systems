import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseService } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { extractPain } from "./worker";
import { aggregateClusters } from "./aggregator";
import { runWithConcurrency } from "./semaphore";
import type { WorkerOutput } from "./types";

export const CONCURRENCY = 10;

type Fixture = { market: string; display_name: string; blobs: string[] };

const FIXTURES: Record<string, Fixture> = {
  "public-adjusters": loadFixture("public-adjusters"),
  "mold-remediation": loadFixture("mold-remediation"),
  "property-data": loadFixture("property-data"),
  restoration: loadFixture("restoration"),
  "trade-payments": loadFixture("trade-payments"),
};

function loadFixture(key: string): Fixture {
  try {
    const raw = readFileSync(join(process.cwd(), `fixtures/colony/${key}.json`), "utf8");
    return JSON.parse(raw);
  } catch {
    return { market: key, display_name: key, blobs: [] };
  }
}

export function listMarkets() {
  return Object.values(FIXTURES).map((f) => ({
    key: f.market,
    display_name: f.display_name,
    available: f.blobs.length,
  }));
}

export function getMarket(key: string) {
  return FIXTURES[key] ?? null;
}

export async function createJob(market_query: string, target_count: number) {
  const db = supabaseService();
  const fixture = FIXTURES[market_query];
  if (!fixture) throw new Error(`unknown market: ${market_query}`);
  const count = Math.min(target_count, fixture.blobs.length);

  const { data: job, error } = await db
    .from("swarm_jobs")
    .insert({ market_query, target_count: count, status: "running" })
    .select("*")
    .single();
  if (error || !job) throw error ?? new Error("job insert failed");

  const workerRows = fixture.blobs.slice(0, count).map((blob) => ({
    job_id: job.id,
    target_ref: blob,
    status: "pending" as const,
  }));
  const { error: wErr } = await db.from("swarm_workers").insert(workerRows);
  if (wErr) throw wErr;

  return job.id;
}

/**
 * Run all pending workers for a job. Called by /api/colony/dispatch/execute.
 * Updates swarm_workers rows as each Haiku call completes; when all done,
 * calls the aggregator and writes swarm_clusters.
 */
export async function executeJob(job_id: string) {
  const log = logger.scoped({ pattern: "colony", job_id });
  const db = supabaseService();

  const { data: workers } = await db
    .from("swarm_workers")
    .select("id,target_ref")
    .eq("job_id", job_id)
    .eq("status", "pending");
  if (!workers || workers.length === 0) return;

  const results = await runWithConcurrency(workers, CONCURRENCY, async (w) => {
    const t0 = Date.now();
    try {
      // Mark running
      await db.from("swarm_workers").update({ status: "running" }).eq("id", w.id);
      const out = await extractPain(w.target_ref);
      const runtime = Date.now() - t0;
      await db
        .from("swarm_workers")
        .update({
          status: "done",
          output_json: out as never,
          runtime_ms: runtime,
        })
        .eq("id", w.id);
      // atomic bump of completed_count via fetch-then-update
      const { data: cur } = await db.from("swarm_jobs").select("completed_count").eq("id", job_id).maybeSingle();
      await db
        .from("swarm_jobs")
        .update({ completed_count: (cur?.completed_count ?? 0) + 1 })
        .eq("id", job_id);
      return { id: w.id, ok: true as const, out };
    } catch (e) {
      await db
        .from("swarm_workers")
        .update({ status: "errored", runtime_ms: Date.now() - t0 })
        .eq("id", w.id);
      log.warn("worker errored", { err: String(e) });
      return { id: w.id, ok: false as const };
    }
  });

  const outs: WorkerOutput[] = results.flatMap((r) => (r.ok ? [r.out] : []));
  if (outs.length === 0) {
    await db.from("swarm_jobs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", job_id);
    return;
  }

  // Aggregator
  const { data: job } = await db.from("swarm_jobs").select("market_query").eq("id", job_id).single();
  const marketKey = job?.market_query ?? "";
  const fixture = FIXTURES[marketKey];
  const marketLabel = fixture?.display_name ?? marketKey;
  try {
    const agg = await aggregateClusters(marketLabel, outs);
    const clusterRows = agg.clusters.map((c) => ({
      job_id,
      theme: c.theme,
      size: c.size,
      examples: c.examples as never,
    }));
    await db.from("swarm_clusters").insert(clusterRows);
    await db.from("swarm_jobs").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", job_id);
  } catch (e) {
    log.error("aggregator failed", { err: String(e) });
    await db.from("swarm_jobs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", job_id);
  }
}
