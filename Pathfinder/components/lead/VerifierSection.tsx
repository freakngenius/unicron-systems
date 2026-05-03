'use client';

// components/lead/VerifierSection.tsx — Demo Polish UX Gate 9A.
//
// Wraps the Verifier badge + body text in a section heading matching the
// v2 aesthetic (uppercase mono). Ported from the Verifier Section block
// in components/ProjectModal.tsx. Section 8 of the v2 lead detail page.

import * as React from 'react';

import { VerifierBadge } from '@/components/ProjectList';
import { PF_TINTS } from '@/lib/agent-tints';
import type { Project } from '@/lib/types';

import { SectionHeading } from './SectionHeading';

interface Props {
  project: Project;
}

function statusSub(verified: boolean | null | undefined): string {
  if (verified === true) return 'passed · all 4 checks';
  if (verified === false) return 'flagged · awaiting re-rank';
  return 'awaiting verifier';
}

function bodyText(
  verified: boolean | null | undefined,
  notes: string | null | undefined,
): string {
  const trimmed = (notes ?? '').trim();
  if (verified == null) {
    return 'Pending verification — Generator-Verifier loop will check rationale, branch attribution, score sensibility, and customer references.';
  }
  if (trimmed.length > 0) return trimmed;
  if (verified === true) {
    return 'Verifier passed all 4 checks (rationale · branch · score · customer-refs).';
  }
  return 'Verifier flagged at least one check. Awaiting re-rank.';
}

export function VerifierSection({ project }: Props): React.ReactElement {
  const verified = project.verified ?? null;
  const passCount = project.verifier_pass_count ?? 0;
  return (
    <section data-testid="lead-detail-verifier-section">
      <SectionHeading title="Verifier" sub={statusSub(verified)} />
      <div
        style={{
          background: PF_TINTS.bg,
          border: `1px solid ${PF_TINTS.ruleSoft}`,
          borderRadius: PF_TINTS.r.md,
          padding: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <VerifierBadge verified={verified} />
          {passCount > 0 && (
            <span
              style={{
                font: `500 10px ${PF_TINTS.mono}`,
                color: PF_TINTS.inkDim,
                letterSpacing: '0.04em',
              }}
            >
              pass count · {passCount}
            </span>
          )}
        </div>
        <p
          style={{
            margin: 0,
            font: `400 13px/1.55 ${PF_TINTS.sans}`,
            color: PF_TINTS.ink,
          }}
        >
          {bodyText(verified, project.verifier_notes ?? null)}
        </p>
      </div>
    </section>
  );
}
