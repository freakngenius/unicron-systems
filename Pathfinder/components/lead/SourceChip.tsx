'use client';

// components/lead/SourceChip.tsx — Demo Polish UX Gate 11C.
//
// Colored chip rendering of the project's source name, used in the Source
// Record section heading and other places that surface a source. Spec
// (Gate 11 dispatch § 11C):
//   sam.gov     → blue
//   USAspending → teal
//   harris      → amber
//   news        → gray
//
// The chip presents the source name with display capitalization
// (USAspending, not usaspending) and ignores trailing whitespace. Unknown
// sources render in a neutral gray so adding a new source doesn't crash
// the page.

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';

interface Props {
  source: string | null | undefined;
  /** Optional size variant. `sm` is used for inline section-heading
   *  placement. `md` for any standalone surface (rare). */
  size?: 'sm' | 'md';
}

interface ChipStyle {
  label: string;
  tint: string;
}

const STYLES: Record<string, ChipStyle> = {
  'sam.gov': { label: 'sam.gov', tint: '#2563eb' },          // blue
  usaspending: { label: 'USAspending', tint: '#0d9488' },    // teal
  harris: { label: 'Harris County', tint: '#d97706' },       // amber
  news: { label: 'News', tint: '#6b7280' },                  // gray
};

const FALLBACK_TINT = '#6b7280';

export function SourceChip({
  source,
  size = 'sm',
}: Props): React.ReactElement | null {
  if (!source) return null;
  const key = source.trim().toLowerCase();
  const style = STYLES[key] ?? { label: source, tint: FALLBACK_TINT };
  const fontSize = size === 'sm' ? 10 : 12;
  const padding = size === 'sm' ? '2px 8px' : '4px 10px';
  return (
    <span
      data-testid="source-chip"
      data-source={key}
      style={{
        display: 'inline-block',
        font: `600 ${fontSize}px ${PF_TINTS.mono}`,
        letterSpacing: '0.06em',
        color: style.tint,
        background: hexAlpha(style.tint, 0.1),
        border: `1px solid ${hexAlpha(style.tint, 0.4)}`,
        borderRadius: 4,
        padding,
        textTransform: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {style.label}
    </span>
  );
}
