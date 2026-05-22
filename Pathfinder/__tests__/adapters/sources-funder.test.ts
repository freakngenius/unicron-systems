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
    const ids = Object.keys(SOURCE_ADAPTERS).sort();
    expect(ids).toEqual([
      'business-license-issuances',
      'custom-accelerator-cohort-pages',
      'custom-ea-forum-rss',
      'custom-funder-990-filings',
      'custom-irs-exempt-org-filings',
      'custom-philanthropy-trade-press-rss',
      'custom-propublica-nonprofit-explorer',
    ]);
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
  it('filters out determinations outside the 3-year recency window', async () => {
    const adapter = SOURCE_ADAPTERS['custom-irs-exempt-org-filings'];
    const currentYear = new Date().getUTCFullYear();
    const fetchImpl = mockFetchByUrl({
      'https://apps.irs.gov/app/eos/api/Search': {
        body: {
          totalResults: 2,
          searchResults: [
            { EIN: '111111111', Name: 'Fresh Org', RulingYear: String(currentYear), RulingMonth: '6', StateAbbreviation: 'MA' },
            { EIN: '222222222', Name: 'Old Org', RulingYear: String(currentYear - 10), RulingMonth: '1', StateAbbreviation: 'NV' },
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
    const eins = events.map((e) => (e.raw_payload as { EIN?: string }).EIN);
    expect(eins).toContain('111111111');
    expect(eins).not.toContain('222222222');
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
