// __tests__/agents/search/plan.test.ts — ICP Saved Search S2.
//
// Sonar is mocked; verifies tier1 deterministic shape, tier2 catalog
// behavior, and tier3 lenient JSON parsing.

import { describe, it, expect, vi } from 'vitest';
import { planSources } from '@/lib/agents/search/plan';
import type { GeoExpansion, SearchArchitecture } from '@/lib/agents/search/types';

function archFixture(overrides: Partial<SearchArchitecture> = {}): SearchArchitecture {
  return {
    vertical: 'test-vertical',
    lead_schema: {},
    scoring_signals: [],
    naics_codes: ['236220', '237310'],
    psc_codes: [],
    keywords: ['site security', 'commercial general contractor'],
    business_summary: {
      lead_type: 'commercial general contractor',
      business_area: 'Texas construction',
      problem_solved: 'pre-bid intel',
      what_they_get: 'a feed',
    },
    ...overrides,
  };
}

function geoFixture(overrides: Partial<GeoExpansion> = {}): GeoExpansion {
  return {
    region: 'Houston, TX',
    radius_mi: 200,
    center: { lat: 29.76, lon: -95.37, label: 'Houston, TX' },
    states: ['TX', 'LA', 'OK'],
    counties: [],
    metros: [],
    bbox: { north: 32, south: 27, east: -91, west: -100 },
    ...overrides,
  };
}

describe('planSources', () => {
  it('emits one sam.gov + one usaspending entry per NAICS, and news_rss entries per keyword', async () => {
    const completeSonar = vi.fn().mockResolvedValue({
      text: '[]',
      citations: [],
      model: 'sonar',
      latencyMs: 100,
    });

    const plan = await planSources(
      { architecture: archFixture(), geo: geoFixture() },
      { completeSonar, now: () => new Date('2026-05-30T12:00:00Z') },
    );

    expect(plan.generated_at).toBe('2026-05-30T12:00:00.000Z');
    const samEntries = plan.tier1.filter((s) => s.kind === 'sam_gov_entity');
    const usaEntries = plan.tier1.filter((s) => s.kind === 'usaspending_recipients');
    const newsEntries = plan.tier1.filter((s) => s.kind === 'news_rss');
    expect(samEntries.length).toBe(2);
    expect(usaEntries.length).toBe(2);
    expect(newsEntries.length).toBe(2);
    expect(samEntries[0]!.params.primaryNaics).toBe('236220');
    expect(samEntries[0]!.params.stateOrProvinceCode).toEqual(['TX', 'LA', 'OK']);
    expect(usaEntries[0]!.params.place_of_performance_state).toEqual(['TX', 'LA', 'OK']);
    expect(newsEntries[0]!.params.query).toContain('Houston, TX');
  });

  it('produces tier2 entries only for states in the catalog', async () => {
    const completeSonar = vi.fn().mockResolvedValue({ text: '[]', citations: [], model: 'sonar', latencyMs: 50 });
    const plan = await planSources(
      { architecture: archFixture(), geo: geoFixture({ states: ['TX', 'CA', 'XX'] }) },
      { completeSonar },
    );
    const ids = plan.tier2.map((s) => s.source_id);
    expect(ids).toEqual(expect.arrayContaining(['state_license:TX', 'state_license:CA']));
    expect(ids).not.toContain('state_license:XX'); // XX has no template
  });

  it('parses tier3 sources from a Sonar JSON array', async () => {
    const completeSonar = vi.fn().mockResolvedValue({
      text: JSON.stringify([
        { name: 'TX Contractors Trade Journal', url: 'https://example.com/feed', why: 'covers TX construction starts' },
        { name: 'Bad source', url: 'not a url' },
        { name: 'Duplicate', url: 'https://example.com/feed', why: 'dup' },
      ]),
      citations: [],
      model: 'sonar',
      latencyMs: 100,
    });

    const plan = await planSources(
      { architecture: archFixture(), geo: geoFixture() },
      { completeSonar },
    );

    expect(plan.tier3.length).toBe(1);
    expect(plan.tier3[0]).toMatchObject({
      candidate: 'TX Contractors Trade Journal',
      url: 'https://example.com/feed',
      discovered_by: 'perplexity',
      auto_attempt: true,
      reason: 'covers TX construction starts',
    });
  });

  it('returns empty tier3 (not throw) when Sonar fails', async () => {
    const completeSonar = vi.fn().mockRejectedValue(new Error('Sonar 503'));
    const plan = await planSources(
      { architecture: archFixture(), geo: geoFixture() },
      { completeSonar },
    );
    expect(plan.tier3).toEqual([]);
    expect(plan.tier1.length).toBeGreaterThan(0); // tier1 still produced
  });

  it('returns empty tier3 (not throw) when Sonar text is unparseable', async () => {
    const completeSonar = vi.fn().mockResolvedValue({
      text: 'I tried but here is some prose instead of JSON.',
      citations: [],
      model: 'sonar',
      latencyMs: 50,
    });
    const plan = await planSources(
      { architecture: archFixture(), geo: geoFixture() },
      { completeSonar },
    );
    expect(plan.tier3).toEqual([]);
  });

  it('still emits the news/RSS tier1 entries when NAICS list is empty (keyword-only profile)', async () => {
    const completeSonar = vi.fn().mockResolvedValue({ text: '[]', citations: [], model: 'sonar', latencyMs: 50 });
    const plan = await planSources(
      { architecture: archFixture({ naics_codes: [] }), geo: geoFixture() },
      { completeSonar },
    );
    expect(plan.tier1.filter((s) => s.kind === 'sam_gov_entity').length).toBe(0);
    expect(plan.tier1.filter((s) => s.kind === 'news_rss').length).toBeGreaterThan(0);
  });
});
