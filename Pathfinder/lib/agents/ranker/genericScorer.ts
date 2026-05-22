// Phase 2C slice 2 — generic per-org weighted scorer.
//
// Org-agnostic ranker for non-Zedcor orgs. Computes a 0-100 composite
// from architecture.scoring.weights. The Architect emits per-feature
// weights as part of its decomposition; this scorer turns those weights
// into a usable score with defensive defaults so missing extractors
// contribute 0 rather than throw.
//
// Spec: Company Docs/Metacron/SPEC - Phase 2C Dynamic Agent Dispatch.md
//       §"Ranker"
// Plan: docs/PLAN-phase2c-slice2-org-aware-ranker.md (v2 post-codex)
//
// Why a separate scorer and not extend lib/scoring.ts:
// lib/scoring.ts:scoreProject hardcodes the Zedcor multi-branch model
// (geo_score from branch coverage radius, customer_score from warm
// adjacency, stage_score from project_stage). That model assumes the
// org has branches + customers — which Zedcor does, but a real-estate
// or SaaS Architect-onboarded org doesn't. The generic scorer takes a
// flat feature-extractor map and weighted-sums it; the dispatcher in
// app/api/cron/ranker/route.ts routes each project to the right kernel.

import type { OrgArchitecture } from '@/lib/types/architecture';
import type { Project } from '@/lib/types';

// Per-feature extractor returns a 0..1 normalized score. A weight of
// 1.0 with extractor returning 1.0 contributes 100 points to the
// composite (after the *100 scaling in the weighted sum).
type FeatureExtractor = (
  project: Project & { state?: string | null },
  architecture: OrgArchitecture,
) => number;

// Stage trigger strength is the historical Zedcor signal — kept org-agnostic
// because every public-data feed exposes some flavor of pre-bid → bid → award
// stage progression and the relative ordering is universal.
const TRIGGER_BY_STAGE: Record<string, number> = {
  RFP: 1.0,
  PRE: 0.75,
  PLN: 0.55,
  NWS: 0.35,
};
const TRIGGER_DEFAULT = 0.5;

// Per-vertical keyword maps (slice 2 ships the architecture.vertical match
// as a single keyword; per-vertical extractors land in a follow-up when
// Realberry/other orgs have projects to test against — plan §"Generic
// scoring approach").
function asset_class_match(
  project: Project,
  architecture: OrgArchitecture,
): number {
  const vert = (architecture.vertical ?? '').toLowerCase().trim();
  if (!vert || vert === 'generic') return 0;
  const haystack =
    `${project.title ?? ''} ${project.summary ?? ''}`.toLowerCase();
  // Split the vertical into tokens so "real-estate" and "commercial real
  // estate" both match "real estate development". Tokens >= 4 chars only,
  // to avoid garbage matches on "the", "to", etc.
  const tokens = vert.split(/[-_\s]+/).filter((t) => t.length >= 4);
  if (tokens.length === 0) return 0;
  return tokens.some((t) => haystack.includes(t)) ? 1 : 0;
}

function geography_match(
  project: Project & { state?: string | null },
  architecture: OrgArchitecture,
): number {
  const defaults = architecture.geography?.defaults ?? [];
  if (defaults.length === 0) return 0;
  // The Project type has lat/lon at the top level + a state column from
  // the geography backfill (Demo Polish P1, migration 0104). Default the
  // match to state-based; metro/county-based matching is a follow-up
  // when the architecture.geography.scope hint warrants it.
  const projectState = project.state ?? null;
  if (!projectState) return 0;
  return defaults.includes(projectState) ? 1 : 0;
}

function trigger_strength(project: Project): number {
  const stage = (project.project_stage ?? '').toUpperCase().trim();
  return TRIGGER_BY_STAGE[stage] ?? TRIGGER_DEFAULT;
}

// Stub extractors — plan §"Generic scoring approach" defers real
// per-vertical implementations until orgs that need them have projects
// to test against. They participate in the weighted sum as 0 so an
// Architect-emitted weight on them doesn't throw, it just contributes
// nothing to the score.
function basis_fit(_project: Project, _architecture: OrgArchitecture): number {
  return 0;
}

function unit_count_fit(_project: Project, _architecture: OrgArchitecture): number {
  return 0;
}

// ---------------------------------------------------------------------------
// Funder onboarding Stage 5 — philanthropic-deal-sourcing extractors.
//
// Additive. Existing extractors above (geography_match, asset_class_match,
// trigger_strength, basis_fit, unit_count_fit) are unchanged so Zedcor and
// Realberry continue to score the same. Each Funder extractor returns 0..1
// and reads only project + architecture + raw_payload — no LLM call. The
// Sonnet rationale + first_step that wraps the score lives in
// lib/agents/ranker/genericRationale.ts.
// ---------------------------------------------------------------------------

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

function projectRawPayload(project: Project): Record<string, unknown> {
  return (project.raw_payload as Record<string, unknown> | null) ?? {};
}

function projectHaystack(project: Project): string {
  const payload = projectRawPayload(project);
  const payloadStr = (payload.founder_affiliation as string | undefined) ?? JSON.stringify(payload).slice(0, 2000);
  return `${project.title ?? ''} ${project.summary ?? ''} ${payloadStr}`.toLowerCase();
}

function thesis_fit(project: Project, architecture: OrgArchitecture): number {
  const enumValues = architecture.lead_unit.schema.thesis_area?.enum_values ?? [];
  if (enumValues.length === 0) return 0;
  const payload = projectRawPayload(project);
  const candidates = [
    payload.funder_inferred_thesis as string | null,
    payload.thesis_match as string | null,
    payload.thesis as string | null,
  ].filter((c): c is string => typeof c === 'string' && c.trim() !== '');
  for (const c of candidates) {
    if (enumValues.includes(c)) return 1.0;
  }
  // Soft text match
  const text = `${project.title ?? ''} ${project.summary ?? ''}`.toLowerCase();
  const hit = enumValues
    .filter((t) => t !== 'other')
    .some((t) => text.includes(t.replace(/-/g, ' ')));
  return hit ? 0.6 : 0;
}

function founder_credential(project: Project, _architecture: OrgArchitecture): number {
  const text = projectHaystack(project);
  if (TIER_1_INSTITUTIONS.some((t) => text.includes(t))) return 1.0;
  if (TIER_2_INSTITUTIONS.some((t) => text.includes(t))) return 0.7;
  return 0.2;
}

function raise_stage(project: Project, _architecture: OrgArchitecture): number {
  const payload = projectRawPayload(project);
  const stage = ((payload.fundraising_stage as string | null) ?? '').toLowerCase();
  const stageMap: Record<string, number> = {
    'actively-raising': 1.0,
    closing: 0.8,
    'pre-raise': 0.6,
    forming: 0.4,
    raised: 0.1,
  };
  if (stage && stageMap[stage] !== undefined) return stageMap[stage];
  return 0.5; // unknown
}

function talent_density(project: Project, _architecture: OrgArchitecture): number {
  const text = projectHaystack(project);
  let count = 0;
  for (const inst of TIER_1_INSTITUTIONS) {
    const matches = text.match(new RegExp(inst.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'));
    if (matches) count += matches.length;
  }
  return Math.min(count / 3, 1);
}

function peer_funder_signal(project: Project, _architecture: OrgArchitecture): number {
  const payload = projectRawPayload(project);
  if (payload.peer_funder_signal) return 1.0;
  if (project.source === 'custom-funder-990-filings') return 0.4;
  const text = projectHaystack(project);
  const peerNames = ['open philanthropy', 'survival and flourishing fund', 'founders pledge', 'longview philanthropy'];
  if (peerNames.some((p) => text.includes(p))) return 0.7;
  return 0.2;
}

function recency(project: Project, _architecture: OrgArchitecture): number {
  const ts = project.posted_date ?? project.ingested_at ?? null;
  if (!ts) return 0.3;
  const parsed = Date.parse(ts);
  if (!Number.isFinite(parsed)) return 0.3;
  const days = (Date.now() - parsed) / (1000 * 86_400);
  if (days < 30) return 1.0;
  if (days < 90) return 0.8;
  if (days < 180) return 0.6;
  if (days < 365) return 0.4;
  return 0.2;
}

// ---------------------------------------------------------------------------
// Internal onboarding Stage 6 — construction-vertical B2B feature extractors.
//
// Six per-architecture-weight extractors that read project + raw_payload
// (no LLM). All return 0..1 normalized. Architecture weights at
// Pathfinder-Internal-Architecture.json§scoring.weights:
//   - sales_motion_strength: 0.25
//   - operational_footprint: 0.20
//   - federal_signal:        0.15
//   - project_driven_fit:    0.15
//   - recency:               0.15  (reused — name collides intentionally
//                                    with Funder recency above; the
//                                    extractor map keys by feature name
//                                    so there is exactly one entry, used
//                                    by both architectures.)
//   - association_presence:  0.10
// ---------------------------------------------------------------------------

function internalRawPayload(project: Project): Record<string, unknown> {
  return (project.raw_payload as Record<string, unknown> | null) ?? {};
}

function internalEnrichment(project: Project): Record<string, unknown> {
  const p = internalRawPayload(project);
  return ((p.internal_enrichment as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
}

function internalGeo(project: Project): Record<string, unknown> {
  const p = internalRawPayload(project);
  return ((p.internal_geo as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
}

function sales_motion_strength(project: Project, _architecture: OrgArchitecture): number {
  const enr = internalEnrichment(project);
  const payload = internalRawPayload(project);
  const motion =
    (enr.sales_motion as string | undefined) ??
    (payload.internal_sales_motion_signal as string | undefined) ??
    null;
  if (motion === 'active-outbound') return 1.0;
  if (motion === 'hiring-bd') return 0.8;
  if (motion === 'inbound-only') return 0.3;

  // Fallback: count BD/sales role signals in enrichment contacts.
  const contacts = (enr.contacts as Array<{ title?: string }> | undefined) ?? [];
  let salesContactCount = 0;
  for (const c of contacts) {
    const t = (c.title ?? '').toLowerCase();
    if (/sales|business development|revenue|growth|bd|sdr|account executive/.test(t)) {
      salesContactCount++;
    }
  }
  if (salesContactCount >= 2) return 0.6;
  if (salesContactCount === 1) return 0.4;

  // Source-trusted: job-posting sources mean hiring-bd at the minimum.
  if (project.source === 'custom-construction-sales-job-postings') return 0.6;
  return 0.2;
}

function operational_footprint(project: Project, _architecture: OrgArchitecture): number {
  const geo = internalGeo(project);
  const states = (geo.operating_states as string[] | undefined) ?? [];
  if (states.length >= 10) return 1.0;
  if (states.length >= 5) return 0.8;
  if (states.length >= 3) return 0.6;
  if (states.length >= 2) return 0.4;
  if (states.length === 1) return 0.2;
  return 0;
}

function federal_signal(project: Project, _architecture: OrgArchitecture): number {
  const payload = internalRawPayload(project);
  const fed =
    (payload.internal_federal_registration as string | undefined) ??
    null;
  if (fed === 'both') return 1.0;
  if (fed === 'federal-awardee') return 0.8;
  if (fed === 'sam-registered') return 0.5;

  // Soft check: source = usaspending implies awardee, source = sam-gov
  // implies sam-registered.
  if (project.source === 'usaspending') return 0.8;
  if (project.source === 'sam-gov') return 0.5;
  return 0;
}

function project_driven_fit(project: Project, _architecture: OrgArchitecture): number {
  const payload = internalRawPayload(project);
  // NAICS match: construction 236/237/238/532412 family.
  const naicsRaw =
    (payload.internal_construction_naics_match as string | undefined) ??
    (payload.primary_naics as string | undefined) ??
    (project.naics_code as string | undefined) ??
    '';
  const naics = String(naicsRaw).trim();
  const naicsHit =
    naics.startsWith('236') || naics.startsWith('237') || naics.startsWith('238') || naics === '532412';

  // Recent award density: count of recipient awards on payload if surfaced.
  const awards = payload.awards as Array<unknown> | undefined;
  const awardCount = Array.isArray(awards) ? awards.length : 0;
  const jobs = payload.jobs as Array<unknown> | undefined;
  const jobCount = Array.isArray(jobs) ? jobs.length : 0;

  let score = 0;
  if (naicsHit) score += 0.6;
  if (awardCount >= 5) score += 0.3;
  else if (awardCount >= 1) score += 0.15;
  if (jobCount >= 3) score += 0.1;
  else if (jobCount >= 1) score += 0.05;
  return Math.min(score, 1);
}

function association_presence(project: Project, _architecture: OrgArchitecture): number {
  const enr = internalEnrichment(project);
  const payload = internalRawPayload(project);
  const assocs = (enr.associations as string[] | undefined) ?? [];
  const hint = payload.internal_association_hint as string | undefined;
  const adjacency = (payload.internal_adjacency as Record<string, unknown> | undefined) ?? {};
  const overlap =
    ((adjacency.association_overlap as unknown[] | undefined) ?? []).length;

  let count = assocs.length;
  if (hint) count = Math.max(count, 1);
  count = Math.max(count, overlap);

  if (count >= 3) return 1.0;
  if (count === 2) return 0.7;
  if (count === 1) return 0.4;
  return 0;
}

const EXTRACTORS: Record<string, FeatureExtractor> = {
  // Zedcor-shaped (existing) — unchanged.
  geography_match,
  asset_class_match,
  trigger_strength,
  basis_fit,
  unit_count_fit,
  // Funder onboarding Stage 5 — philanthropic-deal-sourcing.
  thesis_fit,
  founder_credential,
  raise_stage,
  talent_density,
  peer_funder_signal,
  recency,
  // Internal onboarding Stage 6 — construction-vertical B2B prospecting.
  sales_motion_strength,
  operational_footprint,
  federal_signal,
  project_driven_fit,
  association_presence,
};

export interface GenericScoreResult {
  score: number; // 0..100, rounded integer for parity with the Zedcor scorer
  components: Record<string, number>; // raw 0..1 per-feature scores, for agent_log debugging
}

export function scoreGenericProject(
  project: Project & { state?: string | null },
  architecture: OrgArchitecture,
): GenericScoreResult {
  const weights = architecture.scoring?.weights ?? {};
  const components: Record<string, number> = {};
  let sum = 0;
  for (const [feature, weight] of Object.entries(weights)) {
    const extractor = EXTRACTORS[feature];
    // Unknown weight keys are forward-compat — Architect may emit features
    // we haven't implemented extractors for yet. Skip cleanly rather than
    // throw; codex review v1 flagged this as the must-have defensive
    // default since resolveArchitecture replaces weights wholesale (no
    // fallback to BASE_ARCHITECTURE for the per-feature keys).
    if (!extractor) continue;
    const featureScore = extractor(project, architecture);
    components[feature] = featureScore;
    sum += weight * featureScore;
  }
  // Clamp to [0, 100] — Architect-emitted weights might sum >1 or include
  // a negative; the clamp keeps the dashboard percentage well-bounded.
  const raw = Math.max(0, Math.min(1, sum));
  return {
    score: Math.round(raw * 100),
    components,
  };
}
