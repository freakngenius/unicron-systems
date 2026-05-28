// __tests__/lib/orchestrator/enrich-zedcor.test.ts
//
// Sprint Z3.5 — unit tests for the pure exports of enrich-zedcor.ts.
// The supabase-touching paths (loadEligibleProjectsForRun,
// enrichEligibleProjects) need a real client and are covered by the
// live backfill smoke documented in PR #490.

import { describe, it, expect, afterEach } from 'vitest';
import {
  DEFAULT_ENRICHMENT_CAP_PER_RUN,
  ENRICHMENT_ELIGIBLE_STAGES,
  getEnrichmentCap,
} from '@/lib/orchestrator/enrich-zedcor';

const ORIGINAL = process.env.ZEDCOR_ENRICHMENT_CAP;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ZEDCOR_ENRICHMENT_CAP;
  else process.env.ZEDCOR_ENRICHMENT_CAP = ORIGINAL;
});

describe('DEFAULT_ENRICHMENT_CAP_PER_RUN', () => {
  it('matches the spec §"Soft cap" value of 200', () => {
    expect(DEFAULT_ENRICHMENT_CAP_PER_RUN).toBe(200);
  });
});

describe('ENRICHMENT_ELIGIBLE_STAGES', () => {
  it('matches the spec §"Goal" stage list (orchestrator-run scope; backfill widens to include mobilization)', () => {
    expect(Array.from(ENRICHMENT_ELIGIBLE_STAGES)).toEqual(['awarded', 'gc_selected', 'sub_bid']);
  });
});

describe('getEnrichmentCap', () => {
  it('returns the default when the env var is unset', () => {
    delete process.env.ZEDCOR_ENRICHMENT_CAP;
    expect(getEnrichmentCap()).toBe(DEFAULT_ENRICHMENT_CAP_PER_RUN);
  });

  it('parses a numeric override', () => {
    process.env.ZEDCOR_ENRICHMENT_CAP = '50';
    expect(getEnrichmentCap()).toBe(50);
  });

  it('falls back to the default on a non-numeric value', () => {
    process.env.ZEDCOR_ENRICHMENT_CAP = 'not-a-number';
    expect(getEnrichmentCap()).toBe(DEFAULT_ENRICHMENT_CAP_PER_RUN);
  });

  it('falls back to the default on zero or negative', () => {
    process.env.ZEDCOR_ENRICHMENT_CAP = '0';
    expect(getEnrichmentCap()).toBe(DEFAULT_ENRICHMENT_CAP_PER_RUN);
    process.env.ZEDCOR_ENRICHMENT_CAP = '-5';
    expect(getEnrichmentCap()).toBe(DEFAULT_ENRICHMENT_CAP_PER_RUN);
  });

  it('accepts large overrides without clamping (operators can scale up for backfill-like runs)', () => {
    process.env.ZEDCOR_ENRICHMENT_CAP = '2000';
    expect(getEnrichmentCap()).toBe(2000);
  });
});
