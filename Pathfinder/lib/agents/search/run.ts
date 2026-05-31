// lib/agents/search/run.ts — orchestrators for ICP Saved Search.
//
// SPEC: docs/SPEC-ICP-Search.md (S2 slice).
//
// Exports:
//   runSearchPlan(savedSearchId, deps?)       — interpret + geo + plan
//   runIngestForSearch(savedSearchId, deps?)  — wire + scrape + score
//
// S1's job (lib/inngest/functions/search-*) imports these and persists
// the emitted phase events into search_runs.progress. All non-trivial
// collaborators are dependency-injected so the runners are unit-testable
// in isolation against a mocked DB and mocked agents.
//
// Contract reminders:
//   - architecture jsonb is written by runSearchPlan onto the saved_search row.
//   - source_plan jsonb is written by runSearchPlan onto the saved_search row.
//   - progress jsonb is emitted via the onPhase callback (S1 persists).
//   - stats jsonb is returned from runIngestForSearch (S1 persists).
//   - Tier 3 failures are graceful: the run still completes on Tier 1/2.
//   - Never fabricate leads or sources: thin profiles produce thin runs.

import { supabaseAdmin } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  runSourceOnboarder as runSourceOnboarderLive,
} from '@/services/source-onboarder/agent';
import type {
  SourceOnboarderInput,
  SourceOnboarderResult,
} from '@/services/source-onboarder/types';
import { interpretIcp, type InterpretDeps } from './interpret';
import { resolveGeoRadius, type GeoDeps } from './geo';
import { planSources, type PlanDeps } from './plan';
import type {
  GeoExpansion,
  OnPhase,
  PhaseKey,
  SavedSearchRow,
  SearchArchitecture,
  SearchStats,
  SourcePlan,
  Tier2Source,
  Tier3Source,
} from './types';
import { initialStats, PHASE_LABELS } from './types';

// ----- Dependencies -------------------------------------------------------

type AnySupabase = SupabaseClient<any, any, any>;

interface BaseRunDeps {
  supabase?: AnySupabase;
  onPhase?: OnPhase;
  now?: () => Date;
}

export type RunSearchPlanDeps = BaseRunDeps & InterpretDeps & GeoDeps & PlanDeps;

export interface RunIngestDeps extends BaseRunDeps {
  runSourceOnboarder?: (args: { inputs: SourceOnboarderInput }) => Promise<SourceOnboarderResult>;
  // Scrape hook — wraps the existing per-org ingest pipeline. Default impl
  // is an honest no-op (returns 0 counts with detail) until S1's
  // `projects.saved_search_id` migration applies and the per-search persist
  // path is wired. S1's job overrides this with a real implementation that
  // calls SOURCE_ADAPTERS[kind].pollOnce + inserts into projects scoped by
  // saved_search_id. See seam notes in docs/PLAN-icp-search-s2.md.
  scrapeForSearch?: (args: {
    saved_search: SavedSearchRow;
    source_plan: SourcePlan;
    geo: GeoExpansion | null;
    wired: WireOutcome[];
  }) => Promise<{ companies_ingested: number; detail?: string }>;
  // Score hook — wraps the generic ranker over the projects the scrape
  // step produced. Default is an honest no-op (returns 0 counts) for the
  // same reason as scrapeForSearch.
  scoreForSearch?: (args: {
    saved_search: SavedSearchRow;
    companies_ingested: number;
  }) => Promise<{ scored: number; verified: number; detail?: string }>;
}

// ----- Helpers ------------------------------------------------------------

async function emitPhase(
  onPhase: OnPhase | undefined,
  key: PhaseKey,
  status: 'running' | 'done' | 'failed',
  detail?: string,
): Promise<void> {
  if (!onPhase) return;
  try {
    await onPhase({ key, status, detail });
  } catch {
    // Phase persistence is best-effort from S2's perspective; never let a
    // logging failure abort the run.
  }
}

async function loadSavedSearch(
  supabase: AnySupabase,
  saved_search_id: string,
): Promise<SavedSearchRow> {
  const { data, error } = await supabase
    .from('saved_searches')
    .select('id, organization_id, name, icp_text, region, radius_mi, status, architecture, source_plan')
    .eq('id', saved_search_id)
    .single();
  if (error) {
    throw new Error(`saved_searches load failed for id=${saved_search_id}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`saved_searches load returned no row for id=${saved_search_id}`);
  }
  return data as unknown as SavedSearchRow;
}

async function persistArchitecture(
  supabase: AnySupabase,
  saved_search_id: string,
  architecture: SearchArchitecture,
  now: () => Date,
): Promise<void> {
  const { error } = await supabase
    .from('saved_searches')
    .update({ architecture, updated_at: now().toISOString() })
    .eq('id', saved_search_id);
  if (error) {
    throw new Error(`saved_searches architecture update failed: ${error.message}`);
  }
}

async function persistSourcePlan(
  supabase: AnySupabase,
  saved_search_id: string,
  source_plan: SourcePlan,
  now: () => Date,
): Promise<void> {
  const { error } = await supabase
    .from('saved_searches')
    .update({ source_plan, updated_at: now().toISOString() })
    .eq('id', saved_search_id);
  if (error) {
    throw new Error(`saved_searches source_plan update failed: ${error.message}`);
  }
}

// ----- runSearchPlan ------------------------------------------------------

export interface RunSearchPlanResult {
  architecture: SearchArchitecture;
  geo: GeoExpansion;
  source_plan: SourcePlan;
  sources_found: number;
}

/**
 * Run the plan-only phases (interpret → geo → sources). Writes architecture
 * and source_plan back to the saved_search row. Emits phase events through
 * the injected onPhase callback. Returns the composed plan so S1's job can
 * thread the architecture / geo / source_plan into runIngestForSearch
 * without re-reading the row.
 */
export async function runSearchPlan(
  saved_search_id: string,
  deps: RunSearchPlanDeps = {},
): Promise<RunSearchPlanResult> {
  const supabase = deps.supabase ?? supabaseAdmin();
  const onPhase = deps.onPhase;
  const now = deps.now ?? (() => new Date());

  const saved = await loadSavedSearch(supabase, saved_search_id);

  // Phase: interpret
  await emitPhase(onPhase, 'interpret', 'running');
  let interpretResult;
  try {
    interpretResult = await interpretIcp(saved.icp_text, {
      runDecomposition: deps.runDecomposition,
      runLlm: deps.runLlm,
      newId: deps.newId,
    });
  } catch (err) {
    await emitPhase(onPhase, 'interpret', 'failed', errMessage(err));
    throw err;
  }
  await persistArchitecture(supabase, saved_search_id, interpretResult.architecture, now);
  await emitPhase(
    onPhase,
    'interpret',
    'done',
    `vertical=${interpretResult.architecture.vertical} · naics=${interpretResult.architecture.naics_codes.join(',') || 'n/a'}`,
  );

  // Phase: geo
  await emitPhase(onPhase, 'geo', 'running');
  let geo: GeoExpansion;
  try {
    geo = await resolveGeoRadius(saved.region, saved.radius_mi, {
      geocodeLocation: deps.geocodeLocation,
    });
  } catch (err) {
    await emitPhase(onPhase, 'geo', 'failed', errMessage(err));
    throw err;
  }
  await emitPhase(
    onPhase,
    'geo',
    'done',
    `center=${geo.center.lat.toFixed(2)},${geo.center.lon.toFixed(2)} · states=${geo.states.length}`,
  );

  // Phase: sources
  await emitPhase(onPhase, 'sources', 'running');
  let source_plan: SourcePlan;
  try {
    source_plan = await planSources(
      { architecture: interpretResult.architecture, geo },
      { completeSonar: deps.completeSonar, now: deps.now },
    );
  } catch (err) {
    await emitPhase(onPhase, 'sources', 'failed', errMessage(err));
    throw err;
  }
  await persistSourcePlan(supabase, saved_search_id, source_plan, now);
  const sources_found = source_plan.tier1.length + source_plan.tier2.length + source_plan.tier3.length;
  await emitPhase(
    onPhase,
    'sources',
    'done',
    `tier1=${source_plan.tier1.length} tier2=${source_plan.tier2.length} tier3=${source_plan.tier3.length}`,
  );

  return { architecture: interpretResult.architecture, geo, source_plan, sources_found };
}

// ----- runIngestForSearch -------------------------------------------------

export interface WireOutcome {
  // tier of the wire attempt
  tier: 'tier1' | 'tier2' | 'tier3';
  // the source id (tier1/tier2) or candidate URL (tier3)
  ref: string;
  outcome: 'live' | 'queued' | 'human-assist' | 'declined' | 'skipped' | 'failed';
  reason?: string;
  source_onboarder_id?: string;
}

export interface RunIngestResult {
  stats: SearchStats;
  wired: WireOutcome[];
  detail?: string;
}

/**
 * Run the ingest phases (wire → scrape → score). Reads the saved_search +
 * source_plan that runSearchPlan persisted; iterates the tiers; emits phase
 * events through onPhase; returns final stats for S1 to persist into
 * search_runs.stats.
 *
 * Tier 3 wire failures are graceful — they are recorded as `outcome:
 * 'failed'` with a reason, and the run proceeds. The scrape / score hooks
 * are injection points so S1's job can wire the per-search ingest
 * persistence (which needs `projects.saved_search_id` from S1's migration).
 */
export async function runIngestForSearch(
  saved_search_id: string,
  deps: RunIngestDeps = {},
): Promise<RunIngestResult> {
  const supabase = deps.supabase ?? supabaseAdmin();
  const onPhase = deps.onPhase;
  const onboard = deps.runSourceOnboarder ?? runSourceOnboarderLive;
  const scrape = deps.scrapeForSearch ?? defaultScrapeForSearch;
  const score = deps.scoreForSearch ?? defaultScoreForSearch;

  const saved = await loadSavedSearch(supabase, saved_search_id);
  if (!saved.source_plan) {
    throw new Error(
      `runIngestForSearch: saved_searches.id=${saved_search_id} has no source_plan; runSearchPlan must complete first`,
    );
  }
  const source_plan = saved.source_plan;

  // Phase: wire
  await emitPhase(onPhase, 'wire', 'running');
  const wired: WireOutcome[] = [];

  for (const t1 of source_plan.tier1) {
    wired.push({
      tier: 'tier1',
      ref: t1.source_id,
      outcome: 'live',
      reason: `tier1 kind=${t1.kind} auto-wired`,
    });
  }

  for (const t2 of source_plan.tier2) {
    if (!t2.candidate_url) {
      wired.push({
        tier: 'tier2',
        ref: t2.source_id,
        outcome: 'skipped',
        reason: 'tier2 template has no candidate_url; needs human-assist fill',
      });
      continue;
    }
    const outcome = await safeOnboard(onboard, {
      kind: 'url',
      url: t2.candidate_url,
    });
    wired.push({ tier: 'tier2', ref: t2.source_id, ...outcome });
  }

  for (const t3 of source_plan.tier3) {
    const outcome = await safeOnboard(onboard, {
      kind: 'url',
      url: t3.url,
      description: t3.candidate,
    });
    wired.push({ tier: 'tier3', ref: t3.url, ...outcome });
  }

  const tier3Failures = wired.filter((w) => w.tier === 'tier3' && (w.outcome === 'failed' || w.outcome === 'declined')).length;
  await emitPhase(
    onPhase,
    'wire',
    'done',
    `tier1=${source_plan.tier1.length} tier2=${countWired(wired, 'tier2')} tier3=${countWired(wired, 'tier3')} (tier3 failures=${tier3Failures}, graceful)`,
  );

  // Phase: scrape
  await emitPhase(onPhase, 'scrape', 'running');
  const stats = initialStats();
  stats.sources_found = source_plan.tier1.length + source_plan.tier2.length + source_plan.tier3.length;
  let scrapeDetail: string | undefined;
  try {
    const sc = await scrape({
      saved_search: saved,
      source_plan,
      geo: null,
      wired,
    });
    stats.companies_ingested = sc.companies_ingested;
    scrapeDetail = sc.detail;
  } catch (err) {
    await emitPhase(onPhase, 'scrape', 'failed', errMessage(err));
    throw err;
  }
  await emitPhase(
    onPhase,
    'scrape',
    'done',
    scrapeDetail ?? `companies_ingested=${stats.companies_ingested}`,
  );

  // Phase: score
  await emitPhase(onPhase, 'score', 'running');
  let scoreDetail: string | undefined;
  try {
    const sr = await score({
      saved_search: saved,
      companies_ingested: stats.companies_ingested,
    });
    stats.scored = sr.scored;
    stats.verified = sr.verified;
    scoreDetail = sr.detail;
  } catch (err) {
    await emitPhase(onPhase, 'score', 'failed', errMessage(err));
    throw err;
  }
  await emitPhase(
    onPhase,
    'score',
    'done',
    scoreDetail ?? `scored=${stats.scored} verified=${stats.verified}`,
  );

  return { stats, wired };
}

// ----- Default hooks ------------------------------------------------------

async function defaultScrapeForSearch(_args: {
  saved_search: SavedSearchRow;
  source_plan: SourcePlan;
  geo: GeoExpansion | null;
  wired: WireOutcome[];
}): Promise<{ companies_ingested: number; detail?: string }> {
  // Honest no-op: the per-search scrape persistence depends on
  // projects.saved_search_id from S1's migration, and the per-org ingest
  // pipeline is owned by S1's job. Returning 0 here is the correct
  // not-yet-wired signal; never fabricate counts.
  return {
    companies_ingested: 0,
    detail: 'scrape hook not provided; S1 ingest pipeline wires per-search persistence',
  };
}

async function defaultScoreForSearch(args: {
  saved_search: SavedSearchRow;
  companies_ingested: number;
}): Promise<{ scored: number; verified: number; detail?: string }> {
  if (args.companies_ingested === 0) {
    return {
      scored: 0,
      verified: 0,
      detail: 'no companies ingested; nothing to score',
    };
  }
  return {
    scored: 0,
    verified: 0,
    detail: 'score hook not provided; S1 ranker dispatch handles per-search scoring',
  };
}

// ----- internal helpers --------------------------------------------------

async function safeOnboard(
  onboard: (args: { inputs: SourceOnboarderInput }) => Promise<SourceOnboarderResult>,
  inputs: SourceOnboarderInput,
): Promise<Pick<WireOutcome, 'outcome' | 'reason' | 'source_onboarder_id'>> {
  try {
    const res = await onboard({ inputs });
    return {
      outcome: res.outcome,
      reason: res.reason,
      source_onboarder_id: res.source_id ?? res.session_id,
    };
  } catch (err) {
    // Tier 3 brittle / blocked candidates fail gracefully.
    return {
      outcome: 'failed',
      reason: `onboarder threw: ${errMessage(err)}`,
    };
  }
}

function countWired(wired: WireOutcome[], tier: 'tier1' | 'tier2' | 'tier3'): number {
  return wired.filter((w) => w.tier === tier).length;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return 'unknown error';
  }
}

// Re-exports so consumers can pluck labels without re-importing types.ts.
export { PHASE_LABELS };
