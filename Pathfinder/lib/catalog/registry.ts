// lib/catalog/registry.ts, Stream A Foundation.
//
// MODULE_REGISTRY is the source of truth for which modules exist, what slot
// each claims, what its dependencies are, and which Zod schema validates its
// per-org config. Per-org enablement lives in `architecture.modules[id]`,
// not here.
//
// Surface streams B/C/D do NOT mutate this registry. They replace the
// component loader thunks in floor-stubs.tsx with real component imports.

import { z } from 'zod';
import type { Dependency, ModuleDefinition, ModuleId } from './types';
import { FLOOR_STUB_LOADERS } from './floor-stubs';

const v1 = '1.0.0';

/**
 * Per-module config schemas. Kept inline so the registry below stays readable.
 * Each schema mirrors the per-org config shape the dispatch prompt enumerates
 * (kpi-strip metrics, analytics-charts emphasis, etc.).
 */
const NoConfig = z.object({}).strict().optional().default({}) as unknown as z.ZodType<Record<string, unknown>>;

const KpiStripConfig = z.object({
  metrics: z.array(z.string().min(1)).min(1),
}) as unknown as z.ZodType<Record<string, unknown>>;

const AnalyticsChartsConfig = z.object({
  emphasis: z.enum(['primary', 'secondary']).default('primary'),
}) as unknown as z.ZodType<Record<string, unknown>>;

const FilterRailConfig = z
  .object({
    fields: z.array(z.string().min(1)).optional(),
  })
  .partial() as unknown as z.ZodType<Record<string, unknown>>;

const dep = (kind: Dependency['kind'], ref: string, gate: Dependency['gate']): Dependency => ({ kind, ref, gate });

export const MODULE_REGISTRY: Record<ModuleId, ModuleDefinition> = {
  'ranked-feed': {
    id: 'ranked-feed',
    version: v1,
    slot: 'dashboard.hero',
    title: 'Ranked feed',
    component: FLOOR_STUB_LOADERS['ranked-feed'],
    dependencies: [
      dep('schema_field', 'score', 'hard'),
      dep('data_signal', 'verified', 'hard'),
    ],
    configSchema: NoConfig,
    fallback: 'floor',
  },

  'company-detail': {
    id: 'company-detail',
    version: v1,
    slot: 'detail.body',
    title: 'Company detail',
    component: FLOOR_STUB_LOADERS['company-detail'],
    dependencies: [
      dep('data_signal', 'enriched_record', 'hard'),
      dep('data_signal', 'score_components', 'hard'),
      dep('data_signal', 'sources', 'soft'),
    ],
    configSchema: NoConfig,
    fallback: 'floor',
  },

  'outreach-composer': {
    id: 'outreach-composer',
    version: v1,
    slot: 'detail.outreach',
    title: 'Outreach composer',
    component: FLOOR_STUB_LOADERS['outreach-composer'],
    agent: 'outreach-drafter',
    dependencies: [
      dep('data_signal', 'outreach_drafts', 'soft'),
      dep('integration', 'resend', 'hard'),
    ],
    configSchema: NoConfig,
    fallback: 'inactive',
  },

  'hubspot-sync': {
    id: 'hubspot-sync',
    version: v1,
    slot: 'detail.outreach',
    // Action-affordance: renders inside outreach-composer's affordance row
    // instead of claiming detail.outreach a second time. See PLAN section
    // "Slot-collision resolution for hubspot-sync".
    slotMode: 'action-affordance',
    title: 'HubSpot sync',
    component: FLOOR_STUB_LOADERS['hubspot-sync'],
    dependencies: [
      dep('integration', 'hubspot', 'hard'),
    ],
    configSchema: NoConfig,
    fallback: 'floor',
  },

  'pipeline-kanban': {
    id: 'pipeline-kanban',
    version: v1,
    slot: 'pipeline.board',
    title: 'Pipeline kanban',
    component: FLOOR_STUB_LOADERS['pipeline-kanban'],
    dependencies: [
      dep('data_signal', 'pipeline_stages', 'hard'),
    ],
    configSchema: NoConfig,
    fallback: 'floor',
  },

  'filter-rail': {
    id: 'filter-rail',
    version: v1,
    slot: 'dashboard.filters',
    title: 'Filter rail',
    component: FLOOR_STUB_LOADERS['filter-rail'],
    dependencies: [
      // Sentinel: renderer expands this to one schema_field check per field
      // listed in the per-org config (architecture.modules.filter-rail.config.fields).
      // When no fields are configured the dependency is vacuously met.
      dep('schema_field', '__configured_filters__', 'soft'),
    ],
    configSchema: FilterRailConfig,
    fallback: 'floor',
  },

  'warm-intro-panel': {
    id: 'warm-intro-panel',
    version: v1,
    slot: 'detail.relationships',
    title: 'Warm intro panel',
    component: FLOOR_STUB_LOADERS['warm-intro-panel'],
    agent: 'adjacency-mapper',
    dependencies: [
      dep('data_signal', 'adjacency_graph', 'soft'),
    ],
    configSchema: NoConfig,
    fallback: 'inactive',
  },

  'kpi-strip': {
    id: 'kpi-strip',
    version: v1,
    slot: 'dashboard.kpi',
    title: 'KPI strip',
    component: FLOOR_STUB_LOADERS['kpi-strip'],
    dependencies: [
      // Sentinel: renderer expands to one data_signal check per metric in
      // the per-org config (architecture.modules.kpi-strip.config.metrics).
      dep('data_signal', '__configured_metrics__', 'soft'),
    ],
    configSchema: KpiStripConfig,
    fallback: 'inactive',
  },

  'analytics-charts': {
    id: 'analytics-charts',
    version: v1,
    slot: 'dashboard.charts',
    title: 'Analytics charts',
    component: FLOOR_STUB_LOADERS['analytics-charts'],
    dependencies: [
      dep('data_signal', 'aggregate_queries', 'soft'),
    ],
    configSchema: AnalyticsChartsConfig,
    fallback: 'inactive',
  },

  'daily-digest': {
    id: 'daily-digest',
    version: v1,
    slot: 'delivery.digest',
    title: 'Daily digest',
    component: FLOOR_STUB_LOADERS['daily-digest'],
    agent: 'briefer',
    dependencies: [
      dep('data_signal', 'verified_companies', 'hard'),
      dep('integration', 'slack', 'hard'),
    ],
    configSchema: NoConfig,
    fallback: 'hidden',
  },

  'geo-map': {
    id: 'geo-map',
    version: v1,
    // detail.body when enabled; no live collision because no org enables it
    // in Stream A's additive migration.
    slot: 'detail.body',
    title: 'Geo map',
    component: FLOOR_STUB_LOADERS['geo-map'],
    agent: 'geo-mapper',
    dependencies: [
      dep('data_signal', 'geocoded_coords', 'hard'),
    ],
    configSchema: NoConfig,
    fallback: 'hidden',
  },
};

/** Stable list of registered module ids; useful when iterating in tests. */
export function listRegisteredIds(): readonly ModuleId[] {
  return Object.keys(MODULE_REGISTRY) as ModuleId[];
}

/** Lookup by id with a typed undefined when missing. */
export function getModuleDefinition(id: string): ModuleDefinition | undefined {
  return (MODULE_REGISTRY as Record<string, ModuleDefinition>)[id];
}
