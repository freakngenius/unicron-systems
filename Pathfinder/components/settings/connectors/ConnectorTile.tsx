'use client';

// ConnectorTile — one tile per connector type. Renders one of six states
// per SPEC - Connectors (Slack, Teams, HubSpot).md § 4.4.
//
// Phase 0: only `disconnected` and `connected` paths fire from the
// stub seed; the other states are wired in here so Phase 1 onwards
// can light them up without re-laying-out.

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';

export type ConnectorTileState =
  | 'disconnected'
  | 'pending'
  | 'connected'
  | 'error'
  | 'expired'
  | 'revoked';

export type ConnectorId = 'slack' | 'teams' | 'hubspot';

export interface ConnectorTileProps {
  id: ConnectorId;
  name: string;
  oneLiner: string;
  state: ConnectorTileState;
  accountName?: string;
  stat?: string;
  errorMessage?: string;
  // For Phase 0, primary action goes through `onPrimaryAction` so the
  // "Coming next phase" modal can intercept Connect/Configure clicks
  // until real OAuth lands in Phase 1.
  onPrimaryAction: () => void;
  onSecondaryAction?: () => void;
  /** Optional tertiary action (secondary call-to-action). Used by C-2B
   *  for the "Generate manifest for IT" button on disconnected Slack/
   *  Teams tiles. The button renders as a full-width row below the
   *  primary footer so the tile layout stays responsive on narrow
   *  viewports. */
  tertiaryAction?: { label: string; onClick: () => void; testId?: string };
  comingPhase?: string;
}

// Logo monogram — inline SVG mark for each connector. Phase 0 ships
// minimal vector marks rather than pulling in brand SVGs from a CDN
// (avoids a third-party dep + asset-host config). Phase 1 can swap in
// the real brand assets once the connector framework lands.
function Logo({ id }: { id: ConnectorId }) {
  const size = 28;
  if (id === 'slack') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2" y="10" width="6" height="4" rx="2" fill="#36C5F0" />
        <rect x="10" y="2" width="4" height="6" rx="2" fill="#2EB67D" />
        <rect x="16" y="10" width="6" height="4" rx="2" fill="#ECB22E" />
        <rect x="10" y="16" width="4" height="6" rx="2" fill="#E01E5A" />
      </svg>
    );
  }
  if (id === 'teams') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="6" width="14" height="12" rx="2" fill="#5059C9" />
        <rect x="13" y="3" width="8" height="8" rx="2" fill="#7B83EB" />
        <text
          x="10"
          y="15"
          textAnchor="middle"
          fontSize="9"
          fontFamily="system-ui, sans-serif"
          fontWeight="700"
          fill="#fff"
        >
          T
        </text>
      </svg>
    );
  }
  // hubspot
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="16" cy="14" r="5" fill="none" stroke="#FF7A59" strokeWidth="2" />
      <line x1="16" y1="9" x2="16" y2="5" stroke="#FF7A59" strokeWidth="2" />
      <circle cx="16" cy="3.5" r="2" fill="#FF7A59" />
      <circle cx="6" cy="6" r="1.5" fill="#FF7A59" />
      <line x1="7" y1="7" x2="11.5" y2="11.5" stroke="#FF7A59" strokeWidth="1.5" />
    </svg>
  );
}

interface BadgeColor {
  fg: string;
  bg: string;
  ring: string;
}

const BADGE_COLORS: Record<ConnectorTileState, BadgeColor> = {
  disconnected: { fg: PF_TINTS.inkDim, bg: hexAlpha('#0a0a0a', 0.04), ring: PF_TINTS.ruleSoft },
  pending: { fg: PF_TINTS.violet, bg: PF_TINTS.violetSoft, ring: PF_TINTS.violetRing },
  connected: { fg: '#198754', bg: 'rgba(25,135,84,0.12)', ring: 'rgba(25,135,84,0.40)' },
  error: { fg: '#c42424', bg: 'rgba(196,36,36,0.10)', ring: 'rgba(196,36,36,0.45)' },
  expired: { fg: '#a06600', bg: 'rgba(160,102,0,0.12)', ring: 'rgba(160,102,0,0.40)' },
  revoked: { fg: PF_TINTS.inkSub, bg: hexAlpha('#0a0a0a', 0.06), ring: PF_TINTS.ruleSoft },
};

const BADGE_LABEL: Record<ConnectorTileState, string> = {
  disconnected: 'Disconnected',
  pending: 'Authorizing…',
  connected: 'Connected',
  error: 'Error',
  expired: 'Token expired',
  revoked: 'Revoked',
};

const PRIMARY_ACTION: Record<ConnectorTileState, string> = {
  disconnected: 'Connect',
  pending: 'Cancel',
  connected: 'Configure',
  error: 'Reconnect',
  expired: 'Reconnect',
  revoked: 'Reconnect',
};

export function ConnectorTile(props: ConnectorTileProps) {
  const { id, name, oneLiner, state, accountName, stat, errorMessage, onPrimaryAction, onSecondaryAction, tertiaryAction } = props;
  const badge = BADGE_COLORS[state];
  const primaryLabel = PRIMARY_ACTION[state];

  return (
    <article
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        boxShadow: PF_TINTS.shadow.sm,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 200,
      }}
      data-testid={`connector-tile-${id}`}
      data-state={state}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Logo id={id} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              font: `600 14px/1.2 ${PF_TINTS.sans}`,
              color: PF_TINTS.ink,
              letterSpacing: '-0.005em',
            }}
          >
            {name}
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 4,
            }}
          >
            <span
              style={{
                font: `500 10px ${PF_TINTS.mono}`,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: badge.fg,
                background: badge.bg,
                border: `1px solid ${badge.ring}`,
                borderRadius: 3,
                padding: '2px 6px',
              }}
            >
              {BADGE_LABEL[state]}
            </span>
            {state === 'pending' && (
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  border: `2px solid ${PF_TINTS.violet}`,
                  borderTopColor: 'transparent',
                  animation: 'pf-spin 0.8s linear infinite',
                }}
              />
            )}
          </div>
        </div>
      </header>

      <div
        style={{
          font: `400 12px/1.5 ${PF_TINTS.sans}`,
          color: PF_TINTS.inkSub,
          flex: 1,
        }}
      >
        {oneLiner}
        {accountName && state === 'connected' && (
          <div style={{ marginTop: 8, color: PF_TINTS.ink, fontWeight: 500 }}>
            {accountName}
          </div>
        )}
        {stat && state === 'connected' && (
          <div
            className="pf-mono"
            style={{
              marginTop: 4,
              fontSize: 10,
              color: PF_TINTS.inkDim,
              letterSpacing: '0.04em',
            }}
          >
            {stat}
          </div>
        )}
        {errorMessage && (state === 'error' || state === 'expired') && (
          <div style={{ marginTop: 8, color: badge.fg, fontSize: 11 }}>{errorMessage}</div>
        )}
      </div>

      <footer
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignItems: 'stretch',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={onPrimaryAction}
            data-testid={`connector-tile-${id}-primary`}
            style={{
              font: `500 12px ${PF_TINTS.sans}`,
              color: PF_TINTS.bg,
              background: PF_TINTS.ink,
              border: `1px solid ${PF_TINTS.ink}`,
              borderRadius: 3,
              padding: '6px 12px',
              cursor: 'pointer',
              letterSpacing: '-0.005em',
            }}
          >
            {primaryLabel}
          </button>
          {state === 'connected' && onSecondaryAction && (
            <button
              type="button"
              onClick={onSecondaryAction}
              style={{
                font: `500 12px ${PF_TINTS.sans}`,
                color: PF_TINTS.inkSub,
                background: 'transparent',
                border: `1px solid ${PF_TINTS.ruleSoft}`,
                borderRadius: 3,
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              Disconnect
            </button>
          )}
        </div>
        {tertiaryAction && (
          <button
            type="button"
            onClick={tertiaryAction.onClick}
            data-testid={tertiaryAction.testId ?? `connector-tile-${id}-tertiary`}
            style={{
              font: `500 11px ${PF_TINTS.sans}`,
              color: PF_TINTS.inkSub,
              background: 'transparent',
              border: `1px solid ${PF_TINTS.ruleSoft}`,
              borderRadius: 3,
              padding: '5px 10px',
              cursor: 'pointer',
              alignSelf: 'flex-start',
              letterSpacing: '-0.003em',
            }}
          >
            {tertiaryAction.label}
          </button>
        )}
      </footer>
    </article>
  );
}
