// lib/hubspot/field-mapper.ts — Gate 10C field map for the per-user
// lead → HubSpot deal push.
//
// SPEC - HubSpot Bridge.md §Lead detail → "Field mapping (baked-in defaults)".
//
// Pure functions; no I/O. The orchestrator in lib/hubspot/lead-deal.ts
// composes these into the deal-create payload and the contact upsert.
// Distinct from lib/hubspot/deal-mapper.ts (the cron flow's mapper which
// targets the legacy lead_actions push); this module mirrors the v2
// spec's table 1:1 so the field set stays auditable.

import type { Project } from '@/lib/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HUBSPOT_DEALNAME_MAX = 255;

export type HubspotPropertyValue = string | number;
export type HubspotProperties = Record<string, HubspotPropertyValue>;

/** Normalize a Pathfinder project_stage string → HubSpot stage id name.
 *  Defaults to 'appointmentscheduled' (per spec). The actual env-resolved
 *  HubSpot stage uuid lookup happens via stage-map.ts; this just decides
 *  WHICH stage. */
export function normalizeProjectStage(stage: string | null | undefined): string {
  const s = (stage ?? '').trim().toLowerCase();
  if (s === 'pre-bid' || s === 'prebid' || s === 'pre bid') return 'qualifiedtobuy';
  if (s === 'rfp open' || s === 'rfp' || s === 'bidding' || s === 'rfp_open') {
    return 'presentationscheduled';
  }
  if (s === 'awarded' || s === 'closed' || s === 'won') return 'decisionmakerboughtin';
  // Announcement / Announced / null / anything else → first stage.
  return 'appointmentscheduled';
}

/** Build the HubSpot deal `description` string. Prefers project.summary;
 *  falls back to project.rationale; finally a short stub so the deal
 *  isn't blank in HubSpot. */
export function descriptionFor(project: Project): string {
  if (typeof project.summary === 'string' && project.summary.trim().length > 0) {
    return project.summary.trim();
  }
  if (typeof project.rationale === 'string' && project.rationale.trim().length > 0) {
    return project.rationale.trim();
  }
  return `Pathfinder lead from ${project.source}.`;
}

/** Build dealname. Format: "<title> · <branch.code>" if branch present,
 *  truncated at HubSpot's 255-char limit while preserving the suffix. */
export function dealnameFor(project: Project, branchCode: string | null): string {
  const suffix = branchCode ? ` · ${branchCode}` : '';
  const full = project.title + suffix;
  if (full.length <= HUBSPOT_DEALNAME_MAX) return full;
  const titleBudget = HUBSPOT_DEALNAME_MAX - suffix.length;
  return project.title.slice(0, titleBudget) + suffix;
}

/** closedate per spec: estimated_end_date if present, else posted_date+90d,
 *  else now+90d. HubSpot accepts ms-since-epoch on the deal create
 *  endpoint; we return ms so the caller doesn't have to format. */
export function closedateMsFor(project: Project, now: number = Date.now()): number {
  if (project.estimated_end_date) {
    const ms = Date.parse(project.estimated_end_date);
    if (Number.isFinite(ms)) return ms;
  }
  const anchor = project.posted_date ? Date.parse(project.posted_date) : NaN;
  const baseMs = Number.isFinite(anchor) ? anchor : now;
  return baseMs + 90 * MS_PER_DAY;
}

/** Best-effort `hs_lead_source` value. HubSpot's standard property is an
 *  enum; the safe path is "Other" + a custom property with the real source.
 *  We surface 'Other' here so the deal create doesn't 400 on enum
 *  mismatch; the custom property carries the truth. */
export function hubspotLeadSource(): string {
  return 'OTHER_CAMPAIGNS';
}

export interface BuildDealPropertiesInput {
  project: Project;
  branchName: string | null;
  branchCode: string | null;
  /** Resolved HubSpot stage id from stage-map.ts (env-driven). When
   *  null, the stage-map default is used; the deal still creates. */
  hubspotStageId: string | null;
  hubspotPipelineId: string | null;
  /** Custom-property name prefix. Defaults to 'pathfinder_'. */
  prefix?: string;
}

/**
 * Build the HubSpot deal properties object per the spec field map.
 * Custom properties (pathfinder_*) are best-effort: the orchestrator
 * ensures them via ensureCustomProperty() before the create call.
 *
 * Returns a flat string-or-number map; HubSpot accepts numeric values
 * for amount + closedate but everything else is stringified.
 */
export function buildDealProperties(input: BuildDealPropertiesInput): HubspotProperties {
  const { project, branchName, branchCode, hubspotStageId, hubspotPipelineId } = input;
  const prefix = input.prefix ?? 'pathfinder_';
  const props: HubspotProperties = {
    dealname: dealnameFor(project, branchCode),
    description: descriptionFor(project),
    closedate: closedateMsFor(project),
    hs_lead_source: hubspotLeadSource(),
    [`${prefix}lead_id`]: project.id,
    [`${prefix}source_id`]: `${project.source}:${project.source_id}`,
  };
  if (typeof project.project_value === 'number' && Number.isFinite(project.project_value)) {
    props.amount = project.project_value;
  }
  if (typeof project.score === 'number') {
    props[`${prefix}score`] = project.score;
  }
  if (branchName) {
    props[`${prefix}branch`] = branchName;
  }
  if (hubspotStageId) {
    props.dealstage = hubspotStageId;
  }
  if (hubspotPipelineId) {
    props.pipeline = hubspotPipelineId;
  }
  if (typeof project.naics_description === 'string' && project.naics_description.length > 0) {
    // hs_industry is a HubSpot default property on companies, not deals,
    // but Pathfinder uses a custom deal property so the industry stays
    // on the deal even when no company is associated.
    props[`${prefix}industry`] = project.naics_description;
  }
  return props;
}

/** Build the company name for the optional company association. v1
 *  derives from project.title — HubSpot company dedup happens server-side
 *  via domain/name matching. */
export function companyNameFor(project: Project): string {
  return project.title.length > 0 ? project.title : `${project.source}:${project.source_id}`;
}

export interface ContactProperties {
  email?: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  jobtitle?: string;
  company?: string;
}

/** Build the HubSpot contact properties for a single Pathfinder
 *  lead_contact row. Drops empty fields so HubSpot's contact create
 *  doesn't get an `email: ""` and 400. */
export function buildContactProperties(
  contact: { contact_name: string; email?: string | null; phone?: string | null; role?: string | null },
  companyName: string | null,
): ContactProperties {
  const parts = contact.contact_name.split(/\s+/).filter(Boolean);
  const firstname = parts[0] ?? '';
  const lastname = parts.slice(1).join(' ');
  const out: ContactProperties = {};
  if (firstname) out.firstname = firstname;
  if (lastname) out.lastname = lastname;
  if (contact.email && contact.email.trim().length > 0) out.email = contact.email.trim();
  if (contact.phone && contact.phone.trim().length > 0) out.phone = contact.phone.trim();
  if (contact.role && contact.role.trim().length > 0) out.jobtitle = contact.role.trim();
  if (companyName) out.company = companyName;
  return out;
}
