// src/lib/customersClient.test.ts
//
// Asserts the real getOrgHealth() query shape after PR #280 redo: every
// query scopes by organization_id (uuid), agent_log uses ts not created_at,
// data_sources uses adapter_kind/name (mapped to type/label in the response),
// and the OrgHealthRollup wire contract is honored.
//
// Replaces the archived mock-mode test suite. Mocks the Supabase client at
// the module boundary instead of via env-flag toggle.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

interface CapturedCall {
  table: string;
  select: string;
  filters: Array<{ op: string; col: string; value: unknown }>;
  order?: { col: string; ascending: boolean };
}

let capturedCalls: CapturedCall[] = [];

// In-memory mock data — Zedcor org_id matches the production UUID
const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';

// Fixture refs are mutable so individual tests can override the data the
// mocked Supabase client returns. resetFixtures() restores the defaults.
let PROJECTS_FIXTURE: unknown[] = [];
let AGENT_LOG_FIXTURE: unknown[] = [];
let DATA_SOURCES_FIXTURE: unknown[] = [];
let OUTREACH_DRAFTED_FIXTURE: unknown[] = [];
let OUTREACH_SENT_FIXTURE: unknown[] = [];

function resetFixtures() {
  PROJECTS_FIXTURE = [
    { created_at: new Date(Date.now() - 1 * 86400_000).toISOString(), score: 92 }, // d-1, high
    { created_at: new Date(Date.now() - 2 * 86400_000).toISOString(), score: 71 }, // d-2
    { created_at: new Date(Date.now() - 8 * 86400_000).toISOString(), score: 85 }, // d-8 outside 7d
  ];
  AGENT_LOG_FIXTURE = [
    {
      agent_name: 'Enricher',
      event_type: 'error',
      event_data: { message: 'Sonar Pro rate limit', reason: 'rate_limited' },
      ts: new Date(Date.now() - 1 * 86400_000).toISOString(),
    },
    {
      agent_name: 'Verifier',
      event_type: 'verify_fail',
      event_data: { reason: 'overlapping_cycle' },
      ts: new Date(Date.now() - 3 * 86400_000).toISOString(),
    },
  ];
  DATA_SOURCES_FIXTURE = [
    { id: 'src-1', adapter_kind: 'permits', name: 'Allegheny County permits', jurisdiction: 'Allegheny County, PA' },
  ];
  // Outreach delivery rate is computed from two independent queries:
  //   denominator = pathfinder.outreach_drafts in 7d window scoped by org
  //   numerator   = pathfinder.outreach_edits with sent_at NOT NULL in 7d
  //                 window, scoped to this org via the outreach_drafts!inner
  //                 FK + .eq('outreach_drafts.organization_id', orgId)
  // Mocks represent the rows PostgREST would return AFTER the server-side
  // filters; the filter presence is asserted separately.
  OUTREACH_DRAFTED_FIXTURE = [
    { id: 1 },
    { id: 2 },
    { id: 3 },
    { id: 4 },
  ];
  OUTREACH_SENT_FIXTURE = [
    { sent_at: new Date(Date.now() - 1 * 86400_000).toISOString() },
    { sent_at: new Date(Date.now() - 2 * 86400_000).toISOString() },
  ];
}
resetFixtures();

function buildQueryBuilder(table: string, dataset: unknown[]) {
  const call: CapturedCall = { table, select: '', filters: [] };
  capturedCalls.push(call);
  const builder = {
    select(cols: string) {
      call.select = cols;
      return builder;
    },
    eq(col: string, value: unknown) {
      call.filters.push({ op: 'eq', col, value });
      return builder;
    },
    in(col: string, values: unknown[]) {
      call.filters.push({ op: 'in', col, value: values });
      return builder;
    },
    gte(col: string, value: unknown) {
      call.filters.push({ op: 'gte', col, value });
      return builder;
    },
    not(col: string, op: string, value: unknown) {
      call.filters.push({ op: `not.${op}`, col, value });
      return builder;
    },
    order(col: string, opts: { ascending: boolean }) {
      call.order = { col, ascending: opts.ascending };
      return builder;
    },
    then(resolve: (v: { data: unknown[]; error: null }) => void) {
      resolve({ data: dataset, error: null });
    },
  };
  return builder;
}

vi.mock('./supabase', () => ({
  getSupabase: () => ({
    schema: () => ({
      from(table: string) {
        if (table === 'projects') return buildQueryBuilder(table, PROJECTS_FIXTURE);
        if (table === 'agent_log') return buildQueryBuilder(table, AGENT_LOG_FIXTURE);
        if (table === 'data_sources') return buildQueryBuilder(table, DATA_SOURCES_FIXTURE);
        if (table === 'outreach_drafts') return buildQueryBuilder(table, OUTREACH_DRAFTED_FIXTURE);
        if (table === 'outreach_edits') return buildQueryBuilder(table, OUTREACH_SENT_FIXTURE);
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }),
}));

describe('getOrgHealth', () => {
  beforeEach(() => {
    capturedCalls = [];
    resetFixtures();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scopes every query by organization_id (uuid), not customer_org_id', async () => {
    const { getOrgHealth } = await import('./customersClient');
    await getOrgHealth(ZEDCOR_ORG_ID);

    expect(capturedCalls).toHaveLength(5);
    for (const call of capturedCalls) {
      // outreach_edits has no organization_id of its own — it scopes via
      // the outreach_drafts!inner FK with .eq('outreach_drafts.organization_id', ...).
      const orgCol = call.table === 'outreach_edits'
        ? 'outreach_drafts.organization_id'
        : 'organization_id';
      const orgFilter = call.filters.find((f) => f.col === orgCol);
      expect(orgFilter, `${call.table} must filter by ${orgCol}`).toBeDefined();
      expect(orgFilter?.value).toBe(ZEDCOR_ORG_ID);
      // Negative assertion — the bug PR #280 had:
      const customerOrgFilter = call.filters.find((f) => f.col === 'customer_org_id');
      expect(customerOrgFilter, `${call.table} must NOT filter by customer_org_id`).toBeUndefined();
    }
  });

  it('queries agent_log by ts (not created_at) for time bounds + ordering', async () => {
    const { getOrgHealth } = await import('./customersClient');
    await getOrgHealth(ZEDCOR_ORG_ID);

    const agentLog = capturedCalls.find((c) => c.table === 'agent_log');
    expect(agentLog).toBeDefined();
    expect(agentLog?.filters.some((f) => f.op === 'gte' && f.col === 'ts')).toBe(true);
    expect(agentLog?.order).toEqual({ col: 'ts', ascending: false });
    // Errors are filtered by event_type IN [...], not level='error'
    const eventTypeFilter = agentLog?.filters.find((f) => f.op === 'in' && f.col === 'event_type');
    expect(eventTypeFilter).toBeDefined();
    expect(eventTypeFilter?.value).toEqual(
      expect.arrayContaining(['error', 'verify_fail', 'deal_push_failed', 'signature_failed', 'draft_fail']),
    );
  });

  it('queries data_sources with the enabled column added in the Phase 2A completion migration', async () => {
    const { getOrgHealth } = await import('./customersClient');
    await getOrgHealth(ZEDCOR_ORG_ID);

    const sources = capturedCalls.find((c) => c.table === 'data_sources');
    expect(sources).toBeDefined();
    const enabledFilter = sources?.filters.find((f) => f.col === 'enabled');
    expect(enabledFilter).toEqual({ op: 'eq', col: 'enabled', value: true });
  });

  it('selects adapter_kind + name from data_sources (mapped to type + label in response)', async () => {
    const { getOrgHealth } = await import('./customersClient');
    const rollup = await getOrgHealth(ZEDCOR_ORG_ID);

    const sources = capturedCalls.find((c) => c.table === 'data_sources');
    expect(sources?.select).toMatch(/adapter_kind/);
    expect(sources?.select).toMatch(/name/);

    expect(rollup.active_sources).toHaveLength(1);
    expect(rollup.active_sources[0]).toEqual({
      id: 'src-1',
      type: 'permits', // adapter_kind → type
      label: 'Allegheny County permits', // name → label
      jurisdiction: 'Allegheny County, PA',
    });
  });

  it('lifts agent_log error message from event_data jsonb', async () => {
    const { getOrgHealth } = await import('./customersClient');
    const rollup = await getOrgHealth(ZEDCOR_ORG_ID);

    expect(rollup.recent_errors).toHaveLength(2);
    expect(rollup.recent_errors[0]).toEqual({
      agent_name: 'Enricher',
      message: 'Sonar Pro rate limit', // from event_data.message
      created_at: AGENT_LOG_FIXTURE[0].ts,
    });
    expect(rollup.recent_errors[1]).toEqual({
      agent_name: 'Verifier',
      message: 'overlapping_cycle', // from event_data.reason fallback
      created_at: AGENT_LOG_FIXTURE[1].ts,
    });
  });

  it('outreach denominator queries pathfinder.outreach_drafts in 7d window, scoped by organization_id', async () => {
    const { getOrgHealth } = await import('./customersClient');
    await getOrgHealth(ZEDCOR_ORG_ID);

    const drafts = capturedCalls.find((c) => c.table === 'outreach_drafts');
    expect(drafts, 'must query pathfinder.outreach_drafts').toBeDefined();
    expect(drafts?.filters.find((f) => f.col === 'organization_id')?.value).toBe(ZEDCOR_ORG_ID);
    expect(drafts?.filters.some((f) => f.op === 'gte' && f.col === 'draft_at')).toBe(true);
    expect(drafts?.select).toMatch(/id/);
  });

  it('outreach numerator queries pathfinder.outreach_edits.sent_at via outreach_drafts!inner FK', async () => {
    // Codex 2026-05-11 review caught the regression where this slice
    // initially queried outreach_drafts.sent_at — a column the send pipeline
    // never writes. outreach_edits is the canonical send log written by
    // sendOutreach in Pathfinder/app/api/leads/.../send/route.ts.
    const { getOrgHealth } = await import('./customersClient');
    await getOrgHealth(ZEDCOR_ORG_ID);

    const edits = capturedCalls.find((c) => c.table === 'outreach_edits');
    expect(edits, 'must query pathfinder.outreach_edits for sends').toBeDefined();
    // Scoped to org through the outreach_drafts FK (no organization_id on
    // outreach_edits directly).
    expect(edits?.select).toMatch(/outreach_drafts!inner/);
    expect(edits?.filters.find((f) => f.col === 'outreach_drafts.organization_id')?.value).toBe(ZEDCOR_ORG_ID);
    // Only counts rows with a real send timestamp inside the 7d window.
    expect(edits?.filters.some((f) => f.op === 'not.is' && f.col === 'sent_at')).toBe(true);
    expect(edits?.filters.some((f) => f.op === 'gte' && f.col === 'sent_at')).toBe(true);
  });

  it('computes outreach_delivery_rate_7d = sends ÷ drafts, capped at 1', async () => {
    const { getOrgHealth } = await import('./customersClient');
    const rollup = await getOrgHealth(ZEDCOR_ORG_ID);
    // Fixtures: 4 drafts in 7d window, 2 sends in 7d window → 0.5
    expect(rollup.outreach_delivery_rate_7d).toBeCloseTo(0.5, 5);
  });

  it('outreach_delivery_rate_7d is 0 when no drafts exist in the 7d window', async () => {
    OUTREACH_DRAFTED_FIXTURE = [];
    OUTREACH_SENT_FIXTURE = [];
    const { getOrgHealth } = await import('./customersClient');
    const rollup = await getOrgHealth(ZEDCOR_ORG_ID);
    expect(rollup.outreach_delivery_rate_7d).toBe(0);
  });

  it('caps outreach_delivery_rate_7d at 1 when sends exceed drafts (older drafts sent today)', async () => {
    // Sends in the 7d window can correspond to drafts created BEFORE the
    // window, so the numerator can exceed the denominator. The cap keeps
    // the dashboard percentage from rendering > 100%.
    OUTREACH_DRAFTED_FIXTURE = [{ id: 1 }];
    OUTREACH_SENT_FIXTURE = [
      { sent_at: new Date().toISOString() },
      { sent_at: new Date().toISOString() },
      { sent_at: new Date().toISOString() },
    ];
    const { getOrgHealth } = await import('./customersClient');
    const rollup = await getOrgHealth(ZEDCOR_ORG_ID);
    expect(rollup.outreach_delivery_rate_7d).toBe(1);
  });

  it('returns OrgHealthRollup-shaped response with org_id propagated', async () => {
    const { getOrgHealth } = await import('./customersClient');
    const rollup = await getOrgHealth(ZEDCOR_ORG_ID);

    expect(rollup.org_id).toBe(ZEDCOR_ORG_ID);
    expect(rollup.lead_volume_30d).toHaveLength(30);
    expect(rollup.error_volume_30d).toHaveLength(30);
    expect(rollup.lead_volume_30d_total).toBe(3);
    // d-1 score 92 ≥ 80 → 1 high-score lead in 7d window of 2 leads → 50%
    expect(rollup.lead_volume_7d_total).toBe(2);
    expect(rollup.high_score_rate_7d).toBeCloseTo(0.5, 5);
    // 2 errors total in 30d, both inside 7d window
    expect(rollup.error_total_7d).toBe(2);
    expect(rollup.error_rate_7d).toBeCloseTo(2 / 2, 5);
  });
});
