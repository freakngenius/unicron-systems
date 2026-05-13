// Phase 2E Slice 3 — shared status presentation for the Customers tab.
//
// Maps the 6-state onboarding-to-live machine onto an operator-friendly
// label, a Tailwind tone (text + border) that progresses from muted at
// setting_up to emerald success at operator_viewed, and a reason string
// surfaced via title= when the Open Pathfinder button is gated off.
//
// Source of truth for the state machine is the CHECK constraint on
// pathfinder.organizations.status (migration
// 20260511_phase2e_organizations_status.sql) and SPEC - Phase 2E
// Onboarding Completion Loop.md.

import type { OrgStatus } from '../lib/contracts/customers';

export const STATUS_LABEL: Record<OrgStatus, string> = {
  setting_up: 'Setting up',
  first_run: 'First run',
  ranking: 'Ranking',
  awaiting_threshold: 'Awaiting threshold',
  ready_to_view: 'Ready to view',
  operator_viewed: 'Live',
};

// Progression: muted neutral → amber working → gold pending operator action →
// emerald success. Border opacity follows tailwind/40 convention shared with
// the rest of the Metacron palette.
export const STATUS_TONE: Record<OrgStatus, string> = {
  setting_up: 'text-text-primary/50 border-border-default',
  first_run: 'text-amber-400 border-amber-400/40',
  ranking: 'text-amber-400 border-amber-400/40',
  awaiting_threshold: 'text-accent-gold border-accent-gold/40',
  ready_to_view: 'text-emerald-400 border-emerald-400/60',
  operator_viewed: 'text-emerald-400 border-emerald-400/40',
};

export const OPEN_PATHFINDER_ENABLED: ReadonlySet<OrgStatus> = new Set<OrgStatus>([
  'ready_to_view',
  'operator_viewed',
]);

const DISABLED_REASON: Record<OrgStatus, string> = {
  setting_up: 'Setting up sources — first ingestion run has not started yet',
  first_run: 'Awaiting first ingestion run',
  ranking: 'Ranking and verifying leads',
  awaiting_threshold:
    'Below verified-lead threshold — expand geography or lower threshold',
  ready_to_view: '',
  operator_viewed: '',
};

export function openPathfinderDisabledReason(status: OrgStatus): string {
  return DISABLED_REASON[status];
}
