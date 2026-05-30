// lib/catalog/modules/analytics-charts/charts.ts, Stream B Dashboard.
//
// Pure data shapers for Module 4. Kept dependency-free so the unit tests
// run without booting Supabase or React. The renderer composes the shaped
// series into the bar and line; per the spec, an empty series triggers
// the designed EmptyState, never a broken chart.

export interface ServiceCategoryPoint {
  slug: string;
  count: number;
}

/**
 * Count projects by service_category. Reads
 * raw_payload.internal_enrichment.service_category with fallback to
 * raw_payload.internal_inferred_service_category (the qualifier-time
 * signal). Rows without a resolvable category are dropped rather than
 * bucketed as "unknown" so the chart never lies about coverage.
 */
export function byServiceCategory(rows: ReadonlyArray<{ raw_payload?: Record<string, unknown> | null }>): ServiceCategoryPoint[] {
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const payload = row.raw_payload ?? null;
    if (!payload) continue;
    const enr = payload.internal_enrichment as Record<string, unknown> | undefined;
    const enrCat = typeof enr?.service_category === 'string' ? (enr.service_category as string) : null;
    const inferred = typeof payload.internal_inferred_service_category === 'string'
      ? (payload.internal_inferred_service_category as string)
      : null;
    const slug = enrCat ?? inferred;
    if (!slug) continue;
    buckets.set(slug, (buckets.get(slug) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

export interface VerifiedDayPoint {
  date: string; // YYYY-MM-DD (UTC)
  count: number;
}

export interface VerifiedOverTimeOpts {
  /** Reference "now" (UTC) for the window. Defaults to new Date(). */
  now?: Date;
  /** Lookback window in days. Defaults to 14. */
  days?: number;
}

/**
 * Bucket verified rows by UTC day inside a fixed lookback window. Returns
 * one entry per day in the window even when there are zero verifications
 * that day; the chart needs a continuous axis. Rows with null or
 * unparseable ranked_at are ignored rather than dropped onto an arbitrary
 * bucket.
 */
export function verifiedOverTime(
  rows: ReadonlyArray<{ ranked_at?: string | null }>,
  opts: VerifiedOverTimeOpts = {},
): VerifiedDayPoint[] {
  const days = opts.days ?? 14;
  const now = opts.now ?? new Date();
  const startUtc = startOfUtcDay(now);
  const window: VerifiedDayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(startUtc.getTime() - i * 86_400_000);
    window.push({ date: formatUtcDay(d), count: 0 });
  }
  const idx = new Map<string, VerifiedDayPoint>();
  for (const p of window) idx.set(p.date, p);
  for (const row of rows) {
    const raw = row.ranked_at;
    if (!raw) continue;
    const t = new Date(raw);
    if (Number.isNaN(t.getTime())) continue;
    const key = formatUtcDay(t);
    const point = idx.get(key);
    if (point) point.count += 1;
  }
  return window;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function formatUtcDay(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
