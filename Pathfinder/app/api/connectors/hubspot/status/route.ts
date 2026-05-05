// GET /pathfinder/api/connectors/hubspot/status
//
// Per-user HubSpot connection state for the Settings tile. Auth: same
// operator gate as install/disconnect — the row returned belongs to the
// authenticated operator, never another user.
//
// Used client-side by HubspotUserTile to hydrate after mount. Page render
// itself doesn't have the operator email in its request headers (it's a
// client-localStorage value), so the tile fetches its own state.

import { NextResponse, type NextRequest } from 'next/server';

import { getCurrentUserId } from '@/lib/connectors/auth';
import { getHubspotConnectionStatus } from '@/lib/connectors/connection-status';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return NextResponse.json({ state: 'disconnected' }, { status: 200 });
  }

  let status;
  try {
    status = await getHubspotConnectionStatus(userId);
  } catch (err) {
    return NextResponse.json(
      { state: 'error', error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  if (status.status === 'none') {
    return NextResponse.json({ state: 'disconnected' }, { status: 200 });
  }

  // Surface 'expired' if the access token's expires_at is in the past.
  // Refresh-token recovery happens via the cron in Gate 10E; for now the
  // tile shows a Reconnect affordance.
  const state = status.expired ? 'expired' : 'connected';

  return NextResponse.json({
    state,
    portal_id: status.portalId,
    portal_name: status.portalName,
    connected_at: status.connectedAt,
    expires_at: status.expiresAt,
  });
}
