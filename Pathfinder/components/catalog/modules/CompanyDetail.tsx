'use client';

// components/catalog/modules/CompanyDetail.tsx, Stream C Detail surface.
//
// Slot: detail.body. The deep view for an Internal company. Header + signals
// panel + rationale + qualifying signals + enriched data + sources +
// timeline. Per SPEC b72f4eb the signals panel is QUALITATIVE: each signal
// shows its architecture weight and the real stored evidence that fired it,
// never a fabricated numeric contribution. The real total score is shown
// prominently in the header ScoreBadge.

import * as React from 'react';

import {
  Card,
  EmptyState,
  ScoreBadge,
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
import {
  extractInternalSignals,
  formatWeightPercent,
} from '@/lib/catalog/internalSignals';

import { useCompanyDetail } from '../CompanyDetailContext';

void React;

export default function CompanyDetail(_props: ModuleComponentProps): React.ReactElement {
  const { lead, project, architecture } = useCompanyDetail();
  const rawPayload = (project.raw_payload ?? {}) as Record<string, unknown>;
  const signals = extractInternalSignals(lead, rawPayload);
  const schema = architecture.lead_unit?.schema ?? {};

  return (
    <div data-stream-c-module="company-detail" style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
      <Header lead={lead} schema={schema} />
      <SignalsPanel signals={signals} />
      <RationaleSection rationale={lead.rationale} />
      <QualifyingSignalsSection signals={signals} />
      <EnrichedDataSection lead={lead} schema={schema} />
      <SourcesSection lead={lead} />
      <TimelineSection lead={lead} rawPayload={rawPayload} />
    </div>
  );
}

interface SchemaShape {
  [k: string]: { display_label?: string } | undefined;
}

function labelFor(schema: SchemaShape, field: string, fallback: string): string {
  return schema[field]?.display_label ?? fallback;
}

function Header({
  lead,
  schema,
}: {
  lead: ReturnType<typeof useCompanyDetail>['lead'];
  schema: SchemaShape;
}): React.ReactElement {
  const eyebrow = [lead.source, lead.posted_date ? new Date(lead.posted_date).toISOString().slice(0, 10) : null]
    .filter((s): s is string => !!s)
    .join(' · ');
  const verifiedPill = lead.verified ? (
    <span
      style={{
        background: color.verifiedPillBg,
        border: `1px solid ${color.verifiedPillBorder}`,
        color: color.verifiedPillText,
        padding: `2px 8px`,
        borderRadius: radius.sm,
        fontFamily: font.mono,
        fontSize: fontSize.eyebrow,
        fontWeight: fontWeight.semi,
        letterSpacing: letterSpacing.wider,
      }}
    >
      VERIFIED
    </span>
  ) : null;

  const scoreLabel = labelFor(schema, 'score', 'Score');

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: space.lg,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          {eyebrow ? (
            <div
              data-detail-eyebrow
              style={{
                fontFamily: font.mono,
                fontSize: fontSize.eyebrow,
                letterSpacing: letterSpacing.wider,
                color: color.textMuted,
                textTransform: 'uppercase',
                marginBottom: space.xs,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <h1
            style={{
              margin: 0,
              color: color.text,
              fontFamily: font.sans,
              fontSize: fontSize.hero,
              fontWeight: fontWeight.semi,
              lineHeight: 1.15,
            }}
          >
            {lead.company_name}
          </h1>
          {lead.rationale ? (
            <div style={{ marginTop: space.sm }}>
              <WhyLine tone="accent">{truncate(lead.rationale, 220)}</WhyLine>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: space.xs }}>
          <ScoreBadge score={lead.score} label />
          <div
            data-detail-score-label
            style={{
              fontFamily: font.mono,
              fontSize: fontSize.eyebrow,
              letterSpacing: letterSpacing.wider,
              color: color.textDim,
              textTransform: 'uppercase',
            }}
          >
            {scoreLabel}
          </div>
          {verifiedPill}
        </div>
      </div>
    </Card>
  );
}

function SignalsPanel({
  signals,
}: {
  signals: ReturnType<typeof extractInternalSignals>;
}): React.ReactElement {
  return (
    <Card>
      <SectionHeader
        eyebrow="Signals"
        title="What the ranker weighed"
        subtitle="Each signal with its architecture weight and the real stored evidence that fired it."
      />
      <div data-signals-panel style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        {signals.map((s) => (
          <div
            key={s.id}
            data-signal-id={s.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(160px, 1fr) auto minmax(0, 2fr)',
              gap: space.md,
              alignItems: 'baseline',
              padding: `${space.sm}px 0`,
              borderTop: `1px solid ${color.border}`,
            }}
          >
            <div
              style={{
                color: color.text,
                fontFamily: font.sans,
                fontSize: fontSize.md,
                fontWeight: fontWeight.medium,
              }}
            >
              {s.label}
            </div>
            <div
              data-signal-weight
              style={{
                fontFamily: font.mono,
                fontSize: fontSize.micro,
                fontWeight: fontWeight.semi,
                color: color.accent,
                background: color.accentSoft,
                padding: `2px 8px`,
                borderRadius: radius.sm,
                letterSpacing: letterSpacing.wider,
              }}
            >
              {formatWeightPercent(s.weight)}
            </div>
            <div
              data-signal-evidence
              style={{
                color: s.evidence ? color.textMuted : color.textDim,
                fontFamily: font.sans,
                fontSize: fontSize.sm,
                lineHeight: 1.45,
              }}
            >
              {s.evidence || '-'}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RationaleSection({ rationale }: { rationale: string | null }): React.ReactElement {
  return (
    <Card>
      <SectionHeader eyebrow="Rationale" title="Why this is on the list" />
      {rationale ? (
        <p
          style={{
            margin: 0,
            color: color.text,
            fontFamily: font.sans,
            fontSize: fontSize.md,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {rationale}
        </p>
      ) : (
        <EmptyState
          size="sm"
          title="Rationale not generated yet"
          body="The next ranker pass will fill this in."
        />
      )}
    </Card>
  );
}

function QualifyingSignalsSection({
  signals,
}: {
  signals: ReturnType<typeof extractInternalSignals>;
}): React.ReactElement {
  const evidenced = signals.filter((s) => s.evidence !== '');
  return (
    <Card>
      <SectionHeader eyebrow="Qualifying signals" title="Concrete evidence" />
      {evidenced.length === 0 ? (
        <EmptyState
          size="sm"
          title="No qualifying evidence yet"
          body="Once enrichment fills in sales-motion, footprint, registration, or association data, the qualifying signals show here."
        />
      ) : (
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: space.xs }}>
          {evidenced.map((s) => (
            <li
              key={s.id}
              style={{
                color: color.text,
                fontFamily: font.sans,
                fontSize: fontSize.sm,
                display: 'flex',
                alignItems: 'baseline',
                gap: space.sm,
              }}
            >
              <span
                aria-hidden
                style={{
                  color: color.accent,
                  fontFamily: font.mono,
                  fontSize: fontSize.eyebrow,
                  letterSpacing: letterSpacing.wider,
                  textTransform: 'uppercase',
                  minWidth: 88,
                }}
              >
                {s.label}
              </span>
              <span style={{ color: color.textMuted, fontSize: fontSize.sm }}>{s.evidence}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

interface EnrichedRow {
  label: string;
  value: React.ReactNode | null;
}

function EnrichedDataSection({
  lead,
  schema,
}: {
  lead: ReturnType<typeof useCompanyDetail>['lead'];
  schema: SchemaShape;
}): React.ReactElement {
  const linkStyle: React.CSSProperties = {
    color: color.accent,
    textDecoration: 'none',
  };
  const rows: EnrichedRow[] = [
    { label: labelFor(schema, 'service_category', 'Service category'), value: lead.service_category },
    { label: labelFor(schema, 'sales_motion', 'Sales motion'), value: lead.sales_motion },
    { label: labelFor(schema, 'footprint', 'Operating footprint'), value: lead.footprint },
    { label: labelFor(schema, 'hq_location', 'Headquarters'), value: lead.hq_location },
    {
      label: labelFor(schema, 'company_size', 'Size'),
      value: lead.employee_count !== null ? `${lead.employee_count} employees` : null,
    },
    {
      label: labelFor(schema, 'federal_registration', 'Federal registration'),
      value: lead.federal_registration,
    },
    {
      label: labelFor(schema, 'association_memberships', 'Trade associations'),
      value: lead.associations.length > 0 ? lead.associations.join(', ') : null,
    },
    {
      label: 'Website',
      value: lead.website ? (
        <a href={lead.website} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          {lead.website}
        </a>
      ) : null,
    },
    {
      label: 'LinkedIn',
      value: lead.linkedin ? (
        <a href={lead.linkedin} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          {lead.linkedin}
        </a>
      ) : null,
    },
  ];
  const present = rows.filter((r) => r.value !== null && r.value !== '');

  return (
    <Card>
      <SectionHeader eyebrow="Enriched data" title="Snapshot" />
      {present.length === 0 ? (
        <EmptyState
          size="sm"
          title="No enriched fields yet"
          body="The enricher fills in service, sales motion, footprint, and contact data after verification."
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: space.md,
          }}
        >
          {present.map((row) => (
            <div key={row.label} data-enriched-row>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: fontSize.eyebrow,
                  letterSpacing: letterSpacing.wider,
                  color: color.textMuted,
                  textTransform: 'uppercase',
                  marginBottom: space.xs,
                }}
              >
                {row.label}
              </div>
              <div
                style={{
                  color: color.text,
                  fontFamily: font.sans,
                  fontSize: fontSize.sm,
                  lineHeight: 1.45,
                  wordBreak: 'break-word',
                }}
              >
                {row.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SourcesSection({
  lead,
}: {
  lead: ReturnType<typeof useCompanyDetail>['lead'];
}): React.ReactElement {
  const citations = lead.citations;
  return (
    <Card>
      <SectionHeader eyebrow="Sources" title="Where this came from" />
      {citations.length === 0 && !lead.source ? (
        <EmptyState
          size="sm"
          title="No source records yet"
          body="Per-company source records show here once the enricher attaches citations."
        />
      ) : (
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: space.xs }}>
          {lead.source ? (
            <li
              style={{
                color: color.text,
                fontFamily: font.sans,
                fontSize: fontSize.sm,
                display: 'flex',
                alignItems: 'baseline',
                gap: space.sm,
              }}
            >
              <span
                aria-hidden
                style={{
                  color: color.textMuted,
                  fontFamily: font.mono,
                  fontSize: fontSize.eyebrow,
                  letterSpacing: letterSpacing.wider,
                  textTransform: 'uppercase',
                  minWidth: 88,
                }}
              >
                Primary
              </span>
              <span style={{ color: color.text }}>{lead.source}</span>
            </li>
          ) : null}
          {citations.map((c, i) => (
            <li
              key={`${i}-${c.url}`}
              style={{
                color: color.text,
                fontFamily: font.sans,
                fontSize: fontSize.sm,
                display: 'flex',
                alignItems: 'baseline',
                gap: space.sm,
              }}
            >
              <span
                aria-hidden
                style={{
                  color: color.textMuted,
                  fontFamily: font.mono,
                  fontSize: fontSize.eyebrow,
                  letterSpacing: letterSpacing.wider,
                  textTransform: 'uppercase',
                  minWidth: 88,
                }}
              >
                Citation
              </span>
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: color.accent, textDecoration: 'none' }}
              >
                {c.title || c.url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

interface TimelineEntry {
  at: string;
  label: string;
}

function TimelineSection({
  lead,
  rawPayload,
}: {
  lead: ReturnType<typeof useCompanyDetail>['lead'];
  rawPayload: Record<string, unknown>;
}): React.ReactElement {
  const entries: TimelineEntry[] = [];
  if (lead.posted_date) entries.push({ at: lead.posted_date, label: 'Posted' });
  // Pull verifier / enrichment / scoring timestamps off raw_payload when
  // present. The keys mirror the conventions in lib/agents/internal/*.
  const tStamps: Array<[string, string]> = [
    ['internal_scored_at', 'Scored'],
    ['internal_verified_at', 'Verified'],
    ['internal_enriched_at', 'Enriched'],
    ['internal_geo_at', 'Geo-mapped'],
  ];
  for (const [key, label] of tStamps) {
    const v = rawPayload[key];
    if (typeof v === 'string' && v.trim() !== '') {
      entries.push({ at: v, label });
    }
  }
  // Optional rich timeline payload.
  const rich = rawPayload.internal_timeline;
  if (Array.isArray(rich)) {
    for (const item of rich) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const at = typeof r.at === 'string' ? r.at : null;
      const label = typeof r.label === 'string' ? r.label : null;
      if (at && label) entries.push({ at, label });
    }
  }
  entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  return (
    <Card>
      <SectionHeader eyebrow="Timeline" title="Activity on this company" />
      {entries.length === 0 ? (
        <EmptyState
          size="sm"
          title="No timeline yet"
          body="Activity (scored, verified, enriched, outreach sent) shows here as it accumulates."
        />
      ) : (
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: space.xs }}>
          {entries.map((e, i) => (
            <li
              key={`${i}-${e.at}-${e.label}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto minmax(0, 1fr)',
                gap: space.sm,
                alignItems: 'baseline',
                color: color.text,
                fontFamily: font.sans,
                fontSize: fontSize.sm,
              }}
            >
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: fontSize.eyebrow,
                  letterSpacing: letterSpacing.wider,
                  color: color.textDim,
                }}
              >
                {formatTimestamp(e.at)}
              </span>
              <span style={{ color: color.textMuted }}>{e.label}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

function truncate(s: string, max: number): string {
  const trimmed = s.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
