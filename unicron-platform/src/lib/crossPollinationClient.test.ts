import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bucketFor } from './contracts/crossPollination';

// Captured query state for assertions per-call.
type QueryState = {
  eqArgs: Array<[string, unknown]>;
  inArgs: Array<[string, unknown[]]>;
  gteArgs: Array<[string, number]>;
  orderArgs: Array<[string, { ascending: boolean }]>;
  limitArg: number | null;
  selectArg: string | null;
};

let lastState: QueryState;
let mockData: unknown[] = [];
let mockError: { message: string } | null = null;

function makeQuery() {
  const state: QueryState = {
    eqArgs: [],
    inArgs: [],
    gteArgs: [],
    orderArgs: [],
    limitArg: null,
    selectArg: null,
  };
  lastState = state;
  const thenable: PromiseLike<{ data: unknown[] | null; error: unknown }> = {
    then(onFulfilled) {
      return Promise.resolve({ data: mockData, error: mockError }).then(onFulfilled);
    },
  };
  const builder = {
    select(col: string) {
      state.selectArg = col;
      return builder;
    },
    order(col: string, opts: { ascending: boolean }) {
      state.orderArgs.push([col, opts]);
      return builder;
    },
    eq(col: string, val: unknown) {
      state.eqArgs.push([col, val]);
      return builder;
    },
    in(col: string, vals: unknown[]) {
      state.inArgs.push([col, vals]);
      return builder;
    },
    gte(col: string, val: number) {
      state.gteArgs.push([col, val]);
      return builder;
    },
    limit(n: number) {
      state.limitArg = n;
      return builder;
    },
    then: thenable.then.bind(thenable),
  };
  return builder;
}

vi.mock('./supabase', () => ({
  getSupabase: () => ({
    schema: () => ({
      from: () => makeQuery(),
    }),
  }),
}));

// Import after vi.mock so module sees the mocked supabase.
import { listCrossPollinationMatches } from './crossPollinationClient';

const SAMPLE_ROWS = [
  {
    id: 'm1',
    lead_id: 'lead-pgh-3401',
    customer_org_id: 'zedcor',
    customer_canonical: 'Acme',
    match_layer: 'exact',
    match_confidence: 0.95,
    primary_branch_id: null,
    primary_branch_name: null,
    branch_count: 1,
    active_site_count: 0,
    most_recent_site_date: null,
    national_account: false,
    matched_at: '2026-05-01T00:00:00Z',
    matched_field: 'project_owner',
    matched_value_raw: 'Acme',
  },
  {
    id: 'm2',
    lead_id: 'lead-hou-2207',
    customer_org_id: 'zedcor',
    customer_canonical: 'Beta',
    match_layer: 'fuzzy',
    match_confidence: 0.72,
    primary_branch_id: null,
    primary_branch_name: null,
    branch_count: 2,
    active_site_count: 1,
    most_recent_site_date: null,
    national_account: false,
    matched_at: '2026-05-01T00:00:00Z',
    matched_field: 'prime_contractor',
    matched_value_raw: 'Beta',
  },
];

describe('crossPollinationClient (real-mode)', () => {
  beforeEach(() => {
    mockData = SAMPLE_ROWS;
    mockError = null;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('queries pathfinder.lead_cross_pollination sorted by match_confidence desc', async () => {
    const rows = await listCrossPollinationMatches({ customer_org_id: 'zedcor' });
    expect(rows.length).toBe(SAMPLE_ROWS.length);
    expect(lastState.orderArgs).toEqual([['match_confidence', { ascending: false }]]);
    expect(lastState.eqArgs).toContainEqual(['customer_org_id', 'zedcor']);
  });

  it('applies lead_id filter via eq', async () => {
    await listCrossPollinationMatches({ lead_id: 'lead-pgh-3401' });
    expect(lastState.eqArgs).toContainEqual(['lead_id', 'lead-pgh-3401']);
  });

  it('applies lead_ids batch via in', async () => {
    await listCrossPollinationMatches({
      lead_ids: ['lead-pgh-3401', 'lead-hou-2207'],
    });
    expect(lastState.inArgs).toContainEqual([
      'lead_id',
      ['lead-pgh-3401', 'lead-hou-2207'],
    ]);
  });

  it('applies min_confidence via gte', async () => {
    await listCrossPollinationMatches({ min_confidence: 0.85 });
    expect(lastState.gteArgs).toContainEqual(['match_confidence', 0.85]);
  });

  it('applies limit', async () => {
    await listCrossPollinationMatches({ limit: 5 });
    expect(lastState.limitArg).toBe(5);
  });

  it('returns empty array when data is null', async () => {
    mockData = [];
    const rows = await listCrossPollinationMatches();
    expect(rows).toEqual([]);
  });

  it('throws when Supabase returns an error', async () => {
    mockError = { message: 'boom' };
    await expect(listCrossPollinationMatches()).rejects.toBeTruthy();
  });

  it('bucketFor classifies high / ambiguous / low correctly', () => {
    expect(bucketFor(0.95)).toBe('high');
    expect(bucketFor(0.9)).toBe('high');
    expect(bucketFor(0.85)).toBe('ambiguous');
    expect(bucketFor(0.7)).toBe('ambiguous');
    expect(bucketFor(0.65)).toBe('low');
  });
});
