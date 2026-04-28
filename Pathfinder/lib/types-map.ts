// Tiny re-export for the Google Maps style spec so we can keep the dark style
// JSON typed without depending on the Google Maps SDK at build time. The actual
// google.maps.MapTypeStyle type is loaded at runtime by @vis.gl/react-google-maps.

export type MapStyleSpec = Array<{
  featureType?: string;
  elementType?: string;
  stylers?: Array<Record<string, string | number | boolean>>;
}>;

// Pin tier colors (per build brief).
export const TIER_COLORS = {
  /** New (recently ingested, < 24h) */
  mint: '#3DDC97',
  /** High-priority (score >= 80) */
  amber: '#FFB454',
  /** Branch markers */
  cobalt: '#5B7FFF',
  /** Cross-pollination warm-intros */
  magenta: '#E879F9',
  /** Low-signal (score < 60) */
  gray: '#9AA3B2',
} as const;

export type TierKey = keyof typeof TIER_COLORS;

export interface ProjectTier {
  /** True if `ingested_at` is within the last 24h. */
  isNew: boolean;
  /** True if score >= 80. */
  isHi: boolean;
  /** True if score < 60 (or null). */
  isLow: boolean;
  /** True if `warm_for_customer_id` is set. */
  isWarm: boolean;
  /** Resolved tint color for the pin (highest-priority tier wins: warm > hi > new > gray). */
  color: string;
}

export function projectTier(p: {
  score: number | null;
  ingested_at: string;
  warm_for_customer_id: string | null;
}): ProjectTier {
  const isWarm = !!p.warm_for_customer_id;
  const isHi = (p.score ?? 0) >= 80;
  const isLow = (p.score ?? 0) < 60;
  const ingestedMs = Date.parse(p.ingested_at);
  const isNew = Number.isFinite(ingestedMs) && Date.now() - ingestedMs < 24 * 60 * 60 * 1000;
  // Color precedence: warm-intro overrides everything (cross-pol view), then hi, then new, then gray.
  const color = isWarm
    ? TIER_COLORS.magenta
    : isHi
      ? TIER_COLORS.amber
      : isNew
        ? TIER_COLORS.mint
        : TIER_COLORS.gray;
  return { isNew, isHi, isLow, isWarm, color };
}
