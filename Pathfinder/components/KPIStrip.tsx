// components/KPIStrip.tsx — Build-Out Pass Slice 2.
//
// Spec: Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md.
//
// Renders the top KPI strip for the tailored Pathfinder at /[slug].
// Reads ui_plan.kpis (label, metric_id, optional unit and target) and
// emits one data-kpi-card per entry inside a data-kpi-strip wrapper.
// Values resolve via lib/metrics/kpiQueries which currently returns
// null for every metric_id — em-dash placeholder until Slice 3+ wires
// real queries. The point of this component is the layout + the
// data-kpi-strip / data-kpi-card markers the DoD smoke harness
// (scripts/dod-smoke.ts step 8) probes for.

import * as React from 'react';
import type { UIPlan } from '@/lib/types/architecture';
import type { KpiValue } from '@/lib/metrics/kpiQueries';

void React;

export type KPIStripProps = {
  kpis: UIPlan['kpis'];
  /** Optional pre-resolved values keyed by metric_id. Server pages
   * resolve values via getKpiValue and pass them in; client/tests can
   * skip this and accept em-dash placeholders. */
  values?: Record<string, KpiValue>;
};

function formatValue(v: KpiValue | undefined, unit?: string): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    const s = unit === '$' ? `$${v.toLocaleString()}` : unit === '%' ? `${v}%` : `${v}`;
    return s;
  }
  return unit && unit !== '$' && unit !== '%' ? `${v} ${unit}` : String(v);
}

export function KPIStrip({ kpis, values }: KPIStripProps) {
  return (
    <div
      data-kpi-strip
      style={{
        display: 'flex',
        gap: '0.75rem',
        flexWrap: 'wrap',
        marginBottom: '1.5rem',
      }}
    >
      {kpis.map(kpi => {
        const raw = values?.[kpi.metric_id];
        const display = formatValue(raw, kpi.unit);
        return (
          <div
            key={kpi.metric_id}
            data-kpi-card
            data-metric-id={kpi.metric_id}
            style={{
              flex: '1 1 180px',
              minWidth: 180,
              background: '#111',
              border: '1px solid #222',
              borderRadius: 6,
              padding: '0.875rem 1rem',
            }}
          >
            <div
              style={{
                color: '#777',
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.4rem',
              }}
            >
              {kpi.label}
            </div>
            <div
              data-kpi-value
              style={{
                fontSize: '1.5rem',
                fontWeight: 600,
                color: '#fff',
                lineHeight: 1.1,
              }}
            >
              {display}
            </div>
            {kpi.target !== undefined && (
              <div
                data-kpi-target
                style={{
                  marginTop: '0.4rem',
                  fontSize: '0.7rem',
                  color: '#666',
                }}
              >
                target {kpi.target}
                {kpi.unit ? ` ${kpi.unit}` : ''}
                {kpi.invert ? ' (lower is better)' : ''}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default KPIStrip;
