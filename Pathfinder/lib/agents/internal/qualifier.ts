// lib/agents/internal/qualifier.ts
//
// Internal onboarding Stage 5 — qualifier for the construction-vertical
// B2B prospecting pipeline.
//
// Internal qualifier accepts raw company records and gates to genuine
// active-sales-motion construction-vertical companies. Uses evidence
// available on each record:
//   - NAICS code (236/237/238/532412) for construction-vertical match
//   - recent sales / BD job postings as a hiring-bd sales-motion signal
//   - federal awardee + SAM registration as federal_signal sources
//   - trade-association membership as association_presence signal
//
// Ambiguous events are allowed through so the verifier can adjudicate
// against public records (SAM, USASpending, license lookups). This
// mirrors the Build-Brief decision: bias toward recall at the qualifier,
// precision at the verifier. The qualifier never calls an LLM — it is
// pure heuristics over the adapter payload.
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §6.
//       Pathfinder/docs/PLAN-internal-onboarding.md §"Stage 5".

import type { OrgArchitecture } from '@/lib/types/architecture';
import { isConstructionNaics, CONSTRUCTION_KEYWORDS } from '@/lib/adapters/sources/_internal-shared';

export interface InternalQualifierInput {
  source_event_id: string;
  source: string;
  title: string;
  summary: string | null;
  raw_payload: Record<string, unknown>;
  architecture: OrgArchitecture;
}

export interface InternalQualifierResult {
  qualified: boolean;
  reason: string;
  inferred_service_category?: string | null;
  sales_motion_signal?: 'active-outbound' | 'hiring-bd' | 'inbound-only' | 'unknown' | null;
  federal_registration?: 'sam-registered' | 'federal-awardee' | 'both' | 'none' | null;
  /** Association name lifted from the trade-association adapter payload, used
   *  by the association_presence feature extractor at the ranker stage. */
  association_hint?: string | null;
}

// Hard noise: residential-only signals, single-LLC holding companies,
// church/HOA-style filings that pollute the SOS feed.
const NOISE_KEYWORDS = [
  'homeowner',
  'condominium',
  'realty trust',
  'family trust',
  'church renovation',
];

const SERVICE_CATEGORY_HINTS: Array<{ keys: string[]; category: string }> = [
  { keys: ['equipment rental', 'rental'], category: 'equipment-rental' },
  { keys: ['fence', 'fencing'], category: 'temp-fence' },
  { keys: ['power', 'sanitation', 'portable toilet'], category: 'temp-power-sanitation' },
  { keys: ['traffic control'], category: 'traffic-control' },
  { keys: ['modular', 'site office', 'jobsite trailer'], category: 'modular-site-offices' },
  { keys: ['roofing', 'roof '], category: 'commercial-roofing' },
  { keys: ['industrial cleaning'], category: 'industrial-cleaning' },
  { keys: ['waste', 'recycling', 'haul'], category: 'waste-management' },
  { keys: ['crane'], category: 'crane-rental' },
  { keys: ['connectivity', 'jobsite wifi', 'site internet'], category: 'jobsite-connectivity' },
  { keys: ['safety services', 'flagger', 'osha consulting'], category: 'site-safety-services' },
  { keys: ['general contractor', 'general construction'], category: 'general-contractor' },
];

function inferServiceCategory(text: string): string | null {
  const lower = text.toLowerCase();
  for (const hint of SERVICE_CATEGORY_HINTS) {
    if (hint.keys.some((k) => lower.includes(k))) return hint.category;
  }
  return null;
}

export function qualifyForInternal(input: InternalQualifierInput): InternalQualifierResult {
  const text = `${input.title} ${input.summary ?? ''}`.toLowerCase();

  // Hard noise filter.
  for (const noise of NOISE_KEYWORDS) {
    if (text.includes(noise)) {
      return { qualified: false, reason: `noise:${noise.replace(/\s+/g, '-')}` };
    }
  }

  // Source-specific structural trust — adapters that already filter on
  // construction NAICS or construction-vertical boards land qualified.
  if (input.source === 'sam-gov') {
    const payload = input.raw_payload as { primary_naics?: string; internal_construction_naics_match?: string };
    const naics = payload.internal_construction_naics_match ?? payload.primary_naics ?? null;
    return {
      qualified: isConstructionNaics(naics),
      reason: `source-trusted:sam-gov:naics-${naics ?? 'unknown'}`,
      inferred_service_category: inferServiceCategory(text),
      federal_registration: 'sam-registered',
    };
  }

  if (input.source === 'usaspending') {
    return {
      qualified: true,
      reason: 'source-trusted:usaspending',
      inferred_service_category: inferServiceCategory(text),
      federal_registration: 'federal-awardee',
    };
  }

  if (input.source === 'custom-construction-sales-job-postings') {
    return {
      qualified: true,
      reason: 'source-trusted:job-postings',
      inferred_service_category: inferServiceCategory(text),
      sales_motion_signal: 'hiring-bd',
    };
  }

  if (input.source === 'custom-sos-business-registrations') {
    // SOS entities already filter for construction-name match server-side;
    // surface as qualified with sales_motion=unknown for enricher to fill.
    const constructionHit = CONSTRUCTION_KEYWORDS.some((k) => text.includes(k)) ||
      text.includes('construction');
    return {
      qualified: constructionHit,
      reason: constructionHit ? 'source-trusted:sos' : 'sos:no-construction-keyword',
      inferred_service_category: inferServiceCategory(text),
      sales_motion_signal: 'unknown',
    };
  }

  if (input.source === 'custom-trade-association-directories') {
    const payload = input.raw_payload as { association_name?: string };
    return {
      qualified: true,
      reason: 'source-trusted:trade-association',
      inferred_service_category: inferServiceCategory(text),
      association_hint: payload.association_name ?? null,
    };
  }

  if (input.source === 'custom-state-contractor-licenses') {
    return {
      qualified: true,
      reason: 'source-trusted:contractor-license',
      inferred_service_category: inferServiceCategory(text),
    };
  }

  // Ambiguous-allow path: when an unknown source carries a strong
  // construction signal in the haystack, let it through so the verifier
  // can decide. Bias toward recall — a noise event still gets dropped
  // by the verifier's score-threshold gate before it reaches outreach.
  const constructionHit = CONSTRUCTION_KEYWORDS.some((k) => text.includes(k));
  if (constructionHit) {
    return {
      qualified: true,
      reason: 'ambiguous_allow:construction-keyword',
      inferred_service_category: inferServiceCategory(text),
      sales_motion_signal: 'unknown',
    };
  }

  // Default: drop unknown sources without a construction signal so
  // downstream Sonnet costs stay bounded.
  return { qualified: false, reason: 'unknown_source_for_internal' };
}
