'use client';

// components/lead/RationaleCard.tsx — Demo Polish UX Gate 9A.
//
// Cyan-tinted card holding the long-form rationale string from
// pathfinder.projects.rationale. Top-right CACHED indicator when the
// rationale was streamed previously (rationale_streamed_at present),
// matching the SPEC - Lead Detail Page v2.md § 3 contract.
//
// Ported from the Rationale Section block in components/ProjectModal.tsx.
// The page-route LeadDetail does not animate (Typewriter) — that effect
// is reserved for the modal-on-dashboard surface so the demo's first
// open feels live without re-streaming on every refresh.

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import type { Project } from '@/lib/types';

interface Props {
  project: Project;
}

const HI = '#22d3ee';

export function RationaleCard({ project }: Props): React.ReactElement {
  const rationale =
    project.rationale ??
    'Rationale pending. Once Pathfinder Ranker scores this project, the reasoning will appear here.';
  const cached = project.rationale_streamed_at != null;

  return (
    <section
      data-testid="lead-detail-rationale-card"
      style={{
        background: hexAlpha(HI, 0.08),
        border: `1px solid ${hexAlpha(HI, 0.45)}`,
        borderRadius: PF_TINTS.r.md,
        padding: 18,
        position: 'relative',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
        }}
      >
        <h3
          style={{
            margin: 0,
            font: `600 11px ${PF_TINTS.mono}`,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: PF_TINTS.ink,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: HI,
              display: 'inline-block',
            }}
          />
          Rationale
        </h3>
        {cached && (
          <span
            data-testid="lead-detail-rationale-cached"
            style={{
              font: `600 9px ${PF_TINTS.mono}`,
              letterSpacing: '0.1em',
              color: PF_TINTS.inkDim,
              padding: '2px 6px',
              border: `1px solid ${PF_TINTS.ruleHair}`,
              borderRadius: 3,
            }}
          >
            CACHED
          </span>
        )}
      </header>
      <p
        style={{
          margin: 0,
          font: `400 13px/1.55 ${PF_TINTS.sans}`,
          color: PF_TINTS.ink,
          whiteSpace: 'pre-wrap',
        }}
      >
        {rationale}
      </p>
    </section>
  );
}
