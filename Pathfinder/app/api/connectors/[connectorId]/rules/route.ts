// /pathfinder/api/connectors/[connectorId]/rules
//
// GET  → list active routing rules for a connector
// POST → create a new routing rule
//
// All operations are operator-gated (see lib/connectors/auth.ts) and
// scoped to a single connector belonging to the operator's org. The
// `connectorId` path segment is verified against `customer_org_id`
// before any mutation — defense-in-depth on top of RLS.

import { NextResponse, type NextRequest } from 'next/server';

import { isOperatorRequest, resolveOrgId } from '@/lib/connectors/auth';
import { getConnectorById, listRoutingRules } from '@/lib/connectors/queries';
import { validateRoutingRule } from '@/lib/connectors/rules-validate';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Params {
  params: { connectorId: string };
}

export async function GET(req: NextRequest, { params }: Params) {
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
  const rules = await listRoutingRules(connector.id);
  return NextResponse.json({ rules });
}

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const result = validateRoutingRule(body);
  if (!result.ok || !result.value) {
    return NextResponse.json({ error: 'validation_failed', errors: result.errors }, { status: 400 });
  }

  const { event_type, channel_id, channel_name, filter_json, quiet_hours_json } = result.value;

  const admin = supabaseAdmin();
  // Insert via the unsafe-cast pattern used elsewhere in the codebase
  // (see lib/deals.ts, lib/email/oauth.ts) — the generated Supabase
  // Insert types collapse to `never` for tables whose schema bag was
  // hand-rolled rather than regenerated. The runtime row shape is
  // validated by validateRoutingRule above + the Postgres CHECK
  // constraints on the table.
  const insertRow = {
    connector_id: connector.id,
    event_type,
    channel_id,
    channel_name,
    filter_json,
    quiet_hours_json,
    is_active: true,
  };
  const { data, error } = await (admin.from('connector_routing_rules') as any)
    .insert(insertRow)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'insert_failed', message: error?.message ?? 'unknown_error' },
      { status: 500 },
    );
  }

  return NextResponse.json({ rule: data }, { status: 201 });
}
