'use client';

// components/catalog/modules/WarmIntroPanel.tsx, Stream C Detail surface.
//
// Slot: detail.relationships. Soft-gated on the adjacency_graph data
// signal. Unicron seed data has not landed, so for Internal the catalog
// renderer mounts this in 'inactive' mode (soft unmet, fallback='inactive')
// and the component renders the designed pending state.
//
// The active layout is built too, so activation later needs no code
// change: once the adjacency_graph signal goes non-empty (a future
// adjacency-mapper pass), the component receives matches via the
// useCompanyDetail() context's raw_payload.internal_adjacency entries
// and renders them.

import * as React from 'react';

import {
  Card,
  EmptyState,
  SectionHeader,
  WhyLine,
  color,
  font,
  fontSize,
  fontWeight,
  letterSpacing,
  radius,
  space,
} from '@/components/design';
import type { ModuleComponentProps } from '@/lib/catalog/types';
import { orgPaths } from '@/lib/nav/orgPath';

import { useCompanyDetail } from '../CompanyDetailContext';

void React;

interface AdjacencyMatch {
  related_company_id: string;
  related_company_name: string;
  relationship: string;
  why: string;
}

function readMatches(raw: Record<string, unknown>): AdjacencyMatch[] {
  const v = raw.internal_adjacency;
  if (!Array.isArray(v)) return [];
  const out: AdjacencyMatch[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.related_company_id === 'string' ? r.related_company_id : null;
    const name = typeof r.related_company_name === 'string' ? r.related_company_name : null;
    const rel = typeof r.relationship === 'string' ? r.relationship : null;
    const why = typeof r.why === 'string' ? r.why : '';
    if (!id || !name || !rel) continue;
    out.push({ related_company_id: id, related_company_name: name, relationship: rel, why });
  }
  return out;
}

export default function WarmIntroPanel(_props: ModuleComponentProps): React.ReactElement {
  const { project, org, slotMode, slotReason } = useCompanyDetail();
  const rawPayload = (project.raw_payload ?? {}) as Record<string, unknown>;
  const matches = readMatches(rawPayload);
  const inactive = slotMode['detail.relationships'] !== 'active' || matches.length === 0;
  const reason = slotReason['detail.relationships'] ?? '';

  return (
    <Card data-stream-c-module="warm-intro-panel" data-warm-intro-state={inactive ? 'pending' : 'active'}>
      <SectionHeader
        eyebrow="Warm intro"
        title="Cross-pollination"
        subtitle={
          inactive
            ? 'Adjacency graph not yet populated for Unicron. This panel activates on its own once relationship data lands.'
            : `${matches.length} match${matches.length === 1 ? '' : 'es'} for this company.`
        }
      />
      {inactive ? (
        <EmptyState
          eyebrow="Pending"
          title="No warm intros surfaced yet"
          body={
            reason
              ? `Adjacency signal: ${reason}. The cross-pollination engine will populate matches as the graph grows.`
              : 'The cross-pollination engine populates matches from shared customers, trade associations, and licensure overlap once seed data lands.'
          }
          size="md"
        />
      ) : (
        <ul
          data-warm-intro-matches
          style={{
            margin: 0,
            paddingLeft: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: space.sm,
          }}
        >
          {matches.map((m) => (
            <li
              key={m.related_company_id}
              data-warm-intro-match={m.related_company_id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(160px, 1fr) auto minmax(0, 2fr)',
                gap: space.md,
                alignItems: 'baseline',
                padding: `${space.sm}px 0`,
                borderTop: `1px solid ${color.border}`,
              }}
            >
              <a
                href={orgPaths.leadDetail(org.slug, m.related_company_id)}
                style={{
                  color: color.accent,
                  fontFamily: font.sans,
                  fontSize: fontSize.md,
                  fontWeight: fontWeight.medium,
                  textDecoration: 'none',
                }}
              >
                {m.related_company_name}
              </a>
              <span
                data-warm-intro-relationship
                style={{
                  fontFamily: font.mono,
                  fontSize: fontSize.micro,
                  letterSpacing: letterSpacing.wider,
                  color: color.accent,
                  background: color.accentSoft,
                  padding: `2px 8px`,
                  borderRadius: radius.sm,
                  textTransform: 'uppercase',
                }}
              >
                {m.relationship}
              </span>
              {m.why ? <WhyLine>{m.why}</WhyLine> : <span />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
