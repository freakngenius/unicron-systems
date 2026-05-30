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
  // Build-Out Pass Slice 1 (Spec: SPEC - Pathfinder Build-Out Pass.md):
  // Architect emits a ui_plan describing how the customer's tailored
  // Pathfinder should be laid out. Optional for backward compat with
  // existing orgs persisted before the v4 prompt — resolveArchitecture
  // falls back to the BASE_ARCHITECTURE default ui_plan when missing.
  ui_plan?: UIPlan;
  // Stream A Foundation: optional per-org module enablement block. Read by
  // the catalog renderer in lib/catalog/renderer. Absent on Zedcor (#1),
  // Realberry (#2), Funder (#3). Present on Internal (#4) after the
  // additive migration 20260530_internal_modules_block.sql. The type
  // lives in lib/catalog/types to keep this module agnostic.
  modules?: import('@/lib/catalog/types').OrgModulesBlock;
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

// UIPlan — verbatim from SPEC - Pathfinder Build-Out Pass.md
// (§"Architecture JSON extension"). Drives the schema-driven renderer
// at /[slug] in later slices (KPI strip, charts, lead card layout,
// filter sidebar). This file ships the type only — renderer wiring is
// Slice 2.
export interface UIPlan {
  lead_card_layout: {
    primary_fields: string[]; // 3-5 fields displayed prominently
    secondary_fields: string[]; // additional fields in expandable section
    score_position: 'top-right' | 'top-left' | 'bottom';
  };
  kpis: Array<{
    label: string; // "Leads this week"
    metric_id: string; // maps to a query function
    unit?: string; // "%", "$", null
    target?: number;
    invert?: boolean; // lower is better
  }>;
  charts: Array<{
    title: string;
    type: 'line' | 'bar' | 'pie' | 'area';
    metric_id: string;
    grouping?: string; // "day", "week", "source", "asset_class"
  }>;
  filters: Array<{
    field: string; // lead schema field name
    label: string;
    default?: unknown;
  }>;
  dashboard_emphasis: 'volume' | 'quality' | 'velocity' | 'coverage';
}
