'use client';

// components/lead/RecommendedAction.tsx — Demo Polish UX Gate 7A.
//
// Section 5 of the redesigned lead detail page. Surfaces the recommended
// first move extracted from the rationale, plus buying contact + timing
// pressure (per SPEC § 5).
//
// Gate 7A scope: stub. Calls parse-rationale (which returns fallback shape
// in 7A) and renders a placeholder pointer to the rationale block in
// section 6. Full extraction + structured render lands in Gate 7B.

import * as React from 'react';

import { parseRationale } from '@/lib/leads/parse-rationale';
import { PF_TINTS } from '@/lib/agent-tints';
import type { Project } from '@/lib/types';

interface Props {
  project: Project;
}

export function RecommendedAction({ project }: Props): React.ReactElement | null {
  const parsed = parseRationale(project.rationale);

  // 7A: when parse falls back, hide the section. 7B replaces this with the
  // structured render once parse-rationale extracts the action sentence.
  if (parsed.fallback) {
    return null;
  }

  return (
    <section
      data-testid="recommended-action"
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        padding: 14,
      }}
    >
      <h3
        style={{
          margin: '0 0 8px',
          font: `600 11px ${PF_TINTS.sans}`,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: PF_TINTS.inkSub,
        }}
      >
        Recommended action
      </h3>
      {parsed.action && (
        <p style={{ margin: 0, font: `500 14px/1.45 ${PF_TINTS.sans}`, color: PF_TINTS.ink }}>
          {parsed.action}
        </p>
      )}
      {parsed.buyingContact && (
        <div
          style={{
            marginTop: 8,
            font: `400 12px ${PF_TINTS.sans}`,
            color: PF_TINTS.inkSub,
          }}
        >
          Contact: {parsed.buyingContact}
        </div>
      )}
      {parsed.timingPressure && (
        <div
          style={{
            marginTop: 4,
            font: `500 12px ${PF_TINTS.mono}`,
            color: PF_TINTS.inkDim,
          }}
        >
          {parsed.timingPressure}
        </div>
      )}
    </section>
  );
}
