// lib/catalog/modules/kpi-strip/metrics.ts, Stream B Dashboard.
//
// Module 3: per-metric resolvers for the Internal kpi-strip. Each resolver
// returns `number | null`. NULL means "DROP this KPI from the strip" so a
// misleading zero never reaches the UI. The renderer filters nulls out
// before composing the strip.
//
// Resolution semantics, per docs/PLAN-stream-b-dashboard.md and the
// dispatch prompt:
//
//   verified_count_1d  count of projects where organization_id=org AND
//                      verified=true AND ranked_at >= now()-1d. Real zero
//                      ("no verifications in the last 24h") IS meaningful
//                      and renders as 0.
//
//   active_motion_pct  percent of VERIFIED projects whose
//                      raw_payload.internal_enrichment.sales_motion equals
//                      a value in the schema's sales_motion enum matching
//                      outbound semantics. DROP (null) when:
//                        - no verified rows (zero denominator)
//                        - schema lacks sales_motion (extractor broken)
//                        - schema enum has no outbound member
//
//   avg_score          rounded mean of projects.score WHERE score IS NOT
//                      NULL. DROP (null) when no scored rows exist.
//
//   sources_live       count of architecture.sources where type=registered.
//                      Real zero ("no live sources") is meaningful and
//                      renders as 0.
//
// All resolvers swallow Supabase errors and return null so a transient
// query failure drops the KPI rather than rendering a stale or wrong
// value.

export interface SupabaseLike {
  from: (table: string) => any;
}

export interface MetricResolverDeps {
  orgId: string;
  admin: SupabaseLike;
  architecture: {
    sources?: ReadonlyArray<{ id?: string; type?: string }>;
    lead_unit?: {
      schema?: Record<string, { type?: string; enum_values?: readonly string[]; display_label?: string }>;
    };
  };
}

export type MetricValue = number | null;

const OUTBOUND_HINT_KEYS = ['outbound', 'active'];

function hasOutboundEnumMember(deps: MetricResolverDeps): string | null {
  const schema = deps.architecture.lead_unit?.schema ?? {};
  const entry = schema.sales_motion;
  if (!entry || !Array.isArray(entry.enum_values)) return null;
  for (const v of entry.enum_values) {
    const lower = v.toLowerCase();
    if (OUTBOUND_HINT_KEYS.some((hint) => lower.includes(hint))) return v;
  }
  return null;
}

async function verifiedCount1d(deps: MetricResolverDeps): Promise<MetricValue> {
  try {
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const res = await deps.admin
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', deps.orgId)
      .eq('verified', true)
      .gte('ranked_at', dayAgo);
    if (res?.error) return null;
    return typeof res?.count === 'number' ? res.count : 0;
  } catch {
    return null;
  }
}

async function activeMotionPct(deps: MetricResolverDeps): Promise<MetricValue> {
  const outboundEnum = hasOutboundEnumMember(deps);
  // Drop when the schema lacks sales_motion or has no outbound member.
  if (!outboundEnum) return null;
  try {
    const res = await deps.admin
      .from('projects')
      .select('raw_payload')
      .eq('organization_id', deps.orgId)
      .eq('verified', true)
      .limit(10_000);
    if (res?.error) return null;
    const rows = (res?.data ?? []) as Array<{ raw_payload: Record<string, unknown> | null }>;
    if (rows.length === 0) return null; // zero denominator: DROP, do not show 0%
    const active = rows.filter((r) => {
      const enr = (r.raw_payload?.internal_enrichment as Record<string, unknown> | undefined) ?? {};
      return enr.sales_motion === outboundEnum;
    }).length;
    return Math.round((active / rows.length) * 100);
  } catch {
    return null;
  }
}

async function avgScore(deps: MetricResolverDeps): Promise<MetricValue> {
  try {
    const res = await deps.admin
      .from('projects')
      .select('score')
      .eq('organization_id', deps.orgId)
      .not('score', 'is', null)
      .limit(10_000);
    if (res?.error) return null;
    const rows = (res?.data ?? []) as Array<{ score: number | null }>;
    const scores = rows.map((r) => r.score).filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
    if (scores.length === 0) return null;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.round(mean);
  } catch {
    return null;
  }
}

async function sourcesLive(deps: MetricResolverDeps): Promise<MetricValue> {
  const sources = deps.architecture.sources ?? [];
  return sources.filter((s) => s.type === 'registered').length;
}

const RESOLVERS: Record<string, (deps: MetricResolverDeps) => Promise<MetricValue>> = {
  verified_count_1d: verifiedCount1d,
  active_motion_pct: activeMotionPct,
  avg_score: avgScore,
  sources_live: sourcesLive,
};

export const KNOWN_METRIC_IDS: readonly string[] = Object.keys(RESOLVERS);

/**
 * Resolve one metric to a number, or null to drop it from the strip. An
 * unknown metric_id always returns null and emits a structured warning so
 * a misconfigured Internal architecture surfaces in logs.
 */
export async function resolveMetric(metricId: string, deps: MetricResolverDeps): Promise<MetricValue> {
  const fn = RESOLVERS[metricId];
  if (!fn) {
    // eslint-disable-next-line no-console
    console.warn(
      `[catalog] kpi-strip metric "${metricId}" has no resolver in lib/catalog/modules/kpi-strip/metrics.ts; dropped from strip.`,
    );
    return null;
  }
  return fn(deps);
}

/**
 * Resolve every configured metric in parallel. Returns one entry per
 * metric_id in the same order; the renderer filters nulls. This is the
 * single entry point the KpiStrip component uses.
 */
export async function resolveMetrics(
  metricIds: readonly string[],
  deps: MetricResolverDeps,
): Promise<Array<{ id: string; value: MetricValue }>> {
  return Promise.all(
    metricIds.map(async (id) => ({ id, value: await resolveMetric(id, deps) })),
  );
}
