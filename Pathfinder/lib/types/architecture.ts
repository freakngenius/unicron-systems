// lib/types/architecture.ts — Phase 2B/2C tenant config layer.
//
// Spec: Company Docs/Metacron/SPEC - Phase 2B Tenant Config Layer.md.
//
// These types describe the architecture JSON persisted in
// pathfinder.organizations.architecture (jsonb). The Architect agent emits
// values matching this shape; the resolver in lib/config/resolveArchitecture
// merges partials with BASE_ARCHITECTURE so missing fields fall back cleanly.

export interface OrgArchitecture {
  vertical: string;
  lead_unit: LeadUnitConfig;
  pipeline: PipelineConfig;
  scoring: ScoringConfig;
  geography: GeographyConfig;
  sources: SourceRef[];
  outreach: OutreachConfig;
  vocabulary: VocabularyOverrides;
  branding: BrandingConfig;
  compliance: string[];
  integrations: string[];
  business_summary?: BusinessSummary;
}

export interface LeadUnitConfig {
  name: string;
  plural: string;
  schema: Record<string, LeadFieldDef>;
}

export interface LeadFieldDef {
  type: 'string' | 'number' | 'currency' | 'enum' | 'object' | 'date';
  enum_values?: string[];
  required?: boolean;
  display_label?: string;
}

export interface PipelineConfig {
  stages: string[];
  stage_labels: Record<string, string>;
}

export interface ScoringConfig {
  weights: Record<string, number>;
  thresholds: { verified: number; high_priority: number };
}

export interface GeographyConfig {
  scope: 'metros' | 'counties' | 'states' | 'global';
  defaults: string[];
}

export interface SourceRef {
  id: string;
  type: 'registered' | 'tier-2-human-assist' | 'pending';
}

export interface OutreachConfig {
  persona: string;
  tone: string;
  value_prop: string;
}

export type VocabularyOverrides = Record<string, string>;

export interface BrandingConfig {
  display_name: string;
  accent_color?: string;
  logo_url?: string;
}

export interface BusinessSummary {
  lead_type: string;
  business_area: string;
  problem_solved: string;
  what_they_get: string;
}
