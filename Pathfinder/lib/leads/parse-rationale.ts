// lib/leads/parse-rationale.ts — Demo Polish UX Gate 7A.
//
// Splits a project's free-form `rationale` string into structured buckets the
// redesigned lead detail page renders into Recommended Action (Section 5) +
// Project Story → "Why this lead" (Section 6 — fit / market / geography).
//
// Gate 7A scope: stub. Always returns `fallback: true` with the original
// rationale text in `monolithic`. Gate 7B implements the actual extraction
// (heuristic + structured-output retry).
//
// The contract is stable: callers can render `parsed.monolithic` when
// `parsed.fallback === true` and progressively use the structured fields once
// 7B lands. parse-rationale never throws — input nulls return a `fallback`
// shape with `monolithic === null`.

export interface ParsedRationale {
  /** True when extraction failed or wasn't attempted; render `monolithic`. */
  fallback: boolean;
  /** Original rationale text (or null if input was null). */
  monolithic: string | null;
  /** Recommended-action sentence (1-2 sentences). 7B will populate. */
  action: string | null;
  /** Buying contact name + role + suggested channel. 7B will populate. */
  buyingContact: string | null;
  /** Timing pressure (e.g. "21 days until bid window closes"). 7B will populate. */
  timingPressure: string | null;
  /** Fit-with-product-mix sentence. 7B will populate. */
  fitWithProductMix: string | null;
  /** Market-signal-strength sentence. 7B will populate. */
  marketSignalStrength: string | null;
  /** Geographic-fit sentence (references nearest branch + distance). 7B will populate. */
  geographicFit: string | null;
}

/**
 * Parse a project rationale string into structured action / fit / timing
 * buckets. Stub for Gate 7A — always returns fallback shape.
 *
 * @param rationale - Project.rationale (may be null)
 * @returns ParsedRationale with `fallback: true` and `monolithic` populated
 */
export function parseRationale(rationale: string | null | undefined): ParsedRationale {
  return {
    fallback: true,
    monolithic: rationale ?? null,
    action: null,
    buyingContact: null,
    timingPressure: null,
    fitWithProductMix: null,
    marketSignalStrength: null,
    geographicFit: null,
  };
}
