// lib/catalog/modules/ranked-feed/RankedFeed.tsx, Stream B Dashboard +
// Stream E (Internal V2 cards + companies).
//
// Module 1: the ranked company feed (slot dashboard.hero) for Internal.
// The hero a rep triages without clicking, dense and Zedcor-calibrated.
//
// Stream E refactor: the inner card was extracted to
// components/catalog/cards/CompanyLeadCard.tsx so the Companies list
// (app/[slug]/leads/page.tsx) and the Pipeline kanban (Stream G) render
// through the same fixed card. RankedFeed now projects rows and delegates
// to CompanyLeadCard with the existing "ranked-feed" testid prefix so
// every selector in __tests__/catalog/ranked-feed/ stays stable.

import * as React from 'react';
import { EmptyState } from '@/components/design/EmptyState';
import { space } from '@/lib/design/tokens';
import {
  projectToCompanyLeadView,
} from '@/lib/agents/internal/companyLeadView';
import type { Project } from '@/lib/types';
import type { RawCompanyRow } from '@/lib/catalog/modules/filter-rail/applyFilters';
import { type LeadUnitSchema } from './labels';
import { CompanyLeadCard } from '@/components/catalog/cards/CompanyLeadCard';

void React;

interface RankedFeedProps {
  rows: readonly RawCompanyRow[];
  slug: string;
  schema: LeadUnitSchema;
}

export function RankedFeed({ rows, slug, schema }: RankedFeedProps): React.ReactElement {
  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        eyebrow="Ranked feed"
        title="No ranked companies yet"
        body="The Internal pipeline has not surfaced a scored company. The next ingest + ranker cycle will populate this view."
      />
    );
  }

  return (
    <div
      data-testid="ranked-feed"
      style={{ display: 'flex', flexDirection: 'column', gap: space.md }}
    >
      {rows.map((row) => {
        const view = projectToCompanyLeadView(row as unknown as Project);
        return (
          <CompanyLeadCard
            key={view.id}
            view={view}
            slug={slug}
            schema={schema}
            testIdPrefix="ranked-feed"
          />
        );
      })}
    </div>
  );
}

export default RankedFeed;
