import { describe, it, expect } from 'vitest';
import { findMatches, levenshtein, bestFuzzyMatch } from '../../lib/cross-pollination/engine';

// In-memory mock of the Supabase service-role client. Only the calls used
// by findMatches() need to be implemented:
//   .from('zedcor_customer_sites').select(...).eq('customer_org_id', x)
//   .from('zedcor_branches').select(...).eq('customer_org_id', x)
//   .from('lead_cross_pollination').insert(rows)
// All return { data, error } awaitable thenables.

interface Site {
  customer_name_normalized: string;
  customer_name_raw: string | null;
  parent_company_canonical: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
  is_active: boolean;
  ingested_at: string;
}

interface Branch {
  id: string;
  branch_name: string;
  state: string;
  lat: number | null;
  lon: number | null;
  customer_org_id: string;
}

function makeMockClient(opts: {
  sites: Site[];
  branches: Branch[];
  inserts?: unknown[];
}) {
  const sitesWithOrg = opts.sites.map((s) => ({ ...s, customer_org_id: 'zedcor' }));
  const inserts = opts.inserts ?? [];
  return {
    from(table: string) {
      if (table === 'zedcor_customer_sites') {
        // findMatches paginates via .from().select().eq().range(); the
        // mock corpus is < one page so a single call covers it.
        return {
          select() {
            return {
              eq() {
                return {
                  range() {
                    return Promise.resolve({ data: sitesWithOrg, error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'zedcor_branches') {
        return {
          select() {
            return {
              eq() {
                return Promise.resolve({ data: opts.branches, error: null });
              },
            };
          },
        };
      }
      if (table === 'lead_cross_pollination') {
        return {
          insert(rows: unknown) {
            if (Array.isArray(rows)) inserts.push(...rows);
            else inserts.push(rows);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      throw new Error(`mock: unhandled table ${table}`);
    },
    _inserts: inserts,
  };
}

const TX_HOUSTON: Branch = {
  id: 'br-houston',
  branch_name: 'Houston',
  state: 'TX',
  lat: 29.76,
  lon: -95.37,
  customer_org_id: 'zedcor',
};
const TX_DALLAS: Branch = {
  id: 'br-dallas',
  branch_name: 'Dallas',
  state: 'TX',
  lat: 32.78,
  lon: -96.8,
  customer_org_id: 'zedcor',
};
const CO_DENVER: Branch = {
  id: 'br-denver',
  branch_name: 'Denver',
  state: 'CO',
  lat: 39.74,
  lon: -104.99,
  customer_org_id: 'zedcor',
};

describe('levenshtein', () => {
  it('returns 0 for equal strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
  it('counts single-char edits', () => {
    expect(levenshtein('kitten', 'sitten')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
  it('handles empty inputs', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
  it('respects the cap (early exit)', () => {
    // 'a' and 'bbbbbbbbbb' differ by 10 — with cap=2 we should get >2
    expect(levenshtein('a', 'bbbbbbbbbb', 2)).toBeGreaterThan(2);
  });
});

describe('bestFuzzyMatch', () => {
  const haystack = ['davidson homes', 'starlight homes', 'lennar', 'toll brothers'];
  it('finds 1-edit matches within length window', () => {
    const hit = bestFuzzyMatch('lenar', haystack, 3);
    expect(hit?.name).toBe('lennar');
    expect(hit?.distance).toBe(1);
  });
  it('returns null for inputs outside the length window', () => {
    // 4-char candidate, length window roughly 3-5; 'davidson homes' is 14
    const hit = bestFuzzyMatch('abcd', haystack, 3);
    expect(hit).toBeNull();
  });
  it('returns null when nothing within max distance', () => {
    const hit = bestFuzzyMatch('zzzzzzz', haystack, 1);
    expect(hit).toBeNull();
  });
});

describe('findMatches', () => {
  const sites: Site[] = [
    {
      customer_name_normalized: 'lennar',
      customer_name_raw: 'Lennar',
      parent_company_canonical: 'lennar',
      state: 'TX',
      lat: 29.7,
      lon: -95.4,
      is_active: true,
      ingested_at: '2026-04-15T00:00:00Z',
    },
    {
      customer_name_normalized: 'lennar',
      customer_name_raw: 'Lennar',
      parent_company_canonical: 'lennar',
      state: 'TX',
      lat: 32.8,
      lon: -96.8,
      is_active: true,
      ingested_at: '2026-04-20T00:00:00Z',
    },
    {
      customer_name_normalized: 'lennar',
      customer_name_raw: 'Lennar',
      parent_company_canonical: 'lennar',
      state: 'CO',
      lat: 39.7,
      lon: -104.9,
      is_active: true,
      ingested_at: '2026-04-10T00:00:00Z',
    },
    {
      customer_name_normalized: 'dr horton - south houston',
      customer_name_raw: 'D.R. Horton Inc. - South Houston',
      parent_company_canonical: 'dr horton',
      state: 'TX',
      lat: 29.5,
      lon: -95.1,
      is_active: true,
      ingested_at: '2026-04-22T00:00:00Z',
    },
    {
      customer_name_normalized: 'dr horton - dallas',
      customer_name_raw: 'D.R. Horton Inc. - Dallas',
      parent_company_canonical: 'dr horton',
      state: 'TX',
      lat: 32.78,
      lon: -96.8,
      is_active: true,
      ingested_at: '2026-04-21T00:00:00Z',
    },
    {
      customer_name_normalized: 'davidson homes',
      customer_name_raw: 'Davidson Homes',
      parent_company_canonical: 'davidson homes',
      state: 'TX',
      lat: 30.27,
      lon: -97.74,
      is_active: true,
      ingested_at: '2026-04-18T00:00:00Z',
    },
    {
      customer_name_normalized: 'starlight homes',
      customer_name_raw: 'Starlight Homes',
      parent_company_canonical: 'starlight homes',
      state: 'TX',
      lat: 30.0,
      lon: -95.0,
      is_active: false, // inactive — should not surface
      ingested_at: '2026-03-01T00:00:00Z',
    },
  ];
  const branches: Branch[] = [TX_HOUSTON, TX_DALLAS, CO_DENVER];

  it('finds an exact match (Lennar) and aggregates branch_count by state', async () => {
    const mock = makeMockClient({ sites, branches });
    const result = await findMatches({
      leadId: 'lead-test-1',
      fields: { project_owner: 'Lennar' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      writeMatches: true,
    });
    expect(result).toHaveLength(1);
    const m = result[0];
    expect(m.customer_canonical).toBe('lennar');
    expect(m.match_layer).toBe('exact');
    expect(m.match_confidence).toBe(1.0);
    expect(m.active_site_count).toBe(3);
    expect(m.branch_count).toBe(2); // distinct states: TX + CO
    expect(m.matched_field).toBe('project_owner');
    expect(m.matched_value_raw).toBe('Lennar');
    expect(mock._inserts).toHaveLength(1);
  });

  it('strips Inc./LLC suffixes via the canonical normalizer', async () => {
    const mock = makeMockClient({ sites, branches });
    const result = await findMatches({
      leadId: 'lead-test-2',
      fields: { project_owner: 'Lennar Inc.' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      writeMatches: false,
    });
    expect(result[0]?.customer_canonical).toBe('lennar');
    expect(result[0]?.match_layer).toBe('exact');
  });

  it('finds a fuzzy match within the length window', async () => {
    const mock = makeMockClient({ sites, branches });
    const result = await findMatches({
      leadId: 'lead-test-3',
      fields: { project_owner: 'Lenar' }, // 1-edit typo of "lennar"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      writeMatches: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0].customer_canonical).toBe('lennar');
    expect(result[0].match_layer).toBe('fuzzy');
    expect(result[0].match_confidence).toBeLessThan(1);
    expect(result[0].match_confidence).toBeGreaterThan(0.7);
  });

  it('does NOT fuzzy-match outside the length window (4-char vs 14-char)', async () => {
    const mock = makeMockClient({ sites, branches });
    const result = await findMatches({
      leadId: 'lead-test-4',
      fields: { prime_contractor: 'ABCD' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      writeMatches: false,
    });
    expect(result).toHaveLength(0);
  });

  it('matches via parent-company canonical', async () => {
    // Use a candidate that exactly matches the parent canonical, not any
    // single customer name.
    const mock = makeMockClient({ sites, branches });
    const result = await findMatches({
      leadId: 'lead-test-5',
      fields: { parent_company: 'dr horton' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      writeMatches: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0].match_layer).toBe('parent_company');
    expect(result[0].match_confidence).toBe(0.85);
    // Should aggregate both DR Horton sites (south houston + dallas), both
    // active, both in TX → branch_count=1, active_site_count=2.
    expect(result[0].active_site_count).toBe(2);
    expect(result[0].branch_count).toBe(1);
  });

  it('returns an empty array when nothing matches', async () => {
    const mock = makeMockClient({ sites, branches });
    const result = await findMatches({
      leadId: 'lead-test-6',
      fields: { prime_contractor: 'Quantarix Holdings' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      writeMatches: false,
    });
    expect(result).toHaveLength(0);
    expect(mock._inserts).toHaveLength(0);
  });

  it('aggregates across multiple lead fields (multi-field)', async () => {
    const mock = makeMockClient({ sites, branches });
    const result = await findMatches({
      leadId: 'lead-test-7',
      fields: {
        project_owner: 'Lennar',
        prime_contractor: 'Davidson Homes',
        key_subs: ['D.R. Horton Inc. - South Houston'],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      writeMatches: false,
    });
    const names = result.map((m) => m.customer_canonical).sort();
    expect(names).toEqual(['davidson homes', 'dr horton - south houston', 'lennar']);
  });

  it('skips inactive-only matches', async () => {
    const mock = makeMockClient({ sites, branches });
    const result = await findMatches({
      leadId: 'lead-test-8',
      fields: { project_owner: 'Starlight Homes' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      writeMatches: false,
    });
    expect(result).toHaveLength(0);
  });

  it('respects writeMatches=false (no insert)', async () => {
    const mock = makeMockClient({ sites, branches });
    await findMatches({
      leadId: 'lead-test-9',
      fields: { project_owner: 'Lennar' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      writeMatches: false,
    });
    expect(mock._inserts).toHaveLength(0);
  });

  it('flags national_account when branch_count >= threshold', async () => {
    const mock = makeMockClient({ sites, branches });
    const result = await findMatches({
      leadId: 'lead-test-10',
      fields: { project_owner: 'Lennar' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      config: { national_account_threshold: 2 },
      writeMatches: false,
    });
    expect(result[0].national_account).toBe(true);
  });

  it('selects primary_branch by state-of-most-recent-site', async () => {
    const mock = makeMockClient({ sites, branches });
    const result = await findMatches({
      leadId: 'lead-test-11',
      fields: { project_owner: 'Lennar' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      writeMatches: false,
    });
    // Most recent Lennar site is in TX (2026-04-20) at lat=32.8 → nearer to Dallas
    expect(result[0].primary_branch_name).toBe('Dallas');
    expect(result[0].primary_branch_id).toBe('br-dallas');
  });
});
