'use client';

// QuickPickRulesStep — step 5 of the C-4A onboarding wizard. For each
// connected chat connector (Slack/Teams), surface a checkbox list of
// 2-3 sensible default routing rules from
// `lib/connectors/onboarding-rules.ts`. The user fills in their actual
// channel id before the rules are saved.
//
// Spec: SPEC - Connectors (Slack, Teams, HubSpot).md § 7.3 +
// `lib/connectors/onboarding-rules.ts` for the rule catalog.

import * as React from 'react';

import { PF_TINTS, hexAlpha } from '@/lib/agent-tints';
import {
  getQuickPickRules,
  hasQuickPickRules,
  type QuickPickRule,
} from '@/lib/connectors/onboarding-rules';
import type { ConnectorType } from '@/lib/types';

export interface ConnectedConnectorInfo {
  type: ConnectorType;
  name: string;
}

export interface QuickPickRulesSelection {
  /** Map of `connectorType:ruleId` → `{ checked, channel }`. */
  [key: string]: { checked: boolean; channel: string };
}

export interface QuickPickRulesStepProps {
  connectedConnectors: ConnectedConnectorInfo[];
  selection: QuickPickRulesSelection;
  onSelectionChange: (next: QuickPickRulesSelection) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function quickPickKey(connectorType: ConnectorType, ruleId: string): string {
  return `${connectorType}:${ruleId}`;
}

/**
 * `defaultSelection` — given the connected connectors, build the
 * initial selection state from each rule's `default_checked` flag and
 * `channel_placeholder`. Stable across renders — the wizard owns the
 * mutable copy after first mount.
 */
export function defaultSelection(
  connectedConnectors: ConnectedConnectorInfo[],
): QuickPickRulesSelection {
  const out: QuickPickRulesSelection = {};
  for (const c of connectedConnectors) {
    if (!hasQuickPickRules(c.type)) continue;
    for (const rule of getQuickPickRules(c.type)) {
      out[quickPickKey(c.type, rule.id)] = {
        checked: rule.default_checked,
        channel: rule.channel_placeholder,
      };
    }
  }
  return out;
}

export function QuickPickRulesStep(props: QuickPickRulesStepProps) {
  const { connectedConnectors, selection, onSelectionChange, onBack, onContinue } = props;

  const rulesByConnector = connectedConnectors
    .filter((c) => hasQuickPickRules(c.type))
    .map((c) => ({ connector: c, rules: getQuickPickRules(c.type) }));

  const noRulesAvailable = rulesByConnector.length === 0;

  const update = (
    connectorType: ConnectorType,
    rule: QuickPickRule,
    patch: Partial<{ checked: boolean; channel: string }>,
  ) => {
    const key = quickPickKey(connectorType, rule.id);
    const prev = selection[key] ?? {
      checked: rule.default_checked,
      channel: rule.channel_placeholder,
    };
    onSelectionChange({ ...selection, [key]: { ...prev, ...patch } });
  };

  return (
    <section
      data-testid="onboarding-quick-pick-step"
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
            font: `600 18px/1.2 ${PF_TINTS.sans}`,
            color: PF_TINTS.ink,
            margin: '0 0 4px',
            letterSpacing: '-0.01em',
          }}
        >
          Quick-pick routing rules
        </h2>
        <p style={{ margin: 0, color: PF_TINTS.inkSub }}>
          Pick a starter set of routing rules for each connected tool. You can edit, add, or remove
          rules anytime in Settings → Connectors.
        </p>
      </header>

      {noRulesAvailable && (
        <div
          data-testid="onboarding-quick-pick-empty"
          style={{
            background: PF_TINTS.bgAlt,
            border: `1px solid ${PF_TINTS.ruleSoft}`,
            borderRadius: PF_TINTS.r.sm,
            padding: 16,
            color: PF_TINTS.inkSub,
            fontSize: 13,
          }}
        >
          No chat connectors are connected yet. Skip ahead — you can add routing rules later from
          Settings → Connectors once a connector is wired up.
        </div>
      )}

      {rulesByConnector.map(({ connector, rules }) => (
        <div
          key={connector.type}
          data-testid={`onboarding-quick-pick-block-${connector.type}`}
        >
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
            {connector.name}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rules.map((rule) => {
              const key = quickPickKey(connector.type, rule.id);
              const current = selection[key] ?? {
                checked: rule.default_checked,
                channel: rule.channel_placeholder,
              };
              return (
                <label
                  key={rule.id}
                  data-testid={`onboarding-quick-pick-row-${connector.type}-${rule.id}`}
                  style={{
                    display: 'flex',
                    gap: 12,
                    padding: 12,
                    border: `1px solid ${PF_TINTS.ruleSoft}`,
                    borderRadius: PF_TINTS.r.sm,
                    background: current.checked ? hexAlpha('#198754', 0.04) : PF_TINTS.bg,
                    cursor: 'pointer',
                    alignItems: 'flex-start',
                  }}
                >
                  <input
                    type="checkbox"
                    data-testid={`onboarding-quick-pick-check-${connector.type}-${rule.id}`}
                    checked={current.checked}
                    onChange={(e) => update(connector.type, rule, { checked: e.target.checked })}
                    style={{ marginTop: 4 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        font: `500 13px/1.3 ${PF_TINTS.sans}`,
                        color: PF_TINTS.ink,
                        marginBottom: 4,
                      }}
                    >
                      {rule.label}
                    </div>
                    <div
                      style={{
                        color: PF_TINTS.inkSub,
                        fontSize: 12,
                        marginBottom: 8,
                      }}
                    >
                      {rule.description}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label
                        className="pf-mono"
                        style={{
                          fontSize: 9,
                          color: PF_TINTS.inkDim,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Channel
                      </label>
                      <input
                        type="text"
                        data-testid={`onboarding-quick-pick-channel-${connector.type}-${rule.id}`}
                        value={current.channel}
                        onChange={(e) => update(connector.type, rule, { channel: e.target.value })}
                        onClick={(e) => e.preventDefault()}
                        disabled={!current.checked}
                        placeholder={rule.channel_placeholder}
                        style={{
                          flex: 1,
                          font: `400 12px ${PF_TINTS.mono}`,
                          color: PF_TINTS.ink,
                          background: PF_TINTS.bg,
                          border: `1px solid ${PF_TINTS.ruleSoft}`,
                          borderRadius: 3,
                          padding: '4px 8px',
                        }}
                      />
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <footer style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          data-testid="onboarding-quick-pick-back"
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
        <button
          type="button"
          data-testid="onboarding-quick-pick-continue"
          onClick={onContinue}
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
          Save selections
        </button>
      </footer>
    </section>
  );
}
