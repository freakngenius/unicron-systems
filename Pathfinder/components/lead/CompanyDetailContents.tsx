// components/lead/CompanyDetailContents.tsx
//
// Inner content of the lead detail view for Internal-shaped orgs
// (architecture.lead_unit.name === 'company'). Mounted as children of
// LeadDetailShell at /pathfinder/[slug]/leads/[projectId]. Renders the
// data we have on a `projects` row today: rationale, recommended first
// step, snapshot grid, enrichment brief, citations, contacts. Every
// section is honest about missing data; empty enrichment leaves the
// detail view sparse, not pretending data exists.
//
// This is the "basic contents now" component referenced in the bug-fix
// brief; a later rework can swap in a deeper view by passing different
// children to LeadDetailShell, without touching the shell itself.

import * as React from 'react';
import type { CompanyLeadView } from '@/lib/agents/internal/companyLeadView';

void React;

const PANEL_BG = '#111';
const PANEL_BORDER = '#222';

export type CompanyDetailContentsProps = {
  lead: CompanyLeadView;
};

export function CompanyDetailContents({ lead }: CompanyDetailContentsProps): React.ReactElement {
  const snapshotItems: Array<[string, string | null]> = [
    ['Service category', lead.service_category],
    ['Sales motion', lead.sales_motion],
    ['Footprint', lead.footprint],
    ['Headquarters', lead.hq_location],
    ['Employees', lead.employee_count !== null ? String(lead.employee_count) : null],
    ['Federal registration', lead.federal_registration],
    ['Source', lead.source],
    ['Posted', lead.posted_date ? new Date(lead.posted_date).toLocaleDateString('en-US') : null],
  ];

  return (
    <div data-company-detail-contents>
      {(lead.first_step || lead.warm_intro) && (
        <Section title="Recommended first step">
          {lead.first_step ? <Paragraph>{lead.first_step}</Paragraph> : null}
          {lead.warm_intro ? (
            <Paragraph muted>
              <strong style={{ color: '#cfd8e3' }}>Warm intro: </strong>
              {lead.warm_intro}
            </Paragraph>
          ) : null}
        </Section>
      )}

      <Section title={`Why this scored ${lead.score ?? 'unscored'}`} empty={!lead.rationale}>
        {lead.rationale ? (
          <Paragraph preserveLines>{lead.rationale}</Paragraph>
        ) : (
          <Paragraph muted>
            Rationale not generated yet. The next ranker pass will write one.
          </Paragraph>
        )}
      </Section>

      <Section title="Snapshot">
        <KeyValueGrid items={snapshotItems} />
      </Section>

      {lead.associations.length > 0 ? (
        <Section title="Trade associations">
          <ChipRow chips={lead.associations} />
        </Section>
      ) : null}

      <Section title="Brief" empty={!lead.brief}>
        {lead.brief ? (
          <Paragraph>{lead.brief}</Paragraph>
        ) : (
          <Paragraph muted>No enrichment brief yet. The next Sonar pass will fill this in.</Paragraph>
        )}
      </Section>

      {(lead.website || lead.linkedin || lead.contacts.length > 0) && (
        <Section title="Contact">
          {lead.website ? (
            <Paragraph>
              <ExternalLink href={lead.website}>{lead.website}</ExternalLink>
            </Paragraph>
          ) : null}
          {lead.linkedin ? (
            <Paragraph>
              <ExternalLink href={lead.linkedin}>{lead.linkedin}</ExternalLink>
            </Paragraph>
          ) : null}
          {lead.contacts.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {lead.contacts.map((c, i) => {
                const meta = [c.title, c.email].filter((s): s is string => !!s).join(' · ');
                return (
                  <li
                    key={`${i}-${c.name}`}
                    style={{ marginBottom: '0.4rem', fontSize: '0.88rem', color: '#e3e8ed' }}
                  >
                    <strong>{c.name}</strong>
                    {meta ? <span style={{ color: '#9aa5b1' }}> {meta}</span> : null}
                    {c.linkedin_url ? (
                      <>
                        {' '}
                        <ExternalLink href={c.linkedin_url}>LinkedIn</ExternalLink>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </Section>
      )}

      {lead.citations.length > 0 ? (
        <Section title="Citations">
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {lead.citations.map((c, i) => (
              <li key={`${i}-${c.url}`} style={{ marginBottom: '0.3rem', fontSize: '0.85rem' }}>
                <ExternalLink href={c.url}>{c.title || c.url}</ExternalLink>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      data-section
      data-empty={empty ? 'true' : undefined}
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
        color: muted ? '#666' : '#e3e8ed',
        fontSize: muted ? '0.85rem' : '0.92rem',
        lineHeight: 1.55,
        margin: 0,
        marginBottom: '0.4rem',
        whiteSpace: preserveLines ? 'pre-wrap' : undefined,
      }}
    >
      {children}
    </p>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: '#85aaff', textDecoration: 'none' }}
    >
      {children}
    </a>
  );
}

function ChipRow({ chips }: { chips: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
      {chips.map((c, i) => (
        <span
          key={`${i}-${c}`}
          style={{
            padding: '0.2rem 0.55rem',
            background: '#141414',
            border: '1px solid #2a2a2a',
            borderRadius: 999,
            color: '#cfd8e3',
            fontSize: '0.75rem',
          }}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

function KeyValueGrid({ items }: { items: Array<[string, string | null]> }) {
  const present = items.filter(([, v]) => v && v.trim() !== '');
  if (present.length === 0) {
    return (
      <p style={{ color: '#666', fontSize: '0.85rem', margin: 0 }}>
        No snapshot fields yet.
      </p>
    );
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

export default CompanyDetailContents;
