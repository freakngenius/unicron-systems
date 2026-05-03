// tests/parse-rationale.test.ts — Demo Polish UX Gate 7A.
//
// parse-rationale is the contract between LeadDetail's RecommendedAction +
// ProjectStory sections and the rationale text. Gate 7A ships the stub
// (always fallback); Gate 7B replaces the implementation but must keep this
// shape stable.

import { describe, it, expect } from 'vitest';

import { parseRationale } from '@/lib/leads/parse-rationale';

describe('parseRationale (Gate 7A stub)', () => {
  it('returns fallback shape with monolithic populated for non-null input', () => {
    const text = 'Call TxDOT this week. Strong fit for the I-45 corridor.';
    const result = parseRationale(text);
    expect(result.fallback).toBe(true);
    expect(result.monolithic).toBe(text);
    // 7A stub does not extract — all structured fields null.
    expect(result.action).toBeNull();
    expect(result.buyingContact).toBeNull();
    expect(result.timingPressure).toBeNull();
    expect(result.fitWithProductMix).toBeNull();
    expect(result.marketSignalStrength).toBeNull();
    expect(result.geographicFit).toBeNull();
  });

  it('handles null input without throwing', () => {
    const result = parseRationale(null);
    expect(result.fallback).toBe(true);
    expect(result.monolithic).toBeNull();
    expect(result.action).toBeNull();
  });

  it('handles undefined input without throwing', () => {
    const result = parseRationale(undefined);
    expect(result.fallback).toBe(true);
    expect(result.monolithic).toBeNull();
  });

  it('handles empty string input by returning empty monolithic', () => {
    const result = parseRationale('');
    expect(result.fallback).toBe(true);
    // Empty string is preserved as-is, distinct from null.
    expect(result.monolithic).toBe('');
  });
});
