// lib/connectors/hubspot/mapping.ts — Demo Polish UX Gate 4B-2.
//
// Field + stage mapping configuration that lives in
// `pathfinder.connectors.metadata.hubspot_mapping`. The Settings UI
// reads / writes this; the Gate 4B-3 reconciliation cron consults the
// per-field `conflict_policy` to decide who wins on disagreement.
//
// Stored shape (jsonb under connectors.metadata.hubspot_mapping):
//
// {
//   "deal_fields": [
//     { "pathfinder_field": "title",         "hubspot_property": "dealname",  "conflict_policy": "last_write_wins" },
//     { "pathfinder_field": "project_value", "hubspot_property": "amount",    "conflict_policy": "pathfinder_locked" },
//     ...
//   ],
//   "contact_fields": [...],
//   "stage_map": [
//     { "pathfinder_stage": "accepted",      "hubspot_stage_id": "stg_xxx",   "conflict_policy": "last_write_wins" },
//     ...
//   ],
//   "updated_at": "2026-05-02T17:30:00.000Z"
// }
//
// The default mapping (`DEFAULT_HUBSPOT_MAPPING`) mirrors lib/hubspot/
// deal-mapper.ts so a freshly-connected account renders sensible
// defaults without forcing the operator to fill out the form before the
// first sync. Stage ids are env-resolved via lib/hubspot/stage-map.ts.

import type { LeadActionStatus } from '@/lib/types';

export type ConflictPolicy =
  | 'last_write_wins'
  | 'pathfinder_locked'
  | 'hubspot_locked';

export const CONFLICT_POLICIES: readonly ConflictPolicy[] = [
  'last_write_wins',
  'pathfinder_locked',
  'hubspot_locked',
];

export interface FieldMapping {
  /** Source-of-truth name on the Pathfinder side. */
  pathfinder_field: string;
  /** HubSpot internal property name. */
  hubspot_property: string;
  /** Display label shown in the UI. */
  label?: string;
  /** Per-field conflict policy. */
  conflict_policy: ConflictPolicy;
}

export interface StageMapping {
  pathfinder_stage: LeadActionStatus;
  /** Env-resolved id (string at write time; we resolve on read). */
  hubspot_stage_id: string;
  conflict_policy: ConflictPolicy;
}

export interface HubspotMappingConfig {
  deal_fields: FieldMapping[];
  contact_fields: FieldMapping[];
  stage_map: StageMapping[];
  updated_at: string;
}

export const DEFAULT_DEAL_FIELDS: FieldMapping[] = [
  { pathfinder_field: 'title', hubspot_property: 'dealname', label: 'Deal name', conflict_policy: 'last_write_wins' },
  { pathfinder_field: 'project_value', hubspot_property: 'amount', label: 'Amount', conflict_policy: 'pathfinder_locked' },
  { pathfinder_field: 'lead_actions.status', hubspot_property: 'dealstage', label: 'Stage', conflict_policy: 'last_write_wins' },
  { pathfinder_field: 'estimated_start_date', hubspot_property: 'closedate', label: 'Close date', conflict_policy: 'last_write_wins' },
  { pathfinder_field: 'id', hubspot_property: 'pathfinder_lead_id', label: 'Pathfinder lead id (locked)', conflict_policy: 'pathfinder_locked' },
];

export const DEFAULT_CONTACT_FIELDS: FieldMapping[] = [
  { pathfinder_field: 'email', hubspot_property: 'email', label: 'Email', conflict_policy: 'last_write_wins' },
  { pathfinder_field: 'full_name', hubspot_property: 'firstname,lastname', label: 'Name', conflict_policy: 'last_write_wins' },
  { pathfinder_field: 'company', hubspot_property: 'company', label: 'Company', conflict_policy: 'last_write_wins' },
];

export const DEFAULT_STAGE_MAP: StageMapping[] = [
  { pathfinder_stage: 'accepted', hubspot_stage_id: '', conflict_policy: 'last_write_wins' },
  { pathfinder_stage: 'meeting_booked', hubspot_stage_id: '', conflict_policy: 'last_write_wins' },
  { pathfinder_stage: 'proposal_sent', hubspot_stage_id: '', conflict_policy: 'last_write_wins' },
  { pathfinder_stage: 'closed_won', hubspot_stage_id: '', conflict_policy: 'last_write_wins' },
  { pathfinder_stage: 'closed_lost', hubspot_stage_id: '', conflict_policy: 'last_write_wins' },
];

export const DEFAULT_HUBSPOT_MAPPING: HubspotMappingConfig = {
  deal_fields: DEFAULT_DEAL_FIELDS,
  contact_fields: DEFAULT_CONTACT_FIELDS,
  stage_map: DEFAULT_STAGE_MAP,
  updated_at: new Date(0).toISOString(),
};

function isConflictPolicy(v: unknown): v is ConflictPolicy {
  return typeof v === 'string' && (CONFLICT_POLICIES as readonly string[]).includes(v);
}

function asFieldMapping(raw: unknown): FieldMapping | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.pathfinder_field !== 'string' || r.pathfinder_field.length === 0) return null;
  if (typeof r.hubspot_property !== 'string' || r.hubspot_property.length === 0) return null;
  const policy = isConflictPolicy(r.conflict_policy) ? r.conflict_policy : 'last_write_wins';
  return {
    pathfinder_field: r.pathfinder_field,
    hubspot_property: r.hubspot_property,
    label: typeof r.label === 'string' ? r.label : undefined,
    conflict_policy: policy,
  };
}

const VALID_STAGES: readonly LeadActionStatus[] = [
  'accepted',
  'meeting_booked',
  'proposal_sent',
  'closed_won',
  'closed_lost',
  'dismissed',
  'snoozed',
];

function asStageMapping(raw: unknown): StageMapping | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.pathfinder_stage !== 'string') return null;
  if (!VALID_STAGES.includes(r.pathfinder_stage as LeadActionStatus)) return null;
  if (typeof r.hubspot_stage_id !== 'string') return null;
  const policy = isConflictPolicy(r.conflict_policy) ? r.conflict_policy : 'last_write_wins';
  return {
    pathfinder_stage: r.pathfinder_stage as LeadActionStatus,
    hubspot_stage_id: r.hubspot_stage_id,
    conflict_policy: policy,
  };
}

/**
 * Parse + repair a stored mapping. Missing fields fall back to the default;
 * malformed entries are dropped. Always returns a valid config.
 */
export function parseMapping(raw: unknown): HubspotMappingConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_HUBSPOT_MAPPING;
  const r = raw as Record<string, unknown>;
  const dealFields = Array.isArray(r.deal_fields)
    ? r.deal_fields.map(asFieldMapping).filter((x): x is FieldMapping => x !== null)
    : DEFAULT_DEAL_FIELDS;
  const contactFields = Array.isArray(r.contact_fields)
    ? r.contact_fields.map(asFieldMapping).filter((x): x is FieldMapping => x !== null)
    : DEFAULT_CONTACT_FIELDS;
  const stageMap = Array.isArray(r.stage_map)
    ? r.stage_map.map(asStageMapping).filter((x): x is StageMapping => x !== null)
    : DEFAULT_STAGE_MAP;
  const updatedAt = typeof r.updated_at === 'string' ? r.updated_at : new Date(0).toISOString();
  return {
    deal_fields: dealFields.length > 0 ? dealFields : DEFAULT_DEAL_FIELDS,
    contact_fields: contactFields.length > 0 ? contactFields : DEFAULT_CONTACT_FIELDS,
    stage_map: stageMap.length > 0 ? stageMap : DEFAULT_STAGE_MAP,
    updated_at: updatedAt,
  };
}

/**
 * Validate a mapping submission from the form. Returns an array of
 * human-readable error strings; empty array means valid.
 */
export function validateMappingInput(input: unknown): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return ['mapping body is not an object'];
  }
  const r = input as Record<string, unknown>;
  for (const key of ['deal_fields', 'contact_fields', 'stage_map']) {
    if (!Array.isArray(r[key])) {
      errors.push(`${key} must be an array`);
    }
  }
  if (Array.isArray(r.deal_fields)) {
    r.deal_fields.forEach((item, i) => {
      if (asFieldMapping(item) === null) errors.push(`deal_fields[${i}] is malformed`);
    });
  }
  if (Array.isArray(r.contact_fields)) {
    r.contact_fields.forEach((item, i) => {
      if (asFieldMapping(item) === null) errors.push(`contact_fields[${i}] is malformed`);
    });
  }
  if (Array.isArray(r.stage_map)) {
    r.stage_map.forEach((item, i) => {
      if (asStageMapping(item) === null) errors.push(`stage_map[${i}] is malformed`);
    });
  }
  return errors;
}
