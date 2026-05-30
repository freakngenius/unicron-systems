// lib/catalog/modules/ranked-feed/RankedFeed.tsx, Stream B Dashboard.
//
// Module 1: the ranked company feed (slot dashboard.hero) for Internal.
// The hero a rep triages without clicking, dense and Zedcor-calibrated.
// Each card surfaces real values with human labels (company, service
// category, operating footprint, sales motion) plus a one-line "why"
// pulled from row.rationale, with the score badge in the top-right.
//
// Reuses lib/agents/internal/companyLeadView.projectToCompanyLeadView so
// the same Internal projection (enum slug to humanized label, geo to
// formatted footprint string, etc.) backs both the dashboard and the
// existing detail view. Clicking a card opens the detail route via
// lib/nav/orgPath.buildOrgPath so the org slug is never dropped (the
// detail page itself is Stream C).

import * as React from 'react';
import Link from 'next/link';
import { Card } from '@/components/design/Card';
import { ScoreBadge } from '@/components/design/ScoreBadge';
import { EmptyState } from '@/components/design/EmptyState';
import { color, font, fontSize, fontWeight, letterSpacing, space } from '@/lib/design/tokens';
import { buildOrgPath } from '@/lib/nav/orgPath';
import {
  projectToCompanyLeadView,
  type CompanyLeadView,
} from '@/lib/agents/internal/companyLeadView';
import type { Project } from '@/lib/types';
import type { RawCompanyRow } from '@/lib/catalog/modules/filter-rail/applyFilters';
import { displayLabel, type LeadUnitSchema } from './labels';

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
        return <RankedFeedCard key={row.id} row={row} view={view} slug={slug} schema={schema} />;
      })}
    </div>
  );
}

interface CardInnerProps {
  row: RawCompanyRow;
  view: CompanyLeadView;
  slug: string;
  schema: LeadUnitSchema;
}

function RankedFeedCard({ row, view, slug, schema }: CardInnerProps): React.ReactElement {
  const href = buildOrgPath(slug, 'leads', row.id);
  const why = oneLineWhy(view.rationale);

  return (
    <Link
      href={href}
      data-testid={`ranked-feed-link-${row.id}`}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Card data-testid={`ranked-feed-card-${row.id}`} padded>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.lg }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3
              style={{
                margin: 0,
                color: color.text,
                fontFamily: font.sans,
                fontSize: fontSize.lg,
                fontWeight: fontWeight.semi,
                lineHeight: 1.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {view.company_name}
            </h3>
            <div
              style={{
                marginTop: space.xs,
                color: color.textMuted,
                fontFamily: font.mono,
                fontSize: fontSize.eyebrow,
                letterSpacing: letterSpacing.wider,
                textTransform: 'uppercase',
              }}
            >
              {displayLabel(schema, 'score')}{' '}
              <span data-testid={`ranked-feed-rank-eyebrow-${row.id}`}>{view.score ?? '-'}</span>
            </div>
          </div>
          <div data-testid={`ranked-feed-score-${row.id}`}>
            <ScoreBadge score={view.score} />
          </div>
        </div>

        <FieldGrid view={view} schema={schema} />

        {why ? (
          <p
            data-testid={`ranked-feed-why-${row.id}`}
            style={{
              margin: `${space.md}px 0 0`,
              color: color.text,
              fontFamily: font.sans,
              fontSize: fontSize.sm,
              lineHeight: 1.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {why}
          </p>
        ) : null}
      </Card>
    </Link>
  );
}

function FieldGrid({ view, schema }: { view: CompanyLeadView; schema: LeadUnitSchema }): React.ReactElement {
  const items: Array<{ key: string; value: string | null }> = [
    { key: 'service_category', value: view.service_category },
    { key: 'footprint', value: view.footprint },
    { key: 'sales_motion', value: view.sales_motion },
  ];
  return (
    <div
      style={{
        marginTop: space.md,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: `${space.sm}px ${space.lg}px`,
      }}
    >
      {items.map(({ key, value }) => (
        <FieldRow key={key} label={displayLabel(schema, key)} value={value} />
      ))}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string | null }): React.ReactElement {
  return (
    <div>
      <div
        style={{
          color: color.textMuted,
          fontFamily: font.mono,
          fontSize: fontSize.eyebrow,
          letterSpacing: letterSpacing.wider,
          textTransform: 'uppercase',
          marginBottom: space.xs,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: value ? color.text : color.textDim,
          fontFamily: font.sans,
          fontSize: fontSize.sm,
        }}
      >
        {value ?? '-'}
      </div>
    </div>
  );
}

/**
 * Trim and clamp a rationale paragraph down to a single sentence (or 180
 * chars, whichever comes first). The hero is supposed to be triagable
 * without a click; the full rationale belongs on the detail page.
 */
function oneLineWhy(rationale: string | null | undefined): string | null {
  if (!rationale) return null;
  const clean = rationale.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const sentenceEnd = clean.search(/[.!?](\s|$)/);
  const firstSentence = sentenceEnd >= 0 ? clean.slice(0, sentenceEnd + 1) : clean;
  if (firstSentence.length <= 180) return firstSentence;
  return `${firstSentence.slice(0, 177)}...`;
}

export default RankedFeed;
