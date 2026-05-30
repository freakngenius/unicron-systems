// lib/catalog/modules/kpi-strip/KpiStrip.tsx, Stream B Dashboard.
//
// Module 3: slim, secondary KPI strip for Internal. NOT the hero, NOT
// chrome that competes with the ranked feed for the rep's first glance.
//
// Two exports:
//   - KpiStrip: server component that resolves metrics and renders.
//   - KpiStripView: pure renderer over already-resolved metrics. Easier
//     to unit-test without booting Supabase, and reusable from the page
//     when it pre-resolves metrics for its own caching.
//
// Spec-critical behavior: any metric whose value is null is DROPPED from
// the DOM entirely. The strip never renders a placeholder zero. When every
// metric drops, the strip itself is absent (no empty chrome).

import * as React from 'react';
import { color, font, fontSize, fontWeight, letterSpacing, radius, space } from '@/lib/design/tokens';
import { resolveMetrics, type MetricResolverDeps } from './metrics';

void React;

export interface KpiTile {
  id: string;
  label: string;
  value: number | null;
  /** Optional suffix appended to the value (e.g. '%'). */
  suffix?: string;
}

export interface KpiStripViewProps {
  metrics: readonly KpiTile[];
}

/**
 * Pure renderer. Filters out null-valued tiles before composing the strip,
 * so callers do not need to remember the drop rule. Returns null when
 * every tile drops so the page does not render an empty container.
 */
export function KpiStripView({ metrics }: KpiStripViewProps): React.ReactElement | null {
  const visible = metrics.filter((m) => m.value !== null);
  if (visible.length === 0) return null;
  return (
    <div
      data-testid="kpi-strip"
      data-tone="secondary"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(140px, 1fr))`,
        gap: space.md,
        padding: `${space.md}px ${space.lg}px`,
        background: color.bgSubtle,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
      }}
    >
      {visible.map((tile) => (
        <div
          key={tile.id}
          data-testid={`kpi-tile-${tile.id}`}
          style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}
        >
          <div
            style={{
              color: color.textMuted,
              fontFamily: font.mono,
              fontSize: fontSize.eyebrow,
              letterSpacing: letterSpacing.wider,
              textTransform: 'uppercase',
            }}
          >
            {tile.label}
          </div>
          <div
            style={{
              color: color.text,
              fontFamily: font.mono,
              fontSize: fontSize.xl,
              fontWeight: fontWeight.bold,
              lineHeight: 1.1,
            }}
          >
            {tile.value}
            {tile.suffix ?? ''}
          </div>
        </div>
      ))}
    </div>
  );
}

export interface KpiStripProps {
  /** Per-org config from architecture.modules.kpi-strip.config. */
  config: { metrics?: readonly string[]; labels?: Record<string, string> } | undefined;
  /** Resolved deps with org id, supabase admin client, and architecture. */
  deps: MetricResolverDeps;
}

/**
 * Default Internal labels and suffixes, mirroring the configured UI labels
 * in __tests__/fixtures/internal-architecture.json so the strip reads the
 * same as today's broken implementation, only now it never lies.
 */
const DEFAULT_LABELS: Record<string, { label: string; suffix?: string }> = {
  verified_count_1d: { label: 'Companies verified today' },
  active_motion_pct: { label: 'Active outbound motion', suffix: '%' },
  avg_score: { label: 'Average sales priority', suffix: '%' },
  sources_live: { label: 'Sources live' },
};

/**
 * Async server component shell. Resolves each configured metric in
 * parallel via resolveMetrics, projects to KpiTile[], hands off to the
 * pure renderer.
 */
export async function KpiStrip({ config, deps }: KpiStripProps): Promise<React.ReactElement | null> {
  const metricIds = config?.metrics ?? [];
  if (metricIds.length === 0) return null;
  const resolved = await resolveMetrics(metricIds, deps);
  const tiles: KpiTile[] = resolved.map(({ id, value }) => ({
    id,
    label: config?.labels?.[id] ?? DEFAULT_LABELS[id]?.label ?? id,
    value,
    suffix: DEFAULT_LABELS[id]?.suffix,
  }));
  return <KpiStripView metrics={tiles} />;
}

export default KpiStrip;
