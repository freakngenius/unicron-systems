'use client';

// components/lead/SectionHeading.tsx — Demo Polish UX Gate 9A.
//
// Shared uppercase-mono section heading used to label every v2 section
// (Project Facts, Contacts, Relationship Context, Outreach, Verifier,
// Source Record). Spec § "Section heading polish".

import * as React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';

interface Props {
  title: string;
  /** Optional sub-label rendered to the right of the title (e.g. counts, status). */
  sub?: string | null;
  /** Optional element rendered to the right (overrides sub). */
  rightSlot?: React.ReactNode;
}

export function SectionHeading({
  title,
  sub = null,
  rightSlot,
}: Props): React.ReactElement {
  return (
    <header
      data-testid={`section-heading-${title.toLowerCase().replace(/\s+/g, '-')}`}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 8,
        paddingBottom: 4,
        borderBottom: `1px solid ${PF_TINTS.ruleHair}`,
        gap: 12,
      }}
    >
      <h2
        style={{
          margin: 0,
          font: `600 11px ${PF_TINTS.mono}`,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: PF_TINTS.ink,
        }}
      >
        {title}
      </h2>
      {rightSlot ? (
        <div>{rightSlot}</div>
      ) : sub ? (
        <span
          style={{
            font: `500 10px ${PF_TINTS.mono}`,
            letterSpacing: '0.06em',
            color: PF_TINTS.inkDim,
            textTransform: 'lowercase',
          }}
        >
          {sub}
        </span>
      ) : null}
    </header>
  );
}
