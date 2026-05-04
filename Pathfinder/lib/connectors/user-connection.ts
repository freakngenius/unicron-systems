// lib/connectors/user-connection.ts — per-user OAuth grant storage.
//
// SPEC - HubSpot Bridge.md §Schema. One row per (user_id, provider) per
// portal. Tokens encrypted via the same pgcrypto helpers (migration 0105)
// the org-level connector_tokens table uses, so CONNECTOR_TOKEN_KEY is
// the single secret rotation surface.
//
// Multi-tenant isolation invariant: every read filters by user_id +
// provider + status='active'. The Gate 10B audit's user-isolation test
// asserts user A's row is never returned when querying user B.
//
// Token plaintext NEVER leaves the DB envelope. Errors carry user_id
// (an email today) but never the token value or its prefix.

import { supabaseAdmin } from '@/lib/supabase';
import { refreshToken as refreshHubspotToken } from '@/lib/connectors/hubspot/oauth';

/** Refresh-when-expiring buffer: refresh proactively if the token has
 *  less than this many seconds of life left, so the call we're about to
 *  make doesn't 401 mid-flight when expiry crosses during the request. */
const TOKEN_REFRESH_BUFFER_SECONDS = 60;

/** Test seam: lets the refresh-path tests inject a stub without
 *  network calls. Production paths leave this null and use the real
 *  HubSpot refresh function. */
let refreshTokenOverride:
  | ((refresh: string) => Promise<{ access_token: string; refresh_token: string; expires_in: number }>)
  | null = null;

export function __setHubspotRefreshTokenOverrideForTests(
  fn:
    | ((refresh: string) => Promise<{ access_token: string; refresh_token: string; expires_in: number }>)
    | null,
): void {
  refreshTokenOverride = fn;
}

export type UserConnectionProvider = 'gmail' | 'outlook' | 'hubspot' | 'teams';
export type UserConnectionStatus = 'active' | 'expired' | 'revoked';

export interface UserConnection {
  id: string;
  user_id: string;
  provider: UserConnectionProvider;
  email: string | null;
  portal_id: string | null;
  portal_name: string | null;
  /** Azure AD tenant guid for Teams rows. Null for non-Teams providers. */
  tenant_id: string | null;
  scope: string[] | null;
  connected_at: string;
  expires_at: string | null;
  status: UserConnectionStatus;
}

export interface UpsertHubspotConnectionInput {
  user_id: string;
  email: string | null;
  portal_id: string;
  portal_name: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: Date | null;
  scope: string[];
}

export interface UpsertTeamsConnectionInput {
  user_id: string;
  email: string | null;
  /** Azure AD tenant guid extracted from the id_token's `tid` claim. The
   *  multi-tenant isolation boundary: every Teams query filters by
   *  (user_id, provider='teams', tenant_id) so user A's tenant data is
   *  never returned for user B. */
  tenant_id: string;
  /** Best-effort display name (e.g., "tenant:abcd1234" or upn-derived). */
  tenant_name: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: Date | null;
  scope: string[];
}

interface RpcSupabase {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => unknown;
}

function getKey(): string {
  const key = process.env.CONNECTOR_TOKEN_KEY;
  if (!key || key.length < 32) {
    throw new Error(
      'CONNECTOR_TOKEN_KEY is missing or too short (expected 32+ hex chars).',
    );
  }
  return key;
}

function admin(): RpcSupabase {
  return supabaseAdmin() as unknown as RpcSupabase;
}

async function encryptViaPg(plaintext: string): Promise<string> {
  const sb = admin();
  const res = await sb.rpc('encrypt_connector_token', {
    plaintext,
    encryption_key: getKey(),
  });
  if (res.error) throw new Error(`encrypt_connector_token failed: ${res.error.message}`);
  if (typeof res.data !== 'string') {
    throw new Error('encrypt_connector_token returned non-string ciphertext');
  }
  return res.data;
}

async function decryptViaPg(ciphertext: unknown): Promise<string> {
  const sb = admin();
  const res = await sb.rpc('decrypt_connector_token', {
    ciphertext,
    encryption_key: getKey(),
  });
  if (res.error) throw new Error(`decrypt_connector_token failed: ${res.error.message}`);
  if (typeof res.data !== 'string') {
    throw new Error('decrypt_connector_token returned non-string plaintext');
  }
  return res.data;
}

interface UserConnectionRow {
  id: string;
  user_id: string;
  provider: UserConnectionProvider;
  email: string | null;
  portal_id: string | null;
  portal_name: string | null;
  tenant_id: string | null;
  oauth_token_enc: unknown;
  oauth_refresh_token_enc: unknown;
  scope: string[] | null;
  connected_at: string;
  expires_at: string | null;
  status: UserConnectionStatus;
}

function rowToConnection(row: UserConnectionRow): UserConnection {
  return {
    id: row.id,
    user_id: row.user_id,
    provider: row.provider,
    email: row.email,
    portal_id: row.portal_id,
    portal_name: row.portal_name,
    tenant_id: row.tenant_id ?? null,
    scope: row.scope,
    connected_at: row.connected_at,
    expires_at: row.expires_at,
    status: row.status,
  };
}

/** Column list shared by all SELECTs against user_connections. Including
 *  tenant_id so Teams rows hydrate completely; harmless for other providers
 *  where the column is null. */
const USER_CONNECTION_COLS =
  'id, user_id, provider, email, portal_id, portal_name, tenant_id, oauth_token_enc, oauth_refresh_token_enc, scope, connected_at, expires_at, status';

/**
 * Look up the active HubSpot connection for the given user. Returns null
 * when no active row exists. Multi-tenant boundary: filters on
 * (user_id, provider='hubspot', status='active').
 */
export async function getActiveHubspotConnection(
  userId: string,
): Promise<UserConnection | null> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          eq: (
            col: string,
            v: string,
          ) => {
            eq: (
              col: string,
              v: string,
            ) => {
              order: (
                col: string,
                opts: { ascending: boolean },
              ) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{
                    data: UserConnectionRow | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          };
        };
      };
    };
  };
  const res = await sb
    .from('user_connections')
    .select(
      'id, user_id, provider, email, portal_id, portal_name, oauth_token_enc, oauth_refresh_token_enc, scope, connected_at, expires_at, status',
    )
    .eq('user_id', userId)
    .eq('provider', 'hubspot')
    .eq('status', 'active')
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) {
    throw new Error(`getActiveHubspotConnection failed for user ${userId}: ${res.error.message}`);
  }
  if (!res.data) return null;
  return rowToConnection(res.data);
}

/**
 * Decrypt the access + refresh tokens for an active HubSpot connection.
 * Used by API routes that call HubSpot on behalf of the user. Returns
 * null when no active connection exists.
 */
export async function getHubspotConnectionTokens(
  userId: string,
): Promise<{ connection: UserConnection; access: string; refresh: string | null } | null> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          eq: (
            col: string,
            v: string,
          ) => {
            eq: (
              col: string,
              v: string,
            ) => {
              order: (
                col: string,
                opts: { ascending: boolean },
              ) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{
                    data: UserConnectionRow | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          };
        };
      };
    };
  };
  const res = await sb
    .from('user_connections')
    .select(
      'id, user_id, provider, email, portal_id, portal_name, oauth_token_enc, oauth_refresh_token_enc, scope, connected_at, expires_at, status',
    )
    .eq('user_id', userId)
    .eq('provider', 'hubspot')
    .eq('status', 'active')
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) {
    throw new Error(`getHubspotConnectionTokens failed for user ${userId}: ${res.error.message}`);
  }
  if (!res.data) return null;
  if (!res.data.oauth_token_enc) {
    throw new Error(`user_connection ${res.data.id} has no oauth_token_enc`);
  }
  let access = await decryptViaPg(res.data.oauth_token_enc);
  let refresh = res.data.oauth_refresh_token_enc
    ? await decryptViaPg(res.data.oauth_refresh_token_enc)
    : null;
  let connection = rowToConnection(res.data);

  // Token-refresh gate: HubSpot access tokens expire after ~30 minutes.
  // If the stored token is past (or near) expiry, swap it for a fresh
  // one before returning. The caller should not have to know about
  // expiry — every code path that gets a token from this function gets
  // a usable token. Refresh failures surface as a clear error so the
  // route can prompt the user to reconnect rather than 401-storming
  // HubSpot on every push.
  if (refresh && tokenIsExpiring(connection.expires_at)) {
    try {
      const refreshFn = refreshTokenOverride ?? refreshHubspotToken;
      const refreshed = await refreshFn(refresh);
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
      await rotateHubspotConnectionTokens({
        connectionId: connection.id,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: newExpiresAt,
      });
      access = refreshed.access_token;
      refresh = refreshed.refresh_token;
      connection = { ...connection, expires_at: newExpiresAt.toISOString() };
    } catch (err) {
      // Refresh failed (refresh token revoked, HubSpot 4xx, etc.). The
      // user has to reconnect. Mark the local row revoked so subsequent
      // calls fall through to "no_connection" rather than retrying a
      // doomed refresh on every push.
      try {
        await markHubspotConnectionRevoked(userId, connection.portal_id ?? undefined);
      } catch {
        // best-effort
      }
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `hubspot token refresh failed for user ${userId}: ${detail.slice(0, 240)} — user must reconnect`,
      );
    }
  }

  return { connection, access, refresh };
}

/** True when `expires_at` is in the past or within TOKEN_REFRESH_BUFFER_SECONDS of now. */
function tokenIsExpiring(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const expiryMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiryMs)) return false;
  return expiryMs - Date.now() < TOKEN_REFRESH_BUFFER_SECONDS * 1000;
}

/** Update the encrypted access + refresh tokens + expires_at on an
 *  existing user_connections row. Used by the token-refresh path so we
 *  rotate in place (preserving connected_at + scope + portal metadata)
 *  rather than insert a new row. */
export async function rotateHubspotConnectionTokens(input: {
  connectionId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}): Promise<void> {
  const access_enc = await encryptViaPg(input.accessToken);
  const refresh_enc = await encryptViaPg(input.refreshToken);
  const sb = admin() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const res = await sb
    .from('user_connections')
    .update({
      oauth_token_enc: access_enc,
      oauth_refresh_token_enc: refresh_enc,
      expires_at: input.expiresAt.toISOString(),
      status: 'active',
    })
    .eq('id', input.connectionId);
  if (res.error) {
    throw new Error(
      `rotateHubspotConnectionTokens failed for connection ${input.connectionId}: ${res.error.message}`,
    );
  }
}

/**
 * Insert (or replace) the active HubSpot connection for a user+portal.
 * Existing rows for the same (user_id, provider='hubspot', portal_id)
 * are marked status='revoked' so the partial-active uniqueness invariant
 * holds without a hard unique constraint (which would block re-connects
 * after a revoke).
 */
export async function upsertHubspotConnection(
  input: UpsertHubspotConnectionInput,
): Promise<UserConnection> {
  const access_enc = await encryptViaPg(input.access_token);
  const refresh_enc = input.refresh_token ? await encryptViaPg(input.refresh_token) : null;

  // Soft-revoke any existing active row for (user, provider, portal).
  const sbUpdate = admin() as unknown as {
    from: (t: string) => {
      update: (v: { status: UserConnectionStatus }) => {
        eq: (
          col: string,
          v: string,
        ) => {
          eq: (
            col: string,
            v: string,
          ) => {
            eq: (
              col: string,
              v: string,
            ) => {
              eq: (
                col: string,
                v: string,
              ) => Promise<{ error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };
  await sbUpdate
    .from('user_connections')
    .update({ status: 'revoked' as UserConnectionStatus })
    .eq('user_id', input.user_id)
    .eq('provider', 'hubspot')
    .eq('portal_id', input.portal_id)
    .eq('status', 'active');

  // Insert the fresh row.
  const sbInsert = admin() as unknown as {
    from: (t: string) => {
      insert: (rows: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: UserConnectionRow | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const res = await sbInsert
    .from('user_connections')
    .insert({
      user_id: input.user_id,
      provider: 'hubspot',
      email: input.email,
      portal_id: input.portal_id,
      portal_name: input.portal_name,
      oauth_token_enc: access_enc,
      oauth_refresh_token_enc: refresh_enc,
      scope: input.scope,
      expires_at: input.expires_at ? input.expires_at.toISOString() : null,
      status: 'active',
    })
    .select(
      'id, user_id, provider, email, portal_id, portal_name, oauth_token_enc, oauth_refresh_token_enc, scope, connected_at, expires_at, status',
    )
    .single();
  if (res.error || !res.data) {
    throw new Error(
      `upsertHubspotConnection failed for user ${input.user_id}: ${res.error?.message ?? 'no row returned'}`,
    );
  }
  return rowToConnection(res.data);
}

/**
 * Mark the active HubSpot connection for a user as revoked. Idempotent —
 * safe to call when no active row exists.
 */
export async function markHubspotConnectionRevoked(
  userId: string,
  portalId?: string,
): Promise<void> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      update: (v: { status: UserConnectionStatus }) => {
        eq: (col: string, v: string) => unknown;
      };
    };
  };
  // Build a query chain via casts (Supabase's typed query builder is
  // narrow; we go through unknown to keep the types tight at the edge).
  type Chain = {
    eq: (col: string, v: string) => Chain;
    then: <T>(onfulfilled: (v: { error: { message: string } | null }) => T) => Promise<T>;
  };
  let q = sb
    .from('user_connections')
    .update({ status: 'revoked' as UserConnectionStatus })
    .eq('user_id', userId) as unknown as Chain;
  q = q.eq('provider', 'hubspot');
  q = q.eq('status', 'active');
  if (portalId) q = q.eq('portal_id', portalId);
  const res = await Promise.resolve(q);
  if (res.error) {
    throw new Error(`markHubspotConnectionRevoked failed for user ${userId}: ${res.error.message}`);
  }
}

/**
 * Best-effort revoke at HubSpot's OAuth API. Returns true on 2xx, false
 * otherwise. Caller should still mark the local row revoked regardless
 * of the return value — local truth is what we control.
 */
export async function revokeHubspotRefreshTokenAtProvider(refresh: string): Promise<boolean> {
  const url = `https://api.hubapi.com/oauth/v1/refresh-tokens/${encodeURIComponent(refresh)}`;
  try {
    const res = await fetch(url, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Microsoft Teams (user-level) — Gate 14A
//
// Mirrors the HubSpot helpers above. The multi-tenant invariant for Teams is
// (user_id, provider='teams', tenant_id, status='active') — including
// tenant_id in the filter chain so user A's tenant data never returns when
// querying user B (even if both happen to be on the same Azure tenant the
// row-by-user_id filter still enforces isolation; tenant_id is the second
// dimension Microsoft Graph routing keys on).
// ============================================================================

/**
 * Look up the active Teams connection for the given user. Returns null
 * when no active row exists. Multi-tenant boundary: filters on
 * (user_id, provider='teams', status='active'). Caller may pass tenantId
 * when they want to disambiguate between multiple tenants the same user
 * has connected (rare today; the schema permits it).
 */
export async function getActiveTeamsConnection(
  userId: string,
  tenantId?: string,
): Promise<UserConnection | null> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, v: string) => SelectChain<UserConnectionRow>;
      };
    };
  };
  let chain: SelectChain<UserConnectionRow> = sb
    .from('user_connections')
    .select(USER_CONNECTION_COLS)
    .eq('user_id', userId);
  chain = chain.eq('provider', 'teams');
  chain = chain.eq('status', 'active');
  if (tenantId) chain = chain.eq('tenant_id', tenantId);
  const res = await chain.order('connected_at', { ascending: false }).limit(1).maybeSingle();
  if (res.error) {
    throw new Error(`getActiveTeamsConnection failed for user ${userId}: ${res.error.message}`);
  }
  if (!res.data) return null;
  return rowToConnection(res.data);
}

/**
 * Decrypt access + refresh tokens for an active Teams connection. Used
 * by API routes that call Microsoft Graph on behalf of the user. Returns
 * null when no active connection exists.
 */
export async function getTeamsConnectionTokens(
  userId: string,
  tenantId?: string,
): Promise<{ connection: UserConnection; access: string; refresh: string | null } | null> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, v: string) => SelectChain<UserConnectionRow>;
      };
    };
  };
  let chain: SelectChain<UserConnectionRow> = sb
    .from('user_connections')
    .select(USER_CONNECTION_COLS)
    .eq('user_id', userId);
  chain = chain.eq('provider', 'teams');
  chain = chain.eq('status', 'active');
  if (tenantId) chain = chain.eq('tenant_id', tenantId);
  const res = await chain.order('connected_at', { ascending: false }).limit(1).maybeSingle();
  if (res.error) {
    throw new Error(`getTeamsConnectionTokens failed for user ${userId}: ${res.error.message}`);
  }
  if (!res.data) return null;
  if (!res.data.oauth_token_enc) {
    throw new Error(`user_connection ${res.data.id} has no oauth_token_enc`);
  }
  const access = await decryptViaPg(res.data.oauth_token_enc);
  const refresh = res.data.oauth_refresh_token_enc
    ? await decryptViaPg(res.data.oauth_refresh_token_enc)
    : null;
  return { connection: rowToConnection(res.data), access, refresh };
}

/**
 * Insert (or replace) the active Teams connection for a user+tenant.
 * Existing active rows for the same (user_id, provider='teams', tenant_id)
 * are marked status='revoked' so the partial-active uniqueness invariant
 * holds. Tokens are encrypted via pgcrypto before write.
 */
export async function upsertTeamsConnection(
  input: UpsertTeamsConnectionInput,
): Promise<UserConnection> {
  const access_enc = await encryptViaPg(input.access_token);
  const refresh_enc = input.refresh_token ? await encryptViaPg(input.refresh_token) : null;

  // Soft-revoke any existing active row for (user, provider, tenant).
  type UpdateChain = {
    eq: (col: string, v: string) => UpdateChain;
    then: <T>(onfulfilled: (v: { error: { message: string } | null }) => T) => Promise<T>;
  };
  const sbUpdate = admin() as unknown as {
    from: (t: string) => {
      update: (v: { status: UserConnectionStatus }) => UpdateChain;
    };
  };
  const updateChain = sbUpdate
    .from('user_connections')
    .update({ status: 'revoked' as UserConnectionStatus })
    .eq('user_id', input.user_id)
    .eq('provider', 'teams')
    .eq('tenant_id', input.tenant_id)
    .eq('status', 'active');
  await Promise.resolve(updateChain);

  // Insert the fresh row.
  const sbInsert = admin() as unknown as {
    from: (t: string) => {
      insert: (rows: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: UserConnectionRow | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const res = await sbInsert
    .from('user_connections')
    .insert({
      user_id: input.user_id,
      provider: 'teams',
      email: input.email,
      portal_id: null,
      portal_name: input.tenant_name,
      tenant_id: input.tenant_id,
      oauth_token_enc: access_enc,
      oauth_refresh_token_enc: refresh_enc,
      scope: input.scope,
      expires_at: input.expires_at ? input.expires_at.toISOString() : null,
      status: 'active',
    })
    .select(USER_CONNECTION_COLS)
    .single();
  if (res.error || !res.data) {
    throw new Error(
      `upsertTeamsConnection failed for user ${input.user_id}: ${res.error?.message ?? 'no row returned'}`,
    );
  }
  return rowToConnection(res.data);
}

/**
 * Mark the active Teams connection(s) for a user as revoked. Idempotent —
 * safe to call when no active row exists. Optionally scopes by tenant_id
 * when revoking a specific tenant grant; without it, every active Teams
 * row for the user is revoked.
 */
export async function markTeamsConnectionRevoked(
  userId: string,
  tenantId?: string,
): Promise<void> {
  const sb = admin() as unknown as {
    from: (t: string) => {
      update: (v: { status: UserConnectionStatus }) => {
        eq: (col: string, v: string) => unknown;
      };
    };
  };
  type Chain = {
    eq: (col: string, v: string) => Chain;
    then: <T>(onfulfilled: (v: { error: { message: string } | null }) => T) => Promise<T>;
  };
  let q = sb
    .from('user_connections')
    .update({ status: 'revoked' as UserConnectionStatus })
    .eq('user_id', userId) as unknown as Chain;
  q = q.eq('provider', 'teams');
  q = q.eq('status', 'active');
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const res = await Promise.resolve(q);
  if (res.error) {
    throw new Error(`markTeamsConnectionRevoked failed for user ${userId}: ${res.error.message}`);
  }
}

/**
 * Best-effort revoke at Microsoft Graph. Calls
 * `POST https://graph.microsoft.com/v1.0/me/revokeSignInSessions` with
 * the user's access token; Microsoft revokes the user's session and
 * issued refresh tokens for that app context. Returns true on 2xx,
 * false otherwise. Caller should still mark the local row revoked
 * regardless of the return value — local truth is what we control.
 */
export async function revokeTeamsTokenAtProvider(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/revokeSignInSessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Internal: shared select-chain shape (used by Teams helpers above; the
// HubSpot helpers above predate this and inline their own chain types —
// preserved intentionally to keep the diff small).
// ============================================================================
type SelectChain<Row> = {
  eq: (col: string, v: string) => SelectChain<Row>;
  order: (col: string, opts: { ascending: boolean }) => SelectChain<Row>;
  limit: (n: number) => SelectChain<Row>;
  maybeSingle: () => Promise<{
    data: Row | null;
    error: { message: string } | null;
  }>;
};
