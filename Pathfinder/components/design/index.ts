// components/design/index.ts, Stream A Foundation.
//
// Single import surface for the shared design primitives. Surface streams
// B/C/D import { Card, ScoreBadge, WhyLine, EmptyState, SectionHeader } from
// '@/components/design'.

export { Card, type CardProps, type CardVariant } from './Card';
export { ScoreBadge, type ScoreBadgeProps } from './ScoreBadge';
export { WhyLine, type WhyLineProps } from './WhyLine';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { SectionHeader, type SectionHeaderProps } from './SectionHeader';
export {
  color,
  space,
  radius,
  font,
  fontSize,
  fontWeight,
  letterSpacing,
  scoreColor,
  designTokens,
  type DesignTokens,
} from '@/lib/design/tokens';
