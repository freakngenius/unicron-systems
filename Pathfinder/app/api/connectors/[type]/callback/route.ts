// GET /api/connectors/[type]/callback?code=...&state=...
//
// OAuth callback for all three connectors. C-1A wires:
//   - state validation (signed + unexpired + nonce-not-replayed)
//   - shape-correct happy path for slack (token exchange URL is real;
//     if env vars missing, returns 501 with a clear message)
//   - 501 placeholder for teams + hubspot so C-1C can render Connect
//     buttons without 404
//
// On any state failure → 400. On exchange failure → records the failure
// in connector_audit_log + flips connectors.status='error' + redirects
// the user back to /pathfinder/settings/connectors with ?error=...
// On success: storeToken + status='connected' + redirect with ?connected=type.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/connectors/audit';
import { validateState } from '@/lib/connectors/oauth-state';
import { getProvider, isConnectorType } from '@/lib/connectors/providers';
import { storeToken } from '@/lib/connectors/tokens';
import type { ConnectorType } from '@/lib/connectors/types';
import { exchangeCode as exchangeHubSpotCode } from '@/lib/connectors/hubspot/oauth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(req: Request, { params }: { params: { type: string } }) {
  const typeParam = params.type.toLowerCase();
  if (!isConnectorType(typeParam)) {
    return NextResponse.json(
      { error: 'unknown_connector_type', allowed: ['slack', 'teams', 'hubspot'] },
      { status: 400 },
    );
  }
  const type: ConnectorType = typeParam;

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateToken = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  // Provider rejected (user clicked Cancel etc.). Bounce back without
  // touching the connector row's token.
  if (providerError) {
    return redirectToSettings(url.origin, `provider_error:${providerError}`);
  }

  if (!stateToken || !code) {
    return NextResponse.json({ error: 'missing code or state' }, { status: 400 });
  }

  const stateResult = validateState(stateToken, { expectedType: type });
  if (!stateResult.ok) {
    return NextResponse.json(
      { error: 'invalid_state', reason: stateResult.reason },
      { status: 400 },
    );
  }
  const { org_id: orgId } = stateResult.payload;

  const provider = getProvider(type);
  if (!provider.exchangeImplemented) {
    // Phase 2 / 3 shim — record the attempt so C-1C's Connect button
    // isn't a black hole, then redirect back with a clear message.
    return NextResponse.json(
      {
        error: 'exchange_not_implemented',
        connector_type: type,
        message:
          type === 'teams'
            ? 'Teams connector exchange ships in C-2 (Phase 2 — Teams parity).'
            : 'HubSpot connector exchange ships in Phase 3 (HubSpot bi-directional).',
      },
      { status: 501 },
    );
  }

  // Look up the existing pending connector row (created by the auth
  // route). If not present, create it on the fly — the user may have
  // been redirected to the callback by some other mechanism.
  let connectorId: string;
  try {
    connectorId = await ensureConnectorRow(orgId, type);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'connector_lookup_failed', detail: message }, { status: 500 });
  }

  // Per-provider token exchange. Each branch maps the provider-specific
  // response into the unified `ProviderExchangeResult` shape consumed
  // below — keeps the storeToken + connector-update logic provider
  // agnostic.
  let exchangeResult: ProviderExchangeResult;
  try {
    const redirectUri = `${url.origin}/api/connectors/${type}/callback`;
    if (type === 'slack') {
      exchangeResult = await exchangeSlackCode(code, redirectUri);
    } else if (type === 'hubspot') {
      exchangeResult = await runHubSpotExchange(code);
    } else {
      // teams falls through to the !exchangeImplemented guard above; if
      // we reach here a future provider was added without wiring the
      // exchange branch.
      throw new Error(`exchange for ${type} not wired in callback route`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAudit({
      connector_id: connectorId,
      customer_org_id: orgId,
      event_type: 'oauth.exchange',
      direction: 'oauth',
      status: 'failed',
      // Critical: we record the error message but never the code or
      // partial token. The provider's error string is safe to log.
      error_message: message,
    });
    await markConnectorError(connectorId, message);
    return redirectToSettings(url.origin, `exchange_failed:${type}`);
  }

  try {
    await storeToken(connectorId, {
      access: exchangeResult.access_token,
      refresh: exchangeResult.refresh_token ?? null,
      expiresAt: exchangeResult.expires_at,
      scope: exchangeResult.scope,
    });
    await markConnectorConnected(connectorId, {
      account_name: exchangeResult.account_name,
      account_external_id: exchangeResult.account_external_id,
    });
    await recordAudit({
      connector_id: connectorId,
      customer_org_id: orgId,
      event_type: 'oauth.exchange',
      direction: 'oauth',
      status: 'succeeded',
      payload_summary: {
        connector_type: type,
        account_name: exchangeResult.account_name,
        scope: exchangeResult.scope,
        // NEVER include the token here. Only the metadata.
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAudit({
      connector_id: connectorId,
      customer_org_id: orgId,
      event_type: 'oauth.persist',
      direction: 'oauth',
      status: 'failed',
      error_message: message,
    });
    await markConnectorError(connectorId, message);
    return redirectToSettings(url.origin, `persist_failed:${type}`);
  }

  return redirectToSettings(url.origin, undefined, type);
}

function redirectToSettings(origin: string, error?: string, connected?: ConnectorType): Response {
  const target = new URL('/pathfinder/settings/connectors', origin);
  if (connected) target.searchParams.set('connected', connected);
  if (error) target.searchParams.set('error', error);
  return NextResponse.redirect(target.toString(), { status: 302 });
}

async function ensureConnectorRow(orgId: string, type: ConnectorType): Promise<string> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      upsert: (
        rows: Record<string, unknown>,
        opts: { onConflict: string },
      ) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const res = await sb
    .from('connectors')
    .upsert(
      { customer_org_id: orgId, connector_type: type, status: 'pending' },
      { onConflict: 'customer_org_id,connector_type' },
    )
    .select('id')
    .maybeSingle();
  if (res.error || !res.data) {
    throw new Error(res.error?.message ?? 'no row returned');
  }
  return res.data.id;
}

async function markConnectorConnected(
  connectorId: string,
  meta: { account_name: string | null; account_external_id: string | null },
): Promise<void> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  await sb
    .from('connectors')
    .update({
      status: 'connected',
      connected_at: new Date().toISOString(),
      disconnected_at: null,
      account_name: meta.account_name,
      account_external_id: meta.account_external_id,
      last_error: null,
    })
    .eq('id', connectorId);
}

async function markConnectorError(connectorId: string, message: string): Promise<void> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  await sb
    .from('connectors')
    .update({ status: 'error', last_error: message.slice(0, 500) })
    .eq('id', connectorId);
}

/**
 * Unified shape returned by every per-provider exchange wrapper. The
 * callback route's persist + audit steps consume this.
 */
interface ProviderExchangeResult {
  access_token: string;
  refresh_token: string | null;
  expires_at: Date | null;
  scope: string;
  account_name: string | null;
  account_external_id: string | null;
}

// Backward-compat alias — internal Slack helper still uses this name.
type SlackExchangeResult = ProviderExchangeResult;

interface SlackOAuthV2Response {
  ok: boolean;
  error?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  team?: { id?: string; name?: string };
}

async function exchangeSlackCode(code: string, redirectUri: string): Promise<SlackExchangeResult> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be set in env');
  }
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as SlackOAuthV2Response;
  if (!json.ok || !json.access_token) {
    throw new Error(`slack oauth error: ${json.error ?? 'unknown'}`);
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? null,
    expires_at: typeof json.expires_in === 'number' ? new Date(Date.now() + json.expires_in * 1000) : null,
    scope: json.scope ?? '',
    account_name: json.team?.name ?? null,
    account_external_id: json.team?.id ?? null,
  };
}

/**
 * Adapter from the HubSpot provider's `HubSpotExchangeResult` to the
 * route's unified `ProviderExchangeResult`. We compute the absolute
 * `expires_at` here (HubSpot returns relative `expires_in` in seconds)
 * so storeToken can persist a timestamptz directly.
 */
async function runHubSpotExchange(code: string): Promise<ProviderExchangeResult> {
  const r = await exchangeHubSpotCode(code);
  return {
    access_token: r.access_token,
    refresh_token: r.refresh_token,
    expires_at: new Date(Date.now() + r.expires_in * 1000),
    scope: r.scopes.join(' '),
    account_name: r.hub_domain,
    account_external_id: r.hub_id,
  };
}
