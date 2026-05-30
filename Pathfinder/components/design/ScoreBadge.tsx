// components/design/ScoreBadge.tsx, Stream A Foundation.
//
// Score badge, threshold-tinted. >=80 high, >=60 mid, else low. Matches the
// Zedcor ScorePill at components/zedcor/ZedcorLeadList.tsx so the three rework
// surfaces read against the same calibration.

import * as React from 'react';
import { color, font, fontWeight, radius, scoreColor } from '@/lib/design/tokens';

void React;

export interface ScoreBadgeProps {
  score: number | null | undefined;
  size?: 'sm' | 'md';
  /** When true, show "Score X" instead of bare number. */
  label?: boolean;
}

export function ScoreBadge({ score, size = 'md', label = false }: ScoreBadgeProps): React.ReactElement {
  if (score == null) {
    return (
      <span
        data-score-badge="empty"
        style={{
          color: color.textMuted,
          fontFamily: font.mono,
          fontSize: size === 'sm' ? 11 : 12,
        }}
      >
        -
      </span>
    );
  }
  const c = scoreColor(score);
  const padX = size === 'sm' ? 6 : 8;
  const padY = size === 'sm' ? 1 : 2;
  return (
    <span
      data-score-badge={score >= 80 ? 'high' : score >= 60 ? 'mid' : 'low'}
      style={{
        display: 'inline-block',
        minWidth: size === 'sm' ? 32 : 38,
        padding: `${padY}px ${padX}px`,
        borderRadius: radius.sm,
        background: `${c}22`,
        color: c,
        fontFamily: font.mono,
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: fontWeight.bold,
        textAlign: 'center',
      }}
    >
      {label ? `Score ${score}` : score}
    </span>
  );
}

export default ScoreBadge;
