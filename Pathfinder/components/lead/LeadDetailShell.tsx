// components/lead/LeadDetailShell.tsx
//
// Reusable layout shell for the org-scoped lead detail page at
// /pathfinder/[slug]/leads/[projectId]. Provides:
//
//   - Slug-scoped breadcrumb (Pathfinder / <slug> / <leadsPlural> / <title>)
//   - Slug-scoped nav row (Dashboard, Companies/Leads, Pipeline)
//   - Header with title + score chip + Verified badge + optional badges
//   - Optional chip row (e.g. service category, sales motion, hub, source)
//   - Content slot (children) where the per-org contents component plugs in
//
// A future deeper detail view plugs into the `children` seam. The shell
// itself is org-agnostic: any architecture can use it by passing a
// title + score + chips + content.
//
// New file. No other file imports this until the [slug] lead-detail
// page rewires to it. The Funder lead-detail flow uses the same shell
// and renders Funder-shaped children inside.

import Link from 'next/link';
import * as React from 'react';

void React;

export type LeadDetailShellChip = string;

export type LeadDetailShellProps = {
  slug: string;
  /** Title bar text (company / org name). */
  title: string;
  /** Numeric score; chip is omitted when null. */
  score: number | null;
  /** Verified flag; pill is omitted when null/false. */
  verified?: boolean | null;
  /** Architecture vocabulary plural ("companies", "leads", "deals", …). */
  leadsPlural: string;
  /** Architecture vocabulary singular ("company", "lead", "deal", …). */
  leadSingular?: string;
  /** Optional chip row under the header (filtered for truthy values). */
  chips?: Array<LeadDetailShellChip | null | undefined>;
  /** Extra badge nodes rendered to the right of the score chip. */
  headerBadges?: React.ReactNode;
  /** Slot for the inner detail contents. */
  children: React.ReactNode;
};

const SHELL_BG = '#0a0a0a';
const PANEL_BG = '#111';
const PANEL_BORDER = '#222';
const TEXT_DIM = '#666';
const TEXT_HI = '#fff';

export function LeadDetailShell({
  slug,
  title,
  score,
  verified,
  leadsPlural,
  leadSingular: _leadSingular,
  chips,
  headerBadges,
  children,
}: LeadDetailShellProps): React.ReactElement {
  const chipRow = (chips ?? []).filter((c): c is string => typeof c === 'string' && c.trim() !== '');
  const dashboardHref = `/${slug}`;
  const leadsHref = `/${slug}/leads`;
  const pipelineHref = `/${slug}/pipeline`;

  return (
    <div
      data-lead-detail-shell
      style={{
        minHeight: '100vh',
        background: SHELL_BG,
        color: TEXT_HI,
        fontFamily: 'var(--font-inter, sans-serif)',
        padding: '2rem',
      }}
    >
      <header
        data-shell-header
        style={{ marginBottom: '1.5rem', borderBottom: `1px solid ${PANEL_BORDER}`, paddingBottom: '1rem' }}
      >
        <p
          data-shell-breadcrumb
          style={{
            color: TEXT_DIM,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '0.25rem',
          }}
        >
          <Link href={dashboardHref} style={{ color: TEXT_DIM, textDecoration: 'none' }}>
            Pathfinder
          </Link>
          {' / '}
          <Link href={dashboardHref} style={{ color: TEXT_DIM, textDecoration: 'none' }}>
            {slug}
          </Link>
          {' / '}
          <Link href={leadsHref} style={{ color: TEXT_DIM, textDecoration: 'none' }}>
            {leadsPlural}
          </Link>
          {' / '}
          {title}
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {verified ? (
              <span
                data-verified-pill
                style={{
                  padding: '0.2rem 0.55rem',
                  background: '#0f2615',
                  border: '1px solid #1a5e2a',
                  borderRadius: 999,
                  color: '#5bd87f',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Verified
              </span>
            ) : null}
            {score !== null ? (
              <span
                data-score-chip
                style={{
                  padding: '0.25rem 0.65rem',
                  background: '#1a1a1a',
                  border: '1px solid #2d2d2d',
                  borderRadius: 999,
                  color: TEXT_HI,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                Score {score}
              </span>
            ) : null}
            {headerBadges}
          </div>
        </div>
      </header>

      <nav
        data-shell-nav
        style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}
      >
        {[
          { href: dashboardHref, label: 'Dashboard', active: false },
          { href: leadsHref, label: titleCase(leadsPlural), active: true },
          { href: pipelineHref, label: 'Pipeline', active: false },
        ].map(({ href, label, active }) => (
          <Link
            key={href}
            href={href}
            style={{
              padding: '0.5rem 1rem',
              background: active ? '#1a1a1a' : PANEL_BG,
              border: `1px solid ${active ? '#444' : '#333'}`,
              borderRadius: 4,
              color: active ? TEXT_HI : '#aaa',
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      {chipRow.length > 0 ? (
        <div
          data-shell-chip-row
          style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}
        >
          {chipRow.map((label, i) => (
            <span
              key={`${i}-${label}`}
              style={{
                padding: '0.25rem 0.6rem',
                background: '#141414',
                border: '1px solid #2a2a2a',
                borderRadius: 999,
                color: '#cfd8e3',
                fontSize: '0.75rem',
              }}
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}

      <div data-shell-contents>{children}</div>
    </div>
  );
}

function titleCase(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

export default LeadDetailShell;
