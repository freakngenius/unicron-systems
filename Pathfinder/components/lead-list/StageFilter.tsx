'use client';

// Demo Polish UX § Gate 19 — Stage filter dropdown.
//
// Multi-check stage selector that lives next to the Range / Score-floor
// controls in the right-rail ProjectList header. Selection state is
// passed in (read from URL via lib/list-filters.ts) and changes are
// pushed back through `onChange`, which the parent serializes to the
// `?stages=` query param.
//
// Visual rules (from the dispatch spec):
//   - Stages render in earliest → latest order.
//   - A divider line separates the bid-window-open band (indices 0..4)
//     from the post-award subcontract band (index 5 = 'awarded').
//   - Below the divider, an italic line: "Bid window closed —
//     subcontract opportunity only".
//   - Footer shows the count of leads matching the current selection
//     (parent computes; we just display).
//   - Default state (`stages == null`) reads as "all 6 checked".

import * as React from 'react';
import {
  STAGE_NORMALIZED_ORDER,
  STAGE_LABELS,
  BID_WINDOW_DIVIDER_INDEX,
  ALL_STAGES_SET,
  type NormalizedStage,
} from '@/lib/leads/stage-normalize';

const PF = {
  bg: '#ffffff',
  bgAlt: '#f6f7f9',
  ink: '#0a0a0a',
  inkDim: '#6b7280',
  inkFaint: '#9ca3af',
  ruleSoft: 'rgba(10,10,10,0.12)',
  ruleHair: 'rgba(10,10,10,0.06)',
  hi: '#22d3ee',
  mono: 'var(--font-jetbrains-mono), ui-monospace, monospace',
} as const;

export interface StageFilterProps {
  /** Active selection. `null` = no narrowing (all 6 stages render as
   * checked in the UI). */
  selection: ReadonlySet<NormalizedStage> | null;
  /** Push a new selection back to the parent. The parent decides
   * whether to write it to the URL or to localStorage; we just emit. */
  onChange: (next: ReadonlySet<NormalizedStage> | null) => void;
  /** Count of leads matching the current selection — surfaced in the
   * popover footer so the operator sees the impact before they close
   * the popover. Computed by the parent so it stays in lockstep with
   * the right-rail "X of Y" header. */
  matchingCount: number;
}

export function StageFilter({ selection, onChange, matchingCount }: StageFilterProps) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  // Effective set used for rendering checkboxes — `null` means "show
  // everything", which the UI presents as "all 6 boxes ticked."
  const effective: ReadonlySet<NormalizedStage> = selection ?? ALL_STAGES_SET;
  const totalStages = STAGE_NORMALIZED_ORDER.length;
  const selectedCount = effective.size;
  const isNarrowed = selectedCount > 0 && selectedCount < totalStages;

  // Click-outside + ESC to close. We attach in capture so the scrim
  // pattern from StatPopover isn't required (no full-screen overlay).
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const wrap = wrapRef.current;
      if (wrap && !wrap.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const toggle = (stage: NormalizedStage) => {
    const next = new Set(effective);
    if (next.has(stage)) {
      next.delete(stage);
    } else {
      next.add(stage);
    }
    // Collapse "all selected" back to `null` so URLs stay clean and the
    // empty-narrow case is unambiguous downstream.
    if (next.size === totalStages) {
      onChange(null);
      return;
    }
    onChange(next);
  };

  const setAll = () => onChange(null);
  const setNone = () => onChange(new Set());

  const pillLabel = isNarrowed
    ? `Filter: Stage (${selectedCount} of ${totalStages})`
    : 'Filter: Stage';

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          appearance: 'none',
          background: PF.bg,
          color: PF.ink,
          border: `1px solid ${isNarrowed ? PF.ink : PF.ruleSoft}`,
          borderRadius: 3,
          padding: '4px 22px 4px 8px',
          font: `500 11px ${PF.mono}`,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 4l3 3 3-3' stroke='%236b7280' stroke-width='1.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 6px center',
        }}
      >
        {pillLabel}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Filter projects by stage"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 40,
            minWidth: 220,
            background: PF.bg,
            border: `1px solid ${PF.ruleSoft}`,
            borderRadius: 4,
            boxShadow: '0 10px 24px rgba(10,10,10,0.12)',
            padding: '8px 0',
            font: `500 12px ${PF.mono}`,
            color: PF.ink,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: '0 12px 8px',
              borderBottom: `1px solid ${PF.ruleHair}`,
            }}
          >
            <button
              type="button"
              onClick={setAll}
              style={linkBtn(selectedCount === totalStages)}
            >
              All
            </button>
            <span style={{ color: PF.inkFaint }}>·</span>
            <button
              type="button"
              onClick={setNone}
              style={linkBtn(selectedCount === 0)}
            >
              None
            </button>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: '4px 0' }}>
            {STAGE_NORMALIZED_ORDER.map((stage, i) => {
              const checked = effective.has(stage);
              const showDivider = i === BID_WINDOW_DIVIDER_INDEX;
              return (
                <React.Fragment key={stage}>
                  {showDivider && (
                    <li
                      aria-hidden
                      style={{
                        margin: '4px 12px',
                        padding: '6px 0 4px',
                        borderTop: `1px solid ${PF.ruleSoft}`,
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          fontStyle: 'italic',
                          fontSize: 10,
                          color: PF.inkDim,
                          letterSpacing: '0.02em',
                        }}
                      >
                        Bid window closed — subcontract opportunity only
                      </span>
                    </li>
                  )}
                  <li>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(stage)}
                        style={{ accentColor: PF.ink, cursor: 'pointer' }}
                      />
                      <span>{STAGE_LABELS[stage]}</span>
                    </label>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
          <div
            style={{
              borderTop: `1px solid ${PF.ruleHair}`,
              padding: '8px 12px 0',
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: PF.inkDim,
            }}
          >
            {matchingCount} {matchingCount === 1 ? 'lead' : 'leads'} match
          </div>
        </div>
      )}
    </div>
  );
}

function linkBtn(active: boolean): React.CSSProperties {
  return {
    appearance: 'none',
    background: 'transparent',
    border: 0,
    padding: 0,
    color: active ? PF.inkFaint : PF.ink,
    font: `500 11px ${PF.mono}`,
    letterSpacing: '0.04em',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
    cursor: active ? 'default' : 'pointer',
  };
}
