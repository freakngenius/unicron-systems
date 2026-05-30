// lib/catalog/types.ts, Stream A Foundation.
//
// Catalog contract that the per-org `architecture.modules` block points at.
// Surface streams B/C/D import these types when they replace the floor stubs
// in `lib/catalog/floor-stubs.tsx` with real components.
//
// Plumbing only: importing this file (or the registry) does not change any
// rendered surface in /[slug]/* until a surface stream wires the renderer
// into the page tree.

import type { ComponentType, LazyExoticComponent } from 'react';
import type { z } from 'zod';

/**
 * The set of UI seams a module may claim. One enabled, slot-claiming module
 * per slot per org. `slotMode: 'action-affordance'` modules are exempt from
 * the uniqueness check and render inside the slot-claiming module's
 * affordance row (see hubspot-sync inside outreach-composer).
 */
export type Slot =
  | 'dashboard.hero'
  | 'dashboard.kpi'
  | 'dashboard.charts'
  | 'dashboard.filters'
  | 'detail.body'
  | 'detail.outreach'
  | 'detail.relationships'
  | 'pipeline.board'
  | 'delivery.digest';

export const ALL_SLOTS: readonly Slot[] = [
  'dashboard.hero',
  'dashboard.kpi',
  'dashboard.charts',
  'dashboard.filters',
  'detail.body',
  'detail.outreach',
  'detail.relationships',
  'pipeline.board',
  'delivery.digest',
];

/**
 * How a module relates to its declared slot.
 * - `claim`: takes exclusive ownership of the slot. The renderer chooses one
 *   such module per slot per org.
 * - `action-affordance`: renders inside the slot-claiming module's affordance
 *   row. Multiple action-affordance modules can target the same slot.
 */
export type SlotMode = 'claim' | 'action-affordance';

export type DependencyKind = 'schema_field' | 'integration' | 'agent' | 'data_signal';

export type DependencyGate = 'hard' | 'soft';

/**
 * A single dependency declaration on a module. `ref` interpretation depends on
 * kind:
 * - `schema_field`: org.architecture.lead_unit.schema[ref] must exist.
 *   The literal string `'__configured_filters__'` and
 *   `'__configured_metrics__'` are interpreted by the renderer to mean
 *   "every field listed in this module's per-org config" (e.g. filter-rail
 *   reads its filters from org config, not from the registry literal).
 * - `integration`: org.architecture.integrations must include ref.
 * - `agent`: org.architecture.agents (when present) must include ref. Orgs
 *   without an `agents` list fail soft for soft deps, hard for hard deps.
 * - `data_signal`: resolved at render time via a pluggable GateContext that
 *   queries pipeline output for non-empty.
 */
export interface Dependency {
  kind: DependencyKind;
  ref: string;
  gate: DependencyGate;
}

/**
 * The module component receives this shape. Implementations vary by stream;
 * Stream A ships stubs that render nothing visible. Surface streams replace
 * the stubs and consume `org`, `architecture`, `config`, and `affordances`.
 */
export interface ModuleComponentProps {
  org: { id: string; slug: string; name: string };
  architecture: unknown; // typed as OrgArchitecture in callers; kept unknown here to avoid a circular type dep.
  /** The merged per-org config for this module (already validated). */
  config: Record<string, unknown> | undefined;
  /**
   * Other modules that have registered as action-affordances on this slot
   * and passed their gates. The slot-claiming module's renderer iterates
   * over these and asks each to render its affordance.
   */
  affordances: readonly ResolvedAffordance[];
}

export interface ResolvedAffordance {
  id: ModuleId;
  config: Record<string, unknown> | undefined;
  Component: ComponentType<ModuleComponentProps>;
}

/**
 * Lazy component loader. Returns a Promise<{default: Component}> so callers
 * can pass it straight to React.lazy when they need code-splitting, or
 * await it inline in tests.
 */
export type ModuleComponentLoader =
  | (() => Promise<{ default: ComponentType<ModuleComponentProps> }>)
  | LazyExoticComponent<ComponentType<ModuleComponentProps>>;

/** A module's fallback strategy when the renderer cannot activate it. */
export type FallbackStrategy = 'floor' | 'inactive' | 'hidden';

/**
 * Module definitions are immutable values in the registry. Per-org enablement
 * lives in `architecture.modules[id]` (the OrgModuleEntry shape).
 */
export interface ModuleDefinition<C extends Record<string, unknown> = Record<string, unknown>> {
  id: ModuleId;
  version: string;
  slot: Slot;
  /** Defaults to 'claim'. Action-affordance modules render inside the slot owner. */
  slotMode?: SlotMode;
  title: string;
  /** Lazy component reference. Stream A stubs are no-op renderers. */
  component: ModuleComponentLoader;
  /** The agent this module's data flow depends on. */
  agent?: string;
  dependencies: readonly Dependency[];
  /** Zod schema for the module's per-org config. */
  configSchema: z.ZodType<C>;
  fallback: FallbackStrategy;
}

/** Per-org enablement record. Stored under architecture.modules[id]. */
export interface OrgModuleEntry {
  enabled: boolean;
  /** Optional pinned version. Must exist in the registry when present. */
  version?: string;
  /** Optional per-org config. Validated against the module's configSchema. */
  config?: Record<string, unknown>;
}

/** The shape of the modules block inside an OrgArchitecture. */
export type OrgModulesBlock = Partial<Record<ModuleId, OrgModuleEntry>>;

/** Module ID union. Extending the catalog adds an id here and a row to the registry. */
export type ModuleId =
  | 'ranked-feed'
  | 'company-detail'
  | 'outreach-composer'
  | 'hubspot-sync'
  | 'pipeline-kanban'
  | 'filter-rail'
  | 'warm-intro-panel'
  | 'kpi-strip'
  | 'analytics-charts'
  | 'daily-digest'
  | 'geo-map';

export const MODULE_IDS: readonly ModuleId[] = [
  'ranked-feed',
  'company-detail',
  'outreach-composer',
  'hubspot-sync',
  'pipeline-kanban',
  'filter-rail',
  'warm-intro-panel',
  'kpi-strip',
  'analytics-charts',
  'daily-digest',
  'geo-map',
];

/* Validation result shape, returned by validateOrgModules. */

export type ValidationErrorCode =
  | 'unknown_module_id'
  | 'slot_collision'
  | 'pinned_version_missing'
  | 'config_schema_failure'
  | 'hard_gate_unmet'
  | 'agent_dependency_unresolved';

export interface ValidationError {
  code: ValidationErrorCode;
  moduleId?: string;
  slot?: Slot;
  message: string;
  /** Optional zod issues when code === 'config_schema_failure'. */
  issues?: Array<{ path: (string | number)[]; message: string }>;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

/* Renderer slot resolution result. */

export type SlotMode_RenderState = 'active' | 'inactive' | 'floor' | 'hidden';

export interface SlotResolution {
  slot: Slot;
  mode: SlotMode_RenderState;
  /** The module that owns the slot, when mode is active or inactive. */
  module?: ModuleDefinition;
  /** Per-org config for the slot-owning module, after configSchema validation. */
  config?: Record<string, unknown>;
  /** Action-affordance modules whose gates are met, in registry order. */
  affordances: readonly ResolvedAffordance[];
  /** Diagnostic note explaining why the renderer chose this mode. */
  reason: string;
}

/* Gate resolution. */

export interface GateResolution {
  met: boolean;
  reason?: string;
}

/**
 * Resolves data_signal gates and any other side-effecting dependency lookups
 * the registry cannot inline. Tests substitute a stub context; production
 * passes a Supabase-backed context.
 */
export interface GateContext {
  /**
   * Returns true when the given data_signal `ref` has at least one
   * non-empty row in the pipeline scoped to this org. The default
   * production implementation queries Supabase; tests inject a stub.
   */
  hasDataSignal(orgId: string, ref: string): Promise<boolean>;
}
