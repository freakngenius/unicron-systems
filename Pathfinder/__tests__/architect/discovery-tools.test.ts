// __tests__/architect/discovery-tools.test.ts — Phase 2 Stream D Gate D3.
// Spec: SPEC - Architect Agent.md §5.

import { describe, expect, it } from 'vitest';
import {
  analyzeSourceMentionsTool,
  estimateImpactTool,
  searchOpenDataPortalsTool,
} from '@/services/architect/tools/discovery';

async function call(tool: { handler: (i: Record<string, unknown>) => unknown | Promise<unknown> }, input: Record<string, unknown>) {
  return await tool.handler(input);
}

describe('analyzeSourceMentions', () => {
  const signals = [
    ...Array.from({ length: 15 }, (_, i) => ({
      project_id: `p-trv-${i}`,
      source: 'news',
      title: `Travis County Austin TX project ${i}`,
      summary: 'permit issued',
      raw_payload: null,
      lat: null,
      lon: null,
      score: 90,
      verified: true,
      ingested_at: '2026-04-25T00:00:00Z',
    })),
    ...Array.from({ length: 80 }, (_, i) => ({
      project_id: `p-other-${i}`,
      source: 'news',
      title: `Random other county project ${i}`,
      summary: 'unrelated',
      raw_payload: null,
      lat: null,
      lon: null,
      score: 90,
      verified: true,
      ingested_at: '2026-04-25T00:00:00Z',
    })),
  ];

  it('flags travis county candidates above 15% gate when not watched', async () => {
    const out = (await call(analyzeSourceMentionsTool, {
      signals,
      currently_watched_source_types: ['usaspending', 'sam.gov', 'harris-county-permits'],
    })) as {
      candidates: { candidate_jurisdiction: string; meets_15pct_gate: boolean; is_currently_watched: boolean }[];
      candidates_above_gate: unknown[];
    };
    const travis = out.candidates.find((c) => c.candidate_jurisdiction === 'TX-Travis');
    expect(travis).toBeTruthy();
    expect(travis?.meets_15pct_gate).toBe(true);
    expect(travis?.is_currently_watched).toBe(false);
    expect(out.candidates_above_gate.length).toBeGreaterThan(0);
  });

  it('marks already-watched jurisdictions', async () => {
    const harrisSignals = Array.from({ length: 20 }, (_, i) => ({
      project_id: `p-${i}`,
      source: 'news',
      title: `Harris County Houston project ${i}`,
      summary: '',
      raw_payload: null,
      lat: null,
      lon: null,
      score: 90,
      verified: true,
      ingested_at: '',
    }));
    const out = (await call(analyzeSourceMentionsTool, {
      signals: harrisSignals,
      currently_watched_source_types: ['harris-county-permits'],
    })) as {
      candidates_above_gate: { candidate_jurisdiction: string }[];
      candidates: { candidate_jurisdiction: string; is_currently_watched: boolean }[];
    };
    const harris = out.candidates.find((c) => c.candidate_jurisdiction === 'TX-Harris');
    expect(harris?.is_currently_watched).toBe(true);
    expect(
      out.candidates_above_gate.find((c) => c.candidate_jurisdiction === 'TX-Harris'),
    ).toBeUndefined();
  });

  it('returns empty for signals with no matching jurisdictions', async () => {
    const out = (await call(analyzeSourceMentionsTool, {
      signals: [{ project_id: 'p1', source: 'news', title: 'random nonsense xyz', summary: '', raw_payload: null, lat: null, lon: null, score: 90, verified: true, ingested_at: '' }],
    })) as { candidates: unknown[] };
    expect(out.candidates).toEqual([]);
  });
});

describe('searchOpenDataPortals', () => {
  it('finds Austin Travis County portal', async () => {
    const out = (await call(searchOpenDataPortalsTool, { jurisdiction: 'TX-Travis' })) as {
      count: number;
      portals: { url: string }[];
    };
    expect(out.count).toBe(1);
    expect(out.portals[0].url).toMatch(/austintexas\.gov/);
  });

  it('returns empty for unknown jurisdiction', async () => {
    const out = (await call(searchOpenDataPortalsTool, { jurisdiction: 'XX-Nowhere' })) as {
      count: number;
    };
    expect(out.count).toBe(0);
  });

  it('matches alternate jurisdiction tokens', async () => {
    const out1 = (await call(searchOpenDataPortalsTool, { jurisdiction: 'Austin' })) as { count: number };
    expect(out1.count).toBe(1);
    const out2 = (await call(searchOpenDataPortalsTool, { jurisdiction: 'Miami-Dade' })) as { count: number };
    expect(out2.count).toBe(1);
  });
});

describe('estimateImpact', () => {
  it('flags meets_2_per_day_gate when lift >= 2', async () => {
    const out = (await call(estimateImpactTool, {
      candidate_jurisdiction: 'TX-Travis',
      reference_rate: 0.2,
      current_daily_qualified: 30,
      sample_size: 200,
      candidate_qualified_rate: 0.12,
      candidate_daily_events: 40,
    })) as { meets_2_per_day_gate: boolean; lift_per_day: number; confidence: string };
    expect(out.lift_per_day).toBeGreaterThanOrEqual(2);
    expect(out.meets_2_per_day_gate).toBe(true);
  });

  it('takes the conservative (smaller) of two lift methods', async () => {
    const out = (await call(estimateImpactTool, {
      candidate_jurisdiction: 'X',
      reference_rate: 0.5,
      current_daily_qualified: 100,                 // method-A lift = 50
      sample_size: 200,
      candidate_qualified_rate: 0.05,
      candidate_daily_events: 20,                   // method-B lift = 1
    })) as { lift_per_day: number; reference_lift: number; catalog_lift: number };
    expect(out.lift_per_day).toBe(out.catalog_lift); // smaller of the two
    expect(out.reference_lift).toBeGreaterThan(out.catalog_lift);
  });

  it('downgrades confidence with small sample size', async () => {
    const out = (await call(estimateImpactTool, {
      candidate_jurisdiction: 'X',
      reference_rate: 0.5,
      current_daily_qualified: 30,
      sample_size: 5,
      candidate_qualified_rate: 0.15,
      candidate_daily_events: 50,
    })) as { confidence: string };
    expect(out.confidence).toBe('low');
  });
});
