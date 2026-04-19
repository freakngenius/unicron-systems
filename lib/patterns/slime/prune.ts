export interface PruneCandidate {
  id: string;
  score: number;
  /** numeric signal for tie-breaks: e.g. parsed TAM in USD. Higher is better. */
  tiebreak?: number;
}

export interface PruneOutput {
  keep: string[];
  eliminate: string[];
}

/**
 * Keep the top ceil(n/2) candidates by score. On ties, higher `tiebreak`
 * wins. Deterministic.
 */
export function prune<T extends PruneCandidate>(cands: T[]): PruneOutput {
  if (cands.length === 0) return { keep: [], eliminate: [] };
  const sorted = [...cands].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.tiebreak ?? 0) - (a.tiebreak ?? 0);
  });
  const n = sorted.length;
  const keepCount = Math.max(1, Math.ceil(n / 2));
  return {
    keep: sorted.slice(0, keepCount).map((c) => c.id),
    eliminate: sorted.slice(keepCount).map((c) => c.id),
  };
}

/** Double resource share for survivors each cycle. */
export function nextResourceShare(currentShare: number): number {
  return currentShare * 2;
}

/** Parse a TAM string like "14.6B" / "3-5T" / "850M" into USD number. */
export function parseTam(tam: string): number {
  if (!tam) return 0;
  const range = tam.match(/([\d.]+)\s*-\s*([\d.]+)\s*([MBTK]?)/i);
  const single = tam.match(/([\d.]+)\s*([MBTK]?)/i);
  const suffixMult = (s: string) =>
    s.toUpperCase() === "T" ? 1e12 : s.toUpperCase() === "B" ? 1e9 : s.toUpperCase() === "M" ? 1e6 : s.toUpperCase() === "K" ? 1e3 : 1;
  if (range) {
    const lo = parseFloat(range[1]!) * suffixMult(range[3] ?? "");
    const hi = parseFloat(range[2]!) * suffixMult(range[3] ?? "");
    return (lo + hi) / 2;
  }
  if (single) {
    return parseFloat(single[1]!) * suffixMult(single[2] ?? "");
  }
  return 0;
}
