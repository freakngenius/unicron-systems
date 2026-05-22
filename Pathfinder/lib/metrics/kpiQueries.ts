// lib/metrics/kpiQueries.ts — Build-Out Pass Slice 2.
//
// Spec: Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md.
//
// Each KPI in ui_plan.kpis carries a metric_id; the renderer asks this
// map for a query function. Funder onboarding Stage 9 populated the
// first batch (verified_count_7d, actively_raising_count, avg_score,
// sources_live) per Funder's architecture ui_plan. The implementations
// are org-scoped by organization_id so adding a metric_id is purely
// additive — Zedcor and Realberry are unaffected (their existing KPI
// configs don't reference these ids today, and their dashboards live
// in /zedcor + the existing Realberry surface).

import { supabaseAdmin } from '@/lib/supabase';

export type KpiValue = number | string | null;

export type KpiQueryFn = (orgId: string) => Promise<KpiValue>;

function admin(): { from: (t: string) => any } {
  return supabaseAdmin() as unknown as { from: (t: string) => any };
}

// ---------------------------------------------------------------------------
// Funder KPI implementations (Stage 9).
// ---------------------------------------------------------------------------

/** verified=true projects ranked in the last 7 days for the org. */
async function verifiedCount7d(orgId: string): Promise<KpiValue> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { count, error } = await admin()
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('verified', true)
    .gte('ranked_at', weekAgo);
  if (error) return null;
  return count ?? 0;
}

/** Projects with fundraising_stage = 'actively-raising'. Reads two paths:
 *  - raw_payload.fundraising_stage              (legacy, pre-enrichment)
 *  - raw_payload.funder_enrichment.fundraising_stage (current — Sonar enricher writes here)
 *  The verifier reads the same enrichment block; this keeps the KPI
 *  honest against the actual enrichment surface. */
async function activelyRaisingCount(orgId: string): Promise<KpiValue> {
  const { data, error } = await admin()
    .from('projects')
    .select('id, raw_payload')
    .eq('organization_id', orgId)
    .limit(10_000);
  if (error || !data) return null;
  const count = (data as Array<{ raw_payload: Record<string, unknown> | null }>).filter((r) => {
    const payload = r.raw_payload ?? {};
    const legacy = payload.fundraising_stage as string | undefined;
    const enriched = (payload.funder_enrichment as { fundraising_stage?: string } | undefined)?.fundraising_stage;
    return legacy === 'actively-raising' || enriched === 'actively-raising';
  }).length;
  return count;
}

/** Mean score over all scored projects for the org (rounded to nearest %). */
async function avgScore(orgId: string): Promise<KpiValue> {
  const { data, error } = await admin()
    .from('projects')
    .select('score')
    .eq('organization_id', orgId)
    .not('score', 'is', null)
    .limit(10_000);
  if (error || !data || data.length === 0) return null;
  const scores = (data as Array<{ score: number }>).map((r) => r.score).filter((s) => Number.isFinite(s));
  if (scores.length === 0) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avg);
}

/** Count of architecture.sources[].type === 'registered'. */
async function sourcesLive(orgId: string): Promise<KpiValue> {
  const { data, error } = await admin()
    .from('organizations')
    .select('architecture')
    .eq('id', orgId)
    .maybeSingle();
  if (error || !data) return null;
  const arch = (data as { architecture: Record<string, unknown> | null }).architecture ?? {};
  const sources = (arch.sources as Array<{ type?: string }> | undefined) ?? [];
  return sources.filter((s) => s.type === 'registered').length;
}

// ---------------------------------------------------------------------------
// Internal KPI implementations (Stage 10).
// ---------------------------------------------------------------------------

/** verified=true projects ranked in the last 24 hours for the org. */
async function verifiedCount1d(orgId: string): Promise<KpiValue> {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error } = await admin()
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('verified', true)
    .gte('ranked_at', dayAgo);
  if (error) return null;
  return count ?? 0;
}

/** Percent of verified Internal companies with sales_motion='active-outbound'. */
async function activeMotionPct(orgId: string): Promise<KpiValue> {
  const { data, error } = await admin()
    .from('projects')
    .select('raw_payload')
    .eq('organization_id', orgId)
    .eq('verified', true)
    .limit(10_000);
  if (error || !data) return null;
  const rows = data as Array<{ raw_payload: Record<string, unknown> | null }>;
  if (rows.length === 0) return 0;
  const active = rows.filter((r) => {
    const enr = (r.raw_payload?.internal_enrichment as Record<string, unknown> | undefined) ?? {};
    return enr.sales_motion === 'active-outbound';
  }).length;
  return Math.round((active / rows.length) * 100);
}

/** count by service_category as a JSON-stringified record (for the bar chart). */
async function countByCategory(orgId: string): Promise<KpiValue> {
  const { data, error } = await admin()
    .from('projects')
    .select('raw_payload')
    .eq('organization_id', orgId)
    .eq('verified', true)
    .limit(10_000);
  if (error || !data) return null;
  const rows = data as Array<{ raw_payload: Record<string, unknown> | null }>;
  const buckets: Record<string, number> = {};
  for (const r of rows) {
    const enr = (r.raw_payload?.internal_enrichment as Record<string, unknown> | undefined) ?? {};
    const cat =
      (enr.service_category as string | undefined) ??
      (r.raw_payload?.internal_inferred_service_category as string | undefined) ??
      'unknown';
    buckets[cat] = (buckets[cat] ?? 0) + 1;
  }
  return JSON.stringify(buckets);
}

/** count of verified projects per day for the last 30 days (JSON line chart). */
async function verifiedCount(orgId: string): Promise<KpiValue> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await admin()
    .from('projects')
    .select('ranked_at')
    .eq('organization_id', orgId)
    .eq('verified', true)
    .gte('ranked_at', since)
    .limit(10_000);
  if (error || !data) return null;
  const rows = data as Array<{ ranked_at: string | null }>;
  const buckets: Record<string, number> = {};
  for (const r of rows) {
    if (!r.ranked_at) continue;
    const day = r.ranked_at.slice(0, 10);
    buckets[day] = (buckets[day] ?? 0) + 1;
  }
  return JSON.stringify(buckets);
}

export const kpiQueryByMetricId: Record<string, KpiQueryFn> = {
  // Funder KPI metric_ids (architecture.ui_plan.kpis):
  verified_count_7d: verifiedCount7d,
  actively_raising_count: activelyRaisingCount,
  avg_score: avgScore,
  sources_live: sourcesLive,
  // Internal KPI metric_ids (Stage 10):
  verified_count_1d: verifiedCount1d,
  active_motion_pct: activeMotionPct,
  count_by_category: countByCategory,
  verified_count: verifiedCount,
};

/** Resolve a kpi value by metric_id. Returns null for unmapped ids. */
export async function getKpiValue(orgId: string, metricId: string): Promise<KpiValue> {
  const fn = kpiQueryByMetricId[metricId];
  if (!fn) return null;
  try {
    return await fn(orgId);
  } catch {
    return null;
  }
}
