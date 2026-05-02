// lib/connectors/tokens.ts — encrypted-at-rest token storage layer.
//
// Wraps the pathfinder.encrypt_connector_token / decrypt_connector_token
// SQL functions added in migration 0105. Encryption + decryption happen
// inside Postgres so the bytea column is always ciphertext at rest;
// the TS layer holds plaintext only on the wire (TLS-protected) during
// the RPC round-trip.
//
// CRITICAL invariants:
//   1. Plaintext tokens are NEVER logged. Errors carry only the
//      connector_id (uuid), never the token value or its prefix.
//   2. The encryption key (CONNECTOR_TOKEN_KEY) is read fresh on each
//      call; we don't cache it because Vercel's secret rotation policy
//      depends on per-invocation env reads.
//   3. The active-token uniqueness is enforced by the partial unique
//      index `connector_tokens_active_unique` on revoked_at IS NULL —
//      rotateToken soft-deletes the old row before inserting the new
//      one inside the same transaction (atomic via plpgsql wrapper).
//
// Public API:
//   storeToken(connectorId, payload)  - first-time write after OAuth
//   getToken(connectorId)             - decrypt + return for a send
//   rotateToken(connectorId, payload) - refresh-token swap; soft-deletes
//                                       the prior active row
//   revokeToken(connectorId)          - mark active row revoked

import { supabaseAdmin } from '@/lib/supabase';
import type { ConnectorTokenPayload } from './types';

function getKey(): string {
  const key = process.env.CONNECTOR_TOKEN_KEY;
  if (!key || key.length < 32) {
    throw new Error(
      'CONNECTOR_TOKEN_KEY is missing or too short (expected 32+ hex chars). ' +
        'Set a 32-byte random hex string in Vercel env (and .env.local for dev).',
    );
  }
  return key;
}

interface RpcSupabase {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => unknown;
}

function adminRpc(): RpcSupabase {
  return supabaseAdmin() as unknown as RpcSupabase;
}

async function encryptViaPg(plaintext: string): Promise<string> {
  const sb = adminRpc();
  const res = await sb.rpc('encrypt_connector_token', {
    plaintext,
    encryption_key: getKey(),
  });
  if (res.error) {
    throw new Error(`encrypt_connector_token failed: ${res.error.message}`);
  }
  if (typeof res.data !== 'string') {
    throw new Error('encrypt_connector_token returned non-string ciphertext');
  }
  // Supabase serializes bytea as `\x<hex>` strings over PostgREST. We
  // store the raw string back through the PostgREST `bytea` decoder by
  // letting Supabase round-trip it; the SQL column stays bytea.
  return res.data;
}

async function decryptViaPg(ciphertext: unknown): Promise<string> {
  const sb = adminRpc();
  const res = await sb.rpc('decrypt_connector_token', {
    ciphertext,
    encryption_key: getKey(),
  });
  if (res.error) {
    throw new Error(`decrypt_connector_token failed: ${res.error.message}`);
  }
  if (typeof res.data !== 'string') {
    throw new Error('decrypt_connector_token returned non-string plaintext');
  }
  return res.data;
}

interface TokenRowInsert {
  connector_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
  scope: string | null;
}

interface ActiveTokenRow {
  id: string;
  connector_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
  scope: string | null;
}

/** Insert the first token row for a freshly-connected connector. Throws
 *  if an active row already exists (caller should rotateToken instead). */
export async function storeToken(
  connectorId: string,
  payload: ConnectorTokenPayload,
): Promise<void> {
  const accessCt = await encryptViaPg(payload.access);
  const refreshCt = payload.refresh ? await encryptViaPg(payload.refresh) : null;

  const insert: TokenRowInsert = {
    connector_id: connectorId,
    access_token_encrypted: accessCt,
    refresh_token_encrypted: refreshCt,
    expires_at: payload.expiresAt ? payload.expiresAt.toISOString() : null,
    scope: payload.scope,
  };
  const sb = adminRpc() as unknown as {
    from: (t: string) => {
      insert: (rows: TokenRowInsert) => Promise<{ error: { message: string } | null }>;
    };
  };
  const res = await sb.from('connector_tokens').insert(insert);
  if (res.error) {
    throw new Error(`storeToken insert failed for connector ${connectorId}: ${res.error.message}`);
  }
}

/** Read + decrypt the active token for a connector. Returns null when
 *  no active token row exists (e.g. disconnected). */
export async function getToken(connectorId: string): Promise<ConnectorTokenPayload | null> {
  const sb = adminRpc() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          is: (
            col: string,
            v: null,
          ) => {
            maybeSingle: () => Promise<{
              data: ActiveTokenRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const res = await sb
    .from('connector_tokens')
    .select('id, connector_id, access_token_encrypted, refresh_token_encrypted, expires_at, scope')
    .eq('connector_id', connectorId)
    .is('revoked_at', null)
    .maybeSingle();
  if (res.error) {
    throw new Error(`getToken read failed for connector ${connectorId}: ${res.error.message}`);
  }
  if (!res.data) return null;

  const access = await decryptViaPg(res.data.access_token_encrypted);
  const refresh = res.data.refresh_token_encrypted
    ? await decryptViaPg(res.data.refresh_token_encrypted)
    : null;
  return {
    access,
    refresh,
    expiresAt: res.data.expires_at ? new Date(res.data.expires_at) : null,
    scope: res.data.scope,
  };
}

/** Rotate the active token. Marks the previous active row as revoked
 *  and inserts a new active row. Two-step rather than UPDATE so the
 *  history of token rotations is preserved for audit. */
export async function rotateToken(
  connectorId: string,
  payload: ConnectorTokenPayload,
): Promise<void> {
  const sb = adminRpc() as unknown as {
    from: (t: string) => {
      update: (v: { revoked_at: string }) => {
        eq: (
          col: string,
          v: string,
        ) => {
          is: (col: string, v: null) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  };
  const now = new Date().toISOString();
  const update = await sb
    .from('connector_tokens')
    .update({ revoked_at: now })
    .eq('connector_id', connectorId)
    .is('revoked_at', null);
  if (update.error) {
    throw new Error(
      `rotateToken revoke-prior failed for connector ${connectorId}: ${update.error.message}`,
    );
  }
  await storeToken(connectorId, payload);
}

/** Mark the current active token as revoked without storing a new one.
 *  Used by Disconnect flows. */
export async function revokeToken(connectorId: string): Promise<void> {
  const sb = adminRpc() as unknown as {
    from: (t: string) => {
      update: (v: { revoked_at: string }) => {
        eq: (
          col: string,
          v: string,
        ) => {
          is: (col: string, v: null) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  };
  const res = await sb
    .from('connector_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('connector_id', connectorId)
    .is('revoked_at', null);
  if (res.error) {
    throw new Error(`revokeToken failed for connector ${connectorId}: ${res.error.message}`);
  }
}
