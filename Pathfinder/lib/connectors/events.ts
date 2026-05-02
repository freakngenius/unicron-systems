// lib/connectors/events.ts — event-type catalog used by the routing
// rules editor. Static for v1; fed by the dispatcher when more event
// types ship. Mirrors SPEC § 3.1's CHECK constraint plus the additional
// types Phase 1 emits.

export interface EventTypeDef {
  id: string;
  label: string;
  description: string;
}

export const EVENT_TYPES: EventTypeDef[] = [
  {
    id: 'lead.high_score',
    label: 'High-priority lead',
    description: 'Fires when a lead crosses the high-priority score threshold.',
  },
  {
    id: 'lead.verified',
    label: 'Verified lead',
    description: 'Fires when the Verifier confirms a lead is qualified.',
  },
  {
    id: 'lead.warm_intro',
    label: 'Warm-intro match',
    description: 'Fires when cross-pollination matches a lead to an existing customer.',
  },
  {
    id: 'brief.daily',
    label: 'Daily brief',
    description: 'The 6 AM rep summary of new leads + pipeline movement.',
  },
  {
    id: 'brief.weekly',
    label: 'Weekly brief',
    description: 'The Friday 6 AM weekly performance + ranking review.',
  },
  {
    id: 'cost.alert',
    label: 'Cost alert',
    description: 'LLM spend exceeded the daily threshold.',
  },
  {
    id: 'agent.failure',
    label: 'Agent failure',
    description: 'A scheduled agent (cron) failed and needs operator attention.',
  },
  {
    id: 'pipeline.stage_changed',
    label: 'Pipeline stage change',
    description: 'A deal moved between stages — DM the rep who owns it.',
  },
];

export const EVENT_TYPE_IDS: string[] = EVENT_TYPES.map((e) => e.id);
