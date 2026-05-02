// ZedcorRelationshipContext — Z-F integrator feature #9.
//
// Renders the "Relationship Context — Warm Intro Available" section on the
// lead detail page when `pathfinder.lead_cross_pollination` has at least
// one match for the project. Format follows
// `SPEC - Cross-Pollination Engine.md` § 4.3.
//
// Intentionally a self-contained presentational component — caller (the
// server-side LeadDetailPage) does the Supabase read and passes the rows.
// Keeps the engine read in one place + lets us render zero-state copy
// when there are no matches without an extra round-trip.

import * as React from 'react';
import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';

export interface CrossPollinationMatchRow {
  id: string;
  customer_canonical: string;
  customer_org_id: string;
  match_layer: 'exact' | 'fuzzy' | 'parent_company' | string;
  match_confidence: number;
  primary_branch_id: string | null;
  primary_branch_name: string | null;
  branch_count: number;
  active_site_count: number;
  most_recent_site_date: string | null;
  national_account: boolean;
  matched_field:
    | 'project_owner'
    | 'prime_contractor'
    | 'key_sub'
    | 'parent_company'
    | string;
  matched_value_raw: string;
}

interface Props {
  matches: CrossPollinationMatchRow[];
  /** Optional state for the "first project in [region]" framing. */
  targetRegion?: string | null;
}

const WARM = '#a3e635';

export function ZedcorRelationshipContext({ matches, targetRegion }: Props) {
  if (matches.length === 0) {
    return (
      <SidebarCard title="Relationship Context">
        <div
          style={{
            font: `400 12px ${PF_TINTS.sans}`,
            color: PF_TINTS.inkDim,
          }}
        >
          No existing Zedcor customer relationship detected for this
          lead&apos;s project owner or prime contractor.
        </div>
      </SidebarCard>
    );
  }

  // Surface the highest-confidence match prominently; remaining matches
  // are listed below in compact form. Keeps the demo's "one striking
  // signature line" without burying secondary signals.
  const sorted = [...matches].sort(
    (a, b) => b.match_confidence - a.match_confidence,
  );
  const primary = sorted[0];
  const rest = sorted.slice(1);

  return (
    <SidebarCard
      title="Relationship Context — Warm Intro Available"
      accent={WARM}
    >
      <PrimaryMatch match={primary} targetRegion={targetRegion} />
      {rest.length > 0 && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: `1px solid ${PF_TINTS.ruleHair}`,
          }}
        >
          <div
            style={{
              font: `500 11px ${PF_TINTS.sans}`,
              color: PF_TINTS.inkSub,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Additional matches ({rest.length})
          </div>
          {rest.map((m) => (
            <SecondaryMatch key={m.id} match={m} />
          ))}
        </div>
      )}
    </SidebarCard>
  );
}

function PrimaryMatch({
  match,
  targetRegion,
}: {
  match: CrossPollinationMatchRow;
  targetRegion?: string | null;
}) {
  const layerLabel = formatLayer(match.match_layer);
  const fieldLabel = formatField(match.matched_field);
  const confidence = match.match_confidence.toFixed(2);
  const customer = formatCustomer(match);
  const branchName = match.primary_branch_name ?? 'unidentified branch';
  const branchSuffix = match.branch_count > 1 ? ` of ${match.branch_count}` : '';
  const recencyLine = match.most_recent_site_date
    ? `Most recent site activity: ${match.most_recent_site_date}`
    : 'Site recency: not recorded';
  const region = targetRegion ?? 'this region';

  return (
    <div
      style={{
        font: `400 13px/1.55 ${PF_TINTS.sans}`,
        color: PF_TINTS.ink,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            font: `600 13px ${PF_TINTS.sans}`,
            color: PF_TINTS.ink,
          }}
        >
          {customer}
        </span>
        <span
          className="pf-mono"
          style={{
            font: `500 11px ${PF_TINTS.mono}`,
            color: PF_TINTS.inkSub,
            letterSpacing: '0.03em',
          }}
        >
          ({fieldLabel})
        </span>
      </div>

      <div
        style={{
          font: `500 11px ${PF_TINTS.mono}`,
          color: PF_TINTS.inkSub,
          letterSpacing: '0.03em',
          marginBottom: 8,
        }}
      >
        Match: {layerLabel} · confidence {confidence}
      </div>

      <ul
        style={{
          margin: '0 0 8px',
          paddingLeft: 16,
          font: `400 12.5px/1.5 ${PF_TINTS.sans}`,
          color: PF_TINTS.inkSub,
        }}
      >
        <li>
          {match.active_site_count} active site
          {match.active_site_count === 1 ? '' : 's'} across{' '}
          {match.branch_count} branch
          {match.branch_count === 1 ? '' : 'es'}
        </li>
        <li>
          Primary branch: <strong style={{ color: PF_TINTS.ink }}>{branchName}</strong>
          {branchSuffix}
        </li>
        <li>{recencyLine}</li>
        {match.national_account && (
          <li
            style={{
              color: '#b45309',
              fontWeight: 500,
            }}
          >
            National account — coordinate with HQ before reaching out.
          </li>
        )}
      </ul>

      <div
        style={{
          marginTop: 8,
          padding: '8px 10px',
          background: hexAlpha(WARM, 0.1),
          border: `1px solid ${hexAlpha(WARM, 0.5)}`,
          borderRadius: PF_TINTS.r.sm,
          font: `500 12px ${PF_TINTS.sans}`,
          color: PF_TINTS.ink,
        }}
      >
        Recommended action: coordinate with {branchName} before reaching out.
        Likely first project for this customer in {region}.
      </div>
    </div>
  );
}

function SecondaryMatch({ match }: { match: CrossPollinationMatchRow }) {
  return (
    <div
      style={{
        padding: '4px 0',
        borderBottom: `1px solid ${PF_TINTS.ruleHair}`,
        font: `400 12px ${PF_TINTS.sans}`,
        color: PF_TINTS.inkSub,
      }}
    >
      <span style={{ color: PF_TINTS.ink, fontWeight: 500 }}>
        {formatCustomer(match)}
      </span>{' '}
      · {formatField(match.matched_field)} · {formatLayer(match.match_layer)} (
      {match.match_confidence.toFixed(2)}) ·{' '}
      {match.active_site_count} site{match.active_site_count === 1 ? '' : 's'}
    </div>
  );
}

function SidebarCard({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${accent ?? PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        boxShadow: PF_TINTS.shadow.sm,
        padding: 14,
      }}
    >
      <h3
        style={{
          margin: '0 0 10px',
          font: `600 12px ${PF_TINTS.sans}`,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: accent ? PF_TINTS.ink : PF_TINTS.inkSub,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {accent && (
          <span
            style={{
              width: 8,
              height: 8,
              background: accent,
              transform: 'rotate(45deg)',
              flexShrink: 0,
            }}
          />
        )}
        {title}
      </h3>
      {children}
    </section>
  );
}

function formatLayer(layer: string): string {
  if (layer === 'exact') return 'Exact';
  if (layer === 'fuzzy') return 'Fuzzy';
  if (layer === 'parent_company') return 'Parent company';
  return layer;
}

function formatField(field: string): string {
  if (field === 'project_owner') return 'project owner';
  if (field === 'prime_contractor') return 'prime contractor';
  if (field === 'key_sub') return 'key sub';
  if (field === 'parent_company') return 'parent company';
  return field;
}

function formatCustomer(match: CrossPollinationMatchRow): string {
  // The engine stores normalized lower-case canonical forms. Title-case
  // for display, preserving common separators.
  return match.customer_canonical
    .split(/\s+/)
    .map((word) =>
      word.length === 0 ? word : word[0].toUpperCase() + word.slice(1),
    )
    .join(' ');
}
