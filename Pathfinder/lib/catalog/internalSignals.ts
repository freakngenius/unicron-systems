// lib/catalog/internalSignals.ts, Stream C Detail surface.
//
// Extracts the six weighted-signal evidence strings for a single Internal
// company. Pure function over CompanyLeadView + raw_payload.
//
// SCORE-COMPONENTS NOTE (per SPEC b72f4eb): the ranker does NOT persist
// per-signal numeric contributions, and they are not faithfully
// re-derivable. company-detail renders the six signals qualitatively
// (name + weight + the real stored evidence that fired the signal),
// never a fabricated numeric breakdown. The real total score is shown
// prominently in the detail header; there is nothing to reconcile.
//
// Output is consumed by components/catalog/modules/CompanyDetail.tsx.

import type { CompanyLeadView } from '@/lib/agents/internal/companyLeadView';

export interface InternalSignal {
  /** Signal id matching the keys in architecture.scoring.weights. */
  id:
    | 'sales_motion_strength'
    | 'operational_footprint'
    | 'federal_signal'
    | 'project_driven_fit'
    | 'recency'
    | 'association_presence';
  /** Display label rendered next to the weight badge. */
  label: string;
  /** Weight as a unit fraction (e.g. 0.25 for 25%). Mirrors architecture.scoring.weights. */
  weight: number;
  /**
   * Short, human-readable evidence string. Empty string when no observable
   * evidence is present for this company. NEVER a fabricated numeric
   * contribution.
   */
  evidence: string;
}

const WEIGHTS = {
  sales_motion_strength: 0.25,
  operational_footprint: 0.2,
  federal_signal: 0.15,
  project_driven_fit: 0.15,
  recency: 0.15,
  association_presence: 0.1,
} as const;

const LABELS: Record<InternalSignal['id'], string> = {
  sales_motion_strength: 'Sales motion strength',
  operational_footprint: 'Operational footprint',
  federal_signal: 'Federal signal',
  project_driven_fit: 'Project-driven fit',
  recency: 'Recency',
  association_presence: 'Association presence',
};

function readString(obj: Record<string, unknown> | undefined, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function readStringArray(obj: Record<string, unknown> | undefined, key: string): string[] {
  if (!obj) return [];
  const v = obj[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
}

function formatPostedDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function salesMotionEvidence(lead: CompanyLeadView, payload: Record<string, unknown>): string {
  const parts: string[] = [];
  if (lead.sales_motion) parts.push(lead.sales_motion);
  const hint = typeof payload.internal_sales_motion_signal === 'string'
    ? (payload.internal_sales_motion_signal as string).trim()
    : '';
  if (hint && hint !== lead.sales_motion) parts.push(`signal: ${hint}`);
  return parts.join(' · ');
}

function operationalFootprintEvidence(payload: Record<string, unknown>): string {
  const geo = (payload.internal_geo as Record<string, unknown> | undefined) ?? undefined;
  if (!geo) return '';
  const hq = readString(geo, 'hq_state');
  const ops = readStringArray(geo, 'operating_states');
  if (ops.length === 0) {
    return hq ? `HQ ${hq}` : '';
  }
  const opsStr = ops.length > 4 ? `${ops.slice(0, 4).join(' / ')} +${ops.length - 4}` : ops.join(' / ');
  return hq ? `HQ ${hq} · ops ${opsStr}` : `ops ${opsStr}`;
}

function federalSignalEvidence(lead: CompanyLeadView): string {
  if (!lead.federal_registration) return '';
  if (lead.federal_registration.toLowerCase() === 'none') return '';
  return lead.federal_registration;
}

function projectDrivenFitEvidence(lead: CompanyLeadView, payload: Record<string, unknown>): string {
  const parts: string[] = [];
  if (lead.service_category) parts.push(lead.service_category);
  const hint = typeof payload.internal_inferred_service_category === 'string'
    ? (payload.internal_inferred_service_category as string).trim()
    : '';
  if (hint && hint !== lead.service_category) parts.push(`inferred: ${hint}`);
  return parts.join(' · ');
}

function recencyEvidence(lead: CompanyLeadView): string {
  const d = formatPostedDate(lead.posted_date);
  return d ? `Posted ${d}` : '';
}

function associationPresenceEvidence(lead: CompanyLeadView): string {
  const list = lead.associations;
  if (!list || list.length === 0) return '';
  const head = list.slice(0, 2).join(', ');
  if (list.length <= 2) return `${list.length} membership${list.length === 1 ? '' : 's'}: ${head}`;
  return `${list.length} memberships: ${head} +${list.length - 2}`;
}

/**
 * Returns the six weighted signals in weight-descending order with each
 * signal's architecture weight and the real stored evidence that fired it.
 * Evidence is an empty string when no observable evidence is present.
 *
 * @param lead The projected CompanyLeadView for the company.
 * @param rawPayload Raw payload from the projects row (used for qualifier
 *   hints and footprint that the projection does not surface).
 */
export function extractInternalSignals(
  lead: CompanyLeadView,
  rawPayload: Record<string, unknown> | null | undefined,
): InternalSignal[] {
  const payload = rawPayload ?? {};

  const signals: InternalSignal[] = [
    {
      id: 'sales_motion_strength',
      label: LABELS.sales_motion_strength,
      weight: WEIGHTS.sales_motion_strength,
      evidence: salesMotionEvidence(lead, payload),
    },
    {
      id: 'operational_footprint',
      label: LABELS.operational_footprint,
      weight: WEIGHTS.operational_footprint,
      evidence: operationalFootprintEvidence(payload),
    },
    {
      id: 'federal_signal',
      label: LABELS.federal_signal,
      weight: WEIGHTS.federal_signal,
      evidence: federalSignalEvidence(lead),
    },
    {
      id: 'project_driven_fit',
      label: LABELS.project_driven_fit,
      weight: WEIGHTS.project_driven_fit,
      evidence: projectDrivenFitEvidence(lead, payload),
    },
    {
      id: 'recency',
      label: LABELS.recency,
      weight: WEIGHTS.recency,
      evidence: recencyEvidence(lead),
    },
    {
      id: 'association_presence',
      label: LABELS.association_presence,
      weight: WEIGHTS.association_presence,
      evidence: associationPresenceEvidence(lead),
    },
  ];

  // Already in weight-descending order by construction. Return as a stable
  // sorted copy in case the WEIGHTS literal is reordered.
  return signals.slice().sort((a, b) => b.weight - a.weight);
}

export function formatWeightPercent(weight: number): string {
  return `${Math.round(weight * 100)}%`;
}
