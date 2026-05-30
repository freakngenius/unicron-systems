// components/design/Card.tsx, Stream A Foundation.
//
// Shared card shell. Surface streams compose this around module contents so
// every surface inherits the same elevation, border, and padding language.
//
// Variants:
//  - default: solid background, full border. Use for primary content cards.
//  - subtle:  translucent background, lighter border. Use for nested groups
//             or secondary panels.

import * as React from 'react';
import { color, radius, space } from '@/lib/design/tokens';

void React;

export type CardVariant = 'default' | 'subtle';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padded?: boolean;
  children: React.ReactNode;
}

export function Card({
  variant = 'default',
  padded = true,
  style,
  children,
  ...rest
}: CardProps): React.ReactElement {
  const base = {
    background: variant === 'subtle' ? color.bgSubtle : color.bg,
    border: `1px solid ${variant === 'subtle' ? color.border : color.border}`,
    borderRadius: radius.lg,
    padding: padded ? `${space.lg}px ${space.xl}px` : 0,
    color: color.text,
  } satisfies React.CSSProperties;
  return (
    <div data-design-card={variant} style={{ ...base, ...(style ?? {}) }} {...rest}>
      {children}
    </div>
  );
}

export default Card;
