// GET /pathfinder/api/connectors/list?org_id=<org>
//
// Returns the connector roster for one org. Read-only; consumed by the
// settings page server component AND the routing-rules modal (refresh
// after save). Operator-gated because cross-org peeking is destructive
// in spirit even when the surface only exposes status counts.

import { NextResponse, type NextRequest } from 'next/server';

import { isOperatorRequest, resolveOrgId } from '@/lib/connectors/auth';
import { listConnectors } from '@/lib/connectors/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!isOperatorRequest(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const orgId = resolveOrgId(req);
  const items = await listConnectors(orgId);
  return NextResponse.json({ org_id: orgId, items });
}
