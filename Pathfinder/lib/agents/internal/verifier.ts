// lib/agents/internal/verifier.ts
//
// Internal onboarding Stage 7 — Internal verifier checks.
//
// Mirrors the verifyFunderProject shape so the verifier route can dispatch
// per-slug. Pure deterministic checks; no LLM call. Reads thresholds from
// the architecture (verified default 0.65, scaled ×100 for parity with
// the scoreGenericProject 0..100 range).
//
// Four Internal checks:
//   - company_exists: title and corroborating field present (NAICS, SAM
//     entity id, federal awardee marker, contractor-license id, etc).
//   - sales_motion_corroborated: at least one of the enrichment sales_motion
//     enum, a sales contact, or the hiring-bd source. Drops candidates with
//     no sales-motion evidence whatsoever — the architecture's lead_type
//     gates on "confirmed to have an active sales team."
//   - footprint_present: hq_state OR operating_states populated (otherwise
//     the operational_footprint feature contributes zero and the company
//     fails the "multi-region operations" architecture criterion).
//   - score_above_threshold: 0..100 score >= verified threshold × 100.
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §8.
//       Pathfinder/Pathfinder-Internal-Architecture.json scoring.thresholds.

import type { OrgArchitecture } from '@/lib/types/architecture';
import type { Project } from '@/lib/types';

export interface InternalVerifierArgs {
  project: Project;
  architecture: OrgArchitecture;
}

export interface InternalVerdict {
  verified: boolean;
  notes: string;
  failures: string[];
  checks: {
    company_exists: boolean;
    sales_motion_corroborated: boolean;
    footprint_present: boolean;
    score_above_threshold: boolean;
  };
  verified_threshold_0_100: number;
}

const NOISE_TITLES = ['unknown', 'tbd', 'untitled', 'n/a', 'na', ''];

const INTERNAL_TRUSTED_SOURCES = new Set([
  'sam-gov',
  'usaspending',
  'custom-state-contractor-licenses',
  'custom-construction-sales-job-postings',
  'custom-trade-association-directories',
  'custom-sos-business-registrations',
]);

function getPayload(project: Project): Record<string, unknown> {
  return (project.raw_payload as Record<string, unknown> | null) ?? {};
}

function getEnrichment(project: Project): Record<string, unknown> {
  const p = getPayload(project);
  return ((p.internal_enrichment as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
}

function getGeo(project: Project): Record<string, unknown> {
  const p = getPayload(project);
  return ((p.internal_geo as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
}

function checkCompanyExists(project: Project): { ok: boolean; reason: string } {
  const title = (project.title ?? '').trim();
  if (title.length < 4 || NOISE_TITLES.includes(title.toLowerCase())) {
    return { ok: false, reason: 'company_name_too_short_or_placeholder' };
  }
  const payload = getPayload(project);
  const enr = getEnrichment(project);
  const sourceTrusted = INTERNAL_TRUSTED_SOURCES.has(project.source as string);
  const hasNaics =
    payload.internal_construction_naics_match != null ||
    payload.primary_naics != null;
  const hasWebsite = typeof enr.website === 'string' && (enr.website as string).trim() !== '';
  const hasLinkedin = typeof enr.linkedin === 'string' && (enr.linkedin as string).trim() !== '';
  if (sourceTrusted || hasNaics || hasWebsite || hasLinkedin) {
    return { ok: true, reason: 'corroborated' };
  }
  return { ok: false, reason: 'no_corroborating_evidence' };
}

function checkSalesMotion(project: Project): { ok: boolean; reason: string } {
  const enr = getEnrichment(project);
  const motion = enr.sales_motion as string | undefined;
  if (motion === 'active-outbound' || motion === 'hiring-bd') {
    return { ok: true, reason: `enrichment_sales_motion=${motion}` };
  }
  const contacts = (enr.contacts as Array<{ title?: string }> | undefined) ?? [];
  const hasSalesContact = contacts.some((c) => {
    const t = (c.title ?? '').toLowerCase();
    return /sales|business development|revenue|growth|bd|sdr|account executive/.test(t);
  });
  if (hasSalesContact) return { ok: true, reason: 'enrichment_sales_contact_present' };

  const payload = getPayload(project);
  const signal = payload.internal_sales_motion_signal as string | undefined;
  if (signal === 'active-outbound' || signal === 'hiring-bd') {
    return { ok: true, reason: `qualifier_signal=${signal}` };
  }
  if (project.source === 'custom-construction-sales-job-postings') {
    return { ok: true, reason: 'source_hiring_bd_jobpost' };
  }
  return { ok: false, reason: 'no_sales_motion_evidence' };
}

function checkFootprintPresent(project: Project): { ok: boolean; reason: string } {
  const geo = getGeo(project);
  const hq = geo.hq_state as string | undefined;
  const ops = (geo.operating_states as string[] | undefined) ?? [];
  if (hq || ops.length > 0) return { ok: true, reason: `hq=${hq ?? 'null'},ops=${ops.length}` };
  return { ok: false, reason: 'no_footprint_evidence' };
}

export function verifyInternalProject(args: InternalVerifierArgs): InternalVerdict {
  const { project, architecture } = args;

  const company = checkCompanyExists(project);
  const motion = checkSalesMotion(project);
  const footprint = checkFootprintPresent(project);

  const verifiedThreshold = (architecture.scoring?.thresholds?.verified ?? 0.65) * 100;
  const scoreAboveThreshold = (project.score ?? 0) >= verifiedThreshold;

  const failures: string[] = [];
  if (!company.ok) failures.push(`company_exists_failed:${company.reason}`);
  if (!motion.ok) failures.push(`sales_motion_failed:${motion.reason}`);
  if (!footprint.ok) failures.push(`footprint_failed:${footprint.reason}`);
  if (!scoreAboveThreshold) {
    failures.push(
      `score_below_threshold:score=${project.score ?? 0}_threshold=${verifiedThreshold}`,
    );
  }

  const verified = company.ok && motion.ok && footprint.ok && scoreAboveThreshold;
  const notes = verified
    ? `verified · company(${company.reason}) · motion(${motion.reason}) · footprint(${footprint.reason}) · score=${project.score}/100 >= ${verifiedThreshold}`
    : failures.join('; ').slice(0, 600);

  return {
    verified,
    notes,
    failures,
    checks: {
      company_exists: company.ok,
      sales_motion_corroborated: motion.ok,
      footprint_present: footprint.ok,
      score_above_threshold: scoreAboveThreshold,
    },
    verified_threshold_0_100: verifiedThreshold,
  };
}
