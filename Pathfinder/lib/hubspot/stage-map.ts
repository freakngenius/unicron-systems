// lib/hubspot/stage-map.ts — bidirectional stage map between Pathfinder
// `lead_actions.status` and HubSpot internal stage IDs.
//
// HubSpot stage IDs are portal-specific opaque strings (set on the deal
// pipeline in the HubSpot UI), so they live in env vars rather than the
// codebase. Five Pathfinder statuses mirror HubSpot stages; two are
// local-only and never round-trip to HubSpot.
//
// docs/HUBSPOT-STAGE-MAP.md is the human-readable form; this module is
// the authoritative source-of-truth for code.
//
// Usage:
//   import { mapHubspotStageToPathfinder, mapPathfinderToHubspotStage } from '@/lib/hubspot/stage-map';
//
//   const status = mapHubspotStageToPathfinder('appointmentscheduled'); // 'meeting_booked'
//   const stageId = mapPathfinderToHubspotStage('proposal_sent');       // env-resolved ID
//
// Resolution is lazy: env reads happen at call time, not module init,
// matching the lib/briefing.ts pattern so a missing env var doesn't crash
// the build.

import type { LeadActionStatus } from '@/lib/types';

export interface StageMapEntry {
  status: LeadActionStatus;
  envVar: string | null; // null = local-only status (no HubSpot mirror)
  description: string;
}

// Source of truth. The order here is the canonical funnel order; do not
// reorder casually because the dashboard rendering relies on it.
export const STAGE_MAP: readonly StageMapEntry[] = [
  {
    status: 'accepted',
    envVar: 'HUBSPOT_STAGE_ACCEPTED_ID',
    description: 'Lead pushed from Pathfinder; deal exists in HubSpot.',
  },
  {
    status: 'meeting_booked',
    envVar: 'HUBSPOT_STAGE_MEETING_ID',
    description: 'First meeting scheduled with the prospect.',
  },
  {
    status: 'proposal_sent',
    envVar: 'HUBSPOT_STAGE_PROPOSAL_ID',
    description: 'Pathfinder lead has reached the proposal stage.',
  },
  {
    status: 'closed_won',
    envVar: 'HUBSPOT_STAGE_WON_ID',
    description: 'Deal closed-won; closed_won_amount + closed_won_at stamped.',
  },
  {
    status: 'closed_lost',
    envVar: 'HUBSPOT_STAGE_LOST_ID',
    description: 'Deal closed-lost; closed_lost_reason stamped.',
  },
  {
    status: 'dismissed',
    envVar: null,
    description: 'Rep dismissed the lead. Local-only; no HubSpot mirror.',
  },
  {
    status: 'snoozed',
    envVar: null,
    description: 'Rep snoozed the lead. Local-only; no HubSpot mirror.',
  },
];

// Build an env-resolved (id → status) lookup. Re-built per call so an
// env-var change in the running process is picked up.
function buildHubspotToPathfinder(): Map<string, LeadActionStatus> {
  const out = new Map<string, LeadActionStatus>();
  for (const entry of STAGE_MAP) {
    if (!entry.envVar) continue;
    const id = process.env[entry.envVar];
    if (id) out.set(id, entry.status);
  }
  return out;
}

/**
 * Resolve a HubSpot stage ID to the Pathfinder lead_actions status.
 * Returns null when the stage ID is unknown (e.g. a stage that exists in
 * HubSpot but isn't mapped on the Pathfinder side — e.g. a custom
 * mid-funnel stage like "Decision Maker Bought-In"). Callers audit-log
 * the unknown id rather than mutating state.
 */
export function mapHubspotStageToPathfinder(stageId: string): LeadActionStatus | null {
  return buildHubspotToPathfinder().get(stageId) ?? null;
}

/**
 * Resolve a Pathfinder status to its HubSpot stage ID.
 * Returns null for local-only statuses (`dismissed`, `snoozed`) and for
 * statuses whose env var isn't set. Callers should treat null as "no
 * HubSpot mirror, do not push."
 */
export function mapPathfinderToHubspotStage(status: LeadActionStatus): string | null {
  const entry = STAGE_MAP.find((e) => e.status === status);
  if (!entry || !entry.envVar) return null;
  return process.env[entry.envVar] ?? null;
}

/**
 * The HubSpot pipeline ID a Pathfinder deal lives in. Read from env at
 * call time. Required (without it, the deal create fails); callers
 * should throw a clear error if missing.
 */
export function hubspotDealPipelineId(): string | null {
  return process.env.HUBSPOT_DEAL_PIPELINE_ID ?? null;
}
