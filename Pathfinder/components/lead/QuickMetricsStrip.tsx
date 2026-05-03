'use client';

// components/lead/QuickMetricsStrip.tsx — Demo Polish UX Gate 9A.
//
// 4-cell metrics strip rendered immediately under the LeadDetail header,
// per SPEC - Lead Detail Page v2.md § 2. Cells: VALUE / STAGE / DISTANCE /
// POSTED. Posted shows a two-line value (`X days ago` + `MM-DD-YY` subtitle).
//
// Ported from the equivalent block in components/ProjectModal.tsx so the
// page-route lead detail and the modal-pattern lead detail share the same
// at-a-glance metrics surface.

import * as React from 'react';

import { formatPostedDate } from '@/lib/posted-date';
import { stageLabel } from '@/lib/stages';
import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import type { Project } from '@/lib/types';

interface Props {
  project: Project;
}

function formatValue(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatDistance(d: number | null | undefined): string {
  if (d == null) return '—';
  return `${d.toFixed(1)} mi`;
}

export function QuickMetricsStrip({ project }: Props): React.ReactElement {
  const posted = formatPostedDate(project.posted_date);
  const cells: Array<{
    label: string;
    value: string;
    subtitle: string | null;
  }> = [
    { label: 'Value', value: formatValue(project.project_value), subtitle: null },
    { label: 'Stage', value: stageLabel(project.project_stage), subtitle: null },
    { label: 'Distance', value: formatDistance(project.distance_miles), subtitle: null },
    { label: 'Posted', value: posted.top, subtitle: posted.subtitle },
  ];

  return (
    <section
      data-testid="lead-detail-quick-metrics"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        overflow: 'hidden',
      }}
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          style={{
            padding: '14px 18px',
            borderRight:
              i < cells.length - 1 ? `1px solid ${PF_TINTS.ruleHair}` : 'none',
            background: i % 2 === 0 ? PF_TINTS.bg : hexAlpha(PF_TINTS.ink, 0.015),
          }}
        >
          <div
            style={{
              font: `600 10px ${PF_TINTS.mono}`,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: PF_TINTS.inkDim,
            }}
          >
            {cell.label}
          </div>
          <div
            style={{
              font: `600 16px ${PF_TINTS.sans}`,
              marginTop: 4,
              color: PF_TINTS.ink,
            }}
          >
            {cell.value}
          </div>
          {cell.subtitle && (
            <div
              style={{
                font: `500 10px ${PF_TINTS.mono}`,
                marginTop: 2,
                color: PF_TINTS.inkDim,
                letterSpacing: '0.04em',
              }}
            >
              {cell.subtitle}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
