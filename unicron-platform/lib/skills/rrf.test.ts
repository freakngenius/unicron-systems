// lib/skills/rrf.test.ts — Sprint 9 Stream B
// Deterministic unit tests for the RRF scorer.

import { describe, it, expect } from 'vitest';
import { reciprocalRankFuse } from './rrf';

describe('reciprocalRankFuse', () => {
  it('combines two lists and ranks shared ids highest', () => {
    const out = reciprocalRankFuse({
      fts: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      vector: [{ id: 'B' }, { id: 'A' }, { id: 'D' }],
    });
    // B is rank 2 FTS + rank 1 vector, A is rank 1 FTS + rank 2 vector.
    // Same total contribution; FTS tie-break ranks A higher (FTS rank 1).
    expect(out[0].id).toBe('A');
    expect(out[1].id).toBe('B');
    // Both should outrank singleton C (FTS-only rank 3) and D (vector-only rank 3).
    const ids = out.map((r) => r.id);
    expect(ids.indexOf('C')).toBeGreaterThan(1);
    expect(ids.indexOf('D')).toBeGreaterThan(1);
  });

  it('returns deterministic scores with default k=60', () => {
    const out = reciprocalRankFuse({
      fts: [{ id: 'A' }],
      vector: [{ id: 'A' }],
    });
    // rank 1 in each list → 2 * (1 / (60 + 1)) = 2/61
    expect(out).toHaveLength(1);
    expect(out[0].rrf_score).toBeCloseTo(2 / 61, 10);
    expect(out[0].fts_rank).toBe(1);
    expect(out[0].vector_rank).toBe(1);
  });

  it('preserves rank metadata for items present in only one list', () => {
    const out = reciprocalRankFuse({
      fts: [{ id: 'X' }],
      vector: [{ id: 'Y' }],
    });
    const xs = out.find((r) => r.id === 'X');
    const ys = out.find((r) => r.id === 'Y');
    expect(xs?.fts_rank).toBe(1);
    expect(xs?.vector_rank).toBeNull();
    expect(ys?.vector_rank).toBe(1);
    expect(ys?.fts_rank).toBeNull();
  });

  it('respects custom k constant', () => {
    const k = 10;
    const out = reciprocalRankFuse({
      fts: [{ id: 'A' }],
      vector: [],
      k,
    });
    expect(out[0].rrf_score).toBeCloseTo(1 / (k + 1), 10);
  });

  it('rejects non-positive k', () => {
    expect(() =>
      reciprocalRankFuse({ fts: [{ id: 'A' }], vector: [], k: 0 }),
    ).toThrow(/positive/);
    expect(() =>
      reciprocalRankFuse({ fts: [{ id: 'A' }], vector: [], k: -1 }),
    ).toThrow(/positive/);
  });

  it('returns empty array for empty inputs', () => {
    expect(reciprocalRankFuse({ fts: [], vector: [] })).toEqual([]);
  });

  it('handles realistic 20-item lists with a single shared top hit', () => {
    // 20 FTS results, 20 vector results, only one id present in both:
    // verify it ranks at #1 in the fused output.
    const fts = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}` }));
    const vector = Array.from({ length: 20 }, (_, i) => ({ id: `v${i}` }));
    fts[3] = { id: 'shared' };
    vector[2] = { id: 'shared' };
    const out = reciprocalRankFuse({ fts, vector });
    expect(out[0].id).toBe('shared');
    // Score for shared: 1/(60+4) + 1/(60+3)
    expect(out[0].rrf_score).toBeCloseTo(1 / 64 + 1 / 63, 10);
  });
});
