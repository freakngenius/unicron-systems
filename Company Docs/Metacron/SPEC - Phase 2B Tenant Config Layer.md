# SPEC — Phase 2B: Tenant Config Layer

OrgContext provider, architecture JSON shape, base template, vocabulary substitution, fallbacks.

## What ships

1. TypeScript types for architecture JSON.
2. `OrgContext` React context exposing resolved (architecture-merged-with-defaults) config.
3. Default `BASE_ARCHITECTURE` template.
4. `useVocab()` hook for vocabulary substitution.
5. Server-side Zod validation on org create/update.

## Architecture JSON types

```typescript
// Pathfinder/lib/types/architecture.ts

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
  stages: string[];                    // ordered
  stage_labels: Record<string, string>;
}

export interface ScoringConfig {
  weights: Record<string, number>;     // sum to 1.0
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
```

## BASE_ARCHITECTURE

```typescript
// Pathfinder/lib/config/baseTemplate.ts

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
      source: { type: 'string', display_label: 'Source' }
    }
  },
  pipeline: {
    stages: ['sourced', 'contacted', 'engaged', 'won', 'lost'],
    stage_labels: { sourced: 'Sourced', contacted: 'Contacted', engaged: 'Engaged', won: 'Won', lost: 'Lost' }
  },
  scoring: { weights: { default: 1.0 }, thresholds: { verified: 0.6, high_priority: 0.8 } },
  geography: { scope: 'metros', defaults: [] },
  sources: [],
  outreach: { persona: 'business development representative', tone: 'professional', value_prop: 'qualified introductions' },
  vocabulary: {},
  branding: { display_name: 'Pathfinder' },
  compliance: [],
  integrations: []
};
```

## Merge resolver

```typescript
// Pathfinder/lib/config/resolveArchitecture.ts

export function resolveArchitecture(
  orgArchitecture: Partial<OrgArchitecture> | null
): OrgArchitecture {
  if (!orgArchitecture) return BASE_ARCHITECTURE;
  return {
    ...BASE_ARCHITECTURE,
    ...orgArchitecture,
    lead_unit: { ...BASE_ARCHITECTURE.lead_unit, ...orgArchitecture.lead_unit },
    pipeline: { ...BASE_ARCHITECTURE.pipeline, ...orgArchitecture.pipeline },
    scoring: { ...BASE_ARCHITECTURE.scoring, ...orgArchitecture.scoring },
    geography: { ...BASE_ARCHITECTURE.geography, ...orgArchitecture.geography },
    outreach: { ...BASE_ARCHITECTURE.outreach, ...orgArchitecture.outreach },
    vocabulary: { ...BASE_ARCHITECTURE.vocabulary, ...orgArchitecture.vocabulary },
    branding: { ...BASE_ARCHITECTURE.branding, ...orgArchitecture.branding }
  };
}
```

## OrgContext

```typescript
// Pathfinder/lib/context/OrgContext.tsx

interface OrgContextValue {
  org: PathfinderOrganization;
  architecture: OrgArchitecture;
  isOperator: boolean;
}

export const OrgContext = createContext<OrgContextValue | null>(null);

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be inside OrgContextProvider');
  return ctx;
}
```

Used by `[slug]/layout.tsx` (Stream 2A).

## Vocabulary helper

```typescript
// Pathfinder/lib/config/useVocab.ts

export function useVocab() {
  const { architecture } = useOrg();
  return (term: string) => architecture.vocabulary[term] ?? term;
}
```

## Server-side Zod validation

```typescript
// Pathfinder/lib/validation/architecture.ts

import { z } from 'zod';

export const ArchitectureSchema = z.object({
  vertical: z.string(),
  lead_unit: z.object({
    name: z.string(),
    plural: z.string(),
    schema: z.record(z.object({
      type: z.enum(['string','number','currency','enum','object','date']),
      enum_values: z.array(z.string()).optional(),
      required: z.boolean().optional(),
      display_label: z.string().optional()
    }))
  }),
  pipeline: z.object({
    stages: z.array(z.string()).min(1),
    stage_labels: z.record(z.string())
  }),
  scoring: z.object({
    weights: z.record(z.number()),
    thresholds: z.object({
      verified: z.number().min(0).max(1),
      high_priority: z.number().min(0).max(1)
    })
  })
  // ... full schema in implementation
});

export function validateArchitecture(json: unknown): OrgArchitecture {
  return ArchitectureSchema.parse(json);
}
```

Called on `POST/PATCH /api/organizations` (peer 6mz1zgdf endpoints — coordinate to add validation).

## Acceptance criteria

- `useOrg()` returns fully-resolved architecture inside any `[slug]` page.
- `useVocab()('leads')` returns "deals" for Realberry, "leads" for generic.
- Org with `architecture: null` renders as base template.
- Org with partial architecture merges correctly with base defaults.
- Invalid architecture rejected at API boundary.
- Type errors fail at build time on missing schema paths.

## Risks + mitigations

- Schema drift between Architect output and Pathfinder validator: shared schema source or CI parity check.
- Scoring weight sum != 1.0: validator warns and normalizes (does not reject).
- Empty sources: org valid but no leads ever flow. Stream 2E completion loop checks `sources.length > 0`.

## Dependencies

- Stream 2A (uses OrgContext from `[slug]/layout.tsx`)
- `pathfinder.organizations.architecture` JSONB (peer 6mz1zgdf)

End.
