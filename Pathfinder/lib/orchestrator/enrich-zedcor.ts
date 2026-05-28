// lib/orchestrator/enrich-zedcor.ts
//
// Sprint Z3.5 — Detail-page enrichment step run between phase tagging
// (Wave 2) and Notion writes (Wave 3) of the Zedcor orchestrator.
//
// Responsibilities:
//   1. Select eligible projects for this run.
//   2. Soft-cap at ZEDCOR_ENRICHMENT_CAP (default 200).
//   3. Sequentially call extractGcMetadata() and persist to gc_metadata.
//   4. Return a map id → GcMetadata so the Notion-writes step can pass
//      it to writeProjectToNotion() without re-querying.
//
// Eligibility:  buy_window_open = true
//               OR project_stage IN ('awarded','gc_selected','sub_bid')
// Order:        buy_window_open=true first → posted_date desc → score desc
//
// Hard rules from spec §"Hard rules":
//   - No fabrication (enforced inside gc-extractor; this caller trusts).
//   - Never overwrite manually-edited Rep Notes (this caller never touches them).
//   - Never claim a GC for a project still in solicitation phase
//     (eligibility filter above gates this).

import { supabaseAdmin } from '@/lib/supabase';
import { extractGcMetadata, type GcMetadata } from '@/lib/adapters/zedcor/gc-extractor';

export const DEFAULT_ENRICHMENT_CAP_PER_RUN = 200;

export const ENRICHMENT_ELIGIBLE_STAGES = ['awarded', 'gc_selected', 'sub_bid'] as const;

export function getEnrichmentCap(): number {
  const raw = process.env.ZEDCOR_ENRICHMENT_CAP;
  if (!raw) return DEFAULT_ENRICHMENT_CAP_PER_RUN;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ENRICHMENT_CAP_PER_RUN;
}

interface EligibleProjectRow {
  id: string;
  source: string;
  source_id: string;
  title: string;
  source_url: string | null;
  project_stage: string | null;
  buy_window_open: boolean | null;
  posted_date: string | null;
  score: number | null;
}

/**
 * Load projects from this orchestrator run that are eligible for
 * enrichment, already ordered + capped.
 */
export async function loadEligibleProjectsForRun(
  runId: number,
  cap: number = getEnrichmentCap(),
): Promise<EligibleProjectRow[]> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: number) => {
          or: (filter: string) => {
            order: (col: string, opts: { ascending?: boolean; nullsFirst?: boolean }) => {
              order: (col2: string, opts2: { ascending?: boolean; nullsFirst?: boolean }) => {
                order: (col3: string, opts3: { ascending?: boolean; nullsFirst?: boolean }) => {
                  limit: (n: number) => Promise<{ data: EligibleProjectRow[] | null; error: { message: string } | null }>;
                };
              };
            };
          };
        };
      };
    };
  };

  const stageList = ENRICHMENT_ELIGIBLE_STAGES.map((s) => `"${s}"`).join(',');
  const filter = `buy_window_open.eq.true,project_stage.in.(${stageList})`;

  const { data, error } = await admin
    .from('projects')
    .select('id, source, source_id, title, source_url, project_stage, buy_window_open, posted_date, score')
    .eq('agent_run_id', runId)
    .or(filter)
    .order('buy_window_open', { ascending: false, nullsFirst: false })
    .order('posted_date', { ascending: false, nullsFirst: false })
    .order('score', { ascending: false, nullsFirst: false })
    .limit(cap);

  if (error) throw new Error(`enrichment eligibility query failed: ${error.message}`);
  return data ?? [];
}

async function persistGcMetadata(projectId: string, meta: GcMetadata): Promise<void> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const { error } = await admin
    .from('projects')
    .update({ gc_metadata: meta as unknown as Record<string, unknown> })
    .eq('id', projectId);
  if (error) {
    // Surface to caller — orchestrator decides whether to abort or log.
    throw new Error(`persist gc_metadata failed for project ${projectId}: ${error.message}`);
  }
}

export interface EnrichmentRunResult {
  attempted: number;
  succeeded: number;
  failed: number;
  enrichedById: Map<string, GcMetadata>;
  errors: Array<{ project_id: string; message: string }>;
}

/**
 * Run enrichment over the projects newly written by this orchestrator
 * invocation. Soft-capped; sequential (the detail-page fetcher already
 * throttles per host, and Anthropic calls are not parallelism-safe in
 * the current SDK without a rate-limiter).
 *
 * Idempotent at the per-project level: gc_metadata.fetched_at is set on
 * every attempt, and re-runs of the same orchestrator simply repopulate
 * the same fields (no state corruption).
 */
export async function enrichEligibleProjects(runId: number): Promise<EnrichmentRunResult> {
  const eligible = await loadEligibleProjectsForRun(runId);
  const enrichedById = new Map<string, GcMetadata>();
  const errors: Array<{ project_id: string; message: string }> = [];
  let succeeded = 0;
  let failed = 0;

  for (const p of eligible) {
    try {
      const meta = await extractGcMetadata({ source_url: p.source_url, title: p.title });
      await persistGcMetadata(p.id, meta);
      enrichedById.set(p.id, meta);
      succeeded += 1;
    } catch (err) {
      failed += 1;
      errors.push({ project_id: p.id, message: (err as Error).message.slice(0, 500) });
    }
  }

  return { attempted: eligible.length, succeeded, failed, enrichedById, errors };
}
