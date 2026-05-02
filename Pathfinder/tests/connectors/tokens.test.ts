// tests/connectors/tokens.test.ts — encrypted token storage.
//
// We can't unit-test against a real Postgres in CI, so we mock the
// supabaseAdmin module to verify the storeToken/getToken/rotateToken
// contract:
//   - storeToken calls rpc('encrypt_connector_token') for access AND
//     refresh tokens, then inserts the ciphertext into connector_tokens
//   - getToken reads the active row (revoked_at is null), decrypts both
//     tokens via rpc('decrypt_connector_token'), returns plaintext
//   - rotateToken marks the prior active row revoked, then writes a new
//     active row
//
// The encrypt/decrypt RPC bodies are simulated with a trivial reversible
// transform (`__ct__` prefix) so we can verify roundtrip without
// pulling pgcrypto into Node. The real DB-side encryption is exercised
// by the apply_migration smoke check at deploy time.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the supabase module BEFORE importing tokens.ts.
vi.mock('@/lib/supabase', () => {
  return {
    supabaseAdmin: () => fakeAdmin,
    supabase: {},
    __resetSupabaseForTests: () => {
      /* no-op for this suite */
    },
  };
});

interface InsertedRow {
  connector_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
  scope: string | null;
}

interface RowState {
  id: string;
  connector_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
  scope: string | null;
  revoked_at: string | null;
}

const inserted: InsertedRow[] = [];
const rows: RowState[] = [];
const updates: { connector_id: string; revoked_at: string }[] = [];
let rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

const fakeAdmin = {
  rpc: async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    if (fn === 'encrypt_connector_token') {
      return { data: `__ct__${args.plaintext as string}`, error: null };
    }
    if (fn === 'decrypt_connector_token') {
      const ct = args.ciphertext as string;
      if (typeof ct !== 'string' || !ct.startsWith('__ct__')) {
        return { data: null, error: { message: 'fake decrypt: bad ciphertext' } };
      }
      return { data: ct.slice('__ct__'.length), error: null };
    }
    return { data: null, error: { message: `unmocked rpc ${fn}` } };
  },
  from: (table: string) => {
    if (table !== 'connector_tokens') {
      throw new Error(`unmocked table ${table}`);
    }
    return {
      insert: async (row: InsertedRow) => {
        inserted.push(row);
        rows.push({ id: `tok-${rows.length + 1}`, ...row, revoked_at: null });
        return { error: null };
      },
      select: (_cols: string) => ({
        eq: (col: string, v: string) => ({
          is: (col2: string, v2: null) => ({
            maybeSingle: async () => {
              if (col !== 'connector_id' || col2 !== 'revoked_at' || v2 !== null) {
                return { data: null, error: { message: 'unexpected select shape' } };
              }
              const found = rows.find((r) => r.connector_id === v && r.revoked_at === null);
              return { data: found ?? null, error: null };
            },
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (col: string, v: string) => ({
          is: (col2: string, v2: null) => {
            if (col !== 'connector_id' || col2 !== 'revoked_at' || v2 !== null) {
              return Promise.resolve({ error: { message: 'unexpected update shape' } });
            }
            const target = rows.find((r) => r.connector_id === v && r.revoked_at === null);
            if (target) {
              target.revoked_at = (patch.revoked_at as string) ?? new Date().toISOString();
              updates.push({ connector_id: v, revoked_at: target.revoked_at });
            }
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };
  },
};

import { getToken, rotateToken, revokeToken, storeToken } from '../../lib/connectors/tokens';

describe('connector tokens', () => {
  beforeEach(() => {
    inserted.length = 0;
    rows.length = 0;
    updates.length = 0;
    rpcCalls = [];
    process.env.CONNECTOR_TOKEN_KEY = 'a'.repeat(64); // 32-byte hex
  });

  afterEach(() => {
    delete process.env.CONNECTOR_TOKEN_KEY;
  });

  it('storeToken encrypts both access and refresh, inserts ciphertext', async () => {
    await storeToken('cx-1', {
      access: 'xoxb-real-access-token',
      refresh: 'xoxe-1-real-refresh-token',
      expiresAt: new Date('2026-06-01T00:00:00Z'),
      scope: 'chat:write,channels:read',
    });
    expect(rpcCalls).toHaveLength(2);
    expect(rpcCalls[0].fn).toBe('encrypt_connector_token');
    expect(rpcCalls[1].fn).toBe('encrypt_connector_token');
    expect(inserted).toHaveLength(1);
    // The inserted ciphertext must NOT equal the plaintext; the
    // decrypt-prefix sentinel is the assertion.
    expect(inserted[0].access_token_encrypted).toBe('__ct__xoxb-real-access-token');
    expect(inserted[0].refresh_token_encrypted).toBe('__ct__xoxe-1-real-refresh-token');
    expect(inserted[0].expires_at).toBe('2026-06-01T00:00:00.000Z');
    expect(inserted[0].scope).toBe('chat:write,channels:read');
  });

  it('storeToken handles a missing refresh token (slack legacy)', async () => {
    await storeToken('cx-2', {
      access: 'xoxb-no-refresh',
      refresh: null,
      expiresAt: null,
      scope: null,
    });
    expect(inserted[0].refresh_token_encrypted).toBe(null);
    // Only one encrypt RPC call when refresh is null.
    expect(rpcCalls.filter((c) => c.fn === 'encrypt_connector_token')).toHaveLength(1);
  });

  it('getToken roundtrips: decrypts the active row to plaintext', async () => {
    await storeToken('cx-3', {
      access: 'xoxb-roundtrip',
      refresh: 'xoxe-roundtrip',
      expiresAt: new Date('2026-06-01T00:00:00Z'),
      scope: 'chat:write',
    });
    const out = await getToken('cx-3');
    expect(out).not.toBeNull();
    expect(out!.access).toBe('xoxb-roundtrip');
    expect(out!.refresh).toBe('xoxe-roundtrip');
    expect(out!.scope).toBe('chat:write');
    expect(out!.expiresAt).toBeInstanceOf(Date);
  });

  it('getToken returns null when no active row exists', async () => {
    const out = await getToken('cx-missing');
    expect(out).toBe(null);
  });

  it('rotateToken revokes the prior active row and inserts a new one', async () => {
    await storeToken('cx-4', {
      access: 'xoxb-old',
      refresh: 'xoxe-old',
      expiresAt: null,
      scope: null,
    });
    await rotateToken('cx-4', {
      access: 'xoxb-new',
      refresh: 'xoxe-new',
      expiresAt: new Date('2026-07-01T00:00:00Z'),
      scope: 'chat:write,channels:read',
    });
    expect(updates).toHaveLength(1);
    expect(updates[0].connector_id).toBe('cx-4');
    // After rotation, getToken returns the new plaintext.
    const out = await getToken('cx-4');
    expect(out!.access).toBe('xoxb-new');
    expect(out!.refresh).toBe('xoxe-new');
  });

  it('revokeToken marks the active row revoked without writing a new one', async () => {
    await storeToken('cx-5', {
      access: 'xoxb-bye',
      refresh: null,
      expiresAt: null,
      scope: null,
    });
    await revokeToken('cx-5');
    expect(updates).toHaveLength(1);
    const out = await getToken('cx-5');
    expect(out).toBe(null);
  });

  it('throws a clear error when CONNECTOR_TOKEN_KEY is missing', async () => {
    delete process.env.CONNECTOR_TOKEN_KEY;
    await expect(
      storeToken('cx-6', { access: 'x', refresh: null, expiresAt: null, scope: null }),
    ).rejects.toThrow(/CONNECTOR_TOKEN_KEY/);
  });
});
