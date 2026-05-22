// lib/agents/funder/qualifier.ts
//
// Funder onboarding Stage 4 — per-org qualifier.
//
// The qualifier is the L3 gate that turns raw source events into "real
// fundable-org signals." Pathfinder's existing Haiku classifier (inline
// in app/api/cron/ranker/route.ts) is Zedcor-hardcoded; this module is
// Funder-shaped and lives alongside it so Zedcor's path is untouched.
//
// Two modes:
//   - heuristic (default): keyword + payload-shape rules. No LLM call,
//     deterministic, cheap, runs inline in ingestOrgRequested before
//     insert. Drops ~30-50% of obvious noise.
//   - sonnet (optional): Sonnet-class classifier with the architecture's
//     business_summary.lead_type as the qualifier criterion. Reserved
//     for borderline cases or as a future upgrade.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 4.

import type { OrgArchitecture } from '@/lib/types/architecture';

export interface QualifierInput {
  source_event_id: string;
  source: string;
  title: string;
  summary: string | null;
  raw_payload: Record<string, unknown>;
  architecture: OrgArchitecture;
}

export interface QualifierResult {
  qualified: boolean;
  reason: string;
  /** Thesis area inferred from the event (if any), for downstream routing. */
  inferred_thesis?: string | null;
  /** Compliance flag emitted when the event matches sensitive criteria. */
  compliance_flag?: 'biosecurity-review' | null;
}

// Thesis-keyword map mirrors the ProPublica adapter's query terms so a
// hit there can be cross-referenced against the qualifier's signal here.
const THESIS_KEYWORDS: Record<string, string[]> = {
  'ai-safety': ['ai safety', 'alignment', 'machine learning safety', 'ai risk', 'agi safety'],
  'ai-governance': ['ai policy', 'ai governance', 'frontier model', 'ai regulation', 'ai oversight'],
  biosecurity: ['biosecurity', 'pandemic preparedness', 'pathogen', 'biorisk', 'gain of function'],
  longevity: ['longevity', 'aging research', 'cellular reprogramming', 'rejuvenation'],
  'civic-infrastructure': ['democracy', 'civic technology', 'voter', 'election integrity', 'public goods'],
  epistemics: ['forecasting', 'collective intelligence', 'epistemics', 'prediction market'],
};

// Hard exclusions: events that look like noise.
const NOISE_KEYWORDS = [
  'real estate',
  'condominium',
  'homeowners association',
  'church renovation',
  'fundraising banquet',
  'gala invitation',
];

export function qualifyForFunder(input: QualifierInput): QualifierResult {
  const text = `${input.title} ${input.summary ?? ''}`.toLowerCase();

  // Hard noise filter first.
  for (const noise of NOISE_KEYWORDS) {
    if (text.includes(noise)) {
      return { qualified: false, reason: `noise:${noise.replace(/\s+/g, '-')}` };
    }
  }

  // Source-specific structural rules. ProPublica + IRS results already
  // come pre-filtered by 501(c)(3) status and NTEE codes; we trust the
  // source's own filtering and keep them.
  if (input.source === 'custom-propublica-nonprofit-explorer' || input.source === 'custom-irs-exempt-org-filings') {
    const thesisMatch = (input.raw_payload as { thesis_match?: string }).thesis_match;
    return {
      qualified: true,
      reason: `source-trusted:${input.source}`,
      inferred_thesis: thesisMatch ?? null,
    };
  }

  // funder 990 filings are enrichment context only; tag as qualified but
  // flag the source so downstream stages can treat them as context.
  if (input.source === 'custom-funder-990-filings') {
    return {
      qualified: true,
      reason: 'enrichment-context:peer-funder-990',
    };
  }

  // Keyword-driven qualification for RSS-style sources.
  const validThesisAreas = (input.architecture.lead_unit.schema.thesis_area?.enum_values ?? []).filter(
    (t) => t !== 'other',
  );
  for (const thesis of validThesisAreas) {
    const keywords = THESIS_KEYWORDS[thesis] ?? [thesis.replace(/-/g, ' ')];
    if (keywords.some((k) => text.includes(k))) {
      const compliance_flag = thesis === 'biosecurity' ? 'biosecurity-review' : null;
      return {
        qualified: true,
        reason: `keyword-thesis-match:${thesis}`,
        inferred_thesis: thesis,
        compliance_flag,
      };
    }
  }

  // Default: drop. The qualifier errs toward dropping noise; a missed
  // fundable signal that re-surfaces in a future cycle is recoverable;
  // a queue full of noise drowns Sonnet-tier downstream costs.
  return { qualified: false, reason: 'no_thesis_keyword_match' };
}
