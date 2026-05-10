// api/atrium/skills/run.ts — Sprint 5 Stream G (extends Sprint 4 Stream E)
// POST /api/atrium/skills/run — execute a skill server-side.
//
// Auth: x-unicron-api-key header (shared internal key from UNICRON_INTERNAL_API_KEY).
// Body: { skill_slug: string; [params]: unknown }
//
// Sprint 4 implemented slugs (productivity):
//   morning-brief     — query ledger + action_items; format brief; post Slack DM if token set
//   inbox-triage      — query nervous_system.ledger where status='inbox'; score + sort; return top 5
//
// Sprint 5 adds (research + sales):
//   deep-research          — proxy to POST /api/skills/deep-research (Pathfinder Stream C)
//   llm-council-deliberate — proxy to POST /api/atrium/council-deliberate (Stream B)
//   track-pipeline-stage   — DB update: customer stage + ledger audit row
//   [all other new slugs]  — scaffolded: return 202 + message
//
// quick-capture is a UI trigger — handled client-side, never reaches this endpoint.
// Any unrecognised slug returns 404.

import type { IncomingMessage, ServerResponse } from 'http';
import { createClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RunBody {
  skill_slug: string;
  // Productivity (Sprint 4)
  team_member_id?: string;
  limit?: number;
  // Research (Sprint 5)
  topic?: string;
  depth?: string;
  question?: string;
  criteria?: string;
  // Sales (Sprint 5)
  customer_id?: string;
  new_stage?: string;
  note?: string;
  // Passthrough for proxied skills
  params?: Record<string, unknown>;
}

interface LedgerRow {
  id: string;
  source_type: string;
  content_summary: string | null;
  confidence: number | null;
  created_at: string;
  status: string | null;
}

interface ActionItemRow {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'irreversible';
  status: string;
  break_off_signal_id: string | null;
}

// ─── Scaffolded slugs (202 response) ─────────────────────────────────────────

const SCAFFOLDED_SLUGS = new Set([
  'light-rag-query',
  'morning-trend-scan',
  'competitor-watch',
  'schedule-discovery-call',
  'extract-vertical-signals',
  'draft-follow-up-email',
  'generate-proposal',
]);

// ─── Pipeline stage allowlist ─────────────────────────────────────────────────

const VALID_PIPELINE_STAGES = new Set([
  'lead',
  'qualified',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
]);

// ─── Source type scoring weights ──────────────────────────────────────────────

const SOURCE_TYPE_WEIGHT: Record<string, number> = {
  call: 1.0,
  voice_memo: 0.9,
  slack: 0.8,
  email: 0.7,
  cowork_session: 0.6,
  apple_note: 0.5,
  manual: 0.4,
};

function getSourceWeight(sourceType: string): number {
  return SOURCE_TYPE_WEIGHT[sourceType] ?? 0.3;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function checkAuth(req: IncomingMessage): boolean {
  const internalKey = process.env.UNICRON_INTERNAL_API_KEY;
  // If no key is configured, allow in non-production environments.
  if (!internalKey) {
    return process.env.VERCEL_ENV !== 'production';
  }
  const provided = req.headers['x-unicron-api-key'];
  return provided === internalKey;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function makeSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ─── Audit log helper ─────────────────────────────────────────────────────────

async function auditSkillRun(
  skillSlug: string,
  outcome: 'success' | 'scaffolded' | 'error',
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = makeSupabase();
    await supabase
      .schema('nervous_system')
      .from('audit_log')
      .insert({
        table_name: 'skills',
        action: `skill_run:${skillSlug}`,
        new_data: { outcome, ...meta },
      });
  } catch {
    // Non-fatal — audit logging must never break the skill response
  }
}

// ─── Sprint 4 Skills ──────────────────────────────────────────────────────────

async function runMorningBrief(
  teamMemberId?: string,
): Promise<{ message: string; delivered_via_slack: boolean }> {
  const supabase = makeSupabase();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  // 1. Yesterday's ledger digest (top 3 by confidence)
  const { data: ledgerRows } = await supabase
    .schema('nervous_system')
    .from('ledger')
    .select('id, source_type, content_summary, confidence, created_at')
    .gte('created_at', yesterdayStart.toISOString())
    .lt('created_at', todayStart.toISOString())
    .order('confidence', { ascending: false })
    .limit(3)
    .returns<LedgerRow[]>();

  const digestLines =
    (ledgerRows ?? []).length > 0
      ? (ledgerRows ?? [])
          .map(
            (r) =>
              `• [${r.source_type}] ${r.content_summary ?? '(no summary)'}`,
          )
          .join('\n')
      : 'No ingest activity recorded yesterday.';

  // 2. Open escalations
  const { data: escalations, count: escalationCount } = await supabase
    .schema('nervous_system')
    .from('action_items')
    .select('id, title, priority, status, break_off_signal_id', {
      count: 'exact',
    })
    .in('status', ['open', 'in_progress'])
    .or('priority.eq.irreversible,break_off_signal_id.not.is.null')
    .limit(3)
    .returns<ActionItemRow[]>();

  const PRIORITY_ORDER: Record<string, number> = {
    irreversible: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const sortedEscalations = [...(escalations ?? [])].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4),
  );

  const escalationLines =
    sortedEscalations.length > 0
      ? sortedEscalations
          .map((e) => `• [${e.priority.toUpperCase()}] ${e.title}`)
          .join('\n')
      : 'None';

  const totalEscalations = escalationCount ?? 0;

  // 3. Format time in PT
  const ptTime = now.toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
  });
  const weekday = now.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
  });
  const date = now.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const message = [
    `*Morning Brief — ${weekday}, ${date}*`,
    '',
    "*Yesterday's Digest*",
    digestLines,
    '',
    `*Escalations* — ${totalEscalations} open`,
    escalationLines,
    '',
    '*Sprint Status*',
    'Check the Atrium Work tab for active sprint details.',
    '',
    `_Brief generated at ${ptTime} PT_`,
  ].join('\n');

  // 4. Post to Slack if token is configured
  let deliveredViaSlack = false;
  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (slackToken && teamMemberId) {
    try {
      // Look up the team member's Slack user ID
      const { data: member } = await supabase
        .schema('nervous_system')
        .from('team_members')
        .select('slack_user_id')
        .eq('id', teamMemberId)
        .maybeSingle();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const slackUserId = (member as any)?.slack_user_id as string | null | undefined;
      if (slackUserId) {
        const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${slackToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ channel: slackUserId, text: message }),
        });
        const slackJson = (await slackRes.json()) as { ok: boolean };
        deliveredViaSlack = slackJson.ok === true;
      }
    } catch {
      // Non-fatal — we still return the message text
    }
  }

  return { message, delivered_via_slack: deliveredViaSlack };
}

async function runInboxTriage(
  limitParam?: number,
): Promise<{ items: (LedgerRow & { score: number })[]; message?: string }> {
  const supabase = makeSupabase();
  const limit = Math.min(Math.max(1, limitParam ?? 5), 20);

  // Fetch up to 50 inbox rows
  const { data: rows } = await supabase
    .schema('nervous_system')
    .from('ledger')
    .select('id, source_type, content_summary, confidence, created_at, status')
    .in('status', ['inbox', 'unprocessed'])
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<LedgerRow[]>();

  if (!rows || rows.length === 0) {
    return { items: [], message: 'Inbox is empty' };
  }

  const now = Date.now();

  // Score each row
  const scored = rows.map((row) => {
    const hoursSince = (now - new Date(row.created_at).getTime()) / 3_600_000;
    const recencyScore = 1 / (1 + hoursSince);
    const confidence = row.confidence ?? 0.5;
    const sourceWeight = getSourceWeight(row.source_type);

    const score =
      0.4 * recencyScore + 0.4 * confidence + 0.2 * sourceWeight;

    return { ...row, score: Math.round(score * 10000) / 10000 };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return { items: scored.slice(0, limit) };
}

// ─── Sprint 5 Skills ──────────────────────────────────────────────────────────

async function runDeepResearch(
  topic: string,
  depth?: string,
): Promise<unknown> {
  const pathfinderBase = process.env.VITE_PATHFINDER_INTERNAL_URL ?? '';
  if (!pathfinderBase) {
    throw new Error(
      'VITE_PATHFINDER_INTERNAL_URL is not configured — cannot proxy to deep-research endpoint.',
    );
  }

  const url = `${pathfinderBase.replace(/\/$/, '')}/api/skills/deep-research`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, depth: depth ?? 'standard' }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`deep-research upstream error ${res.status}: ${text}`);
  }

  return res.json();
}

async function runLlmCouncilDeliberate(
  question: string,
  criteria?: string,
): Promise<unknown> {
  // council-deliberate is served by the same unicron-platform Vercel deployment
  // (delivered by Stream B). We call it as an internal server-to-server request
  // using the absolute URL derived from VERCEL_URL (set automatically by Vercel).
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:5173';

  const url = `${baseUrl}/api/atrium/council-deliberate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-unicron-api-key': process.env.UNICRON_INTERNAL_API_KEY ?? '',
    },
    body: JSON.stringify({ question, criteria }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`council-deliberate upstream error ${res.status}: ${text}`);
  }

  return res.json();
}

async function runTrackPipelineStage(
  customerId: string,
  newStage: string,
  note?: string,
): Promise<{ updated: boolean; customer_id: string; stage: string }> {
  if (!VALID_PIPELINE_STAGES.has(newStage)) {
    throw new Error(
      `Invalid pipeline stage '${newStage}'. Valid stages: ${[...VALID_PIPELINE_STAGES].join(', ')}`,
    );
  }

  const supabase = makeSupabase();

  // Update customer stage in nervous_system.customers (or public.customers — try both)
  // We try nervous_system first since that's the primary schema for this system.
  const { error: nsError } = await supabase
    .schema('nervous_system')
    .from('customers')
    .update({ stage: newStage, updated_at: new Date().toISOString() })
    .eq('id', customerId);

  if (nsError) {
    // Fallback: try public schema
    const { error: pubError } = await supabase
      .from('customers')
      .update({ stage: newStage, updated_at: new Date().toISOString() })
      .eq('id', customerId);

    if (pubError) {
      throw new Error(
        `Failed to update customer stage: ${pubError.message}`,
      );
    }
  }

  // Write a ledger row for the audit trail
  await supabase
    .schema('nervous_system')
    .from('ledger')
    .insert({
      source_type: 'manual',
      content_summary: `Pipeline stage updated: customer ${customerId} → ${newStage}${note ? ` · ${note}` : ''}`,
      status: 'processed',
      confidence: 1.0,
    });

  return { updated: true, customer_id: customerId, stage: newStage };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    jsonResponse(res, 405, { ok: false, error: 'method not allowed' });
    return;
  }

  if (!checkAuth(req)) {
    jsonResponse(res, 401, { ok: false, error: 'unauthorized' });
    return;
  }

  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    jsonResponse(res, 500, { ok: false, error: 'Supabase env vars not configured' });
    return;
  }

  let body: RunBody;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw) as RunBody;
  } catch {
    jsonResponse(res, 400, { ok: false, error: 'invalid JSON body' });
    return;
  }

  const { skill_slug, team_member_id, limit } = body;

  if (!skill_slug || typeof skill_slug !== 'string') {
    jsonResponse(res, 400, { ok: false, error: 'skill_slug is required' });
    return;
  }

  // ─── Scaffolded skills: 202 + message ─────────────────────────────────────

  if (SCAFFOLDED_SLUGS.has(skill_slug)) {
    void auditSkillRun(skill_slug, 'scaffolded');
    jsonResponse(res, 202, {
      ok: true,
      status: 'scaffolded',
      skill_slug,
      message: 'Full implementation coming in Sprint 6',
    });
    return;
  }

  // ─── Implemented skills ───────────────────────────────────────────────────

  try {
    switch (skill_slug) {

      // ── Sprint 4 productivity skills ────────────────────────────────────────

      case 'morning-brief': {
        const result = await runMorningBrief(team_member_id);
        void auditSkillRun(skill_slug, 'success');
        jsonResponse(res, 200, { ok: true, skill_slug, ...result });
        return;
      }

      case 'inbox-triage': {
        const limitParam = typeof limit === 'number' ? limit : undefined;
        const result = await runInboxTriage(limitParam);
        void auditSkillRun(skill_slug, 'success');
        jsonResponse(res, 200, { ok: true, skill_slug, ...result });
        return;
      }

      case 'quick-capture': {
        // UI trigger — should never reach the server.
        jsonResponse(res, 400, {
          ok: false,
          error:
            'quick-capture is a UI trigger skill — it opens the QuickCapture modal client-side and does not call this endpoint.',
        });
        return;
      }

      // ── Sprint 5 research skills ─────────────────────────────────────────────

      case 'deep-research': {
        const topic = body.topic ?? (body.params?.topic as string | undefined);
        if (!topic || typeof topic !== 'string') {
          jsonResponse(res, 400, { ok: false, error: 'topic is required for deep-research' });
          return;
        }
        const depth = body.depth ?? (body.params?.depth as string | undefined);
        const result = await runDeepResearch(topic, depth);
        void auditSkillRun(skill_slug, 'success', { topic });
        jsonResponse(res, 200, { ok: true, skill_slug, ...Object(result) });
        return;
      }

      case 'llm-council-deliberate': {
        const question = body.question ?? (body.params?.question as string | undefined);
        if (!question || typeof question !== 'string') {
          jsonResponse(res, 400, { ok: false, error: 'question is required for llm-council-deliberate' });
          return;
        }
        const criteria = body.criteria ?? (body.params?.criteria as string | undefined);
        const result = await runLlmCouncilDeliberate(question, criteria);
        void auditSkillRun(skill_slug, 'success');
        jsonResponse(res, 200, { ok: true, skill_slug, ...Object(result) });
        return;
      }

      // ── Sprint 5 sales skills ────────────────────────────────────────────────

      case 'track-pipeline-stage': {
        const customerId = body.customer_id ?? (body.params?.customer_id as string | undefined);
        const newStage = body.new_stage ?? (body.params?.new_stage as string | undefined);
        if (!customerId || typeof customerId !== 'string') {
          jsonResponse(res, 400, { ok: false, error: 'customer_id is required for track-pipeline-stage' });
          return;
        }
        if (!newStage || typeof newStage !== 'string') {
          jsonResponse(res, 400, { ok: false, error: 'new_stage is required for track-pipeline-stage' });
          return;
        }
        const note = body.note ?? (body.params?.note as string | undefined);
        const result = await runTrackPipelineStage(customerId, newStage, note);
        void auditSkillRun(skill_slug, 'success', { customer_id: customerId, new_stage: newStage });
        jsonResponse(res, 200, { ok: true, skill_slug, ...result });
        return;
      }

      default: {
        jsonResponse(res, 404, {
          ok: false,
          error: `skill '${skill_slug}' is not implemented as an API skill`,
        });
        return;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unexpected error';
    void auditSkillRun(skill_slug, 'error', { error: message });
    jsonResponse(res, 500, { ok: false, error: message });
  }
}
