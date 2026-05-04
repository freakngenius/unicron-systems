// GET /pathfinder/api/leads/[projectId]/hubspot/status
//
// SPEC - HubSpot Bridge.md §API endpoints. Reads the lead's HubSpot deal
// row scoped to the current user. Returns one of three states the
// HubspotSection component renders against:
//   - no-connection      → user hasn't connected HubSpot
//   - connected-no-deal  → connected, but no row in lead_hubspot_deals
//                          for this (project, user, portal)
//   - pushed             → row exists; surface stage/amount/owner/url

import { NextResponse, type NextRequest } from 'next/server';

import { getCurrentUserId } from '@/lib/connectors/auth';
import { getActiveHubspotConnection } from '@/lib/connectors/user-connection';
import { loadLeadDealStatus } from '@/lib/hubspot/lead-deal';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return NextResponse.json(
      { state: 'no-connection', reason: 'no_operator' },
      { status: 200 },
    );
  }

  const projectId = decodeURIComponent(params.projectId ?? '');
  if (!projectId) {
    return NextResponse.json({ error: 'invalid_project_id' }, { status: 400 });
  }

  const connection = await getActiveHubspotConnection(userId).catch(() => null);
  if (!connection) {
    return NextResponse.json({ state: 'no-connection' });
  }

  const { deal } = await loadLeadDealStatus(projectId, userId);
  if (!deal) {
    return NextResponse.json({
      state: 'connected-no-deal',
      portal_id: connection.portal_id,
      portal_name: connection.portal_name,
    });
  }

  return NextResponse.json({
    state: 'pushed',
    deal: {
      hubspot_deal_id: deal.hubspot_deal_id,
      hubspot_deal_url: deal.hubspot_deal_url,
      portal_id: deal.portal_id,
      portal_name: connection.portal_name,
      pushed_at: deal.pushed_at,
      last_synced_at: deal.last_synced_at,
      current_stage: deal.current_stage,
      current_stage_label: deal.current_stage_label,
      current_amount: deal.current_amount,
      current_owner_name: deal.current_owner_name,
      last_activity_at: deal.last_activity_at,
      status: deal.status,
    },
  });
}
