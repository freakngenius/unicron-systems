'use client';

// components/lead/CrossPollinationCard.tsx — Demo Polish UX Gate 7A.
//
// Section 4 of the redesigned lead detail page. Promoted from Sidebar to a
// full row — the demo signature beat lives here.
//
// Gate 7A scope: stub. Re-renders the existing
// `components/zedcor/ZedcorRelationshipContext` to preserve the 12
// cross-pollination matches surfaced in Gate 2 (hard halt if any are lost).
// The full lift + reposition + per-match outreach-hook insertion lands in
// Gate 7B.

import * as React from 'react';

import {
  ZedcorRelationshipContext,
  type CrossPollinationMatchRow,
} from '@/components/zedcor/ZedcorRelationshipContext';

interface Props {
  matches: CrossPollinationMatchRow[];
  targetRegion: string | null;
}

export function CrossPollinationCard({ matches, targetRegion }: Props): React.ReactElement | null {
  // Spec § 4: hide entirely when 0 matches. Don't render an empty cross-poll
  // section.
  if (matches.length === 0) return null;

  return (
    <div data-testid="cross-pollination-card">
      <ZedcorRelationshipContext matches={matches} targetRegion={targetRegion} />
    </div>
  );
}
