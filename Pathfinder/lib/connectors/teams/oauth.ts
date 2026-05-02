// lib/connectors/teams/oauth.ts — Microsoft Entra (v2.0) OAuth2 token exchange.
//
// SPEC § 2.2 Step F → callback route uses these helpers to exchange the
// `code` query param for an access_token + refresh_token from Microsoft
// identity platform. We use the `/common/oauth2/v2.0/token` endpoint when
// TEAMS_TENANT_ID is unset or 'common', else the tenant-specific endpoint
// so single-tenant customers can lock signins down.
//
// The Slack file is the sibling pattern. Differences vs Slack:
//   - Microsoft requires `grant_type=authorization_code` in the body
//   - Microsoft returns `expires_in` seconds (Slack often omits)
//   - Microsoft returns `id_token` for OIDC profile data; we discard it
//   - The bot-framework messaging path uses the SAME app id + secret as
//     OAuth (TEAMS_BOT_PASSWORD === TEAMS_CLIENT_SECRET per SPEC § 2.2 F)
//
// We intentionally keep the bot framework `client_credentials` flow (used
// to acquire a service-principal token for outbound bot messages, no user
// in the loop) in a separate helper `acquireBotAppToken` so the OAuth
// path stays narrow and easy to audit.

import { publicUrl } from '@/lib/public-url';

const TEAMS_AUTHORITY_BASE = 'https://login.microsoftonline.com';

export interface TeamsTokenResponse {
  token_type: string;
  scope?: string;
  expires_in: number;
  ext_expires_in?: number;
  access_token: string;
  refresh_token?: string;
  id_token?: string;
}

export interface TeamsExchangeResult {
  access_token: string;
  refresh_token: string | null;
  expires_at: Date | null;
  scope: string;
  /** For SPEC § 5.1 multi-tenant: prefer the tenant guid extracted from
   *  the issued id_token's tid claim if present; fall back to env. */
  account_external_id: string | null;
  /** Best-effort display name. We don't call /me here to avoid extra round
   *  trips during the redirect window; the bot's first DM resolves names. */
  account_name: string | null;
}

export function callbackUrl(): string {
  return `${publicUrl()}/api/connectors/teams/callback`;
}

function tokenUrl(): string {
  const tenant = process.env.TEAMS_TENANT_ID || 'common';
  return `${TEAMS_AUTHORITY_BASE}/${tenant}/oauth2/v2.0/token`;
}

/**
 * Exchange a Microsoft auth code for access + refresh tokens.
 *
 * Throws on transport failure or non-2xx provider response. The route
 * handler maps the throw into a connector_audit_log row and a redirect
 * back to the connectors settings UI.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<TeamsExchangeResult> {
  const clientId = process.env.TEAMS_APP_ID;
  const clientSecret = process.env.TEAMS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('TEAMS_APP_ID and TEAMS_CLIENT_SECRET must be set in env');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as TeamsTokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    const detail = json.error_description ?? json.error ?? `status=${res.status}`;
    throw new Error(`teams oauth exchange failed: ${detail}`);
  }

  const tenantFromIdToken = decodeIdTokenTid(json.id_token);
  const tenant = tenantFromIdToken ?? process.env.TEAMS_TENANT_ID ?? null;

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? null,
    expires_at: typeof json.expires_in === 'number'
      ? new Date(Date.now() + json.expires_in * 1000)
      : null,
    scope: json.scope ?? '',
    account_external_id: tenant && tenant !== 'common' ? tenant : null,
    account_name: tenant && tenant !== 'common' ? `tenant:${tenant.slice(0, 8)}` : null,
  };
}

/**
 * Refresh an expired access token using the refresh token grant. Used by
 * the connector token-refresh cron and on-demand by the dispatcher when
 * it sees an expired token before a send.
 */
export async function refreshToken(refresh: string): Promise<TeamsExchangeResult> {
  const clientId = process.env.TEAMS_APP_ID;
  const clientSecret = process.env.TEAMS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('TEAMS_APP_ID and TEAMS_CLIENT_SECRET must be set in env');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refresh,
    grant_type: 'refresh_token',
  });

  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as TeamsTokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    const detail = json.error_description ?? json.error ?? `status=${res.status}`;
    throw new Error(`teams oauth refresh failed: ${detail}`);
  }

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? refresh, // Microsoft sometimes recycles
    expires_at: typeof json.expires_in === 'number'
      ? new Date(Date.now() + json.expires_in * 1000)
      : null,
    scope: json.scope ?? '',
    account_external_id: null,
    account_name: null,
  };
}

/**
 * Bot Framework `client_credentials` token. Used to authenticate
 * outbound `chat.postMessage`-equivalent calls when the bot acts on its
 * own (no user delegation), per SPEC § 2.2 Step F (TEAMS_BOT_ID +
 * TEAMS_BOT_PASSWORD).
 *
 * Microsoft Bot Framework requires the resource scope
 * `https://api.botframework.com/.default`.
 */
export interface BotAppToken {
  access_token: string;
  expires_at: Date;
}

export async function acquireBotAppToken(): Promise<BotAppToken> {
  const botId = process.env.TEAMS_BOT_ID || process.env.TEAMS_APP_ID;
  const botPassword = process.env.TEAMS_BOT_PASSWORD || process.env.TEAMS_CLIENT_SECRET;
  if (!botId || !botPassword) {
    throw new Error('TEAMS_BOT_ID/TEAMS_BOT_PASSWORD (or TEAMS_APP_ID/TEAMS_CLIENT_SECRET) must be set');
  }
  // Bot Framework always uses the multi-tenant /botframework.com authority.
  const url = `${TEAMS_AUTHORITY_BASE}/botframework.com/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: botId,
    client_secret: botPassword,
    grant_type: 'client_credentials',
    scope: 'https://api.botframework.com/.default',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as TeamsTokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    const detail = json.error_description ?? json.error ?? `status=${res.status}`;
    throw new Error(`teams bot app token failed: ${detail}`);
  }
  return {
    access_token: json.access_token,
    expires_at: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
  };
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

/** Best-effort tenant guid extraction from a Microsoft id_token. We do
 *  NOT verify the JWT here — this is a hint for setting account_external_id,
 *  not a security boundary. The state-token validation already gates entry. */
export function decodeIdTokenTid(idToken: string | undefined | null): string | null {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1];
    const pad = payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4));
    const std = payload.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const decoded = Buffer.from(std, 'base64').toString('utf8');
    const obj = JSON.parse(decoded) as { tid?: string };
    if (typeof obj.tid === 'string' && obj.tid.length > 0) return obj.tid;
  } catch {
    // best-effort
  }
  return null;
}
