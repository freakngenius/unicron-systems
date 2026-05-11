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

const EXTRACTORS: Record<string, FeatureExtractor> = {
  geography_match,
  asset_class_match,
  trigger_strength,
  basis_fit,
  unit_count_fit,
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
