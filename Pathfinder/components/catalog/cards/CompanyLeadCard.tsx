// components/catalog/cards/CompanyLeadCard.tsx, Stream E (Internal V2).
//
// The one fixed Internal lead card. Per SPEC-Internal-Rework-V2.md Stream E,
// the Companies list, the Dashboard ranked feed, and the Pipeline kanban
// cards all render through this component so they stay visually consistent.
// Extracted from the Stream B ranked-feed module's inner card; the visual
// language and primitives (Card shell, ScoreBadge, design tokens) are
// unchanged.
//
// Render contract:
//   - Header: company name (h3) and a ScoreBadge top-right with the real
//     stored score (no fabricated breakdown).
//   - Eyebrow line under the title: "<schema display_label for score> <value>".
//   - FieldGrid: service_category, footprint, sales_motion projected through
//     CompanyLeadView with display_labels resolved via the Stream B chokepoint
//     at lib/catalog/modules/ranked-feed/labels.ts. A null value renders as
//     "-" (no em-dash).
//   - One-line "why" from rationale, clamped to a sentence or 180 chars.
//
// Two render modes (`mode` prop):
//   - "link" (default): wraps the card in a Next link to the org-scoped
//     detail route (`/[slug]/leads/[id]`) via buildOrgPath, the existing
//     org-context-preserving nav helper. This is what the Companies list and
//     the Dashboard ranked feed use.
//   - "bare": renders the card without a link wrapper, so the kanban (Stream
//     G) can wrap the card with drag handlers without nested anchors.
//
// `data-testid` prefix defaults to "company-lead-card" but accepts an
// override so each surface keeps its specific selectors stable (the
// ranked-feed view still uses `ranked-feed-card-<id>`).

import * as React from 'react';
import Link from 'next/link';
import { Card } from '@/components/design/Card';
import { ScoreBadge } from '@/components/design/ScoreBadge';
import { color, font, fontSize, fontWeight, letterSpacing, space } from '@/lib/design/tokens';
import { buildOrgPath } from '@/lib/nav/orgPath';
import { displayLabel, type LeadUnitSchema } from '@/lib/catalog/modules/ranked-feed/labels';
import type { CompanyLeadView } from '@/lib/agents/internal/companyLeadView';

void React;

export interface CompanyLeadCardProps {
  view: CompanyLeadView;
  slug: string;
  schema: LeadUnitSchema;
  mode?: 'link' | 'bare';
  testIdPrefix?: string;
}

export function CompanyLeadCard({
  view,
  slug,
  schema,
  mode = 'link',
  testIdPrefix = 'company-lead-card',
}: CompanyLeadCardProps): React.ReactElement {
  const why = oneLineWhy(view.rationale);
  const cardEl = (
    <Card data-testid={`${testIdPrefix}-card-${view.id}`} padded>
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
            <span data-testid={`${testIdPrefix}-rank-eyebrow-${view.id}`}>{view.score ?? '-'}</span>
          </div>
        </div>
        <div data-testid={`${testIdPrefix}-score-${view.id}`}>
          <ScoreBadge score={view.score} />
        </div>
      </div>

      <FieldGrid view={view} schema={schema} />

      {view.hq_location ? (
        <FieldRow
          label={displayLabel(schema, 'hq_location')}
          value={view.hq_location}
          testId={`${testIdPrefix}-hq-${view.id}`}
        />
      ) : null}

      {why ? (
        <p
          data-testid={`${testIdPrefix}-why-${view.id}`}
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
  );

  if (mode === 'bare') return cardEl;

  const href = buildOrgPath(slug, 'leads', view.id);
  return (
    <Link
      href={href}
      data-testid={`${testIdPrefix}-link-${view.id}`}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      {cardEl}
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

function FieldRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | null;
  testId?: string;
}): React.ReactElement {
  return (
    <div data-testid={testId}>
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

export default CompanyLeadCard;
