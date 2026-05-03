'use client';

// components/lead/ScoreBreakdown.tsx — Demo Polish UX Gate 7A.
//
// Section 7 of the redesigned lead detail page. Component scores with
// weights, default collapsed (per SPEC § 7).
//
// Gate 7A scope: stub. Renders the collapsible shell + total score row.
// Per-component breakdown reads from `pathfinder.score_components` (or
// wherever the Ranker writes); Gate 7B wires the data fetch.

import * as React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';
import type { Project } from '@/lib/types';

interface Props {
  project: Project;
}

export function ScoreBreakdown({ project }: Props): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const score = project.score ?? null;

  return (
    <section
      data-testid="score-breakdown"
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        padding: 14,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="score-breakdown-toggle"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: PF_TINTS.inkSub,
        }}
      >
        <span
          style={{
            font: `600 11px ${PF_TINTS.sans}`,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Score breakdown {score != null ? `· ${score}` : ''}
        </span>
        <span style={{ font: `500 11px ${PF_TINTS.mono}` }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div
          data-testid="score-breakdown-detail"
          style={{
            marginTop: 10,
            font: `400 12px ${PF_TINTS.sans}`,
            color: PF_TINTS.inkDim,
            fontStyle: 'italic',
          }}
        >
          Component-level breakdown lands in Gate 7B (reads pathfinder.score_components).
        </div>
      )}
    </section>
  );
}
