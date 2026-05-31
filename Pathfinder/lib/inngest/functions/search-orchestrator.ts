// lib/inngest/functions/search-orchestrator.ts — ICP Saved Search S1.
//
// Subscribes: pathfinder/search.run.requested
//
// Drives the six-phase search plan, each phase inside its own Inngest
// step.run boundary so a hang or throw in one phase surfaces as
// run.status='failed' instead of leaving the row stuck at 'running'.
//
// Why per-phase steps (2026-05-31 incident):
//   The previous version wrapped interpret+geo+sources inside a single
//   step.run('run-search-plan'). The Architect decomposition agent loop's
//   SESSION_TIMEOUT_MS.decomposition is 3 min, but /api/inngest's Vercel
//   maxDuration was 60s. When the Architect call ran past 60s Vercel
//   killed the invocation; Inngest's step-retry semantics never bubbled
//   a JS throw into the function continuation's catch, so the mark-failed
//   step never executed. Result: every Internal saved-search run sat at
//   phase='interpret' status='running' indefinitely with the matching
//   saved_searches.architecture stuck at the `{}` column default.
//
// Per-phase steps + a Promise.race timeout inside interpretIcp guarantee
// the function either lands status='complete' or status='failed' with
// finished_at set and a real error string in progress.detail.
//
// SPEC: docs/SPEC-Fix-Search-Orchestrator-Stall.md (this fix);
// docs/SPEC-ICP-Search.md (S1/S2 contracts).

import { NonRetriableError } from 'inngest';
import { inngest } from '../client';
import { supabaseAdmin } from '@/lib/supabase';
import {
  loadSavedSearchRow,
  doPhaseInterpret,
  doPhaseGeo,
  doPhaseSources,
  doPhaseWire,
  doPhaseScrape,
  doPhaseScore,
  initialProgress,
  initialStats,
  PHASE_LABELS,
  type PhaseEntry,
  type PhaseKey,
  type PhaseStatus,
  type SearchProgress,
  type SearchStats,
} from '@/lib/agents/search';

interface SearchRunRequestedEvent {
  data: {
    search_run_id: string;
    saved_search_id: string;
  };
}

interface StepCtx {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
}

function setPhase(
  progress: SearchProgress,
  key: PhaseKey,
  patch: Partial<Omit<PhaseEntry, 'key'>>,
): SearchProgress {
  return {
    phases: progress.phases.map((p) =>
      p.key === key ? { ...p, ...patch } : p,
    ),
  };
}

interface SearchRunPatch {
  status?: string;
  phase?: PhaseKey | null;
  progress?: SearchProgress;
  stats?: SearchStats;
  started_at?: string | null;
  finished_at?: string | null;
}

async function writeRunProgress(
  searchRunId: string,
  patch: SearchRunPatch,
): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await (admin.from('search_runs') as unknown as {
    update: (row: SearchRunPatch) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  })
    .update(patch)
    .eq('id', searchRunId);
  if (error) {
    throw new Error(`failed to update search_run ${searchRunId}: ${error.message}`);
  }
}

async function writeSavedSearchStatus(
  savedSearchId: string,
  status: string,
): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await (admin.from('saved_searches') as unknown as {
    update: (row: { status: string; updated_at: string }) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  })
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', savedSearchId);
  if (error) {
    throw new Error(`failed to update saved_search ${savedSearchId}: ${error.message}`);
  }
}

interface PhaseStepResult<R> {
  result: R;
  progress: SearchProgress;
  stats: SearchStats;
  detail: string;
}

/**
 * Run one phase inside its own Inngest step.run boundary.
 *
 * The step writes phase='running' on entry and phase='done' on success
 * (or phase='failed' + run.status='failed' + finished_at on throw). The
 * step.run return value carries the new progress+stats so the function
 * continuation can thread state through the next phase even though
 * Inngest replays the function from the top between steps.
 *
 * NonRetriableError is used on throw because each phase has either
 * already retried internally (LLM gateway) or the failure is structural
 * (bad ICP, missing source_plan). Retrying the entire step would just
 * burn another 5 minutes for the same outcome.
 */
async function runPhase<R>(
  step: StepCtx,
  ids: { search_run_id: string; saved_search_id: string },
  prior: { progress: SearchProgress; stats: SearchStats },
  key: PhaseKey,
  body: () => Promise<{ result: R; detail: string; statsPatch?: Partial<SearchStats> }>,
): Promise<PhaseStepResult<R>> {
  return step.run(`phase-${key}`, async () => {
    // Mark this phase running first so the UI sees movement immediately
    // when the previous phase persisted 'done'.
    const runningProgress = setPhase(prior.progress, key, {
      status: 'running' as PhaseStatus,
      label: PHASE_LABELS[key] ?? key,
      detail: undefined,
    });
    await writeRunProgress(ids.search_run_id, {
      phase: key,
      progress: runningProgress,
      stats: prior.stats,
    });

    try {
      const { result, detail, statsPatch } = await body();
      const stats = statsPatch ? { ...prior.stats, ...statsPatch } : prior.stats;
      const doneProgress = setPhase(runningProgress, key, {
        status: 'done' as PhaseStatus,
        label: PHASE_LABELS[key] ?? key,
        detail,
      });
      await writeRunProgress(ids.search_run_id, {
        phase: key,
        progress: doneProgress,
        stats,
      });
      return { result, progress: doneProgress, stats, detail };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const failedProgress = setPhase(runningProgress, key, {
        status: 'failed' as PhaseStatus,
        label: PHASE_LABELS[key] ?? key,
        detail: msg,
      });
      // Persist the failure on both rows so the UI immediately shows a
      // real failure instead of eternal 'running'. We swallow secondary
      // write errors here so a flaky DB write cannot prevent the phase
      // from being marked failed.
      try {
        await writeRunProgress(ids.search_run_id, {
          status: 'failed',
          phase: key,
          progress: failedProgress,
          stats: prior.stats,
          finished_at: new Date().toISOString(),
        });
      } catch (writeErr) {
        // eslint-disable-next-line no-console
        console.error(`[search-orchestrator] failed to persist phase=${key} failure: ${(writeErr as Error).message}`);
      }
      try {
        await writeSavedSearchStatus(ids.saved_search_id, 'failed');
      } catch (writeErr) {
        // eslint-disable-next-line no-console
        console.error(`[search-orchestrator] failed to persist saved_search failure: ${(writeErr as Error).message}`);
      }
      throw new NonRetriableError(`phase ${key} failed: ${msg}`, { cause: err });
    }
  });
}

export const searchOrchestrator = inngest.createFunction(
  {
    id: 'pathfinder-search-orchestrator',
    name: 'ICP Search Orchestrator (Stream S1)',
    retries: 1,
    concurrency: { limit: 4 },
    triggers: [{ event: 'pathfinder/search.run.requested' }],
  },
  async ({ event, step }: { event: SearchRunRequestedEvent; step: unknown }) => {
    const stepCtx = step as StepCtx;
    const { search_run_id, saved_search_id } = event.data;

    const startProgress = setPhase(initialProgress(), 'interpret', {
      status: 'running',
      label: PHASE_LABELS.interpret,
    });
    const startStats: SearchStats = initialStats();

    await stepCtx.run('mark-running', async () => {
      await writeRunProgress(search_run_id, {
        status: 'running',
        phase: 'interpret',
        progress: startProgress,
        stats: startStats,
        started_at: new Date().toISOString(),
      });
      await writeSavedSearchStatus(saved_search_id, 'running');
    });

    const saved = await stepCtx.run('load-saved-search', async () =>
      loadSavedSearchRow(saved_search_id),
    );

    const ids = { search_run_id, saved_search_id };

    try {
      const interpretStep = await runPhase(
        stepCtx,
        ids,
        { progress: startProgress, stats: startStats },
        'interpret',
        async () => {
          const out = await doPhaseInterpret(saved);
          return { result: out, detail: out.detail };
        },
      );

      const geoStep = await runPhase(
        stepCtx,
        ids,
        { progress: interpretStep.progress, stats: interpretStep.stats },
        'geo',
        async () => {
          const out = await doPhaseGeo(saved);
          return { result: out, detail: out.detail };
        },
      );

      const sourcesStep = await runPhase(
        stepCtx,
        ids,
        { progress: geoStep.progress, stats: geoStep.stats },
        'sources',
        async () => {
          const out = await doPhaseSources(
            saved,
            interpretStep.result.architecture,
            geoStep.result.geo,
          );
          return {
            result: out,
            detail: out.detail,
            statsPatch: { sources_found: out.sources_found },
          };
        },
      );

      const wireStep = await runPhase(
        stepCtx,
        ids,
        { progress: sourcesStep.progress, stats: sourcesStep.stats },
        'wire',
        async () => {
          const out = await doPhaseWire(sourcesStep.result.source_plan);
          return { result: out, detail: out.detail };
        },
      );

      const scrapeStep = await runPhase(
        stepCtx,
        ids,
        { progress: wireStep.progress, stats: wireStep.stats },
        'scrape',
        async () => {
          const out = await doPhaseScrape(
            saved,
            sourcesStep.result.source_plan,
            wireStep.result.wired,
          );
          return {
            result: out,
            detail: out.detail,
            statsPatch: { companies_ingested: out.companies_ingested },
          };
        },
      );

      const scoreStep = await runPhase(
        stepCtx,
        ids,
        { progress: scrapeStep.progress, stats: scrapeStep.stats },
        'score',
        async () => {
          const out = await doPhaseScore(saved, scrapeStep.result.companies_ingested);
          return {
            result: out,
            detail: out.detail,
            statsPatch: { scored: out.scored, verified: out.verified },
          };
        },
      );

      await stepCtx.run('mark-complete', async () => {
        await writeRunProgress(search_run_id, {
          status: 'complete',
          phase: 'score',
          progress: scoreStep.progress,
          stats: scoreStep.stats,
          finished_at: new Date().toISOString(),
        });
        await writeSavedSearchStatus(saved_search_id, 'complete');
      });

      return {
        search_run_id,
        status: 'complete' as const,
        stats: scoreStep.stats,
      };
    } catch (err) {
      // Belt-and-suspenders: each runPhase already wrote status='failed'
      // before re-throwing, so this catch is the last line of defense
      // against an escaped throw (e.g., load-saved-search). The
      // mark-failed step is idempotent — a second write of the same
      // status is harmless.
      const message = err instanceof Error ? err.message : String(err);
      await stepCtx.run('mark-failed', async () => {
        try {
          await writeRunProgress(search_run_id, {
            status: 'failed',
            finished_at: new Date().toISOString(),
          });
          await writeSavedSearchStatus(saved_search_id, 'failed');
        } catch (writeErr) {
          // eslint-disable-next-line no-console
          console.error(`[search-orchestrator] mark-failed write failed: ${(writeErr as Error).message}`);
        }
      });
      // NonRetriableError thrown by runPhase already exhausted Inngest
      // retries — surface a clean structured failure return so Inngest
      // marks the function 'completed' (we have already persisted the
      // failure state in the DB; no value in another retry).
      return {
        search_run_id,
        status: 'failed' as const,
        error: message,
      };
    }
  },
);
