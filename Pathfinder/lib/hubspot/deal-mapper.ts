// lib/hubspot/deal-mapper.ts — pure functions translating a Pathfinder
// Project + LeadAction (+ optional Branch / Customer context) into the
// HubSpot deal payload shape.
//
// Tests in __tests__/hubspot/deal-mapper.test.ts pin the spec rules:
//   - pathfinder_lead_id is always set on the payload
//   - dealname capped at 255 chars (HubSpot's limit), branch suffix
//     preserved through truncation
//   - amount preference: attested → project.project_value → omit
//   - closedate heuristic: first_action_date → posted_date → today, +90d
//   - note body includes rationale + outreach_hook + dashboard link, no
//     em-dashes/en-dashes (Pathfinder brand voice rule)

import type { Branch, Customer, LeadAction, Project } from '@/lib/types';
import { hubspotDealPipelineId, mapPathfinderToHubspotStage } from '@/lib/hubspot/stage-map';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HUBSPOT_DEALNAME_MAX = 255;

/**
 * Build the deal name. Format: "<title> · <branch.code>" so attribution
 * stays attached to the deal even after the dashboard URL is forgotten.
 * If the combined string would exceed HubSpot's 255-char dealname limit,
 * the title is truncated but the branch suffix is preserved (the suffix
 * is the load-bearing part for attribution).
 */
export function dealnameFor(project: Project, branch: Branch | null): string {
  const suffix = branch ? ` · ${branch.code}` : '';
  const fullName = project.title + suffix;
  if (fullName.length <= HUBSPOT_DEALNAME_MAX) return fullName;

  const titleBudget = HUBSPOT_DEALNAME_MAX - suffix.length;
  return project.title.slice(0, titleBudget) + suffix;
}

/**
 * Build the closedate as ms-since-epoch (HubSpot accepts ISO timestamps
 * but ms is canonical for the deal endpoint and survives JSON
 * round-trips without ambiguity). +90 days from the most-trusted anchor
 * available: rep-attested first_action_date > project.posted_date > now.
 */
export function closedateForMs(project: Project, leadAction: LeadAction): number {
  const anchor =
    leadAction.first_action_date ??
    project.posted_date ??
    new Date().toISOString();
  // Date-only strings (YYYY-MM-DD) parse as UTC midnight in JS, which is
  // what we want — no local-tz drift across deploy regions.
  const baseMs = new Date(anchor).getTime();
  return baseMs + 90 * MS_PER_DAY;
}

/**
 * The dashboard deep link for the project. Reads NEXT_PUBLIC_BASE_URL at
 * call time so dev / preview / prod all generate links pointing at their
 * own origin. Falls back to a relative path so the note still references
 * the project even if the env is missing.
 */
function dashboardDeepLink(project: Project): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  const path = `/?project=${encodeURIComponent(project.id)}`;
  return base ? `${base}${path}` : path;
}

/**
 * The properties block sent to HubSpot's `POST /crm/v3/objects/deals`
 * endpoint. All values are stringified — HubSpot's deal-properties API
 * accepts strings even for numeric / date columns.
 */
export interface DealProperties {
  dealname: string;
  pipeline: string;
  dealstage: string;
  closedate: string; // ms-epoch as string
  amount?: string;
  pathfinder_lead_id: string;
  pathfinder_branch_code?: string;
  pathfinder_score?: string;
  pathfinder_warm_customer?: string;
  pathfinder_dashboard_url: string;
}

export interface DealMapperInput {
  project: Project;
  leadAction: LeadAction;
  branch: Branch | null;
  customer: Customer | null;
}

/**
 * Translate Pathfinder context into the deal-properties payload. Fails
 * cleanly with a descriptive error when env-driven required values
 * (pipeline id, accepted-stage id) are missing — the route surfaces that
 * error to the caller and audit-logs it.
 */
export function projectToDealProperties(input: DealMapperInput): DealProperties {
  const { project, leadAction, branch, customer } = input;

  const pipeline = hubspotDealPipelineId();
  if (!pipeline) {
    throw new Error('HUBSPOT_DEAL_PIPELINE_ID is not set; cannot build deal payload');
  }
  const dealstage = mapPathfinderToHubspotStage('accepted');
  if (!dealstage) {
    throw new Error(
      'HUBSPOT_STAGE_ACCEPTED_ID is not set; cannot build deal payload (the "accepted" stage has no HubSpot mirror)',
    );
  }

  const props: DealProperties = {
    dealname: dealnameFor(project, branch),
    pipeline,
    dealstage,
    closedate: String(closedateForMs(project, leadAction)),
    pathfinder_lead_id: String(leadAction.id),
    pathfinder_dashboard_url: dashboardDeepLink(project),
  };

  // Amount preference: attested first (rep's best estimate at accept
  // time), then the contract-disclosed project value, otherwise omit so
  // HubSpot's amount column stays null instead of zero.
  const amount = leadAction.attested_pipeline_value ?? project.project_value;
  if (amount !== null && amount !== undefined) {
    props.amount = String(amount);
  }

  if (branch?.code) props.pathfinder_branch_code = branch.code;
  if (project.score !== null && project.score !== undefined) {
    props.pathfinder_score = String(project.score);
  }
  if (customer?.name) props.pathfinder_warm_customer = customer.name;

  return props;
}

/**
 * Markdown body attached to the deal as a note. The spec calls for "the
 * original rationale as a note." We extend that with the outreach hook
 * and a dashboard deep link so a HubSpot-only viewer (sales manager who
 * doesn't open Pathfinder) sees the load-bearing context. Pathfinder's
 * brand voice rule bans em-dashes and en-dashes; we normalize them to
 * "..." or "-" before emitting so any stray ones in upstream rationale
 * text don't leak through.
 */
export function noteBodyFor(
  project: Project,
  leadAction: LeadAction,
  warmCustomer: Customer | null,
): string {
  const lines: string[] = [];

  lines.push(`**Pathfinder lead** (id ${leadAction.id})`);
  lines.push('');

  if (project.rationale) {
    lines.push('**Why this lead:**');
    lines.push(project.rationale);
    lines.push('');
  }

  if (project.outreach_hook) {
    lines.push('**Outreach hook:**');
    lines.push(project.outreach_hook);
    lines.push('');
  }

  if (warmCustomer) {
    lines.push(`**Warm-intro path:** ${warmCustomer.name}`);
    lines.push('');
  }

  lines.push(`**Dashboard:** ${dashboardDeepLink(project)}`);

  // Brand voice: no em or en dashes anywhere in customer-facing copy.
  return lines.join('\n').replace(/[—–]/g, '-');
}
