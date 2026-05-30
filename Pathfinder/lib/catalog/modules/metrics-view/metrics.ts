// lib/catalog/modules/metrics-view/metrics.ts, Stream F.
//
// Rich metric resolvers for the metrics view. Unlike the Stream B kpi-strip
// resolvers (which return number | null), each metric here returns a tile
// shape with optional breakdown subtext and required tooltip, so a
// salesperson reads more than a bare number.
//
// Critical for Stream F's PR blocker: active_outbound_motion NEVER renders
// a bare misleading "0%". When enrichment has not confirmed motion on
// most rows, the tile reports the honest picture:
//   "Confirmed active: <N> of <M>; <K> Unknown"
// where:
//   confirmed = sales_motion in {active-outbound, hiring-bd}
//   unknown   = sales_motion missing or equal to 'unknown'
//   other     = remaining bucket (e.g. inbound-only)

import { METRIC_COPY } from './labels';
import { humanizeKey } from '@/lib/catalog/modules/ranked-feed/labels';

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

export interface MetricTile {
  id: string;
  label: string;
  /**
   * Numeric value rendered as the big number on the tile. Null when the
   * tile should not show a number (for example when the honest breakdown
   * subtext carries the meaning instead).
   */
  value: number | null;
  suffix?: string;
  subText?: string;
  tooltip: string;
}

const ACTIVE_SLUGS = new Set(['active-outbound', 'hiring-bd']);
const UNKNOWN_SLUGS = new Set(['unknown']);

async function verifiedCount1d(deps: MetricResolverDeps): Promise<MetricTile | null> {
  try {
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const res = await deps.admin
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', deps.orgId)
      .eq('verified', true)
      .gte('ranked_at', dayAgo);
    if (res?.error) return null;
    const count = typeof res?.count === 'number' ? res.count : 0;
    const copy = METRIC_COPY.verified_count_1d;
    return {
      id: 'verified_count_1d',
      label: copy.label,
      value: count,
      tooltip: copy.tooltip,
    };
  } catch {
    return null;
  }
}

async function activeOutboundMotion(deps: MetricResolverDeps): Promise<MetricTile | null> {
  try {
    const res = await deps.admin
      .from('projects')
      .select('raw_payload')
      .eq('organization_id', deps.orgId)
      .limit(10_000);
    if (res?.error) return null;
    const rows = (res?.data ?? []) as Array<{ raw_payload: Record<string, unknown> | null }>;
    const total = rows.length;
    if (total === 0) return null;

    let confirmed = 0;
    let unknown = 0;
    for (const r of rows) {
      const enr = (r.raw_payload?.internal_enrichment as Record<string, unknown> | undefined) ?? {};
      const motion = typeof enr.sales_motion === 'string' ? enr.sales_motion.trim() : '';
      if (motion === '' || UNKNOWN_SLUGS.has(motion)) {
        unknown += 1;
      } else if (ACTIVE_SLUGS.has(motion)) {
        confirmed += 1;
      }
    }

    const copy = METRIC_COPY.active_outbound_motion;
    const pct = Math.round((confirmed / total) * 100);
    // Honesty rule: when most rows are unknown OR confirmed is zero, show
    // the breakdown subtext and do NOT render a bare percent as the big
    // number. Salespeople read "0%" as broken; the breakdown reads as
    // "we have not confirmed motion on most of them yet".
    const unknownShare = unknown / total;
    const needsBreakdown = unknownShare >= 0.25 || confirmed === 0;
    if (needsBreakdown) {
      return {
        id: 'active_outbound_motion',
        label: copy.label,
        value: null,
        subText: `Confirmed active: ${confirmed} of ${total}; ${unknown} Unknown`,
        tooltip: copy.tooltip,
      };
    }
    return {
      id: 'active_outbound_motion',
      label: copy.label,
      value: pct,
      suffix: copy.suffix,
      subText: `Confirmed active: ${confirmed} of ${total}; ${unknown} Unknown`,
      tooltip: copy.tooltip,
    };
  } catch {
    return null;
  }
}

async function avgScoreOutOf100(deps: MetricResolverDeps): Promise<MetricTile | null> {
  try {
    const res = await deps.admin
      .from('projects')
      .select('score')
      .eq('organization_id', deps.orgId)
      .not('score', 'is', null)
      .limit(10_000);
    if (res?.error) return null;
    const rows = (res?.data ?? []) as Array<{ score: number | null }>;
    const scores = rows
      .map((r) => r.score)
      .filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
    if (scores.length === 0) return null;
    const mean = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const copy = METRIC_COPY.avg_score_out_of_100;
    return {
      id: 'avg_score_out_of_100',
      label: copy.label,
      value: mean,
      suffix: copy.suffix,
      subText: `Across ${scores.length} scored compan${scores.length === 1 ? 'y' : 'ies'}`,
      tooltip: copy.tooltip,
    };
  } catch {
    return null;
  }
}

async function sourcesLive(deps: MetricResolverDeps): Promise<MetricTile | null> {
  const sources = deps.architecture.sources ?? [];
  const live = sources.filter((s) => s.type === 'registered');
  const total = sources.length;
  const copy = METRIC_COPY.sources_live;
  const liveLabels = live
    .map((s) => (typeof s.id === 'string' ? humanizeKey(s.id) : null))
    .filter((s): s is string => !!s);
  const subText =
    liveLabels.length === 0
      ? `0 of ${total} registered sources are feeding leads`
      : `Live: ${liveLabels.join(', ')}` + (total > live.length ? `; ${total - live.length} pending` : '');
  return {
    id: 'sources_live',
    label: copy.label,
    value: live.length,
    subText,
    tooltip: copy.tooltip,
  };
}

const RESOLVERS: Record<string, (deps: MetricResolverDeps) => Promise<MetricTile | null>> = {
  verified_count_1d: verifiedCount1d,
  active_outbound_motion: activeOutboundMotion,
  avg_score_out_of_100: avgScoreOutOf100,
  sources_live: sourcesLive,
};

export const KNOWN_METRIC_IDS: readonly string[] = Object.keys(RESOLVERS);

export async function resolveMetricTile(
  metricId: string,
  deps: MetricResolverDeps,
): Promise<MetricTile | null> {
  const fn = RESOLVERS[metricId];
  if (!fn) {
    // eslint-disable-next-line no-console
    console.warn(
      `[catalog] metrics-view metric "${metricId}" has no resolver in lib/catalog/modules/metrics-view/metrics.ts; dropped from view.`,
    );
    return null;
  }
  return fn(deps);
}

export async function resolveMetricTiles(
  metricIds: readonly string[],
  deps: MetricResolverDeps,
): Promise<MetricTile[]> {
  const out = await Promise.all(metricIds.map((id) => resolveMetricTile(id, deps)));
  return out.filter((t): t is MetricTile => t !== null);
}
