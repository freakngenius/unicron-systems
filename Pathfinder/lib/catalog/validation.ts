// lib/catalog/validation.ts, Stream A Foundation.
//
// Synchronous, config-time validation of an org's `architecture.modules`
// block against the MODULE_REGISTRY. Run at config write time and at app
// boot so misconfiguration surfaces before a renderer hits it.
//
// What this validates:
//   - every enabled id exists in the registry
//   - no two enabled, slot-claiming modules claim the same slot
//   - the pinned version, when provided, matches the registered version
//   - the per-org config validates against the module's Zod configSchema
//   - synchronous hard-gated dependencies are met (integration, schema_field,
//     and a graceful agent check)
//
// What this defers to render time:
//   - async data_signal gates (see lib/catalog/gating + lib/catalog/renderer)
//
// The renderer is responsible for falling back to the ui_plan floor when
// validation fails at render time. validateOrgModules is the upstream gate
// that surfaces structured errors before that happens.

import type { OrgArchitecture } from '@/lib/types/architecture';
import { MODULE_REGISTRY, getModuleDefinition } from './registry';
import type {
  ModuleDefinition,
  OrgModuleEntry,
  OrgModulesBlock,
  Slot,
  ValidationError,
  ValidationResult,
} from './types';

interface ValidateOpts {
  /**
   * When true, hard-gated dependencies that can be checked synchronously
   * (integration / schema_field / agent) are required to be met. Defaults
   * to true. Set false in pure shape-validation scenarios (round-trip
   * tests, schema-only checks).
   */
  enforceSyncHardGates?: boolean;
}

/**
 * Validate the per-org modules block against the registry.
 *
 * Returns `{ ok, errors }` where `ok === errors.length === 0`. When `ok`
 * is false the renderer still degrades gracefully per-slot; validation is
 * the front door, not the only line of defence.
 */
export function validateOrgModules(
  architecture: Pick<OrgArchitecture, 'lead_unit' | 'integrations' | 'modules'> & {
    agents?: readonly string[];
  },
  opts: ValidateOpts = {},
): ValidationResult {
  const enforceHard = opts.enforceSyncHardGates ?? true;
  const errors: ValidationError[] = [];
  const modules: OrgModulesBlock = architecture.modules ?? {};

  // Track slot claims to surface collisions. Action-affordance modules are
  // exempt: they render inside the claimer's affordance row and are allowed
  // to share the slot with the claiming module.
  const slotClaims = new Map<Slot, string>();

  for (const [rawId, rawEntry] of Object.entries(modules)) {
    if (!rawEntry) continue;
    const entry = rawEntry as OrgModuleEntry;
    if (!entry.enabled) continue;

    const def = getModuleDefinition(rawId);
    if (!def) {
      errors.push({
        code: 'unknown_module_id',
        moduleId: rawId,
        message: `Module id "${rawId}" is not registered in MODULE_REGISTRY`,
      });
      continue;
    }

    // Pinned version check.
    if (entry.version && entry.version !== def.version) {
      errors.push({
        code: 'pinned_version_missing',
        moduleId: rawId,
        message: `Module "${rawId}" pinned to version "${entry.version}" but registry has "${def.version}"`,
      });
    }

    // Config schema validation.
    const parsed = def.configSchema.safeParse(entry.config ?? {});
    if (!parsed.success) {
      errors.push({
        code: 'config_schema_failure',
        moduleId: rawId,
        message: `Module "${rawId}" config failed schema validation`,
        issues: parsed.error.issues.map((iss) => ({
          path: [...iss.path],
          message: iss.message,
        })),
      });
    }

    // Slot collision check, claim-mode only.
    if ((def.slotMode ?? 'claim') === 'claim') {
      const prev = slotClaims.get(def.slot);
      if (prev) {
        errors.push({
          code: 'slot_collision',
          slot: def.slot,
          message: `Slot "${def.slot}" is claimed by both "${prev}" and "${rawId}"`,
        });
      } else {
        slotClaims.set(def.slot, rawId);
      }
    }

    // Synchronous hard-gate enforcement.
    if (enforceHard) {
      for (const d of def.dependencies) {
        if (d.gate !== 'hard') continue;
        if (d.kind === 'data_signal') continue; // async, deferred to render time
        const res = checkSyncDep(d.kind, d.ref, architecture, def, entry);
        if (!res.met) {
          errors.push({
            code: 'hard_gate_unmet',
            moduleId: rawId,
            message: `Module "${rawId}" hard ${d.kind} dependency "${d.ref}" unmet: ${res.reason ?? 'not present'}`,
          });
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Synchronous dependency check shared by validation and render-time gating.
 * data_signal is intentionally not handled here; it is async and resolved
 * by the renderer via GateContext.hasDataSignal.
 */
export function checkSyncDep(
  kind: Exclude<import('./types').DependencyKind, 'data_signal'>,
  ref: string,
  architecture: Pick<OrgArchitecture, 'lead_unit' | 'integrations'> & { agents?: readonly string[] },
  def: ModuleDefinition,
  entry: OrgModuleEntry,
): { met: boolean; reason?: string } {
  switch (kind) {
    case 'schema_field': {
      // Sentinel: expand to one schema_field check per configured field.
      if (ref === '__configured_filters__') {
        const fields = ((entry.config?.fields as string[] | undefined) ?? []) as string[];
        if (fields.length === 0) return { met: true, reason: 'no configured filters' };
        const missing = fields.filter((f) => !architecture.lead_unit?.schema?.[f]);
        if (missing.length > 0) {
          return { met: false, reason: `lead_unit schema missing: ${missing.join(', ')}` };
        }
        return { met: true };
      }
      if (ref === '__configured_metrics__') {
        // No-op for schema_field; sentinel is meant for data_signal in kpi-strip.
        return { met: true, reason: 'metric sentinel ignored for schema_field' };
      }
      if (architecture.lead_unit?.schema?.[ref]) return { met: true };
      return { met: false, reason: `lead_unit.schema.${ref} not present` };
    }
    case 'integration': {
      if ((architecture.integrations ?? []).includes(ref)) return { met: true };
      return { met: false, reason: `integration "${ref}" not in architecture.integrations` };
    }
    case 'agent': {
      const list = architecture.agents ?? [];
      if (list.includes(ref)) return { met: true };
      return { met: false, reason: `agent "${ref}" not in architecture.agents` };
    }
    default: {
      // Exhaustive guard, never executed under the input type.
      const exhaustive: never = kind;
      void exhaustive;
      void def;
      return { met: false, reason: `unknown dependency kind` };
    }
  }
}
