'use client';

// ConnectorsView — client wrapper for the /settings/connectors page.
//
// Responsibilities:
//   1. Render a tile per connector via `ConnectorTile`.
//   2. Slack tile: live OAuth handoff for Connect; routing-rules modal
//      for Configure; disconnect-confirm modal for Disconnect.
//   3. Teams + HubSpot tiles: keep the Phase 0 "coming soon" modal
//      (their connectors aren't wired in Phase 1).

import * as React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';
import { ConnectorTile } from './ConnectorTile';
import type { ConnectorId, ConnectorTileState } from './ConnectorTile';
import { RoutingRulesModal } from './RoutingRulesModal';
import { DisconnectConfirm } from './DisconnectConfirm';

export interface ConnectorsViewTile {
  id: ConnectorId;
  name: string;
  oneLiner: string;
  state: ConnectorTileState;
  accountName?: string;
  stat?: string;
  errorMessage?: string;
  connectorId?: string;
  comingPhase?: string;
  authStartHref?: string;
  stubModal?: boolean;
  stubPhase?: string;
}

const PHASE_DESCRIPTIONS: Record<ConnectorId, { phase: string; whatItDoes: string[] }> = {
  slack: {
    phase: 'Phase 1',
    whatItDoes: [
      'Real OAuth install replaces the webhook stub',
      'Slash commands: /pathfinder leads, /pathfinder rejected, /pathfinder feedback',
      '@-mentions and DMs route to the chat agent',
      'Reaction-based feedback (👍 / 👎) feeds the ranker',
    ],
  },
  teams: {
    phase: 'Phase 2',
    whatItDoes: [
      'Microsoft Entra OAuth + Bot Framework wiring',
      'Adaptive Cards for leads, outreach drafts, and rejections',
      '@-mention command parsing and DM threading',
      'Action-button feedback capture for the ranker',
    ],
  },
  hubspot: {
    phase: 'Phase 3',
    whatItDoes: [
      'Bidirectional sync: deals, contacts, engagements',
      'Stage mapping editor + conflict resolution policy',
      'Webhook subscriptions for real-time updates',
      'Nightly reconciliation cron for catch-up sync',
    ],
  },
};

interface OpenModal {
  kind: 'rules' | 'disconnect' | 'stub';
  connectorId?: string;
  tileId: ConnectorId;
}

export function ConnectorsView({
  tiles,
  orgId,
}: {
  tiles: ConnectorsViewTile[];
  orgId: string;
}) {
  const [modal, setModal] = React.useState<OpenModal | null>(null);

  const handlePrimary = (tile: ConnectorsViewTile) => {
    if (tile.stubModal) {
      setModal({ kind: 'stub', tileId: tile.id });
      return;
    }
    if (tile.state === 'connected' && tile.connectorId) {
      setModal({ kind: 'rules', connectorId: tile.connectorId, tileId: tile.id });
      return;
    }
    if (tile.authStartHref) {
      window.location.href = tile.authStartHref;
      return;
    }
    // Fallback to stub modal so the click is never silently swallowed.
    setModal({ kind: 'stub', tileId: tile.id });
  };

  const handleSecondary = (tile: ConnectorsViewTile) => {
    if (tile.connectorId && tile.state === 'connected') {
      setModal({ kind: 'disconnect', connectorId: tile.connectorId, tileId: tile.id });
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        overflow: 'auto',
        background: PF_TINTS.bgAlt,
        color: PF_TINTS.ink,
        font: `400 13px/1.5 ${PF_TINTS.sans}`,
      }}
    >
      <style>{`@keyframes pf-spin { to { transform: rotate(360deg); } }`}</style>

      <header
        style={{
          height: 56,
          background: PF_TINTS.bg,
          borderBottom: `1px solid ${PF_TINTS.ruleSoft}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 16,
        }}
      >
        <a
          href="/pathfinder/settings"
          style={{
            color: PF_TINTS.ink,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            font: `500 12px ${PF_TINTS.sans}`,
          }}
        >
          <span aria-hidden="true" style={{ color: PF_TINTS.inkDim }}>
            ←
          </span>
          Settings
        </a>
        <span
          className="pf-mono"
          style={{
            fontSize: 9,
            color: PF_TINTS.inkDim,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}
        >
          / connectors
        </span>
        <span style={{ flex: 1 }} />
        <span
          className="pf-mono"
          data-testid="connectors-org-pill"
          style={{
            fontSize: 9,
            color: PF_TINTS.inkDim,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            padding: '3px 8px',
            border: `1px solid ${PF_TINTS.ruleSoft}`,
            borderRadius: 3,
          }}
        >
          org / {orgId}
        </span>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 64px' }}>
        <h1
          style={{
            font: `600 22px/1.2 ${PF_TINTS.sans}`,
            letterSpacing: '-0.01em',
            color: PF_TINTS.ink,
            margin: '0 0 4px',
          }}
        >
          Connectors
        </h1>
        <p
          style={{
            color: PF_TINTS.inkSub,
            margin: '0 0 24px',
            maxWidth: 640,
          }}
        >
          Wire Pathfinder into the tools your team already uses. Connect once,
          configure routing rules per branch, and let the agent post leads,
          outreach drafts, and feedback where your reps already work.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {tiles.map((tile) => (
            <ConnectorTile
              key={tile.id}
              id={tile.id}
              name={tile.name}
              oneLiner={tile.oneLiner}
              state={tile.state}
              accountName={tile.accountName}
              stat={tile.stat}
              errorMessage={tile.errorMessage}
              onPrimaryAction={() => handlePrimary(tile)}
              onSecondaryAction={
                tile.state === 'connected' && tile.connectorId
                  ? () => handleSecondary(tile)
                  : undefined
              }
            />
          ))}
        </div>

        <p
          style={{
            marginTop: 24,
            fontSize: 11,
            color: PF_TINTS.inkDim,
            maxWidth: 720,
          }}
        >
          Slack OAuth, routing rules, and disconnect ship in Phase 1. Microsoft
          Teams parity arrives in Phase 2; HubSpot bi-directional sync in Phase
          3.
        </p>
      </main>

      {modal?.kind === 'stub' && (
        <ComingSoonModal id={modal.tileId} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'rules' && modal.connectorId && (
        <RoutingRulesModal
          connectorId={modal.connectorId}
          connectorType={modal.tileId}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'disconnect' && modal.connectorId && (
        <DisconnectConfirm
          connectorId={modal.connectorId}
          connectorType={modal.tileId}
          onClose={() => setModal(null)}
          onComplete={() => {
            // Refresh the page so the server component re-reads the
            // connector status. window.location.reload preserves the
            // basic-auth session cookie + URL hash.
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

function ComingSoonModal({ id, onClose }: { id: ConnectorId; onClose: () => void }) {
  const info = PHASE_DESCRIPTIONS[id];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="connector-modal-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,10,10,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: PF_TINTS.bg,
          border: `1px solid ${PF_TINTS.ruleSoft}`,
          borderRadius: PF_TINTS.r.md,
          boxShadow: PF_TINTS.shadow.lg,
          maxWidth: 480,
          width: '100%',
          padding: 24,
          font: `400 13px/1.5 ${PF_TINTS.sans}`,
          color: PF_TINTS.ink,
        }}
      >
        <h2
          id="connector-modal-title"
          style={{ font: `600 16px/1.3 ${PF_TINTS.sans}`, margin: '0 0 4px' }}
        >
          Coming in {info.phase}
        </h2>
        <p
          className="pf-mono"
          style={{
            fontSize: 9,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: PF_TINTS.inkDim,
            margin: '0 0 16px',
          }}
        >
          / connector / {id}
        </p>
        <p style={{ color: PF_TINTS.inkSub, margin: '0 0 12px' }}>
          The {id === 'hubspot' ? 'HubSpot' : id === 'teams' ? 'Microsoft Teams' : 'Slack'} connector ships in {info.phase} of the connector framework sprint. Here&apos;s what it will do:
        </p>
        <ul style={{ paddingLeft: 18, margin: '0 0 20px', color: PF_TINTS.inkSub }}>
          {info.whatItDoes.map((item, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {item}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          style={{
            font: `500 12px ${PF_TINTS.sans}`,
            color: PF_TINTS.bg,
            background: PF_TINTS.ink,
            border: `1px solid ${PF_TINTS.ink}`,
            borderRadius: 3,
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
