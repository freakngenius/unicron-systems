// lib/skills/rrf.ts — Sprint 9 Stream B
//
// Reciprocal Rank Fusion scorer for hybrid FTS+vector Skill search.
// Per Addendum 5 §7: embed query → top-K 20 ivfflat against `embedding`,
// run FTS top-K 20 against `fts`, fuse the two ranked lists.
//
// RRF formula: score(d) = Σ over ranked lists L of  1 / (k + rank_L(d))
// where rank is 1-indexed, k=60 is the standard Cormack et al. constant.
//
// The scorer is pure: deterministic given the input rank lists. Used by
// /api/skills/search and by the unit test in rrf.test.ts.

export interface RankedItem {
  /** Stable identifier for the underlying row (Skill id). */
  id: string;
}

export interface RrfInput {
  /** FTS-ranked list, best match at index 0. */
  fts: RankedItem[];
  /** Vector-ranked list, best match at index 0. */
  vector: RankedItem[];
  /** RRF constant. Default 60 per Cormack et al. */
  k?: number;
}

export interface RrfResult {
  id: string;
  /** Fused RRF score. Higher is better. */
  rrf_score: number;
  /** 1-indexed rank in the FTS list; null if absent. */
  fts_rank: number | null;
  /** 1-indexed rank in the vector list; null if absent. */
  vector_rank: number | null;
}

/**
 * Reciprocal-Rank-Fuse two ranked lists. Returns one row per unique id,
 * sorted by descending RRF score. Stable: ties broken by FTS rank then
 * vector rank.
 */
export function reciprocalRankFuse(input: RrfInput): RrfResult[] {
  const k = input.k ?? 60;
  if (k <= 0) {
    throw new Error('RRF constant k must be positive');
  }

  const byId = new Map<string, RrfResult>();

  input.fts.forEach((item, idx) => {
    const rank = idx + 1;
    const contribution = 1 / (k + rank);
    const existing = byId.get(item.id);
    if (existing) {
      existing.rrf_score += contribution;
      existing.fts_rank = rank;
    } else {
      byId.set(item.id, {
        id: item.id,
        rrf_score: contribution,
        fts_rank: rank,
        vector_rank: null,
      });
    }
  });

  input.vector.forEach((item, idx) => {
    const rank = idx + 1;
    const contribution = 1 / (k + rank);
    const existing = byId.get(item.id);
    if (existing) {
      existing.rrf_score += contribution;
      existing.vector_rank = rank;
    } else {
      byId.set(item.id, {
        id: item.id,
        rrf_score: contribution,
        fts_rank: null,
        vector_rank: rank,
      });
    }
  });

  const fused = [...byId.values()];
  fused.sort((a, b) => {
    if (b.rrf_score !== a.rrf_score) return b.rrf_score - a.rrf_score;
    // Tie break: lower (better) FTS rank wins, then lower vector rank.
    const aFts = a.fts_rank ?? Number.POSITIVE_INFINITY;
    const bFts = b.fts_rank ?? Number.POSITIVE_INFINITY;
    if (aFts !== bFts) return aFts - bFts;
    const aVec = a.vector_rank ?? Number.POSITIVE_INFINITY;
    const bVec = b.vector_rank ?? Number.POSITIVE_INFINITY;
    return aVec - bVec;
  });
  return fused;
}
