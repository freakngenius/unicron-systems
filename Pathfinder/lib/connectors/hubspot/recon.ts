// lib/connectors/hubspot/recon.ts — Demo Polish UX Gate 4B-3.
//
// Pure (testable) reconciliation logic for the nightly HubSpot ↔ Pathfinder
// diff. The Inngest cron handler (lib/inngest/functions/hubspot-recon-cron.ts)
// loads HubSpot deals + Pathfinder lead_actions for the last 7 days and
// passes them through `reconcileDeals()` here.
//
// Output of reconcileDeals():
//   - `auto_resolved` — diffs the per-field conflict policy could resolve.
//     Each row carries the resolution decision; the cron applies it.
//   - `escalated`     — diffs the policy can't auto-resolve. The cron
//                       upserts these into pathfinder.architect_inbox
//                       with category='hubspot-sync-conflict'.
//
// Mapping schema lives in lib/connectors/hubspot/mapping.ts.

import {
  parseMapping,
  type ConflictPolicy,
  type FieldMapping,
  type HubspotMappingConfig,
} from './mapping';

export interface DealSnapshot {
  /** Stable cross-system id — Pathfinder's lead_actions.id stamped on the
   *  HubSpot deal as the `pathfinder_lead_id` property. */
  pathfinder_lead_id: string;
  /** HubSpot internal deal id; null for Pathfinder rows that were never
   *  pushed to HubSpot. */
  hubspot_deal_id: string | null;
  /** Field name → value at the time of snapshot. Both sides must use
   *  the same key namespace (the Pathfinder field name from mapping). */
  fields: Record<string, string | number | null>;
  /** ISO timestamp of last update on this side. Used by the
   *  last_write_wins policy. */
  updated_at: string;
}

export interface FieldConflict {
  pathfinder_lead_id: string;
  hubspot_deal_id: string | null;
  pathfinder_field: string;
  hubspot_property: string;
  pathfinder_value: string | number | null;
  hubspot_value: string | number | null;
  policy: ConflictPolicy;
}

export interface AutoResolution extends FieldConflict {
  resolution: 'pathfinder_wins' | 'hubspot_wins';
  reason: string;
}

export interface ReconResult {
  auto_resolved: AutoResolution[];
  escalated: FieldConflict[];
  /** Count of fields that matched (no conflict). Used for drift metrics. */
  matched: number;
}

export interface ReconcileInput {
  pathfinder: Map<string, DealSnapshot>;
  hubspot: Map<string, DealSnapshot>;
  mapping: HubspotMappingConfig;
}

function eq(a: string | number | null, b: string | number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  // Coerce both to strings for cross-type tolerance (HubSpot stringifies
  // numerics in many endpoints).
  return String(a).trim() === String(b).trim();
}

function decide(
  pathfinderUpdatedAt: string,
  hubspotUpdatedAt: string,
  policy: ConflictPolicy,
): AutoResolution['resolution'] | null {
  if (policy === 'pathfinder_locked') return 'pathfinder_wins';
  if (policy === 'hubspot_locked') return 'hubspot_wins';
  // last_write_wins: compare timestamps. Equal timestamps → escalate
  // (can't pick deterministically).
  const pTs = Date.parse(pathfinderUpdatedAt);
  const hTs = Date.parse(hubspotUpdatedAt);
  if (!Number.isFinite(pTs) || !Number.isFinite(hTs)) return null;
  if (pTs > hTs) return 'pathfinder_wins';
  if (hTs > pTs) return 'hubspot_wins';
  return null;
}

export function reconcileDeals(input: ReconcileInput): ReconResult {
  const { pathfinder, hubspot, mapping } = input;
  const auto: AutoResolution[] = [];
  const esc: FieldConflict[] = [];
  let matched = 0;

  // Iterate the Pathfinder side; deals on the HubSpot-only side without a
  // pathfinder_lead_id are surfaced as "missing on Pathfinder" in a
  // separate phase (handled by the cron via a direct insert to deals
  // when Gate 4B-1 inbound webhooks haven't yet caught the create).
  for (const [pfId, pf] of pathfinder) {
    const hs = hubspot.get(pfId);
    if (!hs) {
      // Pathfinder has it; HubSpot doesn't. Treated as "needs outbound
      // push" rather than a conflict. The cron's outbound layer handles
      // this; recon doesn't escalate.
      continue;
    }
    for (const fm of mapping.deal_fields) {
      const pVal = pf.fields[fm.pathfinder_field] ?? null;
      const hVal = hs.fields[fm.pathfinder_field] ?? null;
      if (eq(pVal, hVal)) {
        matched++;
        continue;
      }
      const conflict: FieldConflict = {
        pathfinder_lead_id: pfId,
        hubspot_deal_id: hs.hubspot_deal_id,
        pathfinder_field: fm.pathfinder_field,
        hubspot_property: fm.hubspot_property,
        pathfinder_value: pVal,
        hubspot_value: hVal,
        policy: fm.conflict_policy,
      };
      const decision = decide(pf.updated_at, hs.updated_at, fm.conflict_policy);
      if (decision == null) {
        esc.push(conflict);
        continue;
      }
      auto.push({
        ...conflict,
        resolution: decision,
        reason:
          fm.conflict_policy === 'last_write_wins'
            ? `last_write_wins: ${decision === 'pathfinder_wins' ? 'pathfinder' : 'hubspot'} updated_at is newer`
            : `${fm.conflict_policy.replace('_', ' ')}`,
      });
    }
  }

  return { auto_resolved: auto, escalated: esc, matched };
}

/**
 * Convenience helper: load + parse a connector's mapping config from a
 * raw connectors.metadata jsonb blob. Falls back to defaults.
 */
export function mappingFromMetadata(
  metadata: Record<string, unknown> | null,
): HubspotMappingConfig {
  return parseMapping(metadata?.['hubspot_mapping']);
}

/**
 * Build the pathfinder.architect_inbox row payload for a single
 * unresolvable field conflict. Caller does the actual insert.
 */
export interface ArchitectInboxConflictRow {
  category: 'hubspot-sync-conflict';
  title: string;
  blocked_reason: 'conflict_unresolvable';
  blocked_detail: string;
  what_human_needs_to_do: string;
  context: Record<string, unknown>;
  priority: 'medium';
  status: 'open';
}

export function escalationToInboxRow(
  conflict: FieldConflict,
): ArchitectInboxConflictRow {
  return {
    category: 'hubspot-sync-conflict',
    title: `Sync conflict on ${conflict.pathfinder_field} (lead ${conflict.pathfinder_lead_id})`,
    blocked_reason: 'conflict_unresolvable',
    blocked_detail:
      `Field ${conflict.pathfinder_field} (HubSpot: ${conflict.hubspot_property}) ` +
      `differs between Pathfinder and HubSpot, and policy ` +
      `"${conflict.policy}" can't auto-resolve (timestamps tied or invalid).`,
    what_human_needs_to_do:
      'Pick the canonical value for this field on this deal, ' +
      'then either edit it in Pathfinder (auto-pushes outbound) or in HubSpot (auto-pulls inbound).',
    context: {
      pathfinder_lead_id: conflict.pathfinder_lead_id,
      hubspot_deal_id: conflict.hubspot_deal_id,
      pathfinder_field: conflict.pathfinder_field,
      hubspot_property: conflict.hubspot_property,
      pathfinder_value: conflict.pathfinder_value,
      hubspot_value: conflict.hubspot_value,
      policy: conflict.policy,
    },
    priority: 'medium',
    status: 'open',
  };
}
