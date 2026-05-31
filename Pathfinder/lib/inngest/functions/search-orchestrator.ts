// lib/inngest/functions/search-orchestrator.ts — ICP Saved Search S1.
//
// Subscribes: pathfinder/search.run.requested
// Delegates the six-phase plan to Stream S2's runners:
//   runSearchPlan       — interpret + geo + sources
//   runIngestForSearch  — wire + scrape + score
// Both emit phase events through an `onPhase` callback that S1 persists
// into pathfinder.search_runs.progress. Final stats land on
// pathfinder.search_runs.stats. On any failure: search_runs.status='failed'
// + saved_searches.status='failed'.
//
// SPEC: docs/SPEC-ICP-Search.md, S1 slice. The S2 seam lives in
// lib/agents/search/* (#524, on main).

import { inngest } from '../client';
import { supabaseAdmin } from '@/lib/supabase';
import {
  runSearchPlan,
  runIngestForSearch,
  initialProgress,
  initialStats,
  PHASE_LABELS,
  type OnPhase,
  type PhaseEntry,
  type PhaseKey,
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

async function writeRunProgress(
  searchRunId: string,
  patch: {
    status?: string;
    phase?: PhaseKey | null;
    progress?: SearchProgress;
    stats?: SearchStats;
    started_at?: string | null;
    finished_at?: string | null;
  },
): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await (admin.from('search_runs') as unknown as {
    update: (row: typeof patch) => {
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

    // Initialize: mark running, seed progress shell.
    let progress = initialProgress();
    let stats: SearchStats = initialStats();
    let currentPhase: PhaseKey | null = 'interpret';

    await stepCtx.run('mark-running', async () => {
      await writeRunProgress(search_run_id, {
        status: 'running',
        phase: 'interpret',
        progress,
        stats,
        started_at: new Date().toISOString(),
      });
      await writeSavedSearchStatus(saved_search_id, 'running');
    });

    // Persistence callback handed to S2's runners. S2 emits one event per
    // phase boundary (running -> done/failed). Each emission updates the
    // in-memory progress and writes through to search_runs.
    const onPhase: OnPhase = async (evt) => {
      currentPhase = evt.key;
      progress = setPhase(progress, evt.key, {
        status: evt.status,
        label: PHASE_LABELS[evt.key] ?? evt.key,
        detail: evt.detail,
      });
      await writeRunProgress(search_run_id, {
        phase: evt.key,
        progress,
        stats,
      });
    };

    try {
      const planResult = await stepCtx.run('run-search-plan', async () =>
        runSearchPlan(saved_search_id, { onPhase }),
      );
      stats = { ...stats, sources_found: planResult.sources_found };
      await stepCtx.run('persist-plan-stats', async () => {
        await writeRunProgress(search_run_id, { stats, progress });
      });

      const ingestResult = await stepCtx.run('run-ingest-for-search', async () =>
        runIngestForSearch(saved_search_id, { onPhase }),
      );
      stats = { ...stats, ...ingestResult.stats };

      await stepCtx.run('mark-complete', async () => {
        await writeRunProgress(search_run_id, {
          status: 'complete',
          phase: 'score',
          progress,
          stats,
          finished_at: new Date().toISOString(),
        });
        await writeSavedSearchStatus(saved_search_id, 'complete');
      });

      return {
        search_run_id,
        status: 'complete' as const,
        stats,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await stepCtx.run('mark-failed', async () => {
        await writeRunProgress(search_run_id, {
          status: 'failed',
          phase: currentPhase,
          progress,
          stats,
          finished_at: new Date().toISOString(),
        });
        await writeSavedSearchStatus(saved_search_id, 'failed');
      });
      return {
        search_run_id,
        status: 'failed' as const,
        failed_phase: currentPhase,
        error: message,
      };
    }
  },
);
