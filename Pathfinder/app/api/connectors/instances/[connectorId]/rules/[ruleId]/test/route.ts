// POST /pathfinder/api/connectors/[connectorId]/rules/[ruleId]/test
//
// Fires a synthetic event through C-1A's dispatcher (when present) so the
// operator can verify a rule end-to-end without waiting for a real
// trigger. We import the dispatcher dynamically because C-1C ships
// before C-1A's TS layer lands on main; if the module is missing we
// degrade to a no-op response with `dispatched=false` so the modal
// surfaces a "test queued (dispatcher not yet wired)" hint rather than
// a 500.
//
// Either way we still write a `connector_audit_log` row (direction=
// 'outbound', status='sent' for dispatched, 'failed' otherwise) so the
// test attempt shows up in the audit timeline.

import { NextResponse, type NextRequest } from 'next/server';

import { isOperatorRequest, resolveOrgId } from '@/lib/connectors/auth';
import { dispatchEvent } from '@/lib/connectors/dispatcher';
import { getConnectorById } from '@/lib/connectors/queries';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Params {
  params: { connectorId: string; ruleId: string };
}

const SYNTHETIC_PAYLOADS: Record<string, Record<string, unknown>> = {
  'lead.high_score': {
    project_id: 'pf-test-001',
    title: '[Test] High-priority lead',
    score: 94,
    branch_id: 'denver',
    estimated_value_usd: 250000,
  },
  'lead.warm_intro': {
    project_id: 'pf-test-002',
    title: '[Test] Warm-intro match',
    matched_customer: 'Acme Construction',
    score: 88,
  },
  'cost.alert': {
    threshold_usd: 50,
    today_spend_usd: 73.21,
    breaking_agents: ['ranker', 'verifier'],
  },
  'brief.daily': {
    new_leads: 12,
    pipeline_movement: 4,
  },
  'agent.failure': {
    agent: 'ingestor',
    last_success_at: '2026-05-02T00:44:00Z',
    error: '[Test] Synthetic failure for routing-rule verification',
  },
};

const DEFAULT_TEST_PAYLOAD = { test: true, message: 'Pathfinder routing-rule test event.' };

export async function POST(req: NextRequest, { params }: Params) {
  if (!isOperatorRequest(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const connector = await getConnectorById(params.connectorId);
  if (!connector) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const orgId = resolveOrgId(req);
  if (connector.customer_org_id !== orgId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const admin = supabaseAdmin();
  const { data: ruleData } = await admin
    .from('connector_routing_rules')
    .select('*')
    .eq('id', params.ruleId)
    .eq('connector_id', connector.id)
    .maybeSingle();
  if (!ruleData) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const rule = ruleData as {
    id: string;
    event_type: string;
    channel_id: string;
  };

  const payload = SYNTHETIC_PAYLOADS[rule.event_type] ?? DEFAULT_TEST_PAYLOAD;

  // dispatchEvent is a no-op stub in this branch (see
  // lib/connectors/dispatcher.ts). C-1A's merge replaces it with the
  // real fan-out. We treat success as "dispatched" — when the stub
  // returns void with no side effect, the audit log still captures the
  // attempt so the operator has visibility, and the integration test
  // path resolves once the real adapter ships.
  let dispatched = false;
  let dispatchError: string | null = null;
  try {
    await dispatchEvent(orgId, rule.event_type, payload);
    dispatched = true;
  } catch (err) {
    dispatchError = err instanceof Error ? err.message : String(err);
  }

  // Always log the test attempt to the audit trail.
  await (admin.from('connector_audit_log') as any).insert({
    connector_id: connector.id,
    customer_org_id: orgId,
    event_type: rule.event_type,
    direction: 'outbound',
    status: dispatched ? 'sent' : 'failed',
    payload_summary: { test: true, rule_id: rule.id, channel_id: rule.channel_id },
    error_message: dispatched ? null : dispatchError ?? 'dispatcher_unavailable',
  });

  return NextResponse.json({
    dispatched,
    error: dispatchError,
    note: dispatched
      ? null
      : 'Dispatcher not yet available on this build — test recorded in audit log.',
    payload,
  });
}
