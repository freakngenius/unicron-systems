'use client';

// components/lead/CrossPollinationCard.tsx — Demo Polish UX Gate 7B (full
// lift).
//
// Section 4 of the redesigned lead detail page. Promoted from Sidebar to a
// full row — the demo signature beat lives here.
//
// Spec § 4 contract:
//   - Card title: "Warm intro available — N matches"
//   - Per-match row: <customer> · <confidence chip EXACT/FUZZY> ·
//                    <branch_name> · <distance> mi · <n_active_sites>
//   - Inline outreach hook rendered as italicized quote (auto-generated
//     from match data when DB column unavailable; see hookFor below)
//   - "Open in Outreach with this hook" link inserts hook into composer
//     via `onInsertHook` callback prop
//   - Hide entirely when 0 matches
//
// The legacy `ZedcorRelationshipContext` stays in place for the pre-redesign
// layout (`redesignEnabled === false`) — this component is a parallel
// implementation, not a refactor.

import * as React from 'react';

import { type CrossPollinationMatchRow } from '@/components/zedcor/ZedcorRelationshipContext';
import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';

const MAGENTA = '#d946ef';

interface Props {
  matches: CrossPollinationMatchRow[];
  /** Optional state for "first project in <region>" framing. */
  targetRegion: string | null;
  /**
   * Optional callback fired when operator clicks "Open in Outreach with this
   * hook" on a match row. The implementer (LeadDetail's RedesignedBody)
   * lifts the EmailComposer body state to receive the hook insertion. When
   * unprovided, the link is rendered without a click handler and disabled.
   */
  onInsertHook?: (hook: string, matchId: string) => void;
}

export function CrossPollinationCard({
  matches,
  targetRegion,
  onInsertHook,
}: Props): React.ReactElement | null {
  if (matches.length === 0) return null;

  // Sort by confidence descending — primary match leads, secondary matches
  // follow.
  const sorted = [...matches].sort((a, b) => b.match_confidence - a.match_confidence);

  return (
    <section
      data-testid="cross-pollination-card"
      style={{
        background: hexAlpha(MAGENTA, 0.04),
        border: `1px solid ${hexAlpha(MAGENTA, 0.5)}`,
        borderRadius: PF_TINTS.r.md,
        padding: 16,
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <h3
          style={{
            margin: 0,
            font: `600 11px ${PF_TINTS.sans}`,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: PF_TINTS.ink,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              background: MAGENTA,
              transform: 'rotate(45deg)',
              flexShrink: 0,
            }}
          />
          Warm intro available — {sorted.length} match
          {sorted.length === 1 ? '' : 'es'}
        </h3>
        {targetRegion && (
          <div
            data-testid="cross-pollination-card-region"
            style={{
              marginTop: 4,
              font: `400 11px ${PF_TINTS.mono}`,
              color: PF_TINTS.inkSub,
              letterSpacing: '0.04em',
            }}
          >
            Region: {targetRegion}
          </div>
        )}
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map((match) => (
          <MatchRow key={match.id} match={match} onInsertHook={onInsertHook} />
        ))}
      </div>
    </section>
  );
}

function MatchRow({
  match,
  onInsertHook,
}: {
  match: CrossPollinationMatchRow;
  onInsertHook?: (hook: string, matchId: string) => void;
}): React.ReactElement {
  const customer = formatCustomer(match.customer_canonical);
  const branch = match.primary_branch_name ?? 'unidentified branch';
  const sites = match.active_site_count;
  const hook = hookFor(match);

  return (
    <div
      data-testid={`cross-pollination-match-${match.id}`}
      data-match-layer={match.match_layer}
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleHair}`,
        borderRadius: PF_TINTS.r.sm,
        padding: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          font: `500 13px ${PF_TINTS.sans}`,
          color: PF_TINTS.ink,
        }}
      >
        <span style={{ fontWeight: 600 }}>{customer}</span>
        <ConfidenceChip layer={match.match_layer} confidence={match.match_confidence} />
        <span style={{ color: PF_TINTS.inkSub, font: `400 12px ${PF_TINTS.sans}` }}>
          {branch} · {sites} site{sites === 1 ? '' : 's'}
        </span>
        {match.national_account && (
          <span
            style={{
              font: `600 10px ${PF_TINTS.mono}`,
              color: '#b45309',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            National account
          </span>
        )}
      </div>

      <blockquote
        data-testid={`cross-pollination-match-${match.id}-hook`}
        style={{
          margin: '8px 0 0',
          padding: '6px 10px',
          borderLeft: `2px solid ${MAGENTA}`,
          background: hexAlpha(MAGENTA, 0.06),
          font: `400 italic 12px/1.5 ${PF_TINTS.sans}`,
          color: PF_TINTS.inkSub,
        }}
      >
        “{hook}”
      </blockquote>

      <div style={{ marginTop: 6 }}>
        <button
          type="button"
          data-testid={`cross-pollination-match-${match.id}-insert`}
          onClick={onInsertHook ? () => onInsertHook(hook, match.id) : undefined}
          disabled={!onInsertHook}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            font: `500 12px ${PF_TINTS.sans}`,
            color: onInsertHook ? MAGENTA : PF_TINTS.inkDim,
            cursor: onInsertHook ? 'pointer' : 'not-allowed',
            textDecoration: 'underline',
          }}
        >
          Open in Outreach with this hook
        </button>
      </div>
    </div>
  );
}

function ConfidenceChip({
  layer,
  confidence,
}: {
  layer: string;
  confidence: number;
}): React.ReactElement {
  const isExact = layer === 'exact';
  const label = isExact ? 'EXACT' : layer === 'fuzzy' ? 'FUZZY' : layer.toUpperCase();
  return (
    <span
      style={{
        background: isExact ? hexAlpha(MAGENTA, 0.18) : 'transparent',
        border: isExact
          ? `1px solid ${MAGENTA}`
          : `1px dashed ${MAGENTA}`,
        color: PF_TINTS.ink,
        padding: '1px 7px',
        borderRadius: 3,
        font: `600 10px ${PF_TINTS.mono}`,
        letterSpacing: '0.06em',
      }}
      title={`Confidence ${confidence.toFixed(2)}`}
    >
      {label}
    </span>
  );
}

/**
 * Generate an outreach-opening-hook string for a cross-poll match. The
 * `pathfinder.lead_cross_pollination` table doesn't carry an
 * `outreach_opening_hook` column today (see
 * `MEMORY/operator-todos/2026-05-02-pathfinder-cross-pollination-verify-schema.md`).
 * This helper synthesizes a usable hook from the row data so the demo flow
 * works end-to-end. When the column lands, swap in the stored hook.
 */
function hookFor(match: CrossPollinationMatchRow): string {
  const customer = formatCustomer(match.customer_canonical);
  const branch = match.primary_branch_name ?? 'our nearest branch';
  const sites = match.active_site_count;
  const sitesPhrase = sites === 1 ? '1 active site' : `${sites} active sites`;
  return `${customer} is already a Zedcor customer (${sitesPhrase} at ${branch}). The procurement team there is the natural warm-intro path into this opportunity.`;
}

function formatCustomer(canonical: string): string {
  return canonical
    .split(/\s+/)
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}
