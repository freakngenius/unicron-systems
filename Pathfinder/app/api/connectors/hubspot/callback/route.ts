// GET /pathfinder/api/connectors/hubspot/callback?code=...&state=...
//
// SPEC - HubSpot Bridge.md §Settings page → "OAuth flow" step 5-7.
// Validates the signed state token, exchanges the auth code for tokens
// + portal metadata via lib/connectors/hubspot/oauth.ts, encrypts tokens,
// and writes a row to pathfinder.user_connections scoped to the user_id
// the install step put in state. Then redirects to Settings.
//
// Static path shadows the generic /api/connectors/[type]/callback for
// HubSpot only. Slack + Teams continue through the generic route which
// writes to pathfinder.connectors (org-level).
//
// Multi-tenant invariant: state's user_id is the only source for who
// owns the new row. We never read user_id from headers here — at this
// point in the flow there's no operator session because the user came
// back from HubSpot's redirect, not the Pathfinder UI.

import { NextResponse, type NextRequest } from 'next/server';

import { validateState } from '@/lib/connectors/oauth-state';
import { exchangeCode } from '@/lib/connectors/hubspot/oauth';
import { upsertHubspotConnection } from '@/lib/connectors/user-connection';
import { ensurePathfinderDealProperties } from '@/lib/hubspot/ensure-properties';
import { createUserClient } from '@/lib/hubspot/user-client';
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

  // User clicked Cancel on the HubSpot consent screen, or HubSpot
  // surfaced an error. Bounce back without writing a row.
  if (providerError) {
    return settingsRedirect({ error: `provider_error:${providerError}` });
  }
  if (!stateToken || !code) {
    return NextResponse.json({ error: 'missing code or state' }, { status: 400 });
  }

  const stateResult = validateState(stateToken, { expectedType: 'hubspot' });
  if (!stateResult.ok) {
    return NextResponse.json(
      { error: 'invalid_state', reason: stateResult.reason },
      { status: 400 },
    );
  }
  const userId = stateResult.payload.user_id;
  if (!userId) {
    // Org-level state token mistakenly handed to the user-level callback.
    return NextResponse.json(
      { error: 'invalid_state', reason: 'missing_user_id' },
      { status: 400 },
    );
  }

  let exchange: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    exchange = await exchangeCode(code);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Never log code/token. The provider error is safe to surface.
    return settingsRedirect({ error: 'exchange_failed', detail: message.slice(0, 120) });
  }

  if (!exchange.hub_id) {
    // Without a portal_id we can't write a meaningful user_connections
    // row (the multi-tenant routing in the webhook resolves by portal_id).
    return settingsRedirect({ error: 'introspect_failed', detail: 'missing hub_id' });
  }

  try {
    await upsertHubspotConnection({
      user_id: userId,
      email: null, // HubSpot's OAuth response doesn't include user email
      portal_id: exchange.hub_id,
      portal_name: exchange.hub_domain,
      access_token: exchange.access_token,
      refresh_token: exchange.refresh_token,
      expires_at: new Date(Date.now() + exchange.expires_in * 1000),
      scope: exchange.scopes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return settingsRedirect({ error: 'persist_failed', detail: message.slice(0, 120) });
  }

  // Best-effort: warm the per-portal property schema so the first push
  // from the UI doesn't pay the ~5-call bootstrap latency. Failures here
  // are non-fatal — the push path will retry the ensure step itself.
  try {
    const client = createUserClient({ accessToken: exchange.access_token });
    await ensurePathfinderDealProperties(client, exchange.hub_id);
  } catch {
    // swallow — connect is the user-visible action; ensure failure
    // surfaces on the first push if it persists.
  }

  return settingsRedirect({ connected: 'hubspot' });
}
