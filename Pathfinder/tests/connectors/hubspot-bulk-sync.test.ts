// tests/connectors/hubspot-bulk-sync.test.ts — verifies previewSync returns
// plausible totals, runBulkSync paginates correctly, ON CONFLICT upserts hit
// the right table, and rate-limit (429) retry honors Retry-After.
//
// We use the bulk-sync's test seams (fetchImpl + supabaseImpl + tokenLoader
// + connectorLoader) so the test never touches the real network or DB.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));
vi.mock('@/lib/connectors/audit', () => ({
  recordAudit: vi.fn(async () => undefined),
}));
vi.mock('@/lib/connectors/tokens', () => ({
  getToken: vi.fn(async () => ({ access: 'unused' })),
}));
vi.mock('@/lib/connectors/queries', () => ({
  getConnectorById: vi.fn(async () => null),
}));

import { previewSync, runBulkSync } from '@/lib/connectors/hubspot/bulk-sync';

interface UpsertCall {
  table: string;
  rows: unknown[];
  onConflict: string;
}

/**
 * Tiny in-memory supabase impl that records every upsert. Tables are
 * keyed by primary key string so ON CONFLICT semantics are observable.
 */
function makeFakeSupabase() {
  const upserts: UpsertCall[] = [];
  const tables: Record<string, Map<string, unknown>> = {
    hubspot_deals_raw: new Map(),
    hubspot_contacts_raw: new Map(),
    hubspot_engagements_raw: new Map(),
    hubspot_sync_state: new Map(),
  };
  const impl = () => ({
    from: (t: string) => ({
      upsert: async (rows: unknown, opts: { onConflict: string }) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        upserts.push({ table: t, rows: arr, onConflict: opts.onConflict });
        const bag = tables[t];
        if (bag) {
          for (const r of arr) {
            const row = r as Record<string, unknown>;
            const key = opts.onConflict
              .split(',')
              .map((c) => String(row[c.trim()]))
              .join('|');
            bag.set(key, row);
          }
        }
        return { error: null };
      },
    }),
  });
  return { impl, upserts, tables };
}

interface PageDef {
  results: Array<{ id: string; properties?: Record<string, unknown> }>;
  next?: string;
  total?: number;
}

/**
 * Build a fetch stub that walks a per-object-type page sequence. When a
 * `paging.next.after` is asked for, the next page in the sequence is
 * returned. Optionally injects a 429 on the Nth call to test back-off.
 */
function makeFetchStub(opts: {
  deals: PageDef[];
  contacts: PageDef[];
  engagements?: PageDef[];
  inject429OnCall?: number;
}) {
  let callIndex = 0;
  const dealsRemaining = [...opts.deals];
  const contactsRemaining = [...opts.contacts];
  const engRemaining = [...(opts.engagements ?? [])];
  const calls: Array<{ url: string; body: unknown }> = [];

  // @ts-expect-error stub
  const stub: typeof fetch = vi.fn(async (url: string, init?: RequestInit) => {
    callIndex += 1;
    const parsedBody = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body: parsedBody });

    if (opts.inject429OnCall === callIndex) {
      return {
        ok: false,
        status: 429,
        headers: { get: (h: string) => (h.toLowerCase() === 'retry-after' ? '0' : null) },
        json: async () => ({ error: 'rate_limited' }),
        text: async () => 'rate limited',
      } as unknown as Response;
    }

    let queue: PageDef[] = [];
    if (url.includes('/objects/deals')) queue = dealsRemaining;
    else if (url.includes('/objects/contacts')) queue = contactsRemaining;
    else if (url.includes('/objects/engagements')) queue = engRemaining;

    const page = queue.shift() ?? { results: [] };
    const json: Record<string, unknown> = { results: page.results };
    if (page.next) json.paging = { next: { after: page.next } };
    if (typeof page.total === 'number') json.total = page.total;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => json,
      text: async () => JSON.stringify(json),
    } as unknown as Response;
  });

  return { stub, calls };
}

beforeEach(() => {
  process.env.HUBSPOT_CLIENT_ID = 'cid';
  process.env.HUBSPOT_CLIENT_SECRET = 'csec';
});

afterEach(() => {
  delete process.env.HUBSPOT_CLIENT_ID;
  delete process.env.HUBSPOT_CLIENT_SECRET;
  vi.clearAllMocks();
});

describe('previewSync', () => {
  it('returns total counts from /search?limit=1 without writing rows', async () => {
    const { stub } = makeFetchStub({
      deals: [{ results: [{ id: '1' }], total: 42 }],
      contacts: [{ results: [{ id: '1' }], total: 137 }],
    });
    const fakeSb = makeFakeSupabase();
    const counts = await previewSync('connector-1', {
      fetchImpl: stub,
      supabaseImpl: fakeSb.impl,
      tokenLoader: async () => ({ access: 'tok' }),
    });
    expect(counts.deals).toBe(42);
    expect(counts.contacts).toBe(137);
    expect(counts.engagements).toBe(0);
    // No writes — preview is read-only.
    expect(fakeSb.upserts.length).toBe(0);
  });

  it('honors includeEngagements when the scope is granted', async () => {
    const { stub } = makeFetchStub({
      deals: [{ results: [], total: 0 }],
      contacts: [{ results: [], total: 0 }],
      engagements: [{ results: [], total: 9 }],
    });
    const counts = await previewSync('connector-1', {
      fetchImpl: stub,
      tokenLoader: async () => ({ access: 'tok' }),
      includeEngagements: true,
    });
    expect(counts.engagements).toBe(9);
  });

  it('throws when no active token exists', async () => {
    const { stub } = makeFetchStub({ deals: [], contacts: [] });
    await expect(
      previewSync('connector-1', {
        fetchImpl: stub,
        tokenLoader: async () => null,
      }),
    ).rejects.toThrow(/no active token/);
  });
});

describe('runBulkSync', () => {
  const connectorRow = { id: 'conn-1', customer_org_id: 'zedcor' };

  it('paginates deals via paging.next.after and stops cleanly', async () => {
    const { stub, calls } = makeFetchStub({
      deals: [
        {
          results: [
            { id: 'D1', properties: { dealname: 'A', amount: '100' } },
            { id: 'D2', properties: { dealname: 'B', amount: '200' } },
          ],
          next: 'cursor-1',
        },
        {
          results: [{ id: 'D3', properties: { dealname: 'C', amount: '300' } }],
          // no next → end
        },
      ],
      contacts: [{ results: [] }],
    });
    const fakeSb = makeFakeSupabase();
    const result = await runBulkSync('conn-1', {
      fetchImpl: stub,
      supabaseImpl: fakeSb.impl,
      tokenLoader: async () => ({ access: 'tok' }),
      connectorLoader: async () => connectorRow,
      minIntervalMs: 0,
    });
    expect(result.deals_imported).toBe(3);
    expect(result.contacts_imported).toBe(0);
    // Two deal-search calls + one contacts-search call.
    expect(calls.filter((c) => c.url.includes('/objects/deals')).length).toBe(2);
    // Verify the second deals call carried the cursor.
    const secondDealsCall = calls.filter((c) => c.url.includes('/objects/deals'))[1];
    expect((secondDealsCall.body as Record<string, unknown>).after).toBe('cursor-1');
  });

  it('ON CONFLICT upserts use (connector_id, hs_object_id)', async () => {
    const { stub } = makeFetchStub({
      deals: [
        {
          results: [{ id: 'D1', properties: { dealname: 'A' } }],
        },
      ],
      contacts: [{ results: [] }],
    });
    const fakeSb = makeFakeSupabase();
    await runBulkSync('conn-1', {
      fetchImpl: stub,
      supabaseImpl: fakeSb.impl,
      tokenLoader: async () => ({ access: 'tok' }),
      connectorLoader: async () => connectorRow,
      minIntervalMs: 0,
    });
    const dealsUpsert = fakeSb.upserts.find((u) => u.table === 'hubspot_deals_raw');
    expect(dealsUpsert?.onConflict).toBe('connector_id,hs_object_id');
    // Re-running with the same id must overwrite, not duplicate.
    await runBulkSync('conn-1', {
      fetchImpl: makeFetchStub({
        deals: [{ results: [{ id: 'D1', properties: { dealname: 'A-updated' } }] }],
        contacts: [{ results: [] }],
      }).stub,
      supabaseImpl: fakeSb.impl,
      tokenLoader: async () => ({ access: 'tok' }),
      connectorLoader: async () => connectorRow,
      minIntervalMs: 0,
    });
    expect(fakeSb.tables.hubspot_deals_raw.size).toBe(1);
    const stored = fakeSb.tables.hubspot_deals_raw.get('conn-1|D1') as Record<string, unknown>;
    expect((stored.properties as Record<string, unknown>).dealname).toBe('A-updated');
  });

  it('writes hubspot_sync_state with running flags + final counts', async () => {
    const { stub } = makeFetchStub({
      deals: [{ results: [{ id: 'D1' }, { id: 'D2' }] }],
      contacts: [{ results: [{ id: 'C1' }] }],
    });
    const fakeSb = makeFakeSupabase();
    const result = await runBulkSync('conn-1', {
      fetchImpl: stub,
      supabaseImpl: fakeSb.impl,
      tokenLoader: async () => ({ access: 'tok' }),
      connectorLoader: async () => connectorRow,
      minIntervalMs: 0,
    });
    const stateUpserts = fakeSb.upserts.filter((u) => u.table === 'hubspot_sync_state');
    // first upsert sets sync_running=true, last upsert sets running=false.
    expect((stateUpserts[0].rows[0] as Record<string, unknown>).sync_running).toBe(true);
    const last = stateUpserts[stateUpserts.length - 1].rows[0] as Record<string, unknown>;
    expect(last.sync_running).toBe(false);
    expect(last.deals_imported).toBe(2);
    expect(last.contacts_imported).toBe(1);
    expect(result.deals_imported).toBe(2);
    expect(result.contacts_imported).toBe(1);
  });

  it('respects maxObjects and reports truncated=true', async () => {
    const { stub } = makeFetchStub({
      deals: [
        { results: Array.from({ length: 100 }, (_, i) => ({ id: `D${i}` })), next: 'cursor-1' },
        { results: Array.from({ length: 100 }, (_, i) => ({ id: `D${100 + i}` })) },
      ],
      contacts: [{ results: [] }],
    });
    const fakeSb = makeFakeSupabase();
    const result = await runBulkSync('conn-1', {
      fetchImpl: stub,
      supabaseImpl: fakeSb.impl,
      tokenLoader: async () => ({ access: 'tok' }),
      connectorLoader: async () => connectorRow,
      maxObjects: 100,
      minIntervalMs: 0,
    });
    expect(result.deals_imported).toBe(100);
    expect(result.truncated).toBe(true);
  });

  it('retries once on 429 by honoring Retry-After', async () => {
    const { stub, calls } = makeFetchStub({
      deals: [{ results: [{ id: 'D1' }] }],
      contacts: [{ results: [] }],
      inject429OnCall: 1,
    });
    const fakeSb = makeFakeSupabase();
    const result = await runBulkSync('conn-1', {
      fetchImpl: stub,
      supabaseImpl: fakeSb.impl,
      tokenLoader: async () => ({ access: 'tok' }),
      connectorLoader: async () => connectorRow,
      minIntervalMs: 0,
    });
    // The 429 was on call 1; the retry on call 2 ran the deals page.
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(result.deals_imported).toBe(1);
  });

  it('throws when the connector cannot be found', async () => {
    const { stub } = makeFetchStub({ deals: [], contacts: [] });
    await expect(
      runBulkSync('conn-missing', {
        fetchImpl: stub,
        supabaseImpl: makeFakeSupabase().impl,
        tokenLoader: async () => ({ access: 'tok' }),
        connectorLoader: async () => null,
        minIntervalMs: 0,
      }),
    ).rejects.toThrow(/not found/);
  });

  it('records last_error in sync_state when a search call fails permanently', async () => {
    // @ts-expect-error stub
    const stub: typeof fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      headers: { get: () => null },
      json: async () => ({ error: 'boom' }),
      text: async () => 'boom',
    }));
    const fakeSb = makeFakeSupabase();
    await expect(
      runBulkSync('conn-1', {
        fetchImpl: stub,
        supabaseImpl: fakeSb.impl,
        tokenLoader: async () => ({ access: 'tok' }),
        connectorLoader: async () => connectorRow,
        minIntervalMs: 0,
      }),
    ).rejects.toThrow();
    const stateUpserts = fakeSb.upserts.filter((u) => u.table === 'hubspot_sync_state');
    const last = stateUpserts[stateUpserts.length - 1].rows[0] as Record<string, unknown>;
    expect(last.sync_running).toBe(false);
    expect(typeof last.last_error).toBe('string');
  });
});
