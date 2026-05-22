// lib/agents/internal/qualifier.ts
//
// Internal onboarding Stage 5 (bootstrap qualifier).
//
// Stage 4 of the kickoff prompt requires real, org-scoped rows in
// pathfinder.projects for sam-gov, usaspending, and construction-sales-
// job-postings. The Internal subscriber path needs a qualifier (per the
// ingest-org-requested flow at lines 157-174). The full thesis-keyword
// Internal qualifier ships in Stage 6 (Plan §"Stage 6"); this module is
// the Stage 5 boundary qualifier that lets adapter output reach the
// projects table now, with hooks the Stage 6 module can extend.
//
// Contract mirrors lib/agents/funder/qualifier.ts so the subscriber
// switch dispatches by slug.
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §6.
//       Pathfinder/docs/PLAN-internal-onboarding.md §"Stage 6".

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
    return {
      qualified: true,
      reason: 'source-trusted:trade-association',
      inferred_service_category: inferServiceCategory(text),
    };
  }

  if (input.source === 'custom-state-contractor-licenses') {
    return {
      qualified: true,
      reason: 'source-trusted:contractor-license',
      inferred_service_category: inferServiceCategory(text),
    };
  }

  // Default: drop unknown sources to keep downstream costs bounded.
  return { qualified: false, reason: 'unknown_source_for_internal' };
}
