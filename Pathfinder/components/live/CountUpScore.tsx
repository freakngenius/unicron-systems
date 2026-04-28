'use client';

// CountUpScore — score chip that animates 0 → target over 600ms.
// Easing: cubic-out. Stream 3 swaps `<ScoreChip>` for `<CountUpScore>` while
// a project is in `useJustRanked()`.

import React, { useEffect, useState } from 'react';

import { PF_TINTS } from '@/lib/agent-tints';

export interface CountUpScoreProps {
  target: number | string;
  hi?: boolean;
  warm?: boolean;
  durationMs?: number;
}

export function CountUpScore({ target, hi, warm, durationMs = 600 }: CountUpScoreProps) {
  const [v, setV] = useState(0);

  useEffect(() => {
    const num = typeof target === 'number' ? target : parseInt(String(target), 10) || 0;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(Math.round(num * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  const bg = warm ? PF_TINTS.warmSoft : hi ? PF_TINTS.hiSoft : 'transparent';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 7px',
        borderRadius: 3,
        background: bg,
      }}
    >
      <span
        style={{
          font: `600 12px ${PF_TINTS.mono}`,
          color: PF_TINTS.ink,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {v}
      </span>
    </span>
  );
}

export default CountUpScore;
