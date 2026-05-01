// __tests__/coverage-expansion/discover.test.ts — Phase 2 Stream E, Gate E2.
import { describe, expect, it } from 'vitest';
import { discoverFromRegistry } from '@/services/coverage-expansion/tools/discover-candidates';

describe('discoverFromRegistry', () => {
  it('returns CA permit candidates when constraints match', () => {
    const out = discoverFromRegistry({ geography: ['CA'], source_types: ['permits'] });
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.every((c) => c.estimated_tier === 1)).toBe(true);
    expect(out.every((c) => c.candidate_type === 'socrata')).toBe(true);
  });

  it('returns federal procurement candidates', () => {
    const out = discoverFromRegistry({ geography: ['federal'], source_types: ['rfp', 'awards'] });
    expect(out.some((c) => c.candidate_url.includes('sam.gov'))).toBe(true);
    expect(out.some((c) => c.candidate_url.includes('usaspending'))).toBe(true);
  });

  it('returns empty for unsupported jurisdiction', () => {
    const out = discoverFromRegistry({ geography: ['XX'], source_types: ['permits'] });
    expect(out).toHaveLength(0);
  });

  it('respects no constraint = include everything', () => {
    const out = discoverFromRegistry({});
    expect(out.length).toBeGreaterThan(5);
  });
});
