'use client';

// Done — final step of the C-4A onboarding wizard. Summarizes what was
// connected vs. skipped, lists the routing rules the user opted into,
// and routes them to Settings → Connectors as the primary CTA.
//
// Spec: SPEC - Connectors (Slack, Teams, HubSpot).md § 7.3.

import * as React from 'react';

import { PF_TINTS, hexAlpha } from '@/lib/agent-tints';
import {
  getQuickPickRules,
  type QuickPickRule,
} from '@/lib/connectors/onboarding-rules';
import { quickPickKey, type QuickPickRulesSelection } from './QuickPickRulesStep';
import type { ConnectorType } from '@/lib/types';

export interface DoneSummaryConnector {
  type: ConnectorType;
  name: string;
  status: 'connected' | 'skipped' | 'coming-soon';
}

export interface DoneProps {
  connectors: DoneSummaryConnector[];
  selection: QuickPickRulesSelection;
  onBack: () => void;
  /** Settings href — `/pathfinder/settings/connectors` by default. */
  settingsHref?: string;
}

export function Done(props: DoneProps) {
  const { connectors, selection, onBack, settingsHref = '/pathfinder/settings/connectors' } = props;

  const connectedCount = connectors.filter((c) => c.status === 'connected').length;
  const skippedCount = connectors.filter((c) => c.status === 'skipped').length;
  const comingSoonCount = connectors.filter((c) => c.status === 'coming-soon').length;

  const enabledRules: { connectorType: ConnectorType; rule: QuickPickRule; channel: string }[] = [];
  for (const c of connectors) {
    if (c.status !== 'connected') continue;
    for (const rule of getQuickPickRules(c.type)) {
      const sel = selection[quickPickKey(c.type, rule.id)];
      if (sel?.checked) {
        enabledRules.push({ connectorType: c.type, rule, channel: sel.channel || rule.channel_placeholder });
      }
    }
  }

  return (
    <section
      data-testid="onboarding-done"
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        boxShadow: PF_TINTS.shadow.sm,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <header>
        <h2
          style={{
            font: `600 22px/1.2 ${PF_TINTS.sans}`,
            color: PF_TINTS.ink,
            margin: '0 0 4px',
            letterSpacing: '-0.01em',
          }}
        >
          You&apos;re set up.
        </h2>
        <p style={{ margin: 0, color: PF_TINTS.inkSub }}>
          Pathfinder is wired into your tools. You can revisit any of these from{' '}
          <a
            href={settingsHref}
            style={{ color: PF_TINTS.ink, fontWeight: 500 }}
          >
            Settings → Connectors
          </a>
          .
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 8,
        }}
      >
        <SummaryStat label="Connected" value={connectedCount} tint="#198754" />
        <SummaryStat label="Skipped" value={skippedCount} tint={PF_TINTS.inkSub} />
        <SummaryStat label="Coming soon" value={comingSoonCount} tint={PF_TINTS.inkDim} />
      </div>

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
          Connectors
        </div>
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
          {connectors.map((c) => (
            <li
              key={c.type}
              data-testid={`onboarding-done-connector-${c.type}`}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                padding: '6px 0',
                borderBottom: `1px solid ${PF_TINTS.ruleHair}`,
              }}
            >
              <span
                style={{
                  font: `500 10px ${PF_TINTS.mono}`,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color:
                    c.status === 'connected'
                      ? '#198754'
                      : c.status === 'skipped'
                        ? PF_TINTS.inkSub
                        : PF_TINTS.inkDim,
                  background:
                    c.status === 'connected'
                      ? 'rgba(25,135,84,0.12)'
                      : hexAlpha('#0a0a0a', 0.04),
                  border: `1px solid ${PF_TINTS.ruleSoft}`,
                  borderRadius: 3,
                  padding: '2px 6px',
                  minWidth: 96,
                  textAlign: 'center',
                }}
              >
                {c.status === 'coming-soon' ? 'Coming soon' : c.status}
              </span>
              <span style={{ color: PF_TINTS.ink, fontWeight: 500 }}>{c.name}</span>
            </li>
          ))}
        </ul>
      </div>

      {enabledRules.length > 0 && (
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
            Routing rules ({enabledRules.length})
          </div>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {enabledRules.map(({ connectorType, rule, channel }) => (
              <li
                key={`${connectorType}-${rule.id}`}
                data-testid={`onboarding-done-rule-${connectorType}-${rule.id}`}
                style={{
                  padding: '6px 0',
                  borderBottom: `1px solid ${PF_TINTS.ruleHair}`,
                  fontSize: 13,
                  color: PF_TINTS.inkSub,
                }}
              >
                <span style={{ color: PF_TINTS.ink, fontWeight: 500 }}>{rule.event_type}</span>
                <span style={{ color: PF_TINTS.inkDim }}> → </span>
                <span className="pf-mono" style={{ color: PF_TINTS.ink }}>
                  {channel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          data-testid="onboarding-done-back"
          onClick={onBack}
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
          ← Back
        </button>
        <span style={{ flex: 1 }} />
        <a
          data-testid="onboarding-done-cta"
          href={settingsHref}
          style={{
            font: `500 12px ${PF_TINTS.sans}`,
            color: PF_TINTS.bg,
            background: PF_TINTS.ink,
            border: `1px solid ${PF_TINTS.ink}`,
            borderRadius: 3,
            padding: '8px 16px',
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          Go to Settings →
        </a>
      </footer>
    </section>
  );
}

function SummaryStat({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div
      style={{
        background: PF_TINTS.bgAlt,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.sm,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        className="pf-mono"
        style={{
          fontSize: 9,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: PF_TINTS.inkDim,
        }}
      >
        {label}
      </div>
      <div
        style={{
          font: `600 24px/1 ${PF_TINTS.sans}`,
          color: tint,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
    </div>
  );
}
