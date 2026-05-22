// lib/agents/verifier/funderChecks.ts
//
// Funder onboarding Stage 6 — deterministic Funder-shaped verifier checks.
//
// The platform verifier in app/api/cron/verifier/route.ts runs 5
// Zedcor-shaped checks (rationale anchors, branch attribution, score
// recompute via scoreProject, customer references, owner anchors). Two
// of those (branch attribution, score recompute) reference Zedcor's
// kernel + branch model and produce false failures on Funder projects
// today.
//
// This module replaces those with 3 Funder-appropriate checks the
// verifier route's non-Zedcor branch invokes. Plus it reads
// architecture.scoring.thresholds (× 100 since scoreGenericProject
// returns 0..100) instead of the Zedcor scoring-config-server flow.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 6.

import type { OrgArchitecture } from '@/lib/types/architecture';
import type { Project } from '@/lib/types';

export interface FunderCheckArgs {
  project: Project;
  architecture: OrgArchitecture;
}

export interface FunderVerdict {
  verified: boolean;
  notes: string;
  failures: string[];
  /** Per-check breakdown for telemetry. */
  checks: {
    org_exists: boolean;
    founder_credible: boolean;
    not_widely_funded: boolean;
    score_above_threshold: boolean;
  };
  /** Verified threshold actually applied (0..100 scale). */
  verified_threshold_0_100: number;
}

const TIER_1_INSTITUTIONS = [
  'openai',
  'anthropic',
  'deepmind',
  'google research',
  'meta ai',
  'mit csail',
  'stanford ai lab',
  'berkeley bair',
  'cmu lti',
  'allen institute',
  'nvidia research',
  'broad institute',
  'johns hopkins center for health security',
];

const TIER_2_INSTITUTIONS = [
  'google',
  'meta',
  'apple',
  'microsoft research',
  'stanford',
  'mit',
  'berkeley',
  'cmu',
  'princeton',
  'oxford',
  'cambridge',
  'harvard',
];

const SOURCE_TRUSTED = new Set(['custom-propublica-nonprofit-explorer', 'custom-irs-exempt-org-filings']);

const NOISE_TITLES = ['unknown', 'tbd', 'untitled', 'n/a', 'na'];

function getPayload(project: Project): Record<string, unknown> {
  return (project.raw_payload as Record<string, unknown> | null) ?? {};
}

function checkOrgExists(project: Project): { ok: boolean; reason: string } {
  const title = (project.title ?? '').trim();
  if (title.length < 5) return { ok: false, reason: 'org_name_too_short_or_empty' };
  if (NOISE_TITLES.includes(title.toLowerCase())) return { ok: false, reason: 'org_name_is_placeholder' };
  const payload = getPayload(project);
  // At least one corroborating field: source-trusted, or has EIN, or has a founder_affiliation
  const hasEin = payload.ein != null && String(payload.ein).trim() !== '';
  const sourceTrusted = SOURCE_TRUSTED.has(project.source as string);
  const hasFounderAffiliation =
    typeof payload.founder_affiliation === 'string' && payload.founder_affiliation.trim() !== '';
  if (hasEin || sourceTrusted || hasFounderAffiliation) return { ok: true, reason: 'corroborated' };
  return { ok: false, reason: 'no_corroborating_field' };
}

function checkFounderCredible(project: Project): { ok: boolean; reason: string } {
  const payload = getPayload(project);
  const haystack = `${project.title ?? ''} ${project.summary ?? ''} ${payload.founder_affiliation ?? ''}`.toLowerCase();
  if (TIER_1_INSTITUTIONS.some((t) => haystack.includes(t))) {
    return { ok: true, reason: 'tier_1_institution' };
  }
  if (TIER_2_INSTITUTIONS.some((t) => haystack.includes(t))) {
    return { ok: true, reason: 'tier_2_institution' };
  }
  // Source-trusted sources clear this check without needing institution match.
  if (SOURCE_TRUSTED.has(project.source as string)) return { ok: true, reason: 'source_trusted' };
  return { ok: false, reason: 'no_credible_institution_or_trusted_source' };
}

function checkNotWidelyFunded(project: Project): { ok: boolean; reason: string } {
  // funder-990 entries are context not candidates — they trivially pass.
  if (project.source === 'custom-funder-990-filings') return { ok: true, reason: 'enrichment_context_skip' };
  const payload = getPayload(project);
  // Explicit peer-funder enrichment field (set by Funder adjacency in a
  // future cron wiring). Until then, fall back to a soft heuristic over
  // peer-funder name mentions in the haystack.
  if (payload.peer_funder_signal && String(payload.peer_funder_signal).toLowerCase() !== 'none') {
    // If peer_funder_signal is truthy text (not 'none'), that means an
    // explicit peer funder claim exists. Borderline — we want
    // "not already widely funded", so single peer = OK; multiple = fail.
    const peerSignal = String(payload.peer_funder_signal);
    const peerCount = peerSignal.split(/[,;]/).length;
    if (peerCount >= 3) return { ok: false, reason: `widely_funded_${peerCount}_peers` };
  }
  const haystack = `${project.summary ?? ''}`.toLowerCase();
  const peerNames = ['open philanthropy', 'survival and flourishing fund', 'founders pledge', 'longview philanthropy'];
  const peerMatches = peerNames.filter((p) => haystack.includes(p)).length;
  if (peerMatches >= 3) return { ok: false, reason: `widely_funded_${peerMatches}_peer_mentions` };
  return { ok: true, reason: 'not_widely_funded' };
}

export function verifyFunderProject(args: FunderCheckArgs): FunderVerdict {
  const { project, architecture } = args;

  const org = checkOrgExists(project);
  const founder = checkFounderCredible(project);
  const peerFund = checkNotWidelyFunded(project);

  // Read verified threshold from architecture (0..1) and scale to 0..100.
  const verifiedThreshold = (architecture.scoring?.thresholds?.verified ?? 0.6) * 100;
  const scoreAboveThreshold = (project.score ?? 0) >= verifiedThreshold;

  const failures: string[] = [];
  if (!org.ok) failures.push(`org_exists_failed:${org.reason}`);
  if (!founder.ok) failures.push(`founder_credible_failed:${founder.reason}`);
  if (!peerFund.ok) failures.push(`not_widely_funded_failed:${peerFund.reason}`);
  if (!scoreAboveThreshold) {
    failures.push(`score_below_threshold:score=${project.score ?? 0}_threshold=${verifiedThreshold}`);
  }

  const allChecks = org.ok && founder.ok && peerFund.ok && scoreAboveThreshold;

  const notes = allChecks
    ? `verified · org_exists(${org.reason}) · founder(${founder.reason}) · peer_funding(${peerFund.reason}) · score=${project.score}/100 >= ${verifiedThreshold}`
    : failures.join('; ').slice(0, 600);

  return {
    verified: allChecks,
    notes,
    failures,
    checks: {
      org_exists: org.ok,
      founder_credible: founder.ok,
      not_widely_funded: peerFund.ok,
      score_above_threshold: scoreAboveThreshold,
    },
    verified_threshold_0_100: verifiedThreshold,
  };
}
