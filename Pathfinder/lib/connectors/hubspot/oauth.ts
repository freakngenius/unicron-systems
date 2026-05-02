// lib/connectors/hubspot/oauth.ts — HubSpot OAuth 2.0 token exchange.
//
// Mirrors the C-1A Slack pattern. The framework callback URL
// `/api/connectors/hubspot/callback` is registered in the HubSpot app
// config; the authorize URL + scopes come from `getProvider('hubspot')`
// in lib/connectors/providers.ts (single-sourced so SPEC § 5.4 scope
// minimization stays canonical).
//
// HubSpot OAuth specifics that diverge from Slack:
//   1. Token endpoint accepts `application/x-www-form-urlencoded` POSTs
//      with a `grant_type=authorization_code` body (no client_id /
//      secret in headers — they ride in the body).
//   2. Tokens expire (default 30 min for access; refresh tokens are
//      long-lived). `expires_in` arrives in seconds; we compute the
//      absolute expiresAt for storage.
//   3. The token response includes neither hub_id nor hub_domain. We
//      fetch those via `/oauth/v1/access-tokens/{token}` (the access
//      token introspection endpoint) so the connector row can show a
//      meaningful account_name + account_external_id.
//   4. Refresh path uses `grant_type=refresh_token` against the same URL.
//
// CRITICAL: tokens are NEVER logged. Errors carry only the HubSpot
// error string and HTTP status; the body containing the access_token
// is parsed and discarded. Storage encryption happens in tokens.ts.

import { publicUrl } from '@/lib/public-url';
import { getProvider } from '@/lib/connectors/providers';

const HUBSPOT_PROVIDER = {
  clientIdEnv: 'HUBSPOT_CLIENT_ID' as const,
  clientSecretEnv: 'HUBSPOT_CLIENT_SECRET' as const,
  authorizeUrl: getProvider('hubspot').authorizeUrl,
  tokenUrl: getProvider('hubspot').tokenExchangeUrl,
  scopes: getProvider('hubspot').scopes,
};

/** Raw shape of the HubSpot `/oauth/v1/token` response. */
export interface HubSpotTokenResponse {
  access_token: string;
  refresh_token: string;
  /** Seconds until access_token expires. */
  expires_in: number;
  token_type?: string;
}

/** Augmented exchange result with hub identity (introspected separately). */
export interface HubSpotExchangeResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  hub_id: string | null;
  hub_domain: string | null;
  scopes: string[];
}

export function callbackUrl(): string {
  return `${publicUrl()}/api/connectors/hubspot/callback`;
}

/**
 * Build the HubSpot authorize URL for the OAuth start. Mirrors Slack's
 * `buildAuthorizeUrl(state)` shape so the API route can stay generic.
 */
export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env[HUBSPOT_PROVIDER.clientIdEnv];
  if (!clientId) {
    throw new Error(`${HUBSPOT_PROVIDER.clientIdEnv} is not set; cannot build HubSpot authorize URL`);
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(),
    // HubSpot's scope separator is space-encoded.
    scope: HUBSPOT_PROVIDER.scopes.join(' '),
    state,
  });
  return `${HUBSPOT_PROVIDER.authorizeUrl}?${params.toString()}`;
}

/**
 * Exchange an OAuth authorization code for HubSpot tokens. Throws on
 * transport error or non-2xx response. Caller is responsible for
 * computing the absolute `expiresAt` and persisting via tokens.ts.
 *
 * The redirect_uri MUST match the value used during /authorize verbatim;
 * we recompute it from publicUrl() to stay consistent.
 */
export async function exchangeCode(code: string): Promise<HubSpotExchangeResult> {
  const clientId = process.env[HUBSPOT_PROVIDER.clientIdEnv];
  const clientSecret = process.env[HUBSPOT_PROVIDER.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw new Error('HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET not configured');
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: callbackUrl(),
    code,
  });

  const res = await fetch(HUBSPOT_PROVIDER.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    // Read the error body for the message; never log the raw payload.
    const errText = await res.text().catch(() => '');
    const trimmed = errText.length > 240 ? errText.slice(0, 237) + '...' : errText;
    throw new Error(`hubspot oauth/v1/token failed: status=${res.status} body=${trimmed}`);
  }
  const json = (await res.json()) as Partial<HubSpotTokenResponse>;
  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== 'number') {
    throw new Error('hubspot oauth/v1/token returned a malformed body');
  }

  // Fetch hub_id + hub_domain from the access-token introspection
  // endpoint. Best-effort: a failure here doesn't invalidate the
  // exchange — the connector row just stores nulls for account
  // metadata until the next refresh.
  let hubId: string | null = null;
  let hubDomain: string | null = null;
  let scopes: string[] = [];
  try {
    const meta = await introspectAccessToken(json.access_token);
    hubId = meta.hub_id;
    hubDomain = meta.hub_domain;
    scopes = meta.scopes;
  } catch {
    // swallow — we'll record an account-name-less connector and
    // back-fill on next refresh.
  }

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
    hub_id: hubId,
    hub_domain: hubDomain,
    scopes,
  };
}

/**
 * Use a refresh_token to obtain a fresh access_token. Returns the same
 * shape as exchangeCode. The refresh_token in the response MAY be the
 * same string HubSpot returned originally (HubSpot rotates refresh
 * tokens lazily); callers should still persist it via rotateToken.
 */
export async function refreshToken(refresh: string): Promise<HubSpotExchangeResult> {
  const clientId = process.env[HUBSPOT_PROVIDER.clientIdEnv];
  const clientSecret = process.env[HUBSPOT_PROVIDER.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw new Error('HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET not configured');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refresh,
  });
  const res = await fetch(HUBSPOT_PROVIDER.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const trimmed = errText.length > 240 ? errText.slice(0, 237) + '...' : errText;
    throw new Error(`hubspot refresh failed: status=${res.status} body=${trimmed}`);
  }
  const json = (await res.json()) as Partial<HubSpotTokenResponse>;
  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== 'number') {
    throw new Error('hubspot refresh returned a malformed body');
  }
  let hubId: string | null = null;
  let hubDomain: string | null = null;
  let scopes: string[] = [];
  try {
    const meta = await introspectAccessToken(json.access_token);
    hubId = meta.hub_id;
    hubDomain = meta.hub_domain;
    scopes = meta.scopes;
  } catch {
    // swallow
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
    hub_id: hubId,
    hub_domain: hubDomain,
    scopes,
  };
}

interface AccessTokenInfo {
  hub_id: string | null;
  hub_domain: string | null;
  scopes: string[];
}

/**
 * Hit `/oauth/v1/access-tokens/{token}` to discover the portal id and
 * domain. The access token rides in the URL path — that's the
 * documented contract — and the response body never echoes the token.
 */
async function introspectAccessToken(accessToken: string): Promise<AccessTokenInfo> {
  const url = `https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`hubspot access-token introspect failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    hub_id?: number | string;
    hub_domain?: string;
    scopes?: string[];
  };
  return {
    hub_id: json.hub_id != null ? String(json.hub_id) : null,
    hub_domain: typeof json.hub_domain === 'string' ? json.hub_domain : null,
    scopes: Array.isArray(json.scopes) ? json.scopes : [],
  };
}
