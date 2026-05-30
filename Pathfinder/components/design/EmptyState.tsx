// components/design/EmptyState.tsx, Stream A Foundation.
//
// Designed empty state. Replaces ad-hoc dashed-border placeholders so every
// "nothing here yet" surface reads the same. Surface streams pass title,
// optional body, optional action node.

import * as React from 'react';
import { color, font, fontSize, fontWeight, letterSpacing, radius, space } from '@/lib/design/tokens';

void React;

export interface EmptyStateProps {
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  /** Short uppercase eyebrow above the title. */
  eyebrow?: string;
  /** Compact variant for in-line empty slots. */
  size?: 'md' | 'sm';
}

export function EmptyState({ title, body, action, eyebrow, size = 'md' }: EmptyStateProps): React.ReactElement {
  const pad = size === 'sm' ? space.lg : space.xxl;
  return (
    <div
      data-design-empty-state={size}
      role="status"
      style={{
        background: color.bgSubtle,
        border: `1px solid ${color.border}`,
        borderRadius: radius.xl,
        padding: `${pad}px ${space.xl}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: space.sm,
      }}
    >
      {eyebrow ? (
        <div
          data-design-empty-eyebrow
          style={{
            fontFamily: font.mono,
            fontSize: fontSize.eyebrow,
            letterSpacing: letterSpacing.widest,
            color: color.textMuted,
            textTransform: 'uppercase',
          }}
        >
          {eyebrow}
        </div>
      ) : null}
      <h3
        style={{
          margin: 0,
          color: color.text,
          fontFamily: font.sans,
          fontSize: size === 'sm' ? fontSize.md : fontSize.lg,
          fontWeight: fontWeight.semi,
          lineHeight: 1.2,
        }}
      >
        {title}
      </h3>
      {body ? (
        <p
          style={{
            margin: 0,
            color: color.textMuted,
            fontFamily: font.sans,
            fontSize: fontSize.sm,
            lineHeight: 1.5,
            maxWidth: 480,
          }}
        >
          {body}
        </p>
      ) : null}
      {action ? <div style={{ marginTop: space.sm }}>{action}</div> : null}
    </div>
  );
}

export default EmptyState;
