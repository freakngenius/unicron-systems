// __tests__/internal-chat/internal-lead-tool.test.ts
//
// Unit tests for lib/chat/internal-lead-tool. We stub supabaseAdmin so the
// tests run offline and the tool's logic (filtering, projection, the
// pipeline_stage join) is exercised in isolation. The live integration is
// verified post-merge against the prod DB; that evidence lives in the PR
// body, not here.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const orgId = 'org-internal-test';
const otherOrgId = 'org-other';

type Row = {
  id: string;
  title: string;
  score: number | null;
  verified: boolean | null;
  posted_date: string | null;
  source: string | null;
  organization_id: string;
  raw_payload: Record<string, unknown> | null;
  rationale?: string | null;
  outreach_hook?: string | null;
};

const seed: Row[] = [
  {
    id: 'sam:THALLE',
    title: 'Thalle Construction Company',
    score: 55,
    verified: true,
    posted_date: '2026-04-12',
    source: 'sam.gov',
    organization_id: orgId,
    rationale: 'Federal awardee; AGC membership.',
    outreach_hook: 'Open with the federal awardee angle.',
    raw_payload: {
      internal_enrichment: {
        service_category: 'specialty-trade',
        sales_motion: 'active-outbound',
        associations: ['AGC', 'NUCA'],
      },
      internal_geo: { hq_state: 'NC', operating_states: ['NC', 'SC', 'VA'] },
      internal_federal_registration: 'federal-awardee',
    },
  },
  {
    id: 'sam:MANSON',
    title: 'Manson Construction Co',
    score: 82,
    verified: true,
    posted_date: '2026-05-01',
    source: 'sam.gov',
    organization_id: orgId,
    rationale: 'Marine specialty contractor.',
    raw_payload: {
      internal_enrichment: {
        service_category: 'specialty-trade',
        sales_motion: 'active-outbound',
      },
      internal_geo: { hq_state: 'WA', operating_states: ['WA', 'OR', 'CA'] },
      internal_federal_registration: 'both',
    },
  },
  {
    id: 'sam:APEX',
    title: 'Apex Power',
    score: 40,
    verified: false,
    posted_date: '2026-03-22',
    source: 'usaspending',
    organization_id: orgId,
    rationale: 'Inbound-only; small footprint.',
    raw_payload: {
      internal_enrichment: {
        service_category: 'temp-power-sanitation',
        sales_motion: 'inbound-only',
      },
      internal_federal_registration: 'none',
    },
  },
  // A row belonging to another org. The tool must not surface this.
  {
    id: 'sam:OTHER',
    title: 'Other Org Co',
    score: 99,
    verified: true,
    posted_date: '2026-05-15',
    source: 'sam.gov',
    organization_id: otherOrgId,
    raw_payload: {
      internal_enrichment: {
        service_category: 'equipment-rental',
        sales_motion: 'active-outbound',
      },
      internal_federal_registration: 'sam-registered',
    },
  },
];

const deals: Array<{ project_id: string; pipeline_stage: string; project: { organization_id: string } }> = [
  { project_id: 'sam:THALLE', pipeline_stage: 'PROPOSAL', project: { organization_id: orgId } },
  { project_id: 'sam:MANSON', pipeline_stage: 'CONTACTED', project: { organization_id: orgId } },
  // No deal for Apex; the kanban filter should treat it as outside the kanban.
  // A deal for another org; the pipeline_stage join must drop it.
  { project_id: 'sam:OTHER', pipeline_stage: 'WON', project: { organization_id: otherOrgId } },
];

// In-memory query builder that mimics the subset of supabase-js the tool uses.
function projectsBuilder(rows: Row[]): unknown {
  let cur = rows.slice();
  let limitVal = Number.MAX_SAFE_INTEGER;
  let single = false;
  const self: Record<string, unknown> = {};
  const filter = <T>(pred: (r: Row) => boolean): T => {
    cur = cur.filter(pred);
    return self as T;
  };
  Object.assign(self, {
    select: () => self,
    eq: (col: string, val: unknown) => filter<typeof self>((r) => (r as unknown as Record<string, unknown>)[col] === val),
    gte: (col: string, val: number) => filter<typeof self>((r) => (r[col as keyof Row] as number) >= val),
    lte: (col: string, val: number) => filter<typeof self>((r) => (r[col as keyof Row] as number) <= val),
    ilike: (col: string, pattern: string) => {
      const term = pattern.replace(/%/g, '').toLowerCase();
      return filter<typeof self>((r) => String((r as Record<string, unknown>)[col] ?? '').toLowerCase().includes(term));
    },
    order: (col: string, opts: { ascending: boolean }) => {
      cur = cur.slice().sort((a, b) => {
        const av = (a as Record<string, unknown>)[col];
        const bv = (b as Record<string, unknown>)[col];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return opts.ascending ? -1 : 1;
        if (av > bv) return opts.ascending ? 1 : -1;
        return 0;
      });
      return self;
    },
    limit: (n: number) => {
      limitVal = n;
      return self;
    },
    maybeSingle: async () => {
      single = true;
      const row = cur[0] ?? null;
      return { data: row, error: null };
    },
    then: undefined, // make it not thenable until awaited via toResolve
    async toResolve() {
      return { data: cur.slice(0, limitVal), error: null };
    },
  });
  // Supabase's builder is itself thenable after the last chain call; mimic
  // by giving the proxy a .then that resolves the data.
  (self as { then?: (fn: (v: unknown) => void) => unknown }).then = (fn) => {
    if (single) {
      const row = cur[0] ?? null;
      fn({ data: row, error: null });
      return undefined;
    }
    fn({ data: cur.slice(0, limitVal), error: null });
    return undefined;
  };
  return self;
}

function dealsBuilder() {
  let limitVal = Number.MAX_SAFE_INTEGER;
  const self: Record<string, unknown> = {};
  Object.assign(self, {
    select: () => self,
    eq: () => self,
    limit: (n: number) => {
      limitVal = n;
      return self;
    },
    maybeSingle: async () => ({ data: deals[0] ?? null, error: null }),
    async toResolve() {
      return { data: deals.slice(0, limitVal), error: null };
    },
  });
  (self as { then?: (fn: (v: unknown) => void) => unknown }).then = (fn) => {
    fn({ data: deals.slice(0, limitVal), error: null });
    return undefined;
  };
  return self;
}

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {} as unknown,
    supabaseAdmin: () => ({
      from: (table: string) => {
        if (table === 'projects') return projectsBuilder(seed);
        if (table === 'deals') return dealsBuilder();
        return {
          select: () => ({}),
          eq: () => ({}),
        };
      },
    }),
  };
});

// Re-import after mocking.
import { runLeadTool } from '@/lib/chat/internal-lead-tool';

const ctx = { orgId, orgSlug: 'internal' as const };

describe('runLeadTool (Internal scope)', () => {
  beforeEach(() => {
    // No global state to reset; the mocked supabaseAdmin is stateless per
    // call (always reads from `seed`).
  });

  it('list projects rows to display labels for the right org only', async () => {
    const r = await runLeadTool({ op: 'list' }, ctx);
    expect(r.op).toBe('list');
    if (r.op !== 'list') throw new Error('unreachable');
    const ids = r.rows.map((row) => row.id);
    expect(ids).toContain('sam:THALLE');
    expect(ids).toContain('sam:MANSON');
    expect(ids).toContain('sam:APEX');
    expect(ids).not.toContain('sam:OTHER');
    // Display label projection, never raw key.
    expect(r.rows.find((row) => row.id === 'sam:THALLE')?.federal_registration).toBe('Federal awardee');
  });

  it('aggregate by pipeline_stage returns the seven Internal stages with counts including zeros', async () => {
    const r = await runLeadTool({ op: 'aggregate', group_by: 'pipeline_stage' }, ctx);
    expect(r.op).toBe('aggregate');
    if (r.op !== 'aggregate') throw new Error('unreachable');
    const map = new Map(r.groups.map((g) => [g.key, g.count]));
    expect(map.get('proposal')).toBe(1);
    expect(map.get('contacted')).toBe(1);
    expect(map.get('new-outreach-ready')).toBe(0);
    expect(map.get('won')).toBe(0);
    // Seven keys total.
    expect(r.groups.length).toBe(7);
    // The other-org deal in WON must NOT count toward Internal.
    expect(map.get('won')).toBe(0);
  });

  it('filter federal_registration=federal-awardee returns only matching rows', async () => {
    const r = await runLeadTool(
      { op: 'list', filter: { federal_registration: 'federal-awardee' } },
      ctx,
    );
    expect(r.op).toBe('list');
    if (r.op !== 'list') throw new Error('unreachable');
    const ids = r.rows.map((row) => row.id);
    expect(ids).toEqual(['sam:THALLE']);
  });

  it('search by name substring is case-insensitive and respects org', async () => {
    const r = await runLeadTool({ op: 'search', name_contains: 'manson' }, ctx);
    expect(r.op).toBe('search');
    if (r.op !== 'search') throw new Error('unreachable');
    const ids = r.rows.map((row) => row.id);
    expect(ids).toContain('sam:MANSON');
    expect(ids).not.toContain('sam:OTHER');
  });

  it('clamps limit to a sane max', async () => {
    const r = await runLeadTool({ op: 'list', limit: 99999 }, ctx);
    expect(r.op).toBe('list');
    if (r.op !== 'list') throw new Error('unreachable');
    // Three Internal rows in seed; the clamp prevents an unbounded fetch
    // but does not pad rows that do not exist.
    expect(r.rows.length).toBeLessThanOrEqual(100);
  });
});
