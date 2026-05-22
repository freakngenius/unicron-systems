// __tests__/adapters/sources-funder.test.ts
// Funder onboarding Stage 3 — adapter parse + registry tests.
// Uses injected fetch fixtures; no real network.

import { describe, it, expect } from 'vitest';
import { SOURCE_ADAPTERS, getSourceAdapter } from '@/lib/adapters/sources';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import funderFixture from '../fixtures/funder-architecture.json';

const { _comment: _x, ...funderInput } = funderFixture as unknown as Record<string, unknown>;
const FUNDER_ARCH = resolveArchitecture(funderInput);

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number; isXml?: boolean } = {}): typeof fetch {
  const ok = init.ok ?? true;
  const status = init.status ?? 200;
  return (async () => {
    return {
      ok,
      status,
      text: async () => (init.isXml ? (body as string) : JSON.stringify(body)),
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

function mockFetchByUrl(map: Record<string, { body: unknown; isXml?: boolean; ok?: boolean; status?: number }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const match = Object.entries(map).find(([prefix]) => urlStr.startsWith(prefix));
    if (!match) {
      return { ok: false, status: 404, text: async () => 'no fixture', json: async () => ({}) } as Response;
    }
    const [, init] = match;
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      text: async () => (init.isXml ? String(init.body) : JSON.stringify(init.body)),
      json: async () => init.body,
    } as Response;
  }) as unknown as typeof fetch;
}

describe('SOURCE_ADAPTERS registry', () => {
  it('registers all 7 Funder source ids', () => {
    // Internal onboarding Stage 5 added six Internal adapters additively.
    // This regression check verifies the seven Funder ids are still
    // present (subset check, not equality, so future per-org additions
    // do not destabilize the suite). The Internal-side registry coverage
    // lives in __tests__/adapters/sources-internal.test.ts.
    const ids = new Set(Object.keys(SOURCE_ADAPTERS));
    const funderIds = [
      'business-license-issuances',
      'custom-accelerator-cohort-pages',
      'custom-ea-forum-rss',
      'custom-funder-990-filings',
      'custom-irs-exempt-org-filings',
      'custom-philanthropy-trade-press-rss',
      'custom-propublica-nonprofit-explorer',
    ];
    for (const id of funderIds) {
      expect(ids.has(id), `Funder adapter id missing from registry: ${id}`).toBe(true);
    }
  });

  it('every Funder architecture source id resolves to a registered adapter', () => {
    for (const ref of FUNDER_ARCH.sources) {
      expect(getSourceAdapter(ref.id), `missing adapter for ${ref.id}`).not.toBeNull();
    }
  });

  it('getSourceAdapter returns null for unknown ids (forward-compat)', () => {
    expect(getSourceAdapter('does-not-exist')).toBeNull();
  });
});

describe('ProPublica adapter', () => {
  it('normalizes ProPublica search hits into SourceEvent shape', async () => {
    const adapter = SOURCE_ADAPTERS['custom-propublica-nonprofit-explorer'];
    const fetchImpl = mockFetchByUrl({
      'https://projects.propublica.org/nonprofits/api/v2/search.json': {
        body: {
          total_results: 1,
          organizations: [
            {
              ein: 123456789,
              strein: '12-3456789',
              name: 'Test AI Safety Foundation',
              sub_name: null,
              city: 'San Francisco',
              state: 'CA',
              ntee_code: 'V20',
              raw_ntee_code: 'V20',
              have_filings: true,
              score: 0.94,
            },
          ],
        },
      },
    });
    const events = await adapter.poll({
      organizationId: 'org-1',
      organizationSlug: 'funder',
      architecture: FUNDER_ARCH,
      fetch: fetchImpl,
    });
    expect(events.length).toBeGreaterThan(0);
    const first = events[0];
    expect(first.source_event_id).toBe('propublica:123456789');
    expect(first.title).toBe('Test AI Safety Foundation');
    expect(first.state).toBe('CA');
    expect(first.country).toBe('USA');
    expect((first.raw_payload as { thesis_match?: string }).thesis_match).toBeTruthy();
  });

  it('de-dupes the same EIN across thesis queries', async () => {
    const adapter = SOURCE_ADAPTERS['custom-propublica-nonprofit-explorer'];
    const fetchImpl = mockFetchByUrl({
      'https://projects.propublica.org/nonprofits/api/v2/search.json': {
        body: {
          total_results: 1,
          organizations: [{ ein: 999, name: 'Multi-Match Org', state: 'NY' }],
        },
      },
    });
    const events = await adapter.poll({
      organizationId: 'org-1',
      organizationSlug: 'funder',
      architecture: FUNDER_ARCH,
      fetch: fetchImpl,
    });
    const eins = events.map((e) => e.source_event_id);
    expect(new Set(eins).size).toBe(eins.length); // all unique
  });
});

describe('EA Forum RSS adapter', () => {
  const SAMPLE_RSS = `<?xml version="1.0"?>
  <rss><channel>
    <item>
      <title>Announcing the Survival and Flourishing Fund</title>
      <link>https://forum.effectivealtruism.org/posts/x123</link>
      <guid>x123</guid>
      <pubDate>${new Date(Date.now() - 86_400_000).toUTCString()}</pubDate>
      <description>SFF granted $4M this round to AI safety projects.</description>
      <dc:creator>Andrew Critch</dc:creator>
    </item>
    <item>
      <title>Old post outside lookback window</title>
      <link>https://forum.effectivealtruism.org/posts/old</link>
      <guid>old</guid>
      <pubDate>${new Date(Date.now() - 86_400_000 * 60).toUTCString()}</pubDate>
      <description>Stale.</description>
    </item>
  </channel></rss>`;

  it('parses RSS items and filters by lookback window', async () => {
    const adapter = SOURCE_ADAPTERS['custom-ea-forum-rss'];
    const fetchImpl = mockFetchOnce(SAMPLE_RSS, { isXml: true });
    const events = await adapter.poll({
      organizationId: 'org-1',
      organizationSlug: 'funder',
      architecture: FUNDER_ARCH,
      fetch: fetchImpl,
      lookbackSeconds: 86_400 * 7, // 7 days
    });
    expect(events.length).toBe(1);
    expect(events[0].title).toBe('Announcing the Survival and Flourishing Fund');
    expect(events[0].source_event_id).toBe('ea-forum:x123');
  });
});

describe('IRS exempt-org filings adapter', () => {
  // 2026-05-22 post-merge: IRS TEOS spot search (apps.irs.gov/app/eos/api/Search)
  // is bot-gated and returns HTTP 403 to non-browser clients. Adapter switched
  // to bulk BMF CSV mode; tests cover that path now. Empty config returns []
  // and adapter type is 'pending'.

  function csvFetch(csv: string): typeof fetch {
    return (async () => ({
      ok: true,
      status: 200,
      text: async () => csv,
      json: async () => ({}),
    } as Response)) as unknown as typeof fetch;
  }

  it('returns [] when bulk_url is not configured (pending mode)', async () => {
    const adapter = SOURCE_ADAPTERS['custom-irs-exempt-org-filings'];
    const events = await adapter.poll({
      organizationId: 'org-1',
      organizationSlug: 'funder',
      architecture: FUNDER_ARCH,
      fetch: csvFetch(''), // not called
    });
    expect(events).toEqual([]);
  });

  it('parses BMF CSV rows and filters by 501(c)(3) subsection + recency', async () => {
    const adapter = SOURCE_ADAPTERS['custom-irs-exempt-org-filings'];
    const currentYear = new Date().getUTCFullYear();
    // BMF column 8 is SUBSECTION (03 = 501(c)(3)); column 11 is RULING yyyymm.
    // Build minimal CSV with header + three rows: fresh 501(c)(3), old 501(c)(3),
    // fresh non-501(c)(3). Pad to 28 columns (NTEE_CD at col 26).
    function row(ein: string, name: string, city: string, state: string, subsection: string, ruling: string, ntee: string): string {
      const cols = new Array(28).fill('');
      cols[0] = ein;
      cols[1] = name;
      cols[4] = city;
      cols[5] = state;
      cols[8] = subsection;
      cols[11] = ruling;
      cols[26] = ntee;
      return cols.join(',');
    }
    const csv = [
      'EIN,NAME,ICO,STREET,CITY,STATE,ZIP,GROUP,SUBSECTION,AFFILIATION,CLASSIFICATION,RULING,DEDUCTIBILITY,FOUNDATION,ACTIVITY,ORGANIZATION,STATUS,TAX_PERIOD,ASSET_CD,INCOME_CD,FILING_REQ_CD,PF_FILING_REQ_CD,ACCT_PD,ASSET_AMT,INCOME_AMT,REVENUE_AMT,NTEE_CD,SORT_NAME',
      row('111111111', 'Fresh AI Safety Inc', 'Berkeley', 'CA', '03', `${currentYear}06`, 'V99'),
      row('222222222', 'Old Foundation', 'Boston', 'MA', '03', `${currentYear - 10}01`, 'V20'),
      row('333333333', 'Trade Group', 'NYC', 'NY', '06', `${currentYear}03`, 'W99'),
    ].join('\n');
    const events = await adapter.poll({
      organizationId: 'org-1',
      organizationSlug: 'funder',
      architecture: FUNDER_ARCH,
      fetch: csvFetch(csv),
      config: { bulk_url: 'https://www.irs.gov/pub/irs-soi/eo1.csv' },
    });
    const eins = events.map((e) => (e.raw_payload as { ein?: string }).ein);
    expect(eins).toContain('111111111');
    expect(eins).not.toContain('222222222'); // outside 3-year recency window
    expect(eins).not.toContain('333333333'); // not 501(c)(3)
  });
});

describe('Pending-and-tier-2 adapters return empty without config', () => {
  it('accelerator-cohort-pages returns [] with no portals configured', async () => {
    const events = await SOURCE_ADAPTERS['custom-accelerator-cohort-pages'].poll({
      organizationId: 'org-1',
      organizationSlug: 'funder',
      architecture: FUNDER_ARCH,
    });
    expect(events).toEqual([]);
  });

  it('business-license-issuances returns [] with no portals configured', async () => {
    const events = await SOURCE_ADAPTERS['business-license-issuances'].poll({
      organizationId: 'org-1',
      organizationSlug: 'funder',
      architecture: FUNDER_ARCH,
    });
    expect(events).toEqual([]);
  });
});
