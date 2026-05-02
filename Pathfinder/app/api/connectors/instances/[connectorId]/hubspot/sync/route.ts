// /pathfinder/api/connectors/instances/[connectorId]/hubspot/sync
//
// POST  → kicks off runBulkSync for the named HubSpot connector.
//         Synchronous for v1 (paginated; OK to take 30s+). Operator-only.
// GET   → returns the row from pathfinder.hubspot_sync_state.
//
// The route is operator-gated via lib/connectors/auth.ts:isOperatorRequest.
// Customer-org isolation: we cross-check the connector's customer_org_id
// matches the request's resolved org_id before doing anything.
//
// We do NOT spawn a background job — Vercel's serverless runtime will
// hold the request open for `maxDuration` seconds. C-3A's bulk sync
// against a typical 1-3K-deal CRM finishes well inside 60s; for larger
// portals C-3B introduces a queued worker.

import { NextResponse, type NextRequest } from 'next/server';

import { isOperatorRequest, resolveOrgId } from '@/lib/connectors/auth';
import { getConnectorById } from '@/lib/connectors/queries';
import { runBulkSync } from '@/lib/connectors/hubspot/bulk-sync';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
// HubSpot sync of typical pilot portals (1-5K deals) finishes inside
// 60s; bumping to 300s gives headroom for engagement-included syncs.
export const maxDuration = 300;

interface Params {
  params: { connectorId: string };
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!isOperatorRequest(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const orgId = resolveOrgId(req);
  const connector = await getConnectorById(params.connectorId);
  if (!connector) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (connector.customer_org_id !== orgId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (connector.connector_type !== 'hubspot') {
    return NextResponse.json(
      { error: 'wrong_connector_type', connector_type: connector.connector_type },
      { status: 400 },
    );
  }
  if (connector.status !== 'connected') {
    return NextResponse.json(
      { error: 'connector_not_connected', status: connector.status },
      { status: 409 },
    );
  }

  // Optional body params for tuning (max_objects, include_engagements).
  let body: { maxObjects?: number; includeEngagements?: boolean } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  try {
    const result = await runBulkSync(connector.id, {
      maxObjects: body.maxObjects,
      includeEngagements: body.includeEngagements ?? false,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  if (!isOperatorRequest(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const orgId = resolveOrgId(req);
  const connector = await getConnectorById(params.connectorId);
  if (!connector) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (connector.customer_org_id !== orgId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (connector.connector_type !== 'hubspot') {
    return NextResponse.json(
      { error: 'wrong_connector_type', connector_type: connector.connector_type },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const res = await sb
    .from('hubspot_sync_state')
    .select('*')
    .eq('connector_id', connector.id)
    .maybeSingle();
  if (res.error) {
    return NextResponse.json({ error: 'lookup_failed', detail: res.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sync_state: res.data ?? null });
}
