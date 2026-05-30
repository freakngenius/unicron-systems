// lib/catalog/modules/analytics-charts/AnalyticsCharts.tsx, Stream B.
//
// Module 4: secondary analytics. Companies by service category (bar) +
// verified companies over time (line). Demoted below the feed; soft-gated
// per chart: an empty series renders the designed EmptyState, never a
// broken chart.
//
// Inline SVG keeps the bundle small and matches the Zedcor aesthetic of
// inline-styled, dependency-free chrome. The data shapers are tested in
// charts.test.ts; this file is the renderer.

import * as React from 'react';
import { SectionHeader } from '@/components/design/SectionHeader';
import { EmptyState } from '@/components/design/EmptyState';
import {
  color,
  font,
  fontSize,
  fontWeight,
  letterSpacing,
  radius,
  space,
} from '@/lib/design/tokens';
import { Card } from '@/components/design/Card';
import { humanizeKey, type LeadUnitSchema } from '@/lib/catalog/modules/ranked-feed/labels';
import {
  byServiceCategory,
  verifiedOverTime,
  type ServiceCategoryPoint,
  type VerifiedDayPoint,
} from './charts';

void React;

export interface AnalyticsChartsViewProps {
  byCategory: readonly ServiceCategoryPoint[];
  byDay: readonly VerifiedDayPoint[];
  schema: LeadUnitSchema;
}

export function AnalyticsChartsView({ byCategory, byDay, schema }: AnalyticsChartsViewProps): React.ReactElement {
  const hasCategory = byCategory.length > 0;
  const hasDay = byDay.some((d) => d.count > 0);
  return (
    <section data-testid="analytics-charts">
      <SectionHeader
        eyebrow="Analytics"
        title="Trend"
        subtitle="Secondary view, below the ranked feed."
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: space.lg,
        }}
      >
        <Card padded>
          <SectionHeader title="Companies by service category" />
          {hasCategory ? (
            <BarChart points={byCategory} schema={schema} />
          ) : (
            <div data-testid="analytics-bar-empty">
              <EmptyState
                eyebrow="No data yet"
                title="Service-category breakdown will populate as companies are scored."
                size="sm"
              />
            </div>
          )}
        </Card>
        <Card padded>
          <SectionHeader title="Verified companies over time" />
          {hasDay ? (
            <LineChart points={byDay} />
          ) : (
            <div data-testid="analytics-line-empty">
              <EmptyState
                eyebrow="No data yet"
                title="Daily verification counts will populate as the pipeline runs."
                size="sm"
              />
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}

// ---------- Bar chart ----------

function BarChart({ points, schema }: { points: readonly ServiceCategoryPoint[]; schema: LeadUnitSchema }): React.ReactElement {
  void schema;
  const max = points.reduce((m, p) => Math.max(m, p.count), 0);
  return (
    <div data-testid="analytics-bar" style={{ display: 'flex', flexDirection: 'column', gap: space.sm, marginTop: space.md }}>
      {points.map((p) => {
        const widthPct = max > 0 ? (p.count / max) * 100 : 0;
        return (
          <div key={p.slug} style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
            <div
              style={{
                width: 160,
                flexShrink: 0,
                color: color.text,
                fontFamily: font.sans,
                fontSize: fontSize.sm,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={humanizeKey(p.slug)}
            >
              {humanizeKey(p.slug)}
            </div>
            <div
              style={{
                flex: 1,
                height: 14,
                background: color.bgSubtle,
                borderRadius: radius.sm,
                overflow: 'hidden',
              }}
            >
              <div
                data-testid={`analytics-bar-${p.slug}`}
                style={{
                  width: `${widthPct}%`,
                  height: '100%',
                  background: color.accent,
                  borderRadius: radius.sm,
                }}
              />
            </div>
            <div
              style={{
                width: 40,
                textAlign: 'right',
                color: color.textMuted,
                fontFamily: font.mono,
                fontSize: fontSize.eyebrow,
                fontWeight: fontWeight.semi,
                letterSpacing: letterSpacing.wider,
              }}
            >
              {p.count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Empty-state wrapper for tests to assert against.
function _EmptyBarPlaceholder(): React.ReactElement {
  return <div data-testid="analytics-bar-empty" />;
}
void _EmptyBarPlaceholder;

// ---------- Line chart ----------

function LineChart({ points }: { points: readonly VerifiedDayPoint[] }): React.ReactElement {
  if (points.length === 0) {
    return <div data-testid="analytics-line-empty" style={{ color: color.textMuted, fontSize: fontSize.sm }} />;
  }
  const W = 480;
  const H = 120;
  const padX = 24;
  const padY = 18;
  const maxC = points.reduce((m, p) => Math.max(m, p.count), 0) || 1;
  const xs = (i: number) => padX + (i / (points.length - 1 || 1)) * (W - padX * 2);
  const ys = (c: number) => H - padY - (c / maxC) * (H - padY * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.count).toFixed(1)}`).join(' ');
  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  return (
    <div data-testid="analytics-line" style={{ marginTop: space.md }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Verified companies over time">
        <path d={path} fill="none" stroke={color.accent} strokeWidth="2" />
        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={xs(i)}
            cy={ys(p.count)}
            r={p.count > 0 ? 2.5 : 1.5}
            fill={p.count > 0 ? color.accent : color.textDim}
          />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: color.textMuted, fontFamily: font.mono, fontSize: fontSize.eyebrow, marginTop: space.xs }}>
        <span>{firstDate}</span>
        <span>{lastDate}</span>
      </div>
    </div>
  );
}

// Render-only "empty bar" component path used when byCategory.length === 0.
// (We render this directly in the parent's else branch so the test can
// query for the empty-state marker.)

// Re-export the empty markers as components so the parent can use them
// without inlining the data-testid in two places.
export function _BarEmpty(): React.ReactElement {
  return <div data-testid="analytics-bar-empty" />;
}

// Module shell (server component) for the catalog renderer.

export interface AnalyticsChartsProps {
  byCategory: readonly ServiceCategoryPoint[];
  byDay: readonly VerifiedDayPoint[];
  schema: LeadUnitSchema;
}

export function AnalyticsCharts({ byCategory, byDay, schema }: AnalyticsChartsProps): React.ReactElement {
  return <AnalyticsChartsView byCategory={byCategory} byDay={byDay} schema={schema} />;
}

export { byServiceCategory, verifiedOverTime };
export default AnalyticsCharts;
