'use client';

// EscalationPopover — anchored under the EscalationPill in the TopBar.
// Lists every project the Verifier has handed off to a human (i.e. those
// where `verifier_pass_count >= 2`). Click a row → opens the ProjectModal.
//
// Pattern is parallel to StatPopover.tsx — same scrim, same anchored
// dialog shape, same row styling — but it owns its own data fetch via
// `useEscalations()` instead of receiving an array prop.

import * as React from 'react';
import type { Branch, Project } from '@/lib/types';
import { PF_TINTS } from '@/lib/agent-tints';
import { useEscalations } from '@/lib/realtime';
import { ScoreChip } from './ProjectList';

const HI_THRESHOLD = 80;

const PF = {
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
  ink: '#0a0a0a',
  inkSub: '#3a3f46',
  inkDim: '#6b7280',
  ruleSoft: 'rgba(10,10,10,0.12)',
  ruleHair: 'rgba(10,10,10,0.06)',
  warm: PF_TINTS.warm,
  warmSoft: PF_TINTS.warmSoft,
  warmRing: PF_TINTS.warmRing,
  sans: 'var(--font-inter), system-ui, sans-serif',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as const;

export interface EscalationPopoverProps {
  branches: Branch[];
  /** Pixel offset from the right edge — aligns under the pill in TopBar. */
  rightOffset: number;
  topOffset: number;
  onClose: () => void;
  onOpenProject: (p: Project) => void;
}

export function EscalationPopover({
  branches,
  rightOffset,
  topOffset,
  onClose,
  onOpenProject,
}: EscalationPopoverProps) {
  const escalations = useEscalations();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const branchById = React.useMemo(() => {
    const m = new Map<string, Branch>();
    for (const b of branches) m.set(b.id, b);
    return m;
  }, [branches]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 49,
          background: 'transparent',
        }}
      />
      <div
        role="dialog"
        aria-label="Escalated projects"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: topOffset,
          right: rightOffset,
          width: 420,
          maxHeight: 480,
          background: PF.bg,
          border: `1px solid ${PF.ruleSoft}`,
          borderRadius: 5,
          boxShadow: '0 12px 32px rgba(10,10,10,0.16), 0 0 0 1px rgba(10,10,10,0.08)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 50,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 14px',
            borderBottom: `1px solid ${PF.ruleSoft}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            // Lime accent stripe along the top so the popover reads as
            // Verifier-owned, matching the Generator-Verifier hue family.
            boxShadow: `inset 0 2px 0 0 ${PF.warm}`,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="pf-label" style={{ fontSize: 9 }}>
              Verifier · escalated to human
            </span>
            <span
              className="pf-mono"
              style={{ fontSize: 11, color: PF.inkDim, letterSpacing: '0.04em' }}
            >
              {escalations.length} project{escalations.length === 1 ? '' : 's'} · pass_count ≥ 2
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: PF.bgAlt,
              border: 'none',
              borderRadius: 4,
              width: 24,
              height: 24,
              cursor: 'pointer',
              color: PF.inkDim,
              font: `400 13px ${PF.sans}`,
            }}
          >
            ✕
          </button>
        </div>
        <div className="pf-scrollbar" style={{ overflowY: 'auto', flex: 1 }}>
          {escalations.length === 0 ? (
            <div
              style={{
                padding: '20px 16px',
                color: PF.inkDim,
                font: `400 12px/1.5 ${PF.sans}`,
              }}
            >
              No escalations. The Verifier hasn&apos;t handed any projects off yet.
            </div>
          ) : (
            escalations.map((p) => {
              const branch = p.nearest_branch_id ? branchById.get(p.nearest_branch_id) : null;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onOpenProject(p);
                    onClose();
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 14px',
                    border: 'none',
                    background: 'transparent',
                    borderBottom: `1px solid ${PF.ruleHair}`,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = PF.bgAlt;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 12,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      className="pf-mono"
                      style={{
                        fontSize: 9,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: PF.inkDim,
                      }}
                    >
                      {p.source}
                      {branch ? ` · ${branch.code}` : ''}
                      {' · '}
                      pass {p.verifier_pass_count ?? 0}
                    </span>
                    <ScoreChip
                      value={p.score}
                      hi={(p.score ?? 0) >= HI_THRESHOLD}
                      warm={!!p.warm_for_customer_id}
                    />
                  </div>
                  <div
                    style={{
                      font: `500 13px/1.35 ${PF.sans}`,
                      color: PF.ink,
                      marginBottom: 4,
                    }}
                  >
                    {p.title}
                  </div>
                  {p.verifier_notes ? (
                    <div
                      style={{
                        font: `400 11px/1.45 ${PF.sans}`,
                        color: PF.inkSub,
                        background: PF.warmSoft,
                        borderLeft: `2px solid ${PF.warm}`,
                        padding: '6px 8px',
                        borderRadius: 2,
                      }}
                    >
                      {p.verifier_notes}
                    </div>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

export default EscalationPopover;
