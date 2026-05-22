// __tests__/adapters/sources-internal.test.ts
//
// Internal onboarding Stage 5 — per-adapter parse + registry tests for
// the six Internal source adapters. Uses fixtures captured live on
// 2026-05-22 (where the upstream is keyless) plus synthetic shapes for
// SAM and the scaffolds.
//
// No real network in tests: every adapter receives an injected fetch
// via the SourcePollOptions.fetch test seam (lib/adapters/sources/types.ts:48-50).

import { describe, it, expect } from 'vitest';
import { SOURCE_ADAPTERS, getSourceAdapter } from '@/lib/adapters/sources';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import internalFixture from '../fixtures/internal-architecture.json';
import samFixture from '../fixtures/adapters/sam-gov-entity.json';
import usaspendingFixture from '../fixtures/adapters/usaspending-recipients.json';
import sosFixture from '../fixtures/adapters/sos-business-registrations.json';
import jobsFixture from '../fixtures/adapters/construction-sales-job-postings.json';

const { _comment: _x, ...internalInput } = internalFixture as unknown as Record<string, unknown>;
const INTERNAL_ARCH = resolveArchitecture(internalInput);

function mockFetchByUrl(map: Record<string, { body: unknown; ok?: boolean; status?: number; isXml?: boolean }>): typeof fetch {
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

describe('SOURCE_ADAPTERS registry — Internal entries', () => {
  it('registers all six Internal source ids', () => {
    expect(getSourceAdapter('sam-gov')).not.toBeNull();
    expect(getSourceAdapter('usaspending')).not.toBeNull();
    expect(getSourceAdapter('custom-construction-sales-job-postings')).not.toBeNull();
    expect(getSourceAdapter('custom-trade-association-directories')).not.toBeNull();
    expect(getSourceAdapter('custom-sos-business-registrations')).not.toBeNull();
    expect(getSourceAdapter('custom-state-contractor-licenses')).not.toBeNull();
  });

  it('every Internal architecture source id resolves to a registered adapter', () => {
    for (const ref of INTERNAL_ARCH.sources) {
      expect(getSourceAdapter(ref.id), `missing adapter for ${ref.id}`).not.toBeNull();
    }
  });

  it('Funder entries are preserved (regression)', () => {
    // Funder must continue to resolve every entry in its architecture.
    expect(getSourceAdapter('custom-propublica-nonprofit-explorer')).not.toBeNull();
    expect(getSourceAdapter('custom-funder-990-filings')).not.toBeNull();
    expect(getSourceAdapter('business-license-issuances')).not.toBeNull();
  });
});

describe('sam-gov adapter', () => {
  it('returns [] when SAM_GOV_API_KEY is not set (blocked-on-credentials)', async () => {
    const adapter = SOURCE_ADAPTERS['sam-gov'];
    const events = await adapter.poll({
      organizationId: '2ff1197b-36f8-4210-aa11-65cf025ad83b',
      organizationSlug: 'internal',
      architecture: INTERNAL_ARCH,
      config: { api_key: '' },
      fetch: mockFetchByUrl({}),
    });
    expect(events).toEqual([]);
  });

  it('normalizes SAM entity records into SourceEvent shape when api_key is provided', async () => {
    const adapter = SOURCE_ADAPTERS['sam-gov'];
    const fetchImpl = mockFetchByUrl({
      'https://api.sam.gov/entity-information/v3/entities': { body: samFixture },
    });
    const events = await adapter.poll({
      organizationId: 'org-internal',
      organizationSlug: 'internal',
      architecture: INTERNAL_ARCH,
      config: { api_key: 'test-key', max_pages: 1 },
      fetch: fetchImpl,
    });
    expect(events.length).toBeGreaterThan(0);
    const first = events[0];
    expect(first.source_event_id).toMatch(/^sam-entity:/);
    expect(first.title).toBe('Sample Construction Services Inc');
    expect(first.state).toBe('TX');
    expect(first.country).toBe('USA');
    expect((first.raw_payload as { primary_naics?: string }).primary_naics).toBe('236220');
    expect((first.raw_payload as { internal_federal_registration?: string }).internal_federal_registration).toBe('sam-registered');
  });

  it('de-dupes the same UEI across NAICS queries', async () => {
    const adapter = SOURCE_ADAPTERS['sam-gov'];
    const fetchImpl = mockFetchByUrl({
      'https://api.sam.gov/entity-information/v3/entities': { body: samFixture },
    });
    const events = await adapter.poll({
      organizationId: 'org-internal',
      organizationSlug: 'internal',
      architecture: INTERNAL_ARCH,
      config: { api_key: 'test-key', max_pages: 1 },
      fetch: fetchImpl,
    });
    const ueis = events.map((e) => e.source_event_id);
    expect(new Set(ueis).size).toBe(ueis.length);
  });
});

describe('usaspending adapter', () => {
  it('normalizes recipient results into SourceEvent shape', async () => {
    const adapter = SOURCE_ADAPTERS['usaspending'];
    const fetchImpl = mockFetchByUrl({
      'https://api.usaspending.gov/api/v2/recipient/duns/': { body: usaspendingFixture },
    });
    const events = await adapter.poll({
      organizationId: 'org-internal',
      organizationSlug: 'internal',
      architecture: INTERNAL_ARCH,
      config: { limit: 3 },
      fetch: fetchImpl,
    });
    expect(events.length).toBeGreaterThan(0);
    const first = events[0];
    expect(first.source_event_id).toMatch(/^usaspending:/);
    expect(first.title.length).toBeGreaterThan(0);
    expect((first.raw_payload as { internal_federal_registration?: string }).internal_federal_registration).toBe('federal-awardee');
    expect(first.country).toBe('USA');
  });
});

describe('construction-sales-job-postings adapter', () => {
  it('filters Greenhouse jobs to sales / BD titles only', async () => {
    const adapter = SOURCE_ADAPTERS['custom-construction-sales-job-postings'];
    const fetchImpl = mockFetchByUrl({
      'https://boards-api.greenhouse.io/v1/boards/fieldwire/jobs': { body: jobsFixture },
      'https://boards-api.greenhouse.io/v1/boards/openspace/jobs': { body: { jobs: [] } },
      'https://boards-api.greenhouse.io/v1/boards/buildkite/jobs': { body: { jobs: [] } },
    });
    const events = await adapter.poll({
      organizationId: 'org-internal',
      organizationSlug: 'internal',
      architecture: INTERNAL_ARCH,
      fetch: fetchImpl,
    });
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      const title = (e.raw_payload as { job_title?: string }).job_title?.toLowerCase() ?? '';
      const deptText = ((e.raw_payload as { departments?: string[] }).departments ?? []).join(' ').toLowerCase();
      const combined = `${title} ${deptText}`;
      expect(/(sales|account exec|business dev|territory|commercial|bdr|sdr|go-to-market|presales|pre-sales|bd )/.test(combined)).toBe(true);
    }
  });

  it('drops jobs without a sales/BD signal', async () => {
    const adapter = SOURCE_ADAPTERS['custom-construction-sales-job-postings'];
    const fetchImpl = mockFetchByUrl({
      'https://boards-api.greenhouse.io/v1/boards/fieldwire/jobs': {
        body: {
          jobs: [
            { id: 1, title: 'Senior Software Engineer', departments: [{ name: 'Engineering' }] },
            { id: 2, title: 'Construction Site Operations Manager', departments: [{ name: 'Operations' }] },
          ],
        },
      },
      'https://boards-api.greenhouse.io/v1/boards/openspace/jobs': { body: { jobs: [] } },
      'https://boards-api.greenhouse.io/v1/boards/buildkite/jobs': { body: { jobs: [] } },
    });
    const events = await adapter.poll({
      organizationId: 'org-internal',
      organizationSlug: 'internal',
      architecture: INTERNAL_ARCH,
      fetch: fetchImpl,
    });
    expect(events).toEqual([]);
  });
});

describe('sos-business-registrations adapter', () => {
  it('normalizes NY SOS construction filings into SourceEvent shape', async () => {
    const adapter = SOURCE_ADAPTERS['custom-sos-business-registrations'];
    const fetchImpl = mockFetchByUrl({
      'https://data.ny.gov/resource/p66s-i79p.json': { body: sosFixture },
    });
    const events = await adapter.poll({
      organizationId: 'org-internal',
      organizationSlug: 'internal',
      architecture: INTERNAL_ARCH,
      fetch: fetchImpl,
    });
    expect(events.length).toBeGreaterThan(0);
    const first = events[0];
    expect(first.source_event_id).toMatch(/^sos:NY:/);
    expect(first.title.toUpperCase()).toContain('CONSTRUCTION');
    expect(first.state).toBe('NY');
    expect(first.country).toBe('USA');
  });

  it('returns [] when portals are explicitly cleared', async () => {
    const adapter = SOURCE_ADAPTERS['custom-sos-business-registrations'];
    const events = await adapter.poll({
      organizationId: 'org-internal',
      organizationSlug: 'internal',
      architecture: INTERNAL_ARCH,
      config: { portals: [] },
    });
    expect(events).toEqual([]);
  });
});

describe('Scaffold adapters return [] without config (blocked-on-credentials)', () => {
  it('state-contractor-licenses returns [] with no portals configured', async () => {
    const events = await SOURCE_ADAPTERS['custom-state-contractor-licenses'].poll({
      organizationId: 'org-internal',
      organizationSlug: 'internal',
      architecture: INTERNAL_ARCH,
    });
    expect(events).toEqual([]);
  });

  it('trade-association-directories returns [] with no directories configured', async () => {
    const events = await SOURCE_ADAPTERS['custom-trade-association-directories'].poll({
      organizationId: 'org-internal',
      organizationSlug: 'internal',
      architecture: INTERNAL_ARCH,
    });
    expect(events).toEqual([]);
  });
});
