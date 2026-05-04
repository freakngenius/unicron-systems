// /pathfinder/api/connectors/teams/install
//
// Gate 14A. Initiates per-user Microsoft Teams OAuth. Mirrors the
// HubSpot install pattern at app/api/connectors/hubspot/install/route.ts.
//
// Issues a signed state token carrying the operator's user_id, then
// 302-redirects to Microsoft Entra's consent screen (multi-tenant
// /common authority by default).
//
// GET + POST both supported:
//   - GET  is the canonical browser-navigation entry point. The Settings
//     tile sets `window.location.href = '...?operator_email=...'` and
//     the browser follows the 302 to Microsoft's consent screen.
//   - POST is preserved for backwards-compat with any client that does
//     a fetch+redirect:'manual' pattern.
//
// Auth: requires the basic-auth principal to be in OPERATOR_EMAILS via
// `getCurrentUserId`. Non-operators get 403; without an operator email
// we have no user to scope the connection to.
//
// Env contract (Kyle registers in Microsoft Entra app config):
//   TEAMS_USER_CLIENT_ID
//   TEAMS_USER_CLIENT_SECRET
//   TEAMS_USER_TENANT_AUTHORITY (default https://login.microsoftonline.com/common)
//   MULTI_TENANT_TEAMS_ENABLED — flag the Settings tile reads. The route
//     itself does NOT gate on this flag because the existing org-level
//     stub modal won't reach here when the flag is off.

import { NextResponse, type NextRequest } from 'next/server';

import { getCurrentUserId, DEFAULT_ORG_ID } from '@/lib/connectors/auth';
import { issueState } from '@/lib/connectors/oauth-state';
import { buildAuthorizeUrl } from '@/lib/connectors/teams/user-oauth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function handleInstall(req: NextRequest): Promise<Response> {
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
      connector_type: 'teams',
      user_id: userId,
    });
    authorizeUrl = buildAuthorizeUrl(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'install_setup_failed', detail: message }, { status: 500 });
  }

  return NextResponse.redirect(authorizeUrl, { status: 302 });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handleInstall(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleInstall(req);
}
