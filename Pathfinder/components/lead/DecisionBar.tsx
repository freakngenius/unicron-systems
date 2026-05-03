'use client';

// components/lead/DecisionBar.tsx — Demo Polish UX Gate 7A.
//
// Single horizontal strip below the header on the redesigned lead detail
// page. Three responsibilities (per SPEC § 2):
//   1. Verdict line (left) — generated from score + verifier + cross-poll
//   2. Primary CTA (center) — driven by lead's current pipeline stage
//   3. Secondary actions (right) — Send via Gmail / Outlook
//
// Gate 7A scope: stub. Renders the structural placeholder so the redesigned
// LeadDetail composes correctly. Verdict-line generation + stage-aware CTA
// land in Gate 7B.

import * as React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';
import type { Project } from '@/lib/types';

interface Props {
  project: Project;
  hasCrossPollMatches: boolean;
}

export function DecisionBar({ project, hasCrossPollMatches }: Props): React.ReactElement {
  // 7A placeholder verdict — concatenates score + verifier + warm-intro flag.
  // 7B replaces with structured generation.
  const score = project.score ?? null;
  const verified = project.verified === true;
  const verdictParts: string[] = [];
  if (score != null) verdictParts.push(`Score ${score}`);
  if (verified) verdictParts.push('verified');
  if (hasCrossPollMatches) verdictParts.push('warm intro available');
  const verdict = verdictParts.length > 0 ? verdictParts.join(' · ') : 'Pending rank';

  return (
    <section
      data-testid="decision-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '12px 16px',
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        marginBottom: 18,
      }}
    >
      <div
        data-testid="decision-bar-verdict"
        style={{
          font: `500 13px ${PF_TINTS.sans}`,
          color: PF_TINTS.ink,
          flex: '1 1 auto',
        }}
      >
        {verdict}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          flex: '0 0 auto',
        }}
      >
        <span
          data-testid="decision-bar-cta-placeholder"
          style={{
            font: `500 11px ${PF_TINTS.mono}`,
            color: PF_TINTS.inkDim,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Open in Outreach (7B)
        </span>
      </div>
    </section>
  );
}
