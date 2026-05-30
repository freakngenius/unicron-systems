// __tests__/catalog/modules/ranked-feed/data.test.ts, Stream B Dashboard.
//
// fetchRankedCompanies queries pathfinder.projects for the org, scopes to
// rows with a real score, returns them ordered by score desc, then applies
// the in-memory filter narrowing so a single source of filter truth backs
// both ranked-feed and filter-rail. The Supabase chain is stubbed; the
// production call site supplies the real admin client.

import { describe, it, expect, vi } from 'vitest';
import {
  fetchRankedCompanies,
  type FetchRankedDeps,
} from '@/lib/catalog/modules/ranked-feed/data';
import type { RawCompanyRow } from '@/lib/catalog/modules/filter-rail/applyFilters';

function makeStubAdmin(rows: RawCompanyRow[]) {
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  const order = vi.fn().mockReturnValue({ limit });
  const not = vi.fn().mockReturnValue({ order });
  const eq = vi.fn().mockReturnValue({ not });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const admin = { from } as unknown as FetchRankedDeps['admin'];
  return { admin, calls: { from, select, eq, not, order, limit } };
}

describe('fetchRankedCompanies', () => {
  it('queries projects scoped to organization_id with score not null, score desc, capped', async () => {
    const stub = makeStubAdmin([]);
    await fetchRankedCompanies('org-internal', { admin: stub.admin, limit: 25, filters: {} });
    expect(stub.calls.from).toHaveBeenCalledWith('projects');
    expect(stub.calls.eq).toHaveBeenCalledWith('organization_id', 'org-internal');
    expect(stub.calls.not).toHaveBeenCalledWith('score', 'is', null);
    expect(stub.calls.order).toHaveBeenCalledWith('score', { ascending: false, nullsFirst: false });
    expect(stub.calls.limit).toHaveBeenCalledWith(25);
  });

  it('returns rows from the Supabase response unmodified when no filters are set', async () => {
    const stub = makeStubAdmin([
      { id: 'a', organization_id: 'x', score: 90, title: 'A', source: 'sam-gov', raw_payload: {} },
      { id: 'b', organization_id: 'x', score: 70, title: 'B', source: 'sam-gov', raw_payload: {} },
    ]);
    const out = await fetchRankedCompanies('x', { admin: stub.admin, limit: 50, filters: {} });
    expect(out.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('applies filters after fetch so ranked-feed and filter-rail agree on the narrowed set', async () => {
    const stub = makeStubAdmin([
      {
        id: 'a',
        organization_id: 'x',
        score: 90,
        title: 'A',
        source: 'sam-gov',
        raw_payload: { internal_enrichment: { service_category: 'equipment-rental' } },
      },
      {
        id: 'b',
        organization_id: 'x',
        score: 80,
        title: 'B',
        source: 'sam-gov',
        raw_payload: { internal_enrichment: { service_category: 'temp-fence' } },
      },
    ]);
    const out = await fetchRankedCompanies('x', {
      admin: stub.admin,
      limit: 50,
      filters: { service_category: 'temp-fence' },
    });
    expect(out.map((r) => r.id)).toEqual(['b']);
  });

  it('returns an empty array when Supabase errors so the renderer falls back to EmptyState', async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: new Error('boom') });
    const order = vi.fn().mockReturnValue({ limit });
    const not = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ not });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const admin = { from } as unknown as FetchRankedDeps['admin'];
    const out = await fetchRankedCompanies('x', { admin, limit: 50, filters: {} });
    expect(out).toEqual([]);
  });

  it('defaults limit to 50 when unspecified', async () => {
    const stub = makeStubAdmin([]);
    await fetchRankedCompanies('x', { admin: stub.admin, filters: {} });
    expect(stub.calls.limit).toHaveBeenCalledWith(50);
  });
});
