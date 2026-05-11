// lib/config/baseTemplate.ts — Phase 2B tenant config layer.
//
// BASE_ARCHITECTURE is the safe-default Pathfinder shape that orgs fall
// back to when their architecture JSON is empty or partial. The resolver
// in lib/config/resolveArchitecture composes per-org overrides on top of
// this template.
//
// Spec: Company Docs/Metacron/SPEC - Phase 2B Tenant Config Layer.md.

import type { OrgArchitecture } from '@/lib/types/architecture';

export const BASE_ARCHITECTURE: OrgArchitecture = {
  vertical: 'generic',
  lead_unit: {
    name: 'lead',
    plural: 'leads',
    schema: {
      name: { type: 'string', display_label: 'Name' },
      contact: { type: 'string', display_label: 'Contact' },
      geography: { type: 'object', display_label: 'Geography' },
      score: { type: 'number', display_label: 'Score' },
      source: { type: 'string', display_label: 'Source' },
    },
  },
  pipeline: {
    stages: ['sourced', 'contacted', 'engaged', 'won', 'lost'],
    stage_labels: {
      sourced: 'Sourced',
      contacted: 'Contacted',
      engaged: 'Engaged',
      won: 'Won',
      lost: 'Lost',
    },
  },
  scoring: {
    weights: { default: 1.0 },
    thresholds: { verified: 0.6, high_priority: 0.8 },
  },
  geography: { scope: 'metros', defaults: [] },
  sources: [],
  outreach: {
    persona: 'business development representative',
    tone: 'professional',
    value_prop: 'qualified introductions',
  },
  vocabulary: {},
  branding: { display_name: 'Pathfinder' },
  compliance: [],
  integrations: [],
};
