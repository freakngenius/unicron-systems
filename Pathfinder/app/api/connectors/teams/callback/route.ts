// GET /pathfinder/api/connectors/teams/callback?code=...&state=...
//
// Gate 14A. User-level Microsoft Teams OAuth callback. Mirrors the
// HubSpot callback at app/api/connectors/hubspot/callback/route.ts.
//
// Validates the signed state token, exchanges the auth code for tokens
// + tenant metadata via lib/connectors/teams/user-oauth.ts, encrypts
// tokens, writes a row to pathfinder.user_connections scoped to the
// user_id the install step put in state. Then redirects to Settings.
//
// COEXISTENCE NOTE: this static path shadows the generic
// /api/connectors/[type]/callback for the `teams` segment. The generic
// route's `teams` branch (org-level Bot Framework path, PR #66 / #69)
// is not yet shipped to main. When it ships, that PR should add a
// `state.payload.user_id` fork here so org-level state (no user_id)
// dispatches to the org-level handler. Until then we 400 on no-user_id
// state with a clear pointer.
//
// Multi-tenant invariant: state's user_id is the only source for who
// owns the new row. We never read user_id from headers here — at this
// point in the flow there's no operator session because the user came
// back from Microsoft's redirect, not the Pathfinder UI.

import { NextResponse, type NextRequest } from 'next/server';

import { validateState } from '@/lib/connectors/oauth-state';
import { exchangeCode } from '@/lib/connectors/teams/user-oauth';
import { upsertTeamsConnection } from '@/lib/connectors/user-connection';
import { publicUrl } from '@/lib/public-url';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

function settingsRedirect(params: Record<string, string>): Response {
  const url = new URL(`${publicUrl()}/settings/connectors`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url.toString(), { status: 302 });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateToken = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  // User clicked Cancel on Microsoft's consent screen, or Microsoft
  // surfaced an error. Bounce back without writing a row.
  if (providerError) {
    return settingsRedirect({ error: `provider_error:${providerError}` });
  }
  if (!stateToken || !code) {
    return NextResponse.json({ error: 'missing code or state' }, { status: 400 });
  }

  const stateResult = validateState(stateToken, { expectedType: 'teams' });
  if (!stateResult.ok) {
    return NextResponse.json(
      { error: 'invalid_state', reason: stateResult.reason },
      { status: 400 },
    );
  }
  const userId = stateResult.payload.user_id;
  if (!userId) {
    // Org-level state token reached the user-level callback. The
    // existing generic [type]/callback handles org-level Teams; this
    // static shadow only serves user-level today. When PR #66/#69
    // (org-level Teams) ships, add a fork here that delegates to the
    // org-level handler. Until then 400 with a clear pointer.
    return NextResponse.json(
      {
        error: 'org_level_unsupported_here',
        detail:
          'This callback handles user-level Microsoft Teams OAuth (Gate 14A). Org-level state tokens (no user_id) are not yet routed by this static path.',
      },
      { status: 400 },
    );
  }

  let exchange: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    exchange = await exchangeCode(code);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Never log code/token. The truncated provider error is safe to surface.
    return settingsRedirect({ error: 'exchange_failed', detail: message.slice(0, 120) });
  }

  if (!exchange.tenant_id) {
    // Without a tenant guid we can't write a meaningful user_connections
    // row — multi-tenant routing keys on tenant_id, and Microsoft Graph
    // calls embed it in the request path. Surface a clear error.
    return settingsRedirect({ error: 'introspect_failed', detail: 'missing tenant_id' });
  }

  try {
    await upsertTeamsConnection({
      user_id: userId,
      email: exchange.account_label,
      tenant_id: exchange.tenant_id,
      tenant_name: exchange.account_label,
      access_token: exchange.access_token,
      refresh_token: exchange.refresh_token,
      expires_at: exchange.expires_at,
      scope: exchange.scope ? exchange.scope.split(' ').filter(Boolean) : [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return settingsRedirect({ error: 'persist_failed', detail: message.slice(0, 120) });
  }

  return settingsRedirect({ connected: 'teams' });
}
