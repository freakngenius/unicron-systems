// services/contact-enricher/providers/types.ts — Demo Polish UX Gate 8A.
//
// Provider abstraction for the Contact Enrichment Engine. Spec:
// `Company Docs/Specs/SPEC - Contact Enrichment.md`. Three concrete
// providers (Clay / Apollo / Hunter) implement this interface in 8B; the
// orchestrator at services/contact-enricher/agent.ts composes them with a
// Clay → Apollo → Hunter pipeline.

import type { OwnerType } from '@/services/enricher/types';

export type Seniority =
  | 'c_suite'
  | 'vp'
  | 'director'
  | 'manager'
  | 'individual_contributor'
  | 'unknown';

export type EmailStatus = 'verified' | 'guessed' | 'invalid' | 'unknown';

export type PhoneType = 'direct' | 'mobile' | 'switchboard' | 'unknown';

export type DecisionAuthority =
  | 'signer'
  | 'influencer'
  | 'gatekeeper'
  | 'champion'
  | 'unknown';

export type ProviderName = 'clay' | 'apollo' | 'hunter' | 'manual';

// Shape persisted to pathfinder.lead_contacts. Optional fields map directly
// to nullable columns. id / enriched_at are stamped server-side on insert.
export interface EnrichedContact {
  project_id: string;
  owner_organization: string;
  contact_name: string;
  role?: string | null;
  seniority?: Seniority | null;
  email?: string | null;
  email_status?: EmailStatus | null;
  phone?: string | null;
  phone_type?: PhoneType | null;
  linkedin_url?: string | null;
  source: ProviderName;
  source_confidence?: number | null;
  decision_authority?: DecisionAuthority | null;
  last_verified_at?: string | null;
  notes?: string | null;
}

// Inputs the orchestrator hands to a provider.
export interface EnrichRequest {
  project_id: string;
  owner_organization: string;
  owner_type: OwnerType | string | null;
  // Free-text place name for disambiguation (e.g. "Houston, TX"). Optional.
  location_text?: string | null;
  // 6-digit NAICS for industry-fit ranking. Optional.
  naics_code?: string | null;
  // Pre-computed list of role keywords the orchestrator wants prioritized.
  // Empty / undefined = use provider default.
  prioritized_roles?: string[];
  // Soft cap on contacts to return. Provider may return fewer.
  max_contacts?: number;
}

export interface EnrichResultMeta {
  provider: ProviderName;
  cost_usd: number;
  latency_ms: number;
  // Provider-specific raw response handle, for debugging. Never written to
  // user-facing UI; can be logged to llm_calls.notes if useful.
  raw_request_id?: string | null;
}

export interface EnrichResult {
  contacts: EnrichedContact[];
  meta: EnrichResultMeta;
  // True if the provider returned an authoritative empty result (looked
  // and found nothing) vs. false if the provider could not run (auth fail,
  // rate limit, etc.). Drives the 'all-providers-empty' UI state.
  authoritative: boolean;
}

// Common interface every contact-data provider implements. Keeps the
// agent.ts orchestrator provider-agnostic.
export interface ContactEnricher {
  readonly provider: ProviderName;
  enrichContacts(req: EnrichRequest): Promise<EnrichResult>;
}

// Email verification is its own narrow interface. Hunter implements this
// directly; Clay can implement it via its built-in verifier.
export interface EmailVerifier {
  readonly provider: ProviderName;
  verifyEmail(email: string): Promise<{
    status: EmailStatus;
    confidence: number;
    cost_usd: number;
  }>;
}
