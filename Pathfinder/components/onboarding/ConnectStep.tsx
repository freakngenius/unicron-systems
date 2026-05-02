'use client';

// ConnectStep — reusable per-connector step in the C-4A onboarding
// wizard. Renders the connector logo, what gets posted/where copy, the
// "Connect" button (linking to the OAuth start endpoint), a Skip
// affordance, and a "Coming soon" graceful-degrade for connectors whose
// OAuth route hasn't shipped yet (Teams pre-C-2A, HubSpot pre-C-3A).
//
// Spec: SPEC - Connectors (Slack, Teams, HubSpot).md § 7.3.

import * as React from 'react';

import { PF_TINTS, hexAlpha } from '@/lib/agent-tints';
import type { ConnectorId, ConnectorTileState } from '@/components/settings/connectors/ConnectorTile';

export interface ConnectStepProps {
  connectorId: ConnectorId;
  name: string;
  /** Where the OAuth starts. e.g. `/pathfinder/api/connectors/slack/auth?org_id=zedcor` */
  authStartHref: string;
  /** When true, render the Coming-soon copy in place of the Connect button.
   *  Used when the OAuth route hasn't shipped yet (Teams pre-C-2A, HubSpot pre-C-3A). */
  comingSoon?: boolean;
  /** Current connector state — drives the badge + copy. */
  state: ConnectorTileState;
  /** Bullet list of what the connector posts/does. */
  whatItDoes: string[];
  /** When the user clicks Skip. */
  onSkip: () => void;
  /** When the user clicks Next (after connecting OR explicitly continuing). */
  onContinue: () => void;
  /** When true, show the "Skipped" badge + a "Reconnect" affordance. */
  isSkipped?: boolean;
  /** When true, this step is the wizard's final connector step (controls
   *  copy on the Continue button). */
  isLastConnector?: boolean;
}

const PROVIDER_BLURB: Record<ConnectorId, string> = {
  slack: 'Pathfinder posts leads, briefs, and feedback prompts into your Slack workspace.',
  teams:
    'Pathfinder posts Adaptive Cards into your Microsoft Teams channels and DMs reps directly.',
  hubspot: 'Pathfinder pushes verified leads into your HubSpot CRM and listens for stage changes.',
};

export function ConnectStep(props: ConnectStepProps) {
  const {
    connectorId,
    name,
    authStartHref,
    comingSoon = false,
    state,
    whatItDoes,
    onSkip,
    onContinue,
    isSkipped = false,
    isLastConnector = false,
  } = props;

  const connected = state === 'connected';
  const showConnectAction = !comingSoon && !connected;

  return (
    <section
      data-testid={`onboarding-connect-step-${connectorId}`}
      data-connector-state={state}
      data-coming-soon={comingSoon ? 'true' : 'false'}
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        boxShadow: PF_TINTS.shadow.sm,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2
          style={{
            font: `600 18px/1.2 ${PF_TINTS.sans}`,
            color: PF_TINTS.ink,
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          Connect {name}
        </h2>
        <span
          className="pf-mono"
          style={{
            fontSize: 9,
            color: PF_TINTS.inkDim,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}
        >
          / step / {connectorId}
        </span>
        {connected && (
          <span
            data-testid={`onboarding-connect-step-${connectorId}-connected-badge`}
            style={{
              font: `500 10px ${PF_TINTS.mono}`,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#198754',
              background: 'rgba(25,135,84,0.12)',
              border: '1px solid rgba(25,135,84,0.40)',
              borderRadius: 3,
              padding: '2px 6px',
            }}
          >
            Connected
          </span>
        )}
        {isSkipped && !connected && (
          <span
            data-testid={`onboarding-connect-step-${connectorId}-skipped-badge`}
            style={{
              font: `500 10px ${PF_TINTS.mono}`,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: PF_TINTS.inkSub,
              background: hexAlpha('#0a0a0a', 0.04),
              border: `1px solid ${PF_TINTS.ruleSoft}`,
              borderRadius: 3,
              padding: '2px 6px',
            }}
          >
            Skipped
          </span>
        )}
      </header>

      <p style={{ margin: 0, color: PF_TINTS.inkSub }}>{PROVIDER_BLURB[connectorId]}</p>

      <div>
        <div
          className="pf-mono"
          style={{
            fontSize: 9,
            color: PF_TINTS.inkDim,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          What gets connected
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            color: PF_TINTS.inkSub,
            font: `400 13px/1.5 ${PF_TINTS.sans}`,
          }}
        >
          {whatItDoes.map((item, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {comingSoon && (
        <div
          data-testid={`onboarding-connect-step-${connectorId}-coming-soon`}
          role="note"
          style={{
            background: PF_TINTS.bgAlt,
            border: `1px solid ${PF_TINTS.ruleSoft}`,
            borderRadius: PF_TINTS.r.sm,
            padding: 12,
            color: PF_TINTS.inkSub,
            fontSize: 12,
          }}
        >
          <strong style={{ color: PF_TINTS.ink, fontWeight: 600 }}>Coming soon.</strong>{' '}
          The {name} OAuth flow ships in the next phase of the connector framework. You can skip
          this step now and connect from Settings → Connectors when it&apos;s available.
        </div>
      )}

      <footer style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {showConnectAction && (
          <a
            data-testid={`onboarding-connect-step-${connectorId}-connect`}
            href={authStartHref}
            style={{
              font: `500 12px ${PF_TINTS.sans}`,
              color: PF_TINTS.bg,
              background: PF_TINTS.ink,
              border: `1px solid ${PF_TINTS.ink}`,
              borderRadius: 3,
              padding: '8px 16px',
              cursor: 'pointer',
              textDecoration: 'none',
              letterSpacing: '-0.005em',
            }}
          >
            Connect {name}
          </a>
        )}
        {!comingSoon && (
          <button
            type="button"
            data-testid={`onboarding-connect-step-${connectorId}-skip`}
            onClick={onSkip}
            style={{
              font: `500 12px ${PF_TINTS.sans}`,
              color: PF_TINTS.inkSub,
              background: 'transparent',
              border: `1px solid ${PF_TINTS.ruleSoft}`,
              borderRadius: 3,
              padding: '8px 16px',
              cursor: 'pointer',
            }}
          >
            I&apos;ll do this later
          </button>
        )}
        {comingSoon && (
          <button
            type="button"
            data-testid={`onboarding-connect-step-${connectorId}-skip`}
            onClick={onSkip}
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
            Skip for now
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          data-testid={`onboarding-connect-step-${connectorId}-continue`}
          onClick={onContinue}
          style={{
            font: `500 12px ${PF_TINTS.sans}`,
            color: connected ? PF_TINTS.bg : PF_TINTS.inkSub,
            background: connected ? PF_TINTS.ink : 'transparent',
            border: `1px solid ${connected ? PF_TINTS.ink : PF_TINTS.ruleSoft}`,
            borderRadius: 3,
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          {isLastConnector ? 'Continue to routing' : 'Next →'}
        </button>
      </footer>
    </section>
  );
}
