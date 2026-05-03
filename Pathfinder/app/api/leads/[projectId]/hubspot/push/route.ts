// POST /pathfinder/api/leads/[projectId]/hubspot/push
//
// SPEC - HubSpot Bridge.md §API endpoints. User-auth-gated. Pushes the
// Pathfinder lead to the operator's HubSpot portal via lib/hubspot/lead-deal.
// Idempotent on (project, user, portal).

import { NextResponse, type NextRequest } from 'next/server';

import { getCurrentUserId } from '@/lib/connectors/auth';
import { pushLeadDeal } from '@/lib/hubspot/lead-deal';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'operator email required' },
      { status: 403 },
    );
  }

  const projectId = decodeURIComponent(params.projectId ?? '');
  if (!projectId) {
    return NextResponse.json({ error: 'invalid_project_id' }, { status: 400 });
  }

  const outcome = await pushLeadDeal({ projectId, userId });

  if (!outcome.ok) {
    if (outcome.reason === 'no_connection') {
      return NextResponse.json(
        { error: 'no_connection', message: 'connect HubSpot in Settings before pushing' },
        { status: 412 },
      );
    }
    if (outcome.reason === 'no_project') {
      return NextResponse.json(
        { error: 'no_project', detail: outcome.detail ?? null },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: 'hubspot_error', detail: outcome.detail ?? null },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    idempotent: outcome.idempotent,
    hubspot_deal_id: outcome.hubspot_deal_id,
    hubspot_deal_url: outcome.hubspot_deal_url,
    portal_id: outcome.portal_id,
    contacts_pushed: outcome.contacts_pushed,
  });
}
