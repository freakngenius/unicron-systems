// /pathfinder/api/connectors/[connectorId]/rules/[ruleId]
//
// PATCH  → update an existing routing rule
// DELETE → soft-delete (set is_active=false). Audit log retains the row.

import { NextResponse, type NextRequest } from 'next/server';

import { isOperatorRequest, resolveOrgId } from '@/lib/connectors/auth';
import { getConnectorById } from '@/lib/connectors/queries';
import { validateRoutingRule } from '@/lib/connectors/rules-validate';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Params {
  params: { connectorId: string; ruleId: string };
}

async function loadRuleScoped(req: NextRequest, params: Params['params']) {
  if (!isOperatorRequest(req)) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) } as const;
  }
  const connector = await getConnectorById(params.connectorId);
  if (!connector) {
    return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) } as const;
  }
  const orgId = resolveOrgId(req);
  if (connector.customer_org_id !== orgId) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) } as const;
  }
  const admin = supabaseAdmin();
  const { data: rule } = await admin
    .from('connector_routing_rules')
    .select('*')
    .eq('id', params.ruleId)
    .eq('connector_id', connector.id)
    .maybeSingle();
  if (!rule) {
    return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) } as const;
  }
  return { connector, rule, admin } as const;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const scoped = await loadRuleScoped(req, params);
  if ('error' in scoped) return scoped.error;

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

  // See note in rules/route.ts re: the Supabase Insert/Update type
  // collapse-to-never for hand-rolled schema bags.
  const { data, error } = await (scoped.admin.from('connector_routing_rules') as any)
    .update({
      event_type,
      channel_id,
      channel_name,
      filter_json,
      quiet_hours_json,
    })
    .eq('id', params.ruleId)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'update_failed', message: error?.message ?? 'unknown_error' },
      { status: 500 },
    );
  }
  return NextResponse.json({ rule: data });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const scoped = await loadRuleScoped(req, params);
  if ('error' in scoped) return scoped.error;

  const { error } = await (scoped.admin.from('connector_routing_rules') as any)
    .update({ is_active: false })
    .eq('id', params.ruleId);
  if (error) {
    return NextResponse.json(
      { error: 'delete_failed', message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
