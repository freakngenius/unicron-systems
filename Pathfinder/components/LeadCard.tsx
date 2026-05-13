// components/LeadCard.tsx — Build-Out Pass Slice 2.
//
// Spec: Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md.
//
// Renders one lead card honoring ui_plan.lead_card_layout:
//   - primary_fields shown prominently inside [data-lead-primary]
//   - secondary_fields collapsed inside a <details data-lead-secondary>
//   - score_position controls the data-score-position attribute and
//     visual placement of the score chip
// Container emits data-lead-card so DoD smoke step 8 can probe for it.
// Lead shape is loose Record<string,unknown> — Phase 2D schema-driven
// LeadCard already exists elsewhere; this component is the minimal
// ui_plan-aware renderer the slug route uses. Slice 3+ can fold the
// two together once the iterate-to-green loop runs.

import * as React from 'react';
import type { UIPlan } from '@/lib/types/architecture';

void React;

export type LeadLike = Record<string, unknown> & {
  id?: string | number;
  score?: number | null;
};

export type LeadCardProps = {
  lead: LeadLike;
  layout: UIPlan['lead_card_layout'];
};

function fieldDisplay(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '—';
  }
}

function ScoreChip({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return null;
  return (
    <span
      data-lead-score
      style={{
        display: 'inline-block',
        padding: '0.2rem 0.5rem',
        background: '#1a1a1a',
        border: '1px solid #2d2d2d',
        borderRadius: 999,
        color: '#fff',
        fontSize: '0.75rem',
        fontWeight: 600,
      }}
    >
      {score}
    </span>
  );
}

export function LeadCard({ lead, layout }: LeadCardProps) {
  const scorePos = layout.score_position;
  const scoreCorner =
    scorePos === 'top-right'
      ? { position: 'absolute' as const, top: 12, right: 12 }
      : scorePos === 'top-left'
        ? { position: 'absolute' as const, top: 12, left: 12 }
        : { marginTop: '0.5rem' };

  return (
    <div
      data-lead-card
      data-score-position={scorePos}
      style={{
        position: 'relative',
        background: '#111',
        border: '1px solid #222',
        borderRadius: 6,
        padding: '1rem 1rem 0.875rem',
      }}
    >
      <div style={scoreCorner}>
        <ScoreChip score={(lead.score as number | null | undefined) ?? null} />
      </div>
      <div data-lead-primary>
        {layout.primary_fields.map(field => (
          <div
            key={field}
            data-field={field}
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'baseline',
              marginBottom: '0.25rem',
            }}
          >
            <span
              style={{
                color: '#666',
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                minWidth: 90,
              }}
            >
              {field}
            </span>
            <span style={{ color: '#fff', fontSize: '0.85rem' }}>
              {fieldDisplay(lead[field])}
            </span>
          </div>
        ))}
      </div>
      {layout.secondary_fields.length > 0 && (
        <details
          data-lead-secondary
          style={{
            marginTop: '0.5rem',
            color: '#aaa',
            fontSize: '0.75rem',
          }}
        >
          <summary style={{ cursor: 'pointer', color: '#666' }}>more</summary>
          <div style={{ marginTop: '0.4rem' }}>
            {layout.secondary_fields.map(field => (
              <div
                key={field}
                data-field={field}
                style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.2rem' }}
              >
                <span style={{ color: '#666', minWidth: 90 }}>{field}</span>
                <span>{fieldDisplay(lead[field])}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export type LeadCardListProps = {
  leads: LeadLike[];
  layout: UIPlan['lead_card_layout'];
};

export function LeadCardList({ leads, layout }: LeadCardListProps) {
  return (
    <div
      data-lead-card-list
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '0.75rem',
      }}
    >
      {leads.map((lead, i) => (
        <LeadCard key={(lead.id as string | number | undefined) ?? i} lead={lead} layout={layout} />
      ))}
    </div>
  );
}

export default LeadCard;
