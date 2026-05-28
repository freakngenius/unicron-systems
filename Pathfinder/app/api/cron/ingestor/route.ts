// GET /api/cron/ingestor
//
// Vercel cron schedule: 0 */6 * * * (every 6 hours). Pulls construction
// + security awards from USAspending and SAM.gov, dedupes against
// pathfinder.projects, inserts new rows. Implementation in lib/ingestor.ts
// so any test endpoint can share the orchestrator without falling foul
// of Next.js's route-export restrictions.
//
// Two source connectors only. Google News and the Harris County permits
// browser automation are deferred — see docs/RUNTIME-ARCHITECTURE.md.
//
// SPRINT Z1A — manual_only guard. This handler is purely Zedcor (USAspending
// + SAM.gov tuned for construction-surveillance lead extraction). When
// pathfinder.organizations.config->>'manual_only' is true for Zedcor, skip
// the whole cycle and log a cron_skipped_manual_only event. The cron is
// currently inert via vercel.json (commit 92c9b5e); this is defense-in-depth
// against accidental re-enablement.
//
// Multi-tenant cron handlers (ranker / verifier / outreach) are NOT guarded
// here because per-org filtering inside their loops carries regression risk
// for Funder + Internal paths. Follow-up Sprint Z1C owns the per-org guard
// migration with dedicated multi-tenant testing.

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import { runIngestorCycle, writeIngestorLog } from '@/lib/ingestor';
import { skipIfManualOnly } from '@/lib/orchestrator/manual-only-guard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

// ────────────────────────────────────────────────────────────────────────
// Auth gate (same pattern as Ranker / Verifier crons)
// ────────────────────────────────────────────────────────────────────────

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== 'production';
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim() === expected;
  }
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('secret');
    if (q && q === expected) return true;
  } catch {
    // ignore URL parse errors
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────
// Overlap protection — refuse to start a new cycle while a prior cycle
// is still in flight (started < 90 min ago). Matches the Ranker/Verifier
// pattern but with a wider window because Ingestor cycles take longer.
// ────────────────────────────────────────────────────────────────────────

const OVERLAP_WINDOW_MS = 90 * 60 * 1000;
const STUCK_RUN_THRESHOLD_MS = 120 * 60 * 1000;

interface AgentRunRow {
  id: number;
  status: string;
  started_at: string;
}

async function inFlightRun(): Promise<AgentRunRow | null> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string,
        ) => {
          eq: (
            col: string,
            val: string,
          ) => {
            order: (
              col: string,
              opts: { ascending: boolean },
            ) => {
              limit: (n: number) => Promise<{ data: AgentRunRow[] | null; error: unknown }>;
            };
          };
        };
      };
    };
  };
  const { data } = await sb
    .from('agent_runs')
    .select('id, status, started_at')
    .eq('agent_name', 'ingestor')
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

async function openAgentRun(): Promise<{ id: number | null; error?: string }> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => Promise<{ data: { id: number }[] | null; error: { message: string } | null }>;
      };
    };
  };
  try {
    const { data, error } = await sb
      .from('agent_runs')
      .insert({
        agent_name: 'ingestor',
        status: 'running',
        records_processed: 0,
        records_new: 0,
      })
      .select('id');
    if (error) return { id: null, error: error.message };
    return { id: data?.[0]?.id ?? null };
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function closeAgentRun(args: {
  id: number;
  status: 'success' | 'failed';
  records_processed: number;
  records_new: number;
  error_message?: string;
}): Promise<void> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: number) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  await sb
    .from('agent_runs')
    .update({
      status: args.status,
      records_processed: args.records_processed,
      records_new: args.records_new,
      completed_at: new Date().toISOString(),
      error_message: args.error_message ?? null,
    })
    .eq('id', args.id);
}

async function markRunFailed(id: number, message: string): Promise<void> {
  await closeAgentRun({
    id,
    status: 'failed',
    records_processed: 0,
    records_new: 0,
    error_message: message,
  });
}

// ────────────────────────────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Sprint Z1A — manual_only guard (defense-in-depth; vercel.json crons
  // are already disabled). If the Zedcor org's config flag says
  // manual-only, log + 204 without doing any ingest work.
  const guard = await skipIfManualOnly('app/api/cron/ingestor');
  if (guard) return guard;

  const start = Date.now();

  // Overlap protection
  const inflight = await inFlightRun();
  if (inflight) {
    const ageMs = Date.now() - Date.parse(inflight.started_at);
    if (ageMs < OVERLAP_WINDOW_MS) {
      await writeIngestorLog({
        eventType: 'error',
        data: {
          message: `overlapping_cycle · prior run id=${inflight.id} started ${Math.floor(ageMs / 1000)}s ago`,
          reason: 'overlapping_cycle',
        },
      });
      return NextResponse.json({ skipped: 'overlapping_cycle', prior_run_id: inflight.id });
    }
    if (ageMs >= STUCK_RUN_THRESHOLD_MS) {
      // Treat as timed out; mark failed and proceed.
      await markRunFailed(inflight.id, 'cycle_timeout_detected_by_next_run');
    }
  }

  // Open a new run
  const open = await openAgentRun();
  if (!open.id) {
    return NextResponse.json({ error: 'agent_runs_insert_failed', detail: open.error }, { status: 500 });
  }
  const runId = open.id;

  await writeIngestorLog({
    eventType: 'ingest_start',
    data: { message: 'cycle_start · sources=2', cycle_id: runId },
  });

  try {
    const stats = await runIngestorCycle();
    await closeAgentRun({
      id: runId,
      status: stats.total_errors > 0 && stats.total_inserted === 0 ? 'failed' : 'success',
      records_processed: stats.total_fetched,
      records_new: stats.total_inserted,
      error_message:
        stats.total_errors > 0 && stats.total_inserted === 0
          ? `all sources failed (errors=${stats.total_errors})`
          : undefined,
    });
    return NextResponse.json({
      ok: true,
      run_id: runId,
      stats,
      latency_ms: Date.now() - start,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await writeIngestorLog({
      eventType: 'error',
      data: { message: `unexpected_error · ${message}`, reason: 'unexpected_error' },
    });
    await markRunFailed(runId, message);
    return NextResponse.json({ error: 'cycle_failed', detail: message }, { status: 500 });
  }
}
