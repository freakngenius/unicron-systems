// __tests__/api/searches-route.test.ts — ICP Search S1.
//
// Smoke-tests the POST /api/searches handler: validates input, looks up
// the Internal organization, inserts a saved_search + search_run, and
// emits the pathfinder/search.run.requested event. The supabase client
// and inngest client are mocked.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

interface InsertedRow {
  table: string;
  row: Record<string, unknown>;
}

const dbState = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  internalOrgId: 'org-internal' as string | null,
  savedSearchInsertResult: { id: 'ss-1' } as { id: string } | null,
  searchRunInsertResult: { id: 'sr-1', saved_search_id: 'ss-1' } as { id: string; saved_search_id: string } | null,
}));

const inngestSends = vi.hoisted(() => [] as Array<{ name: string; data: Record<string, unknown> }>);

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'organizations') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: async () =>
                dbState.internalOrgId
                  ? { data: { id: dbState.internalOrgId }, error: null }
                  : { data: null, error: null },
            }),
          }),
        };
      }
      if (table === 'saved_searches') {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: (_cols: string) => ({
              single: async () => {
                dbState.inserts.push({ table, row });
                return dbState.savedSearchInsertResult
                  ? { data: { ...dbState.savedSearchInsertResult, ...row }, error: null }
                  : { data: null, error: { message: 'insert failed' } };
              },
            }),
          }),
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'search_runs') {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: (_cols: string) => ({
              single: async () => {
                dbState.inserts.push({ table, row });
                return dbState.searchRunInsertResult
                  ? { data: { ...dbState.searchRunInsertResult, ...row }, error: null }
                  : { data: null, error: { message: 'insert failed' } };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: async (payload: { name: string; data: Record<string, unknown> }) => {
      inngestSends.push(payload);
      return {};
    },
  },
}));

import { POST } from '@/app/api/searches/route';

function makeRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

describe('POST /api/searches', () => {
  beforeEach(() => {
    dbState.inserts = [];
    dbState.internalOrgId = 'org-internal';
    dbState.savedSearchInsertResult = { id: 'ss-1' };
    dbState.searchRunInsertResult = { id: 'sr-1', saved_search_id: 'ss-1' };
    inngestSends.length = 0;
  });

  it('creates saved_search + search_run, returns 201 {id}, emits inngest event', async () => {
    const res = await POST(
      makeRequest({
        name: 'Houston GC schools',
        icp_text: 'general contractors building schools',
        region: 'Houston, TX',
        radius_mi: 50,
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe('ss-1');

    expect(dbState.inserts.map((i) => i.table)).toEqual(['saved_searches', 'search_runs']);
    expect(dbState.inserts[0].row.organization_id).toBe('org-internal');
    expect(dbState.inserts[0].row.status).toBe('planning');
    expect(dbState.inserts[0].row.radius_mi).toBe(50);
    expect(dbState.inserts[1].row.saved_search_id).toBe('ss-1');

    expect(inngestSends).toHaveLength(1);
    expect(inngestSends[0].name).toBe('pathfinder/search.run.requested');
    expect(inngestSends[0].data).toEqual({ search_run_id: 'sr-1', saved_search_id: 'ss-1' });
  });

  it('returns 400 on missing fields', async () => {
    const res = await POST(makeRequest({ name: 'x' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when Internal org is missing', async () => {
    dbState.internalOrgId = null;
    const res = await POST(
      makeRequest({
        name: 'x',
        icp_text: 'y',
        region: 'z',
        radius_mi: 10,
      }),
    );
    expect(res.status).toBe(404);
  });
});
