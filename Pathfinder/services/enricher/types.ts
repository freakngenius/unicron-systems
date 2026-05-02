// services/enricher/types.ts — Demo Polish UX Gate 3C.
//
// Shapes for the lead-detail enrichment service. Spec:
// `Company Docs/Specs/SPEC - Lead Detail Enrichment.md`.

export type OwnerType =
  | 'federal_agency'
  | 'state_agency'
  | 'municipality'
  | 'private_developer'
  | 'pe_firm'
  | 'reit'
  | 'university'
  | 'nonprofit'
  | 'other';

export interface KeySub {
  name: string;
  role?: string;
  source_url?: string;
}

// Slim project shape passed into the enricher. Mirrors the columns the
// service reads + writes; full Project type lives in lib/types.ts.
export interface EnricherInput {
  id: string;
  source: string;
  title: string;
  summary: string | null;
  location_text: string | null;
  lat: number | null;
  lon: number | null;
  // Current values — the enricher only fills nulls; existing values pass
  // through unchanged.
  owner_name: string | null;
  owner_type: OwnerType | string | null;
  prime_contractor_name: string | null;
  description_long: string | null;
  naics_code: string | null;
  naics_description: string | null;
  estimated_start_date: string | null;
  estimated_end_date: string | null;
  permit_number: string | null;
  permit_jurisdiction: string | null;
  permit_filing_date: string | null;
  permit_type: string | null;
  lot_size_acres: number | null;
  project_value: number | null;
  // Provenance; the service merges with whatever's already there.
  enriched_at: string | null;
  enrichment_provider: string | null;
  enrichment_cost_usd: number | null;
}

export interface SonarEnrichmentResult {
  owner_name?: string | null;
  owner_type?: OwnerType | null;
  prime_contractor_name?: string | null;
  key_subs?: KeySub[] | null;
  estimated_start_date?: string | null;
  estimated_end_date?: string | null;
  permit_number?: string | null;
  permit_jurisdiction?: string | null;
  permit_filing_date?: string | null;
  permit_type?: string | null;
  lot_size_acres?: number | null;
}

export interface AnthropicEnrichmentResult {
  naics_code?: string | null;
  naics_description?: string | null;
  description_long?: string | null;
}

export interface EnricherUpdate {
  owner_name?: string | null;
  owner_type?: string | null;
  prime_contractor_name?: string | null;
  key_subs?: KeySub[] | null;
  description_long?: string | null;
  naics_code?: string | null;
  naics_description?: string | null;
  estimated_start_date?: string | null;
  estimated_end_date?: string | null;
  permit_number?: string | null;
  permit_jurisdiction?: string | null;
  permit_filing_date?: string | null;
  permit_type?: string | null;
  lot_size_acres?: number | null;
  enriched_at?: string;
  enrichment_provider?: string;
  enrichment_cost_usd?: number;
}

export interface EnricherRunResult {
  projectId: string;
  costUsd: number;
  sonarFieldsFilled: number;
  anthropicFieldsFilled: number;
  errors: string[];
  update: EnricherUpdate;
}

export interface EnricherBatchSummary {
  totalLeads: number;
  totalCostUsd: number;
  totalSonarCalls: number;
  totalAnthropicCalls: number;
  totalFieldsFilled: number;
  perLeadResults: EnricherRunResult[];
  haltedReason: string | null;
}
