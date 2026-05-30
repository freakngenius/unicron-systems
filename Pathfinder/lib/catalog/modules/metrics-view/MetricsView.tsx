// lib/catalog/modules/metrics-view/MetricsView.tsx, Stream F.
//
// The "Metrics" tab of the Internal dashboard. Server component: resolves
// each tile via lib/catalog/modules/metrics-view/metrics.ts, hands off to
// a pure renderer.
//
// Layout: responsive 2-col grid of Cards. Each card has a label, an info
// tooltip glyph (title attribute carries the salesperson-readable
// explanation), a big numeric value when applicable, and an optional
// breakdown subtext (used by active_outbound_motion to render the honest
// picture "Confirmed active: X of Y; Z Unknown" instead of a bare 0%).
//
// Why a separate view from the feed: the Stream B kpi-strip is dormant
// chrome competing with the ranked feed for the rep's first glance. Stream
// F's verdict is to put the numbers on a dedicated tab, with each tile
// legible without a click and a plain-language tooltip on hover.

import * as React from 'react';
import { Card } from '@/components/design/Card';
import { color, font, fontSize, fontWeight, letterSpacing, space } from '@/lib/design/tokens';
import {
  resolveMetricTiles,
  type MetricResolverDeps,
  type MetricTile,
} from './metrics';
import { KNOWN_METRIC_IDS } from './metrics';

void React;

export interface MetricsViewProps {
  /** Per-org config from architecture.modules.metrics-view.config. */
  config?: { metrics?: readonly string[] };
  deps: MetricResolverDeps;
}

export interface MetricsViewRenderProps {
  tiles: readonly MetricTile[];
}

const INFO_GLYPH = 'ⓘ'; // circled lowercase i

export function MetricsViewRender({ tiles }: MetricsViewRenderProps): React.ReactElement | null {
  if (tiles.length === 0) return null;
  return (
    <div
      data-testid="metrics-view"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: space.lg,
      }}
    >
      {tiles.map((tile) => (
        <MetricCard key={tile.id} tile={tile} />
      ))}
    </div>
  );
}

function MetricCard({ tile }: { tile: MetricTile }): React.ReactElement {
  return (
    <Card data-testid={`metric-card-${tile.id}`} padded>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: space.md,
        }}
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
        <span
          data-testid={`metric-tooltip-${tile.id}`}
          title={tile.tooltip}
          aria-label={tile.tooltip}
          tabIndex={0}
          style={{
            color: color.textMuted,
            cursor: 'help',
            fontFamily: font.sans,
            fontSize: fontSize.md,
            lineHeight: 1,
          }}
        >
          {INFO_GLYPH}
        </span>
      </div>
      {tile.value !== null ? (
        <div
          data-testid={`metric-value-${tile.id}`}
          style={{
            marginTop: space.md,
            color: color.text,
            fontFamily: font.mono,
            fontSize: fontSize.hero,
            fontWeight: fontWeight.bold,
            lineHeight: 1.1,
          }}
        >
          {tile.value}
          {tile.suffix ?? ''}
        </div>
      ) : null}
      {tile.subText ? (
        <div
          data-testid={`metric-subtext-${tile.id}`}
          style={{
            marginTop: tile.value === null ? space.md : space.sm,
            color: tile.value === null ? color.text : color.textMuted,
            fontFamily: font.sans,
            fontSize: tile.value === null ? fontSize.md : fontSize.sm,
            lineHeight: 1.4,
          }}
        >
          {tile.subText}
        </div>
      ) : null}
    </Card>
  );
}

export async function MetricsView({ config, deps }: MetricsViewProps): Promise<React.ReactElement | null> {
  const ids =
    config?.metrics && config.metrics.length > 0
      ? config.metrics
      : KNOWN_METRIC_IDS;
  const tiles = await resolveMetricTiles(ids, deps);
  return <MetricsViewRender tiles={tiles} />;
}

export default MetricsView;
