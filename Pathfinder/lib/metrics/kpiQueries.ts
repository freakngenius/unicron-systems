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

export const kpiQueryByMetricId: Record<string, KpiQueryFn> = {
  // Funder KPI metric_ids (architecture.ui_plan.kpis):
  verified_count_7d: verifiedCount7d,
  actively_raising_count: activelyRaisingCount,
  avg_score: avgScore,
  sources_live: sourcesLive,
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
