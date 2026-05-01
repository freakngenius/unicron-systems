// Unit tests for the LLM pricing table — Phase 1 G1 Task A5.

import { describe, it, expect } from 'vitest';
import { costUsd, pricingFor } from '@/lib/llm/pricing';

describe('lib/llm/pricing — costUsd', () => {
  it('computes Sonnet 4.6 input + output cost correctly', () => {
    // 1M input + 500K output @ $3 / $15 per MTok
    const cost = costUsd({
      model: 'claude-sonnet-4-6',
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    });
    expect(cost).toBeCloseTo(3.0 + 7.5, 4);
  });

  it('discounts cached input tokens at the cache-read rate', () => {
    // 1M input split 500K full + 500K cached
    // 500K @ $3/MTok input + 500K @ $0.30/MTok cache read = $1.50 + $0.15 = $1.65
    const cost = costUsd({
      model: 'claude-sonnet-4-6',
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedInputTokens: 500_000,
    });
    expect(cost).toBeCloseTo(1.65, 4);
  });

  it('uses fallback pricing for unknown models', () => {
    const fallback = pricingFor('claude-fictional-9');
    const known = pricingFor('claude-sonnet-4-6');
    expect(fallback).toEqual(known);
  });

  it('Sonar pro has different pricing than Sonar small', () => {
    expect(pricingFor('sonar-pro').inputPerMTok).toBeGreaterThan(pricingFor('sonar').inputPerMTok);
  });

  it('returns 0 for zero tokens', () => {
    const cost = costUsd({ model: 'claude-sonnet-4-6', inputTokens: 0, outputTokens: 0 });
    expect(cost).toBe(0);
  });

  it('rounds to 4 decimals (cost_usd column precision)', () => {
    // 1234 input tokens × $3/MTok = 0.003702
    const cost = costUsd({ model: 'claude-sonnet-4-6', inputTokens: 1234, outputTokens: 0 });
    expect(cost).toBe(0.0037);
  });

  it('never returns a negative cost', () => {
    const cost = costUsd({
      model: 'claude-sonnet-4-6',
      inputTokens: 100,
      outputTokens: 0,
      cachedInputTokens: 1_000_000_000, // pathological: more cached than total
    });
    expect(cost).toBeGreaterThanOrEqual(0);
  });
});
