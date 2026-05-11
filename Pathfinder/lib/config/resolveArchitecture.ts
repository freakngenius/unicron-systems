// lib/config/resolveArchitecture.ts — Phase 2B tenant config layer.
//
// resolveArchitecture merges a partial org architecture (from
// pathfinder.organizations.architecture jsonb) with BASE_ARCHITECTURE so
// downstream consumers always receive a fully-populated OrgArchitecture.
//
// Merge semantics: shallow per top-level key. Object-typed fields
// (lead_unit, pipeline, scoring, geography, outreach, vocabulary,
// branding) merge field-by-field with base defaults filling gaps. Array
// fields (sources, compliance, integrations, scoring.thresholds) are
// replaced wholesale when the partial provides them — the resolver
// never appends to base arrays since that would conflate base seed data
// with org config.
//
// Spec: Company Docs/Metacron/SPEC - Phase 2B Tenant Config Layer.md.

import type { OrgArchitecture } from '@/lib/types/architecture';
import { BASE_ARCHITECTURE } from '@/lib/config/baseTemplate';

export function resolveArchitecture(
  partial: Partial<OrgArchitecture> | Record<string, unknown> | null | undefined,
): OrgArchitecture {
  if (partial == null) return cloneBase();
  const p = partial as Partial<OrgArchitecture>;
  const out = cloneBase();
  if (p.vertical !== undefined) out.vertical = p.vertical;
  if (p.lead_unit) {
    out.lead_unit = {
      ...out.lead_unit,
      ...p.lead_unit,
      schema: { ...out.lead_unit.schema, ...(p.lead_unit.schema ?? {}) },
    };
  }
  if (p.pipeline) {
    out.pipeline = {
      ...out.pipeline,
      ...p.pipeline,
      stage_labels: { ...out.pipeline.stage_labels, ...(p.pipeline.stage_labels ?? {}) },
    };
  }
  if (p.scoring) {
    out.scoring = {
      ...out.scoring,
      ...p.scoring,
      weights: p.scoring.weights ?? out.scoring.weights,
      thresholds: { ...out.scoring.thresholds, ...(p.scoring.thresholds ?? {}) },
    };
  }
  if (p.geography) {
    out.geography = { ...out.geography, ...p.geography };
  }
  if (p.outreach) {
    out.outreach = { ...out.outreach, ...p.outreach };
  }
  if (p.vocabulary) {
    out.vocabulary = { ...out.vocabulary, ...p.vocabulary };
  }
  if (p.branding) {
    out.branding = { ...out.branding, ...p.branding };
  }
  if (p.sources) out.sources = [...p.sources];
  if (p.compliance) out.compliance = [...p.compliance];
  if (p.integrations) out.integrations = [...p.integrations];
  if (p.business_summary) out.business_summary = { ...p.business_summary };
  return out;
}

function cloneBase(): OrgArchitecture {
  return {
    ...BASE_ARCHITECTURE,
    lead_unit: {
      ...BASE_ARCHITECTURE.lead_unit,
      schema: { ...BASE_ARCHITECTURE.lead_unit.schema },
    },
    pipeline: {
      ...BASE_ARCHITECTURE.pipeline,
      stages: [...BASE_ARCHITECTURE.pipeline.stages],
      stage_labels: { ...BASE_ARCHITECTURE.pipeline.stage_labels },
    },
    scoring: {
      ...BASE_ARCHITECTURE.scoring,
      weights: { ...BASE_ARCHITECTURE.scoring.weights },
      thresholds: { ...BASE_ARCHITECTURE.scoring.thresholds },
    },
    geography: {
      ...BASE_ARCHITECTURE.geography,
      defaults: [...BASE_ARCHITECTURE.geography.defaults],
    },
    sources: [...BASE_ARCHITECTURE.sources],
    outreach: { ...BASE_ARCHITECTURE.outreach },
    vocabulary: { ...BASE_ARCHITECTURE.vocabulary },
    branding: { ...BASE_ARCHITECTURE.branding },
    compliance: [...BASE_ARCHITECTURE.compliance],
    integrations: [...BASE_ARCHITECTURE.integrations],
  };
}
