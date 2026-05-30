// components/design/WhyLine.tsx, Stream A Foundation.
//
// One-line muted explainer. Used under titles, scores, or list items to
// answer "why this lead ranks where it does" in a single sentence. Surface
// streams import this so every "why" line has consistent typography.

import * as React from 'react';
import { color, fontSize } from '@/lib/design/tokens';

void React;

export interface WhyLineProps {
  children: React.ReactNode;
  /** Optional emphasis color override (e.g. for a flagged note). */
  tone?: 'muted' | 'accent';
}

export function WhyLine({ children, tone = 'muted' }: WhyLineProps): React.ReactElement {
  const c = tone === 'accent' ? color.accent : color.textMuted;
  return (
    <p
      data-design-why
      style={{
        margin: 0,
        color: c,
        fontSize: fontSize.sm,
        lineHeight: 1.4,
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
      }}
    >
      <span aria-hidden style={{ color: color.textDim, flex: '0 0 auto' }}>›</span>
      <span>{children}</span>
    </p>
  );
}

export default WhyLine;
