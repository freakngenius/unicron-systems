// GET /api/cron/outreach — Vercel-cron driven Outreach Drafter.
//
// Runtime: Vercel cron at `0,30 * * * *` (twice per hour, set in
// vercel.json). Spec: Pathfinder/Pathfinder-Feature-Specs.md § "P0
// Feature 2 — Outreach Drafter" + agent-specs/03-computer-outreach.md.
//
// Trigger model: spec says "event-driven (triggered when a verified
// high-priority project arrives)". Vercel doesn't expose Supabase row
// triggers; the substitute is a 30-minute poll of
//   verified = true AND score >= high_priority_threshold AND
//   no row in outreach_drafts(project_id) yet.
// 30 minutes is comfortably within the spec's "at least 1 draft within
// 30 minutes of verification" SLA.
//
// Auth, overlap protection, agent_runs row, agent_log lines mirror the
// Verifier route exactly so the dashboard's activity rail and the
// retro-fit ops dashboard treat all four cron agents (ingestor, ranker,
// verifier, outreach) the same.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchActiveScoringConfig } from '@/lib/scoring-config-server';
import {
  buildInsertRows,
  draftOutreachWithRetry,
  extractContactFromRawPayload,
  type OutreachContact,
  type OutreachDraftInsertRow,
} from '@/lib/outreach';
import { inngest } from '@/lib/inngest/client';
import type { Branch, Customer, Project } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

// CYCLE_TIMEOUT_MS must stay safely under maxDuration (Vercel kills the
// function instance at the maxDuration ceiling). Mirrors the Ranker
// pattern at app/api/cron/ranker/route.ts:50 (CYCLE_BUDGET_MS = 50_000)
// — 10s buffer under the 60s ceiling so the in-flight per-project step
// can finish AND the cleanup writes (markRunFailed, write_success log)
// land before the function dies. Prior value was 12 minutes which
// caused agent_runs rows to leak `status='running'` whenever Vercel
// killed the instance at 60s before internal cleanup fired (Phase 1
// Finding A in MEMORY/audit-pathfinder.md).
//
// QUEUE_LIMIT trimmed to 5 so a 50s budget covers a full cycle: each
// outreach draft is one Anthropic call (~5–10s) plus DB writes. 5×10s
// = 50s leaves ~10s for cleanup. Twice-per-hour cron × 5 = 240/day
// capacity, well above realistic verified-high-priority arrival rate.
const QUEUE_LIMIT = 5;
const CYCLE_TIMEOUT_MS = 50_000;

// ────────────────────────────────────────────────────────────────────
// Auth — bearer CRON_SECRET, with ?secret=… escape hatch for local dev.
// ────────────────────────────────────────────────────────────────────

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return process.env.NODE_ENV !== 'production';
  }
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

// ────────────────────────────────────────────────────────────────────
// agent_log helper
// ────────────────────────────────────────────────────────────────────

type Admin = ReturnType<typeof supabaseAdmin>;

type EventType =
  | 'draft_start'
  | 'draft_skip'
  | 'draft_pass'
  | 'draft_warn'
  | 'draft_fail'
  | 'write_success'
  | 'error';

interface LogRow {
  agent_name: 'outreach';
  event_type: EventType;
  event_data: Record<string, unknown>;
  latency_ms: number | null;
  model_used: string | null;
}

async function writeLog(
  admin: Admin,
  event_type: EventType,
  event_data: Record<string, unknown>,
  opts: { latency_ms?: number; model_used?: string } = {},
): Promise<void> {
  const row: LogRow = {
    agent_name: 'outreach',
    event_type,
    event_data,
    latency_ms: opts.latency_ms ?? null,
    model_used: opts.model_used ?? null,
  };
  await (
    admin.from('agent_log') as unknown as {
      insert: (rows: LogRow) => Promise<{ error: { message: string } | null }>;
    }
  ).insert(row);
}

// ────────────────────────────────────────────────────────────────────
// Queue pull — projects ready for drafting
// ────────────────────────────────────────────────────────────────────

async function fetchQueue(
  admin: Admin,
  highPriorityThreshold: number,
): Promise<Project[]> {
  // Ranked + verified + high-priority + no drafts yet. We use two
  // queries because the supabase-js builder doesn't expose a NOT EXISTS
  // subquery — fetch existing draft project_ids first, then exclude.
  const draftedIdsRes = await (
    admin.from('outreach_drafts') as unknown as {
      select: (cols: string) => Promise<{ data: { project_id: string }[] | null; error: { message: string } | null }>;
    }
  ).select('project_id');
  if (draftedIdsRes.error) {
    throw new Error(`outreach_drafts read failed: ${draftedIdsRes.error.message}`);
  }
  const drafted = new Set((draftedIdsRes.data ?? []).map((r) => r.project_id));

  // Pull the queue. Ordering by score desc gets the strongest leads
  // out first; the QUEUE_LIMIT cap keeps a single cycle bounded.
  const queueRes = await (
    admin.from('projects') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: boolean) => {
          gte: (col: string, val: number) => {
            order: (col: string, opts: { ascending: boolean; nullsFirst: boolean }) => {
              limit: (n: number) => Promise<{ data: Project[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    }
  )
    .select('*')
    .eq('verified', true)
    .gte('score', highPriorityThreshold)
    // Pull more than QUEUE_LIMIT so we can filter out already-drafted
    // rows and still have a full cycle's worth of work.
    .order('score', { ascending: false, nullsFirst: false })
    .limit(QUEUE_LIMIT * 3);

  if (queueRes.error) {
    throw new Error(`projects queue fetch failed: ${queueRes.error.message}`);
  }
  const queue = (queueRes.data ?? []).filter((p) => !drafted.has(p.id)).slice(0, QUEUE_LIMIT);
  return queue;
}

// ────────────────────────────────────────────────────────────────────
// Per-project step
// ────────────────────────────────────────────────────────────────────

interface CycleStats {
  processed: number;
  drafted_clean: number;
  drafted_with_warnings: number;
  failed: number;
}

async function persistInsertRows(
  admin: Admin,
  rows: OutreachDraftInsertRow[],
): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await (
      admin.from('outreach_drafts') as unknown as {
        insert: (rows: OutreachDraftInsertRow[]) => Promise<{ error: { message: string } | null }>;
      }
    ).insert(rows);
    if (!res.error) return { ok: true };
    if (attempt === 1) return { ok: false, error: res.error.message };
  }
  return { ok: false, error: 'unknown' };
}

async function markRunFailed(
  admin: Admin,
  runId: number,
  error_message: string,
): Promise<void> {
  await (
    admin.from('agent_runs') as unknown as {
      update: (v: { status: string; error_message: string; completed_at: string }) => {
        eq: (col: string, val: number) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .update({
      status: 'failed',
      error_message,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);
}

// ────────────────────────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const t0 = Date.now();
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let admin: Admin;
  try {
    admin = supabaseAdmin();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  // Overlap protection — same shape the Verifier uses.
  const now = new Date();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60_000).toISOString();
  const fiveAndTwentyMinAgo = new Date(now.getTime() - 25 * 60_000).toISOString();

  type RunRow = { id: number; started_at: string; status: string };
  const runningRunsRes = await (
    admin.from('agent_runs') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{ data: RunRow[] | null; error: { message: string } | null }>;
        };
      };
    }
  )
    .select('id, started_at, status')
    .eq('agent_name', 'outreach')
    .eq('status', 'running');

  if (runningRunsRes.error) {
    return NextResponse.json({ error: runningRunsRes.error.message }, { status: 500 });
  }
  const runningRuns = runningRunsRes.data ?? [];
  const stuck = runningRuns.filter((r) => r.started_at <= thirtyMinAgo);
  const live = runningRuns.filter(
    (r) => r.started_at > thirtyMinAgo && r.started_at > fiveAndTwentyMinAgo,
  );

  for (const r of stuck) {
    await (
      admin.from('agent_runs') as unknown as {
        update: (v: { status: string; error_message: string; completed_at: string }) => {
          eq: (col: string, val: number) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .update({
        status: 'failed',
        error_message: 'cycle_timeout_detected_by_next_run',
        completed_at: now.toISOString(),
      })
      .eq('id', r.id);
  }

  if (live.length > 0) {
    await writeLog(admin, 'error', { message: 'overlapping cycle detected', reason: 'overlapping_cycle' });
    return NextResponse.json({ skipped: 'overlapping_cycle' });
  }

  // Pull active scoring config so /settings edits to the high-priority
  // threshold flow into Outreach without a redeploy.
  const scoring = await fetchActiveScoringConfig();
  const HIGH_PRIORITY_THRESHOLD = scoring.high_priority_threshold;

  let queue: Project[];
  try {
    queue = await fetchQueue(admin, HIGH_PRIORITY_THRESHOLD);
  } catch (err) {
    await writeLog(admin, 'error', {
      message: (err as Error).message,
      reason: 'queue_fetch_failed',
    });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  if (queue.length === 0) {
    return NextResponse.json({ processed: 0, reason: 'empty_queue' });
  }

  // Open agent_runs row.
  type AgentRunInsert = {
    agent_name: 'outreach';
    started_at: string;
    completed_at: string | null;
    records_processed: number;
    records_new: number;
    status: 'running' | 'success' | 'failed';
    error_message: string | null;
  };
  const runRowPayload: AgentRunInsert = {
    agent_name: 'outreach',
    started_at: now.toISOString(),
    completed_at: null,
    records_processed: 0,
    records_new: 0,
    status: 'running',
    error_message: null,
  };
  const runInsertRes = await (
    admin.from('agent_runs') as unknown as {
      insert: (rows: AgentRunInsert) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{ data: { id: number } | null; error: { message: string } | null }>;
        };
      };
    }
  )
    .insert(runRowPayload)
    .select('id')
    .maybeSingle();

  if (runInsertRes.error || !runInsertRes.data) {
    return NextResponse.json(
      { error: runInsertRes.error?.message ?? 'failed to open agent_runs row' },
      { status: 500 },
    );
  }
  const runId = runInsertRes.data.id;

  await writeLog(admin, 'draft_start', {
    message: `outreach cycle · ${queue.length} verified high-priority projects pending drafts`,
    queue_depth: queue.length,
    high_priority_threshold: HIGH_PRIORITY_THRESHOLD,
  });

  // Lookups: branches + customers (warm-intro lookup + hallucination check).
  const [branchesRes, customersRes] = await Promise.all([
    (admin.from('branches') as unknown as {
      select: (cols: string) => Promise<{ data: Branch[] | null; error: { message: string } | null }>;
    }).select('*'),
    (admin.from('customers') as unknown as {
      select: (cols: string) => Promise<{ data: Customer[] | null; error: { message: string } | null }>;
    }).select('*'),
  ]);

  if (branchesRes.error || customersRes.error) {
    const msg = branchesRes.error?.message ?? customersRes.error?.message ?? 'lookup load failed';
    await markRunFailed(admin, runId, msg);
    await writeLog(admin, 'error', { message: 'lookup load failed', reason: 'supabase_read_failed' });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  const branches = branchesRes.data ?? [];
  const customers = customersRes.data ?? [];
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const allowedCustomerNames = customers.map((c) => c.name);

  const cycleStart = Date.now();
  const stats: CycleStats = {
    processed: 0,
    drafted_clean: 0,
    drafted_with_warnings: 0,
    failed: 0,
  };

  for (const project of queue) {
    if (Date.now() - cycleStart > CYCLE_TIMEOUT_MS) {
      await writeLog(admin, 'error', { message: 'cycle_timeout', reason: 'cycle_timeout' });
      await markRunFailed(admin, runId, 'cycle_timeout');
      return NextResponse.json(
        { error: 'cycle_timeout', processed: stats.processed },
        { status: 500 },
      );
    }
    stats.processed++;

    const branch = project.nearest_branch_id ? branchById.get(project.nearest_branch_id) ?? null : null;
    const warmCustomer = project.warm_for_customer_id
      ? customerById.get(project.warm_for_customer_id) ?? null
      : null;
    const contact: OutreachContact = extractContactFromRawPayload(project.raw_payload);

    const stepStart = Date.now();
    let result;
    try {
      result = await draftOutreachWithRetry(
        {
          project: {
            id: project.id,
            title: project.title,
            summary: project.summary,
            project_value: project.project_value,
            project_stage: project.project_stage,
            distance_miles: project.distance_miles,
            rationale: project.rationale,
            outreach_hook: project.outreach_hook,
            lat: project.lat,
            lon: project.lon,
            raw_payload: project.raw_payload,
            warm_for_customer_id: project.warm_for_customer_id,
            nearest_branch_id: project.nearest_branch_id,
          },
          branch: branch
            ? { id: branch.id, name: branch.name, code: branch.code, region: branch.region }
            : null,
          warmCustomer: warmCustomer
            ? { id: warmCustomer.id, name: warmCustomer.name }
            : null,
          contact,
        },
        { allowedCustomerNames },
      );
    } catch (err) {
      stats.failed++;
      await writeLog(
        admin,
        'draft_fail',
        {
          message: `draft failed · ${project.id} · ${(err as Error).message}`,
          project_id: project.id,
        },
        { latency_ms: Date.now() - stepStart, model_used: 'claude-sonnet' },
      );
      continue;
    }

    const rows = buildInsertRows({
      project: { id: project.id, warm_for_customer_id: project.warm_for_customer_id },
      contact,
      bundle: result.bundle,
      warnings: result.warnings,
      modelUsed: result.modelUsed,
    });

    const write = await persistInsertRows(admin, rows);
    if (!write.ok) {
      stats.failed++;
      await writeLog(admin, 'error', {
        message: `outreach_drafts write failed · ${project.id} · ${write.error}`,
        reason: 'supabase_write_failed',
        project_id: project.id,
      });
      continue;
    }

    // Phase 2 Stream A Gate A1: emit decision.synthesized so the
    // delivery dispatcher Inngest function (currently scaffold) and
    // future delivery channels (briefing, hubspot pre-stamp) can fan
    // out without going through the cron poll. draft_id left null —
    // persistInsertRows doesn't return inserted IDs and the contract
    // permits null for the G1 delivery scaffold. Fire-and-forget; the
    // outreach cycle continues on emit failure.
    try {
      await inngest.send({
        name: 'pathfinder/decision.synthesized',
        data: {
          project_id: project.id,
          draft_id: null,
          synthesized_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      await writeLog(admin, 'error', {
        message: `inngest emit failed (non-fatal) · ${project.id} · synthesized`,
        reason: 'inngest_emit_failed',
        project_id: project.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (result.warnings.length === 0) {
      stats.drafted_clean++;
      await writeLog(
        admin,
        'draft_pass',
        {
          message: `drafted · ${project.id} · clean (3 channels)`,
          project_id: project.id,
          attempts: result.attempts,
          warm_intro_via: project.warm_for_customer_id,
        },
        { latency_ms: Date.now() - stepStart, model_used: result.modelUsed },
      );
    } else {
      stats.drafted_with_warnings++;
      await writeLog(
        admin,
        'draft_warn',
        {
          message: `drafted with warnings · ${project.id} · ${result.warnings.join(',')}`,
          project_id: project.id,
          attempts: result.attempts,
          warnings: result.warnings,
          warm_intro_via: project.warm_for_customer_id,
        },
        { latency_ms: Date.now() - stepStart, model_used: result.modelUsed },
      );
    }
  }

  await writeLog(admin, 'write_success', {
    message: `cycle close · ${stats.drafted_clean} clean · ${stats.drafted_with_warnings} with warnings · ${stats.failed} failed`,
    ...stats,
  });

  await (
    admin.from('agent_runs') as unknown as {
      update: (v: { status: string; records_processed: number; records_new: number; completed_at: string }) => {
        eq: (col: string, val: number) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .update({
      status: 'success',
      records_processed: stats.processed,
      records_new: stats.drafted_clean + stats.drafted_with_warnings,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  return NextResponse.json({
    ok: true,
    processed: stats.processed,
    drafted_clean: stats.drafted_clean,
    drafted_with_warnings: stats.drafted_with_warnings,
    failed: stats.failed,
    latency_ms: Date.now() - t0,
  });
}
