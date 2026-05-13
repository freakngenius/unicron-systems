// lib/metrics/kpiQueries.ts — Build-Out Pass Slice 2.
//
// Spec: Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md.
//
// Stub layer for KPI metric resolution. Each KPI in
// ui_plan.kpis carries a metric_id; the renderer asks this map for a
// query function. Slice 2 intentionally ships an empty map — every
// metric_id resolves to null so the KPI cards show an em-dash. The
// renderer + plumbing is what step 8 of the DoD smoke probes for.
// Real metric query functions (leads_weekly, conversion_rate, etc.)
// will land in Slice 3+ alongside the headless verification agent.

export type KpiValue = number | string | null;

export type KpiQueryFn = (orgId: string) => Promise<KpiValue>;

// TODO(slice 3+): populate with real metric queries. Keep entries
// keyed by the metric_id the Architect emits in ui_plan.kpis.
export const kpiQueryByMetricId: Record<string, KpiQueryFn> = {};

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
