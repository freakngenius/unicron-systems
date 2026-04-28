'use client';

// EscalationPill — TopBar pill that surfaces projects the Verifier has
// escalated to a human (verifier_pass_count >= 2). Hidden when count = 0
// so the chrome stays quiet while the Verifier is doing its job.
//
// Visual: warmRing background + warm text — same hue family as the
// Verifier's lime ring in the activity log + Agent Status row, so the
// affordance reads as "this came from the Verifier".

import * as React from 'react';
import { PF_TINTS } from '@/lib/agent-tints';

export interface EscalationPillProps {
  count: number;
  open: boolean;
  onClick: () => void;
}

export function EscalationPill({ count, open, onClick }: EscalationPillProps) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      className="pf-pill"
      onClick={onClick}
      aria-expanded={open}
      aria-label={`${count} project${count === 1 ? '' : 's'} escalated to a human by the Verifier`}
      title={`${count} project${count === 1 ? '' : 's'} escalated by the Verifier — failed re-check ≥ 2 times. Click to review.`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: open ? PF_TINTS.warmSoft : PF_TINTS.warmRing,
        // Warm hue is bright; pair with ink so the text stays legible
        // against either the ring (semi-transparent lime) or the soft fill.
        color: PF_TINTS.ink,
        border: `1px solid ${PF_TINTS.warm}`,
        cursor: 'pointer',
        fontWeight: 500,
      }}
    >
      <UpArrow />
      <span className="pf-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {count}
      </span>
      <span style={{ letterSpacing: '0.02em' }}>
        escalated
      </span>
    </button>
  );
}

function UpArrow() {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 13 V3" />
      <path d="M3 8 L8 3 L13 8" />
    </svg>
  );
}

export default EscalationPill;
