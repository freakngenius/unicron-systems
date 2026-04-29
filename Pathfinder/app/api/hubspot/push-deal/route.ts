// POST /api/hubspot/push-deal
//
// Internal-only endpoint called by P0-04 (Slack-bot accept button), the
// P0-01 chat-panel "accept lead" action, and any future reconcile cron.
// Wraps lib/lead-actions.ts:acceptLead so all callers share the same
// upsert + HubSpot push semantics.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (same internal-call gate
// as app/api/cron/*). Not user-facing.
//
// Spec: Pathfinder/Pathfinder-Feature-Specs.md § "P0 Feature 3 — HubSpot
// bidirectional sync". Plan: Pathfinder/docs/PLAN-P0-03-HUBSPOT.md.

import { NextResponse } from 'next/server';

import { acceptLead } from '@/lib/lead-actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

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
    // ignore
  }
  return false;
}

interface PushDealRequest {
  project_id?: unknown;
  actor_email?: unknown;
  attested_pipeline_value?: unknown;
  first_action_date?: unknown;
  note?: unknown;
}

function parseBody(raw: unknown): {
  ok: true;
  body: {
    projectId: string;
    actorEmail: string;
    attestedPipelineValue: number | null;
    firstActionDate: string | null;
    note: string | null;
  };
} | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'body must be a JSON object' };
  const r = raw as PushDealRequest;
  if (typeof r.project_id !== 'string' || !r.project_id) return { ok: false, error: 'project_id required (string)' };
  if (typeof r.actor_email !== 'string' || !r.actor_email) return { ok: false, error: 'actor_email required (string)' };

  let attested: number | null = null;
  if (r.attested_pipeline_value !== undefined && r.attested_pipeline_value !== null) {
    const n = Number(r.attested_pipeline_value);
    if (!Number.isFinite(n)) return { ok: false, error: 'attested_pipeline_value must be a number' };
    attested = n;
  }

  let firstAction: string | null = null;
  if (r.first_action_date !== undefined && r.first_action_date !== null) {
    if (typeof r.first_action_date !== 'string') return { ok: false, error: 'first_action_date must be ISO date string' };
    firstAction = r.first_action_date;
  }

  let note: string | null = null;
  if (r.note !== undefined && r.note !== null) {
    if (typeof r.note !== 'string') return { ok: false, error: 'note must be a string' };
    note = r.note;
  }

  return {
    ok: true,
    body: {
      projectId: r.project_id,
      actorEmail: r.actor_email,
      attestedPipelineValue: attested,
      firstActionDate: firstAction,
      note,
    },
  };
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = parseBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'invalid_request', detail: parsed.error }, { status: 400 });
  }

  const start = Date.now();
  try {
    const result = await acceptLead({
      projectId: parsed.body.projectId,
      actorEmail: parsed.body.actorEmail,
      attestedPipelineValue: parsed.body.attestedPipelineValue,
      firstActionDate: parsed.body.firstActionDate,
      note: parsed.body.note,
    });

    return NextResponse.json({
      ok: true,
      lead_action_id: result.leadActionId,
      hubspot_deal_id: result.hubspotDealId,
      pushed: result.pushed,
      push_error: result.pushError ?? null,
      latency_ms: Date.now() - start,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: 'accept_failed', detail: reason }, { status: 500 });
  }
}
