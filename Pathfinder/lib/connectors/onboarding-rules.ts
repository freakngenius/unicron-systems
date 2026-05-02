// lib/connectors/onboarding-rules.ts — quick-pick default routing
// rules surfaced by the C-4A onboarding wizard.
//
// Spec: SPEC - Connectors (Slack, Teams, HubSpot).md § 7.3 (onboarding
// flow) + § 3.6 (dispatcher event types). The wizard offers 2-3
// sensible defaults per chat connector so the customer can opt-in
// without learning the full RoutingRulesModal surface in C-1C.
//
// HubSpot is intentionally excluded — its "routing" is the bi-directional
// deal sync (C-3B), not channel-scoped event dispatch. The wizard skips
// the quick-pick step entirely for HubSpot.

import type { ConnectorType } from '@/lib/types';

/**
 * One default rule the wizard offers. The customer fills in the channel
 * placeholder before the rule lands as a real `connector_routing_rules`
 * row. The label/description are user-facing copy; `event_type` and
 * `filter` map directly onto the dispatcher's contract.
 */
export interface QuickPickRule {
  /** Stable id — used as the React key + form field name. */
  id: string;
  /** Short label for the checkbox row. */
  label: string;
  /** One-line description shown beneath the label. */
  description: string;
  /** Dispatcher event type — must match `EVENT_TYPES` in lib/connectors/events.ts. */
  event_type: string;
  /** Suggested channel/team placeholder (user-editable before save). */
  channel_placeholder: string;
  /** Default filter object (e.g., `{ score_gte: 90 }`). */
  filter: Record<string, unknown>;
  /** Whether this rule is checked-by-default in the wizard. */
  default_checked: boolean;
}

/**
 * `getQuickPickRules` — returns the default rule set for one connector
 * type. HubSpot returns an empty list because its sync is automatic.
 *
 * v1: hardcoded; future versions may pull from a customer-template DB.
 */
export function getQuickPickRules(connectorType: ConnectorType): QuickPickRule[] {
  if (connectorType === 'slack') {
    return [
      {
        id: 'slack.verified-leads',
        label: 'Verified leads (score ≥ 90) → #pathfinder-alerts',
        description:
          'Post the highest-confidence leads to a real-time alert channel as soon as the Verifier confirms them.',
        event_type: 'lead.verified',
        channel_placeholder: '#pathfinder-alerts',
        filter: { score_gte: 90 },
        default_checked: true,
      },
      {
        id: 'slack.daily-brief',
        label: 'Daily brief → #pathfinder-daily',
        description:
          'A 6 AM rep summary of new leads + pipeline movement. Posts once per business day.',
        event_type: 'brief.daily',
        channel_placeholder: '#pathfinder-daily',
        filter: {},
        default_checked: true,
      },
      {
        id: 'slack.cost-alerts',
        label: 'Cost alerts → #ops',
        description:
          'When LLM spend crosses the daily threshold, alert the operator channel so it gets noticed quickly.',
        event_type: 'cost.alert',
        channel_placeholder: '#ops',
        filter: {},
        default_checked: false,
      },
    ];
  }

  if (connectorType === 'teams') {
    return [
      {
        id: 'teams.verified-leads',
        label: 'Verified leads (score ≥ 90) → Pathfinder · Alerts team',
        description:
          'Post the highest-confidence leads to your Teams alerts channel as soon as the Verifier confirms them.',
        event_type: 'lead.verified',
        channel_placeholder: '19:pathfinder-alerts@thread.tacv2',
        filter: { score_gte: 90 },
        default_checked: true,
      },
      {
        id: 'teams.daily-brief',
        label: 'Daily brief → Pathfinder · Daily team',
        description:
          'A 6 AM rep summary of new leads + pipeline movement. Posts once per business day.',
        event_type: 'brief.daily',
        channel_placeholder: '19:pathfinder-daily@thread.tacv2',
        filter: {},
        default_checked: true,
      },
      {
        id: 'teams.cost-alerts',
        label: 'Cost alerts → Pathfinder · Ops team',
        description:
          'When LLM spend crosses the daily threshold, alert the operator team so it gets noticed quickly.',
        event_type: 'cost.alert',
        channel_placeholder: '19:pathfinder-ops@thread.tacv2',
        filter: {},
        default_checked: false,
      },
    ];
  }

  // HubSpot: no quick-pick rules. Push is automatic via C-3B.
  return [];
}

/**
 * Convenience predicate — `true` when a connector type participates in
 * the quick-pick step. The wizard skips step 5 for connectors where this
 * returns `false`.
 */
export function hasQuickPickRules(connectorType: ConnectorType): boolean {
  return getQuickPickRules(connectorType).length > 0;
}
