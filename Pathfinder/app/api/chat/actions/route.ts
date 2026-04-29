// app/api/chat/actions/route.ts — action endpoints for the Intelligence
// Chat panel. Five actions wired end-to-end on this branch; four are
// deferred per PLAN-P0-01-INTELLIGENCE-CHAT.md § 0 Q1 — they return HTTP
// 501 plus a structured payload AND write an audit row to chat_messages
// with the locked user-facing reply, so the UI surface tells the user
// "Queued" rather than implying immediate effect.
//
// POST body:
//   { threadId, messageId?, action, params }
//
// Response shape varies by action:
//   - text/csv         for export_csv
//   - application/json for everything else, with { ok, payload, replyForUser }

import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { anthropic } from '@/lib/anthropic';
import type { ChatActionId, Project } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── User identity ─────────────────────────────────────────────────────────

function userEmailFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    const user = decoded.slice(0, idx).trim();
    return user || null;
  } catch {
    return null;
  }
}

// ── Deferred-action user-facing replies (locked verbatim per spec § 0 Q1) ─

const DEFERRED_REPLIES: Record<string, { reply: string; blocking: string }> = {
  accept_lead_to_hubspot: {
    reply:
      'Queued. This lead will sync to HubSpot when the HubSpot integration ships (P0-03).',
    blocking: 'P0-03-hubspot-sync',
  },
  push_to_pipeline: {
    reply:
      'Queued. Pipeline push will run when the HubSpot integration ships (P0-03).',
    blocking: 'P0-03-hubspot-sync',
  },
  schedule_followup: {
    reply:
      'Saved for sync. Follow-up reminders will activate when the scheduler ships.',
    blocking: 'P0-future-scheduler',
  },
  add_note: {
    reply:
      'Saved for sync. Custom notes will move to the lead record when the notes table ships.',
    blocking: 'P0-future-notes',
  },
};

// ── Thread ownership check ────────────────────────────────────────────────

async function userOwnsThread(threadId: string, userEmail: string): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('chat_threads')
    .select('id')
    .eq('id', threadId)
    .eq('user_email', userEmail)
    .maybeSingle();
  return Boolean(data);
}

// ── Audit row helper ──────────────────────────────────────────────────────

// Supabase 2.45 strict-typing cast wrappers — same pattern used in
// app/api/refresh/route.ts and app/api/chat/route.ts.
interface InsertVoid<TPayload> {
  insert: (row: TPayload) => Promise<{ error: { message: string } | null }>;
}
interface InsertSelectId<TPayload> {
  insert: (row: TPayload) => {
    select: (cols: string) => {
      single: () => Promise<{ data: { id: number } | null; error: { message: string } | null }>;
    };
  };
}

async function writeAuditRow(args: {
  threadId: string;
  action: ChatActionId;
  params: Record<string, unknown>;
  status: 'wired' | 'deferred' | 'error';
  result?: Record<string, unknown>;
  userFacingReply?: string;
}) {
  const admin = supabaseAdmin();
  const row = {
    thread_id: args.threadId,
    role: 'system' as const,
    kind: 'action_result' as const,
    content: args.userFacingReply ?? `action:${args.action}:${args.status}`,
    payload: {
      action: args.action,
      params: args.params,
      status: args.status,
      result: args.result ?? null,
      user_facing_reply: args.userFacingReply ?? null,
      queued_at: new Date().toISOString(),
      ...(args.status === 'deferred'
        ? { blocking_branch: DEFERRED_REPLIES[args.action]?.blocking ?? 'unknown' }
        : {}),
    },
  };
  await (admin.from('chat_messages') as unknown as InsertVoid<typeof row>).insert(row);
}

// ── Wired actions ─────────────────────────────────────────────────────────

async function actionCopyDraft(args: {
  threadId: string;
  params: { messageId?: number };
}): Promise<Response> {
  await writeAuditRow({
    threadId: args.threadId,
    action: 'copy_draft',
    params: args.params,
    status: 'wired',
    userFacingReply: 'Copied to clipboard.',
  });
  return jsonOk({ replyForUser: 'Copied to clipboard.' });
}

async function actionSaveDraft(args: {
  threadId: string;
  params: { bundle?: unknown };
}): Promise<Response> {
  if (!args.params.bundle) {
    return jsonError(400, 'bundle_required');
  }
  const admin = supabaseAdmin();
  const row = {
    thread_id: args.threadId,
    role: 'system' as const,
    kind: 'outreach_draft' as const,
    content: 'Saved outreach draft.',
    payload: { bundle: args.params.bundle, saved: true, saved_at: new Date().toISOString() },
  };
  const { data, error } = await (
    admin.from('chat_messages') as unknown as InsertSelectId<typeof row>
  )
    .insert(row)
    .select('id')
    .single();
  if (error) return jsonError(500, `save_failed: ${error.message}`);
  await writeAuditRow({
    threadId: args.threadId,
    action: 'save_draft',
    params: { savedMessageId: data?.id },
    status: 'wired',
    userFacingReply: 'Draft saved to this thread.',
  });
  return jsonOk({ replyForUser: 'Draft saved to this thread.' });
}

async function actionRegenerateDraft(): Promise<Response> {
  // The chat panel re-sends a turn through /api/chat with the appropriate
  // intent. Returning 200 here just confirms the action button is alive;
  // the client triggers the regeneration itself.
  return jsonOk({
    replyForUser:
      'Send a new chat message describing how you want it changed (e.g., "make it tighter", "less salesy", "open with a question").',
  });
}

async function actionExportCsv(args: {
  threadId: string;
  params: { projectIds?: string[]; branchId?: string; limit?: number };
}): Promise<Response> {
  const admin = supabaseAdmin();
  const limit = Math.min(args.params.limit ?? 50, 500);
  let q = admin
    .from('projects')
    .select(
      'id, title, source, project_value, project_stage, posted_date, score, nearest_branch_id, distance_miles',
    )
    .order('score', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (args.params.projectIds && args.params.projectIds.length > 0) {
    q = q.in('id', args.params.projectIds);
  }
  if (args.params.branchId) {
    q = q.eq('nearest_branch_id', args.params.branchId);
  }
  const { data, error } = await q;
  if (error) return jsonError(500, `query_failed: ${error.message}`);
  const rows = (data ?? []) as Pick<
    Project,
    | 'id'
    | 'title'
    | 'source'
    | 'project_value'
    | 'project_stage'
    | 'posted_date'
    | 'score'
    | 'nearest_branch_id'
    | 'distance_miles'
  >[];
  const csv = toCsv(rows);
  await writeAuditRow({
    threadId: args.threadId,
    action: 'export_csv',
    params: args.params,
    status: 'wired',
    result: { row_count: rows.length },
    userFacingReply: `Exported ${rows.length} rows.`,
  });
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="pathfinder-export-${Date.now()}.csv"`,
    },
  });
}

async function actionSummarizePipeline(args: {
  threadId: string;
  params: { branchId?: string; days?: number };
}): Promise<Response> {
  const admin = supabaseAdmin();
  const days = args.params.days ?? 7;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [projectsRes, runsRes] = await Promise.all([
    args.params.branchId
      ? admin
          .from('projects')
          .select('id, score, project_value, project_stage, nearest_branch_id, ingested_at, verified')
          .gte('ingested_at', since)
          .eq('nearest_branch_id', args.params.branchId)
      : admin
          .from('projects')
          .select('id, score, project_value, project_stage, nearest_branch_id, ingested_at, verified')
          .gte('ingested_at', since),
    admin
      .from('agent_runs')
      .select('agent_name, status, started_at, completed_at, records_processed, records_new')
      .gte('started_at', since),
  ]);

  const projects = (projectsRes.data ?? []) as {
    id: string;
    score: number | null;
    project_value: number | null;
    project_stage: string | null;
    nearest_branch_id: string | null;
    ingested_at: string;
    verified: boolean | null;
  }[];
  const runs = (runsRes.data ?? []) as {
    agent_name: string;
    status: string;
    records_processed: number;
    records_new: number;
  }[];

  const totalProjects = projects.length;
  const verified = projects.filter((p) => p.verified === true).length;
  const hi = projects.filter((p) => (p.score ?? 0) >= 80).length;
  const totalValue = projects.reduce((sum, p) => sum + (p.project_value ?? 0), 0);
  const newRecords = runs.reduce((sum, r) => sum + (r.records_new ?? 0), 0);
  const failedRuns = runs.filter((r) => r.status === 'failed').length;

  const md = [
    `## Pipeline summary (last ${days}d${args.params.branchId ? ` · branch ${args.params.branchId}` : ''})`,
    '',
    `- Projects ingested: ${totalProjects}`,
    `- Verified: ${verified}`,
    `- High priority (score ≥ 80): ${hi}`,
    `- Total project value: ${formatUsd(totalValue)}`,
    `- New records added by agents: ${newRecords}`,
    failedRuns > 0 ? `- Failed agent runs: ${failedRuns}` : '- All agent runs succeeded.',
  ].join('\n');

  await writeAuditRow({
    threadId: args.threadId,
    action: 'summarize_pipeline',
    params: args.params,
    status: 'wired',
    result: { totalProjects, hi, verified, totalValue, newRecords, failedRuns },
  });

  // Stream-style response — return the markdown plus the same body as a
  // chat message. The client appends as if from a chat message kind.
  return jsonOk({ markdown: md, replyForUser: md });
}

// ── Deferred actions ──────────────────────────────────────────────────────

async function actionDeferred(args: {
  threadId: string;
  action: ChatActionId;
  params: Record<string, unknown>;
}): Promise<Response> {
  const lock = DEFERRED_REPLIES[args.action];
  if (!lock) return jsonError(400, `unknown_deferred_action:${args.action}`);
  await writeAuditRow({
    threadId: args.threadId,
    action: args.action,
    params: args.params,
    status: 'deferred',
    userFacingReply: lock.reply,
  });
  return new Response(
    JSON.stringify({
      ok: false,
      status: 'deferred',
      replyForUser: lock.reply,
      blocking_branch: lock.blocking,
    }),
    { status: 501, headers: { 'content-type': 'application/json' } },
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function jsonOk(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    headers: { 'content-type': 'application/json' },
  });
}

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ ok: false, error: code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return 'id,title\n';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => csvCell(row[h]))
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatUsd(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// Anthropic import is reserved for future actions that need narration.
// Suppress the unused-import lint warning by referencing it in a no-op.
void anthropic;

// ── POST handler ──────────────────────────────────────────────────────────

interface ActionsBody {
  threadId: string;
  action: ChatActionId;
  params?: Record<string, unknown>;
  messageId?: number;
}

const WIRED_ACTIONS = new Set<ChatActionId>([
  'copy_draft',
  'save_draft',
  'regenerate_draft',
  'export_csv',
  'summarize_pipeline',
]);

const DEFERRED_ACTIONS = new Set<ChatActionId>([
  'accept_lead_to_hubspot',
  'push_to_pipeline',
  'schedule_followup',
  'add_note',
]);

export async function POST(req: NextRequest): Promise<Response> {
  const userEmail = userEmailFromRequest(req);
  if (!userEmail) return new Response('unauthorized', { status: 401 });

  let body: ActionsBody;
  try {
    body = (await req.json()) as ActionsBody;
  } catch {
    return jsonError(400, 'invalid_json');
  }
  if (!body.threadId || !body.action) {
    return jsonError(400, 'threadId_and_action_required');
  }
  const owns = await userOwnsThread(body.threadId, userEmail);
  if (!owns) return jsonError(403, 'thread_not_yours');

  const params = body.params ?? {};

  if (DEFERRED_ACTIONS.has(body.action)) {
    return actionDeferred({ threadId: body.threadId, action: body.action, params });
  }
  if (!WIRED_ACTIONS.has(body.action)) {
    return jsonError(400, `unknown_action:${body.action}`);
  }
  switch (body.action) {
    case 'copy_draft':
      return actionCopyDraft({ threadId: body.threadId, params });
    case 'save_draft':
      return actionSaveDraft({ threadId: body.threadId, params });
    case 'regenerate_draft':
      return actionRegenerateDraft();
    case 'export_csv':
      return actionExportCsv({ threadId: body.threadId, params });
    case 'summarize_pipeline':
      return actionSummarizePipeline({ threadId: body.threadId, params });
    default:
      return jsonError(400, `unknown_action:${body.action}`);
  }
}
