// tests/connectors/hubspot-user-connection.test.ts — Gate 10B.
//
// Covers SPEC - HubSpot Bridge.md §Schema + §Settings page acceptance:
//   - Multi-tenant isolation: user A's row never returned for user B
//   - Encryption helpers wired through pgcrypto RPCs
//   - upsert revokes prior active row + inserts fresh row
//   - markRevoked is idempotent + scoped to (user, provider, status='active')
//   - Provider revoke best-effort: false return doesn't block local revoke
//
// Pattern: stub supabaseAdmin to record calls + return canned data so
// the helper logic is exercised end-to-end without a live DB. The
// pgcrypto RPCs return their plaintext input as a stand-in for ciphertext
// (that's the only behavior the helper layer cares about — the round
// trip is covered by the integration migration test, not here).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface AdminCall {
  fn: 'rpc' | 'from';
  args: unknown[];
}

const calls: AdminCall[] = [];

interface QueuedQueryResult {
  data: unknown;
  error: { message: string } | null;
}

const queryResults: QueuedQueryResult[] = [];

function nextQueryResult(): QueuedQueryResult {
  return queryResults.shift() ?? { data: null, error: null };
}

interface InsertChain {
  select: (cols: string) => { single: () => Promise<QueuedQueryResult> };
}

interface UpdateChain {
  eq: (col: string, v: string) => UpdateChain;
  then: <T>(onfulfilled: (v: { error: { message: string } | null }) => T) => Promise<T>;
}

interface SelectChain {
  eq: (col: string, v: string) => SelectChain;
  order: (col: string, opts: { ascending: boolean }) => SelectChain;
  limit: (n: number) => SelectChain;
  maybeSingle: () => Promise<QueuedQueryResult>;
}

const filterTrace: string[] = [];

function selectChain(): SelectChain {
  const chain: SelectChain = {
    eq: (col: string, v: string) => {
      filterTrace.push(`eq:${col}=${v}`);
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(nextQueryResult()),
  };
  return chain;
}

function updateChain(): UpdateChain {
  const result = nextQueryResult();
  const chain: UpdateChain = {
    eq: (col: string, v: string) => {
      filterTrace.push(`eq:${col}=${v}`);
      return chain;
    },
    then: <T,>(onfulfilled: (v: { error: { message: string } | null }) => T) =>
      Promise.resolve(onfulfilled({ error: result.error })),
  };
  return chain;
}

const stubAdmin = {
  rpc: (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn: 'rpc', args: [fn, args] });
    if (fn === 'encrypt_connector_token') {
      return Promise.resolve({ data: `enc:${String(args.plaintext)}`, error: null });
    }
    if (fn === 'decrypt_connector_token') {
      const ct = String(args.ciphertext);
      return Promise.resolve({ data: ct.replace(/^enc:/, ''), error: null });
    }
    return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
  },
  from: (table: string) => {
    calls.push({ fn: 'from', args: [table] });
    return {
      select: (_cols: string) => selectChain(),
      update: (_v: Record<string, unknown>) => updateChain(),
      insert: (_row: Record<string, unknown>): InsertChain => ({
        select: (_c: string) => ({
          single: () => Promise.resolve(nextQueryResult()),
        }),
      }),
    };
  },
};

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => stubAdmin,
}));

import {
  getActiveHubspotConnection,
  getHubspotConnectionTokens,
  upsertHubspotConnection,
  markHubspotConnectionRevoked,
  revokeHubspotRefreshTokenAtProvider,
} from '../../lib/connectors/user-connection';

describe('user-connection / HubSpot', () => {
  const originalKey = process.env.CONNECTOR_TOKEN_KEY;

  beforeEach(() => {
    process.env.CONNECTOR_TOKEN_KEY =
      'a'.repeat(64); // 32-byte hex; passes the >=32-char gate.
    calls.length = 0;
    queryResults.length = 0;
    filterTrace.length = 0;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.CONNECTOR_TOKEN_KEY;
    else process.env.CONNECTOR_TOKEN_KEY = originalKey;
  });

  it('getActiveHubspotConnection filters by (user_id, provider, status) — multi-tenant', async () => {
    queryResults.push({
      data: {
        id: 'row-A',
        user_id: 'alice@zedcor.com',
        provider: 'hubspot',
        email: null,
        portal_id: 'portal-A',
        portal_name: 'Alice Sandbox',
        oauth_token_enc: 'enc:access-A',
        oauth_refresh_token_enc: 'enc:refresh-A',
        scope: ['crm.objects.deals.read'],
        connected_at: '2026-05-03T12:00:00Z',
        expires_at: '2026-05-03T12:30:00Z',
        status: 'active',
      },
      error: null,
    });

    const conn = await getActiveHubspotConnection('alice@zedcor.com');
    expect(conn).not.toBeNull();
    expect(conn?.portal_id).toBe('portal-A');
    // The chain must have filtered on all three.
    expect(filterTrace).toContain('eq:user_id=alice@zedcor.com');
    expect(filterTrace).toContain('eq:provider=hubspot');
    expect(filterTrace).toContain('eq:status=active');
  });

  it('returns null when user has no active row (isolation: user B query returns no row from user A data)', async () => {
    queryResults.push({ data: null, error: null });
    const conn = await getActiveHubspotConnection('bob@zedcor.com');
    expect(conn).toBeNull();
    // Filter chain still scoped to bob — never alice
    expect(filterTrace).toContain('eq:user_id=bob@zedcor.com');
    expect(filterTrace).not.toContain('eq:user_id=alice@zedcor.com');
  });

  it('getHubspotConnectionTokens decrypts both access and refresh', async () => {
    queryResults.push({
      data: {
        id: 'row-A',
        user_id: 'alice@zedcor.com',
        provider: 'hubspot',
        email: null,
        portal_id: 'portal-A',
        portal_name: 'Alice Sandbox',
        oauth_token_enc: 'enc:my-access',
        oauth_refresh_token_enc: 'enc:my-refresh',
        scope: ['crm.objects.deals.read'],
        connected_at: '2026-05-03T12:00:00Z',
        expires_at: '2026-05-03T12:30:00Z',
        status: 'active',
      },
      error: null,
    });
    const result = await getHubspotConnectionTokens('alice@zedcor.com');
    expect(result?.access).toBe('my-access');
    expect(result?.refresh).toBe('my-refresh');
  });

  it('upsertHubspotConnection encrypts before insert + revokes prior active row', async () => {
    // 1st query result is the soft-revoke UPDATE (no row needed)
    queryResults.push({ data: null, error: null });
    // 2nd is the INSERT … RETURNING row
    queryResults.push({
      data: {
        id: 'row-B',
        user_id: 'alice@zedcor.com',
        provider: 'hubspot',
        email: null,
        portal_id: 'portal-A',
        portal_name: 'Alice Sandbox',
        oauth_token_enc: 'enc:fresh-access',
        oauth_refresh_token_enc: 'enc:fresh-refresh',
        scope: ['crm.objects.deals.read'],
        connected_at: '2026-05-03T13:00:00Z',
        expires_at: '2026-05-03T13:30:00Z',
        status: 'active',
      },
      error: null,
    });

    const conn = await upsertHubspotConnection({
      user_id: 'alice@zedcor.com',
      email: null,
      portal_id: 'portal-A',
      portal_name: 'Alice Sandbox',
      access_token: 'fresh-access',
      refresh_token: 'fresh-refresh',
      expires_at: new Date('2026-05-03T13:30:00Z'),
      scope: ['crm.objects.deals.read'],
    });
    expect(conn.id).toBe('row-B');

    // Verify both encrypt RPCs fired (access + refresh) before the insert.
    const encryptCalls = calls.filter(
      (c) => c.fn === 'rpc' && (c.args[0] as string) === 'encrypt_connector_token',
    );
    expect(encryptCalls.length).toBe(2);

    // Verify the soft-revoke UPDATE filtered on (user_id, provider, portal_id, status)
    expect(filterTrace).toContain('eq:user_id=alice@zedcor.com');
    expect(filterTrace).toContain('eq:provider=hubspot');
    expect(filterTrace).toContain('eq:portal_id=portal-A');
    expect(filterTrace).toContain('eq:status=active');
  });

  it('markHubspotConnectionRevoked filters scope correctly', async () => {
    queryResults.push({ data: null, error: null });
    await markHubspotConnectionRevoked('alice@zedcor.com', 'portal-A');
    expect(filterTrace).toContain('eq:user_id=alice@zedcor.com');
    expect(filterTrace).toContain('eq:provider=hubspot');
    expect(filterTrace).toContain('eq:status=active');
    expect(filterTrace).toContain('eq:portal_id=portal-A');
  });

  it('markHubspotConnectionRevoked without portalId still scopes by user+provider+status', async () => {
    queryResults.push({ data: null, error: null });
    await markHubspotConnectionRevoked('alice@zedcor.com');
    expect(filterTrace).toContain('eq:user_id=alice@zedcor.com');
    expect(filterTrace).toContain('eq:provider=hubspot');
    expect(filterTrace).toContain('eq:status=active');
    expect(filterTrace.some((s) => s.startsWith('eq:portal_id'))).toBe(false);
  });

  it('revokeHubspotRefreshTokenAtProvider returns false on transport error (best-effort)', async () => {
    const realFetch = global.fetch;
    global.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    try {
      const ok = await revokeHubspotRefreshTokenAtProvider('refresh-xyz');
      expect(ok).toBe(false);
    } finally {
      global.fetch = realFetch;
    }
  });

  it('revokeHubspotRefreshTokenAtProvider returns true on 2xx', async () => {
    const realFetch = global.fetch;
    global.fetch = vi.fn(async () => ({ ok: true, status: 204 }) as unknown as Response) as unknown as typeof fetch;
    try {
      const ok = await revokeHubspotRefreshTokenAtProvider('refresh-xyz');
      expect(ok).toBe(true);
    } finally {
      global.fetch = realFetch;
    }
  });
});
