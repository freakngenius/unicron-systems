// lib/connectors/teams/user-oauth.ts — user-level Microsoft Entra OAuth.
//
// Gate 14A. Distinct from lib/connectors/teams/oauth.ts (org-level Bot
// Framework path); this file owns the per-user multi-tenant OAuth that
// writes to pathfinder.user_connections, mirroring the HubSpot pattern.
//
// Env contract (separate from org-level vars so Kyle can ship one Entra
// app for user-level and a different one for the bot, OR reuse a single
// app — the env names are the dispatch's nominal names):
//   TEAMS_USER_CLIENT_ID         Microsoft Entra application (client) id
//   TEAMS_USER_CLIENT_SECRET     Microsoft Entra app secret
//   TEAMS_USER_TENANT_AUTHORITY  default https://login.microsoftonline.com/common
//
// Scopes (delegated): User.Read offline_access ChannelMessage.Send
// Chat.ReadWrite. Microsoft requires offline_access for the refresh
// token; the rest are dispatched per Gate 14B's send-as-user contract.
//
// CRITICAL: tokens are NEVER logged. Errors carry only Microsoft's
// error_description and HTTP status; the response body containing the
// access_token is parsed and discarded.

import { publicUrl } from '@/lib/public-url';

const DEFAULT_AUTHORITY = 'https://login.microsoftonline.com/common';

export const TEAMS_USER_SCOPES = [
  'User.Read',
  'offline_access',
  'ChannelMessage.Send',
  'Chat.ReadWrite',
];

export interface TeamsUserTokenResponse {
  token_type: string;
  scope?: string;
  expires_in: number;
  ext_expires_in?: number;
  access_token: string;
  refresh_token?: string;
  id_token?: string;
}

export interface TeamsUserExchangeResult {
  access_token: string;
  refresh_token: string | null;
  expires_at: Date | null;
  scope: string;
  /** Azure AD tenant guid extracted from id_token's tid claim. Required
   *  for the user_connections row write — multi-tenant routing keys on
   *  this value. Null tenant means we can't safely upsert; caller should
   *  surface an error rather than write a row with a null tenant. */
  tenant_id: string | null;
  /** Best-effort display string for the connected account. Microsoft's
   *  id_token also carries `preferred_username` (UPN-like) which makes a
   *  human-readable label; we surface that when available. */
  account_label: string | null;
}

export function callbackUrl(): string {
  return `${publicUrl()}/api/connectors/teams/callback`;
}

function authority(): string {
  return process.env.TEAMS_USER_TENANT_AUTHORITY || DEFAULT_AUTHORITY;
}

function authorizeBaseUrl(): string {
  return `${authority()}/oauth2/v2.0/authorize`;
}

function tokenBaseUrl(): string {
  return `${authority()}/oauth2/v2.0/token`;
}

/**
 * Build the Microsoft Entra authorize URL for the user-level OAuth start.
 * Mirrors HubSpot's `buildAuthorizeUrl(state)` shape so the API route can
 * stay slim. `response_type=code` + `response_mode=query` keeps the auth
 * code in the URL (Microsoft also supports form_post; we use query to
 * match the redirect handler's URL parsing).
 */
export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env.TEAMS_USER_CLIENT_ID;
  if (!clientId) {
    throw new Error('TEAMS_USER_CLIENT_ID is not set; cannot build Teams authorize URL');
  }
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    response_mode: 'query',
    redirect_uri: callbackUrl(),
    scope: TEAMS_USER_SCOPES.join(' '),
    state,
    // prompt=select_account makes multi-tenant flows explicit — the user
    // sees the account picker even when they have an existing session.
    prompt: 'select_account',
  });
  return `${authorizeBaseUrl()}?${params.toString()}`;
}

/**
 * Exchange an OAuth authorization code for tokens. Throws on transport
 * error or non-2xx. Caller is responsible for persisting via
 * upsertTeamsConnection (which encrypts before write).
 */
export async function exchangeCode(code: string): Promise<TeamsUserExchangeResult> {
  const clientId = process.env.TEAMS_USER_CLIENT_ID;
  const clientSecret = process.env.TEAMS_USER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('TEAMS_USER_CLIENT_ID / TEAMS_USER_CLIENT_SECRET not configured');
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUrl(),
    scope: TEAMS_USER_SCOPES.join(' '),
  });

  const res = await fetch(tokenBaseUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as Partial<TeamsUserTokenResponse> & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    const detail = json.error_description ?? json.error ?? `status=${res.status}`;
    throw new Error(`teams user oauth exchange failed: ${detail}`);
  }
  if (typeof json.expires_in !== 'number') {
    throw new Error('teams user oauth token response missing expires_in');
  }

  const idTokenInfo = decodeIdToken(json.id_token);

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? null,
    expires_at: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope ?? TEAMS_USER_SCOPES.join(' '),
    tenant_id: idTokenInfo.tid,
    account_label: idTokenInfo.label,
  };
}

/**
 * Refresh path. Microsoft rotates refresh tokens lazily — the response
 * may echo the same refresh token, in which case the caller should
 * still persist it (the upsert path handles that uniformly).
 */
export async function refreshToken(refresh: string): Promise<TeamsUserExchangeResult> {
  const clientId = process.env.TEAMS_USER_CLIENT_ID;
  const clientSecret = process.env.TEAMS_USER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('TEAMS_USER_CLIENT_ID / TEAMS_USER_CLIENT_SECRET not configured');
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refresh,
    scope: TEAMS_USER_SCOPES.join(' '),
  });
  const res = await fetch(tokenBaseUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as Partial<TeamsUserTokenResponse> & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    const detail = json.error_description ?? json.error ?? `status=${res.status}`;
    throw new Error(`teams user oauth refresh failed: ${detail}`);
  }
  if (typeof json.expires_in !== 'number') {
    throw new Error('teams user oauth refresh response missing expires_in');
  }
  const idTokenInfo = decodeIdToken(json.id_token);
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? refresh,
    expires_at: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope ?? TEAMS_USER_SCOPES.join(' '),
    tenant_id: idTokenInfo.tid,
    account_label: idTokenInfo.label,
  };
}

interface IdTokenInfo {
  tid: string | null;
  label: string | null;
}

/** Best-effort id_token decode. We do NOT verify the JWT — this is hint
 *  data for tenant_id + display label, not a security boundary. The
 *  state-token validation already gates entry. */
export function decodeIdToken(idToken: string | undefined | null): IdTokenInfo {
  if (!idToken) return { tid: null, label: null };
  const parts = idToken.split('.');
  if (parts.length !== 3) return { tid: null, label: null };
  try {
    const payload = parts[1];
    const pad = payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4));
    const std = payload.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const decoded = Buffer.from(std, 'base64').toString('utf8');
    const obj = JSON.parse(decoded) as {
      tid?: string;
      preferred_username?: string;
      name?: string;
      upn?: string;
    };
    const tid = typeof obj.tid === 'string' && obj.tid.length > 0 ? obj.tid : null;
    const label =
      (typeof obj.preferred_username === 'string' && obj.preferred_username) ||
      (typeof obj.upn === 'string' && obj.upn) ||
      (typeof obj.name === 'string' && obj.name) ||
      null;
    return { tid, label };
  } catch {
    return { tid: null, label: null };
  }
}
