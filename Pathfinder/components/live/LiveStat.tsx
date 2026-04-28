'use client';

// LiveStat — top-bar stat slot that flashes background `hi-soft` when its
// underlying value changes. Reads from `useStats()` (poll + realtime).
// Slot widths are fixed per `valueKey` so the row doesn't reflow on tick.

import React, { useEffect, useReducer } from 'react';

import { PF_TINTS } from '@/lib/agent-tints';
import { useStats, type StatsKey } from '@/lib/realtime';

export interface LiveStatProps {
  label: string;
  valueKey: StatsKey;
  /** `'hi'` adds the cyan up-arrow accent next to the number. */
  accent?: 'hi' | null;
  /** Render in muted ink instead of full ink. */
  muted?: boolean;
}

const SLOT_WIDTH: Record<StatsKey, number> = { new: 56, total: 70, ranked: 56, err: 40 };

export function LiveStat({ label, valueKey, accent, muted }: LiveStatProps) {
  const { stats, bumped } = useStats();
  const value = stats[valueKey];
  const ts = bumped[valueKey];
  const flashing = ts && Date.now() - ts < 900;

  // Re-render once after the flash window so the box-shadow halo clears.
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!flashing) return;
    const id = setTimeout(force, 950);
    return () => clearTimeout(id);
  }, [ts, flashing]);

  const fmt = (n: number): string => n.toLocaleString();
  const SLOT = SLOT_WIDTH[valueKey] ?? 56;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        alignItems: 'flex-end',
        width: SLOT,
        flexShrink: 0,
      }}
    >
      <span
        className="pf-num"
        style={{
          display: 'inline-block',
          textAlign: 'right',
          color: muted ? PF_TINTS.inkFaint : PF_TINTS.ink,
          fontSize: 16,
          lineHeight: '20px',
          background: flashing ? PF_TINTS.hiSoft : 'transparent',
          borderRadius: 2,
          boxShadow: flashing ? `0 0 0 4px ${PF_TINTS.hiSoft}` : 'none',
          transition: 'background 300ms ease-out, box-shadow 300ms ease-out',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {fmt(value)}
        {accent === 'hi' && <span style={{ color: PF_TINTS.hi, marginLeft: 4 }}>↑</span>}
      </span>
      <span className="pf-label" style={{ fontSize: 9 }}>
        {label}
      </span>
    </div>
  );
}

export default LiveStat;
