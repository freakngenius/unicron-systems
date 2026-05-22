// lib/metrics/chartQueries.ts
//
// Org-scoped chart data resolvers consumed by the [slug] dashboard's
// ChartGrid. Each ui_plan.charts entry has a metric_id; this module
// owns the per-metric_id query that turns raw `pathfinder.projects`
// rows into a small [{ label, value }] series the renderer draws.
//
// Adding a chart metric_id is additive — Zedcor's dashboards live
// outside [slug] and do not import this module.
//
// Funder ui_plan.charts (Pathfinder-Funder-Architecture.json):
//   - count_by_thesis (bar, grouped by thesis_area)
//   - verified_count   (line, grouped by week)

import { supabaseAdmin } from '@/lib/supabase';

export type ChartPoint = { label: string; value: number };
export type ChartSeries = ChartPoint[];
export type ChartQueryFn = (orgId: string) => Promise<ChartSeries>;

function admin(): { from: (t: string) => any } {
  return supabaseAdmin() as unknown as { from: (t: string) => any };
}

const THESIS_LABELS: Record<string, string> = {
  'ai-safety': 'AI safety',
  'biosecurity': 'Biosecurity',
  'longevity': 'Longevity',
  'civic-infrastructure': 'Civic infra',
  'ai-governance': 'AI governance',
  'epistemics': 'Epistemics',
  'other': 'Other',
};

const THESIS_ORDER = [
  'ai-safety',
  'ai-governance',
  'biosecurity',
  'epistemics',
  'longevity',
  'civic-infrastructure',
  'other',
] as const;

function startOfWeekISO(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  // Monday-start week (Mon=1; Sun=0 → roll back 6 days).
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(iso: string): string {
  // YYYY-MM-DD → "MMM D" (UTC). Compact for axis labels.
  const d = new Date(`${iso}T00:00:00Z`);
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${month} ${d.getUTCDate()}`;
}

/** Bar series: opportunities per thesis_area. Reads
 *  raw_payload.funder_inferred_thesis (set by qualifier at ingest time)
 *  with a fallback to raw_payload.funder_enrichment.thesis_area when
 *  present. Zero-buckets dropped. */
async function countByThesis(orgId: string): Promise<ChartSeries> {
  const { data, error } = await admin()
    .from('projects')
    .select('raw_payload')
    .eq('organization_id', orgId)
    .limit(10_000);
  if (error || !data) return [];
  const rows = data as Array<{ raw_payload: Record<string, unknown> | null }>;
  const counts = new Map<string, number>();
  for (const r of rows) {
    const payload = r.raw_payload ?? {};
    const thesis =
      ((payload.funder_enrichment as { thesis_area?: string } | undefined)?.thesis_area ??
        (payload.funder_inferred_thesis as string | undefined) ??
        'other') || 'other';
    counts.set(thesis, (counts.get(thesis) ?? 0) + 1);
  }
  const out: ChartSeries = [];
  // Stable, blueprint-ordered.
  for (const key of THESIS_ORDER) {
    const v = counts.get(key) ?? 0;
    if (v === 0) continue;
    out.push({ label: THESIS_LABELS[key] ?? key, value: v });
  }
  // Append any unexpected thesis keys not in the ordered list.
  for (const [key, v] of counts.entries()) {
    if ((THESIS_ORDER as readonly string[]).includes(key)) continue;
    out.push({ label: THESIS_LABELS[key] ?? key, value: v });
  }
  return out;
}

/** Line series: verified=true projects per ISO week, last 8 weeks.
 *  Always returns 8 points so the line shape is stable. */
async function verifiedCountByWeek(orgId: string): Promise<ChartSeries> {
  const cutoff = new Date(Date.now() - 8 * 7 * 86_400_000).toISOString();
  const { data, error } = await admin()
    .from('projects')
    .select('ranked_at, verified')
    .eq('organization_id', orgId)
    .eq('verified', true)
    .gte('ranked_at', cutoff)
    .limit(10_000);
  if (error) return [];
  const rows = (data as Array<{ ranked_at: string | null; verified: boolean }>) ?? [];
  // Build the canonical 8-week skeleton, then fill.
  const weeks: string[] = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 7 * 86_400_000);
    weeks.push(startOfWeekISO(d));
  }
  const dedupedWeeks = Array.from(new Set(weeks)); // collapse duplicates if `now` lands on a Monday twice.
  const counts = new Map<string, number>();
  for (const w of dedupedWeeks) counts.set(w, 0);
  for (const r of rows) {
    if (!r.ranked_at) continue;
    const week = startOfWeekISO(new Date(r.ranked_at));
    if (counts.has(week)) {
      counts.set(week, (counts.get(week) ?? 0) + 1);
    }
  }
  return dedupedWeeks.map((iso) => ({ label: formatWeekLabel(iso), value: counts.get(iso) ?? 0 }));
}

export const chartQueryByMetricId: Record<string, ChartQueryFn> = {
  count_by_thesis: countByThesis,
  verified_count: verifiedCountByWeek,
};

export async function getChartSeries(orgId: string, metricId: string): Promise<ChartSeries> {
  const fn = chartQueryByMetricId[metricId];
  if (!fn) return [];
  try {
    return await fn(orgId);
  } catch {
    return [];
  }
}
