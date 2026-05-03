// POST /pathfinder/api/connectors/hubspot/install
//
// SPEC - HubSpot Bridge.md §Settings page → "OAuth flow" step 2-3.
// Initiates per-user HubSpot OAuth. Issues a signed state token carrying
// the operator's user_id, then 302-redirects to HubSpot's consent screen.
//
// Auth: requires the basic-auth principal to be in OPERATOR_EMAILS via
// `getCurrentUserId`. Non-operators get 403; without an operator email
// we have no user to scope the connection to.
//
// Static path beats the generic /api/connectors/[type]/auth dynamic
// route for HubSpot specifically — the user-level flow writes to
// pathfinder.user_connections, not pathfinder.connectors. The generic
// route stays for Slack/Teams (org-level).

import { NextResponse, type NextRequest } from 'next/server';

import { getCurrentUserId, DEFAULT_ORG_ID } from '@/lib/connectors/auth';
import { issueState } from '@/lib/connectors/oauth-state';
import { buildAuthorizeUrl } from '@/lib/connectors/hubspot/oauth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'operator email required' },
      { status: 403 },
    );
  }

  let authorizeUrl: string;
  try {
    const state = issueState({
      org_id: DEFAULT_ORG_ID,
      connector_type: 'hubspot',
      user_id: userId,
    });
    authorizeUrl = buildAuthorizeUrl(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'install_setup_failed', detail: message }, { status: 500 });
  }

  return NextResponse.redirect(authorizeUrl, { status: 302 });
}
