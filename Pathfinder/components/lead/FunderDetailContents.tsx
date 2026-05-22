// components/lead/FunderDetailContents.tsx
//
// Inner content of the lead detail view for Funder-shaped orgs
// (architecture.lead_unit.name === 'org' / 'organization' / vocabulary
// 'lead'). Extracted verbatim from the prior bespoke
// app/[slug]/leads/[projectId]/page.tsx so the page can host the new
// LeadDetailShell and pick contents per architecture without altering
// what the Funder customer sees today.
//
// Same data shape (projectFunderLead) and same section ordering
// (Brief, Founders, Snapshot, Citations, rationale) as before.

import * as React from 'react';
import type { Project } from '@/lib/types';
import type { FunderLeadView } from '@/lib/agents/funder/leadView';

void React;

const PANEL_BG = '#111';
const PANEL_BORDER = '#222';

export type FunderDetailContentsProps = {
  lead: FunderLeadView;
  row: Project;
};

export function FunderDetailContents({ lead, row }: FunderDetailContentsProps): React.ReactElement {
  return (
    <div data-funder-detail-contents>
      <Section title="Brief">
        {lead.brief ? (
          <Paragraph>{lead.brief}</Paragraph>
        ) : (
          <Paragraph muted>No enrichment brief yet. The next Sonar pass will fill this in.</Paragraph>
        )}
      </Section>

      <Section title="Founders">
        <FounderList row={row} />
      </Section>

      <Section title="Snapshot">
        <KeyValueGrid
          items={[
            ['Raise target', lead.raise_target],
            ['Stage', lead.fundraising_stage],
            ['Legal form', lead.legal_form],
            ['Founded', lead.founded_date],
            ['Hub', lead.geo_hub],
            ['Source', lead.source],
            ['Posted', lead.posted_date ? new Date(lead.posted_date).toLocaleDateString('en-US') : null],
          ]}
        />
      </Section>

      {lead.citations.length > 0 ? (
        <Section title="Citations">
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {lead.citations.map((c, i) => (
              <li key={`${i}-${c.url}`} style={{ marginBottom: '0.3rem', fontSize: '0.85rem' }}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#85aaff', textDecoration: 'none' }}
                >
                  {c.title || c.url}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {row.rationale ? (
        <Section title={`Why this scored ${lead.score ?? 'unscored'}`}>
          <Paragraph preserveLines>{row.rationale}</Paragraph>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: PANEL_BG,
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 6,
        padding: '1rem 1.1rem',
        marginBottom: '1rem',
      }}
    >
      <h2
        style={{
          fontSize: '0.85rem',
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          margin: '0 0 0.5rem',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Paragraph({
  children,
  muted,
  preserveLines,
}: {
  children: React.ReactNode;
  muted?: boolean;
  preserveLines?: boolean;
}) {
  return (
    <p
      style={{
        color: muted ? '#666' : '#cfd8e3',
        fontSize: muted ? '0.85rem' : '0.88rem',
        lineHeight: 1.55,
        margin: 0,
        whiteSpace: preserveLines ? 'pre-wrap' : undefined,
      }}
    >
      {children}
    </p>
  );
}

function FounderList({ row }: { row: Project }) {
  const payload = (row.raw_payload ?? {}) as Record<string, unknown>;
  const enr = payload.funder_enrichment as
    | { founders?: Array<{ name?: string; role?: string; prior_affiliation?: string; notes?: string }> }
    | undefined;
  const founders = enr?.founders ?? [];
  if (!founders.length) {
    return <p style={{ color: '#666', fontSize: '0.85rem', margin: 0 }}>No founder records yet.</p>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
      {founders.map((f, i) => {
        const name = (f.name ?? '').trim();
        if (!name) return null;
        const lines: string[] = [];
        if (f.role) lines.push(f.role);
        if (f.prior_affiliation) lines.push(`Previously: ${f.prior_affiliation}`);
        if (f.notes) lines.push(f.notes);
        return (
          <li
            key={`${i}-${name}`}
            style={{ marginBottom: '0.45rem', fontSize: '0.88rem', color: '#e3e8ed' }}
          >
            <strong>{name}</strong>
            {lines.length > 0 ? <span style={{ color: '#9aa5b1' }}> {lines.join(' · ')}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function KeyValueGrid({ items }: { items: Array<[string, string | null]> }) {
  const present = items.filter(([, v]) => v && v.trim() !== '');
  if (present.length === 0) {
    return <p style={{ color: '#666', fontSize: '0.85rem', margin: 0 }}>No snapshot fields yet.</p>;
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '0.6rem',
      }}
    >
      {present.map(([k, v]) => (
        <div key={k}>
          <div
            style={{
              color: '#666',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.15rem',
            }}
          >
            {k}
          </div>
          <div style={{ color: '#e3e8ed', fontSize: '0.88rem' }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

export default FunderDetailContents;
