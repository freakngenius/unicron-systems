// components/design/SectionHeader.tsx, Stream A Foundation.
//
// Section header: mono uppercase eyebrow + bold title + optional trailing slot.
// Calibrated to the Zedcor lead-list header pattern (ZEDCOR · LEAD LIST /
// "143 leads").

import * as React from 'react';
import { color, font, fontSize, fontWeight, letterSpacing, space } from '@/lib/design/tokens';

void React;

export interface SectionHeaderProps {
  eyebrow?: string;
  title: React.ReactNode;
  /** Right-aligned slot for counts, actions, or filter selects. */
  trailing?: React.ReactNode;
  /** When provided, rendered as a muted subtitle line below the title. */
  subtitle?: React.ReactNode;
}

export function SectionHeader({ eyebrow, title, trailing, subtitle }: SectionHeaderProps): React.ReactElement {
  return (
    <div
      data-design-section-header
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: space.md,
        marginBottom: space.md,
        flexWrap: 'wrap',
      }}
    >
      <div>
        {eyebrow ? (
          <div
            data-design-section-eyebrow
            style={{
              fontFamily: font.mono,
              fontSize: fontSize.eyebrow,
              letterSpacing: letterSpacing.wider,
              color: color.textMuted,
              textTransform: 'uppercase',
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <h2
          style={{
            margin: eyebrow ? `${space.xs}px 0 0` : 0,
            color: color.text,
            fontFamily: font.sans,
            fontSize: fontSize.xl,
            fontWeight: fontWeight.semi,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>
        {subtitle ? (
          <div
            style={{
              marginTop: space.xs,
              color: color.textMuted,
              fontSize: fontSize.sm,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      {trailing ? <div>{trailing}</div> : null}
    </div>
  );
}

export default SectionHeader;
