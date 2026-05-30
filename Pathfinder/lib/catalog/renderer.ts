// lib/catalog/renderer.ts, Stream A Foundation.
//
// Slot resolution. Given a slot, an org, the org's resolved architecture,
// and a GateContext, decide whether to render:
//   - the active module component (all gates met)
//   - the module's inactive fallback (soft gate unmet)
//   - the ui_plan floor (no claim OR hard gate unmet OR misconfigured)
//   - hidden (fallback === 'hidden' AND a non-met state)
//
// The renderer NEVER blanks a slot when fallback strategy says floor. It logs
// a structured misconfiguration and degrades. Surface streams call resolveSlot
// for each slot they render; Stream A ships the resolver and tests, no page
// integration.

import type { OrgArchitecture } from '@/lib/types/architecture';
import { MODULE_REGISTRY } from './registry';
import { resolveAllGates } from './gating';
import { validateOrgModules } from './validation';
import type {
  GateContext,
  ModuleDefinition,
  OrgModuleEntry,
  OrgModulesBlock,
  ResolvedAffordance,
  Slot,
  SlotResolution,
} from './types';

export interface RenderContext {
  org: { id: string; slug: string; name: string };
  architecture: OrgArchitecture & { agents?: readonly string[] };
  gateContext: GateContext;
  /**
   * Optional sink for misconfiguration warnings. Defaults to console.warn.
   * Surface streams pass a structured logger here in production.
   */
  log?: (event: { level: 'warn'; slot: Slot; moduleId?: string; reason: string }) => void;
}

function defaultLog(event: { level: 'warn'; slot: Slot; moduleId?: string; reason: string }): void {
  // eslint-disable-next-line no-console
  console.warn(
    `[catalog] slot=${event.slot} moduleId=${event.moduleId ?? 'none'} reason="${event.reason}"`,
  );
}

interface ModuleWithEntry {
  def: ModuleDefinition;
  entry: OrgModuleEntry;
}

function enabledModulesForSlot(modules: OrgModulesBlock, slot: Slot): {
  claim?: ModuleWithEntry;
  affordances: ModuleWithEntry[];
} {
  let claim: ModuleWithEntry | undefined;
  const affordances: ModuleWithEntry[] = [];
  for (const [id, entry] of Object.entries(modules)) {
    if (!entry?.enabled) continue;
    const def = MODULE_REGISTRY[id as keyof typeof MODULE_REGISTRY];
    if (!def) continue;
    if (def.slot !== slot) continue;
    if ((def.slotMode ?? 'claim') === 'action-affordance') {
      affordances.push({ def, entry });
    } else if (!claim) {
      claim = { def, entry };
    }
    // Slot collisions are surfaced by validateOrgModules; the renderer
    // keeps the first-claim and ignores the rest to stay degradation-safe.
  }
  return { claim, affordances };
}

async function resolveAffordances(
  affordances: ModuleWithEntry[],
  ctx: RenderContext,
): Promise<ResolvedAffordance[]> {
  const resolved: ResolvedAffordance[] = [];
  for (const { def, entry } of affordances) {
    // eslint-disable-next-line no-await-in-loop
    const gates = await resolveAllGates(def, {
      architecture: ctx.architecture,
      org: ctx.org,
      entry,
      ctx: ctx.gateContext,
    });
    if (gates.hardUnmet.length > 0) {
      (ctx.log ?? defaultLog)({
        level: 'warn',
        slot: def.slot,
        moduleId: def.id,
        reason: `affordance dropped: hard gate "${gates.hardUnmet[0].dep.ref}" unmet (${gates.hardUnmet[0].reason})`,
      });
      continue;
    }
    // Resolve the lazy component once.
    // eslint-disable-next-line no-await-in-loop
    const Component = await loadComponent(def);
    resolved.push({ id: def.id, config: entry.config, Component });
  }
  return resolved;
}

async function loadComponent(def: ModuleDefinition) {
  const c = def.component;
  // A function returning a Promise.
  if (typeof c === 'function') {
    const mod = await (c as () => Promise<{ default: import('react').ComponentType<import('./types').ModuleComponentProps> }>)();
    return mod.default;
  }
  // A React.lazy wrapper: treat as a component directly. React.lazy returns
  // an exotic that callers render through Suspense. resolveSlot exposes it as
  // ResolvedAffordance.Component for surface streams to render under their
  // own Suspense boundary.
  return c as unknown as import('react').ComponentType<import('./types').ModuleComponentProps>;
}

/**
 * Resolve a single slot. Returns a SlotResolution describing what the surface
 * stream should render. The renderer never throws on misconfiguration; it
 * logs and falls back.
 */
export async function resolveSlot(slot: Slot, ctx: RenderContext): Promise<SlotResolution> {
  const modules: OrgModulesBlock = ctx.architecture.modules ?? {};
  const { claim, affordances } = enabledModulesForSlot(modules, slot);
  const resolvedAffordances = await resolveAffordances(affordances, ctx);

  if (!claim) {
    return {
      slot,
      mode: 'floor',
      affordances: resolvedAffordances,
      reason: 'no enabled module claims this slot',
    };
  }

  const { def, entry } = claim;

  // Re-validate per-slot for the renderer pathway (defensive: also catches
  // bypassed validation).
  const v = validateOrgModules(
    { ...ctx.architecture, modules: { [def.id]: entry } },
    { enforceSyncHardGates: true },
  );
  if (!v.ok) {
    (ctx.log ?? defaultLog)({
      level: 'warn',
      slot,
      moduleId: def.id,
      reason: `validation failed: ${v.errors[0].code} ${v.errors[0].message}`,
    });
    return {
      slot,
      mode: def.fallback === 'hidden' ? 'hidden' : 'floor',
      affordances: resolvedAffordances,
      reason: v.errors[0].message,
    };
  }

  const gates = await resolveAllGates(def, {
    architecture: ctx.architecture,
    org: ctx.org,
    entry,
    ctx: ctx.gateContext,
  });

  if (gates.hardUnmet.length > 0) {
    const first = gates.hardUnmet[0];
    (ctx.log ?? defaultLog)({
      level: 'warn',
      slot,
      moduleId: def.id,
      reason: `hard gate unmet: ${first.dep.kind}/${first.dep.ref} (${first.reason})`,
    });
    return {
      slot,
      mode: def.fallback === 'hidden' ? 'hidden' : 'floor',
      affordances: resolvedAffordances,
      reason: `hard gate unmet: ${first.dep.kind}/${first.dep.ref}`,
    };
  }

  if (gates.softUnmet.length > 0) {
    const first = gates.softUnmet[0];
    return {
      slot,
      mode: def.fallback === 'hidden' ? 'hidden' : 'inactive',
      module: def,
      config: entry.config,
      affordances: resolvedAffordances,
      reason: `soft gate unmet: ${first.dep.kind}/${first.dep.ref}`,
    };
  }

  return {
    slot,
    mode: 'active',
    module: def,
    config: entry.config,
    affordances: resolvedAffordances,
    reason: 'all gates met',
  };
}

/**
 * Resolve every slot in one pass. Surface streams can call this once per
 * page render and then look slots up by name.
 */
export async function resolveAllSlots(
  ctx: RenderContext,
): Promise<Record<Slot, SlotResolution>> {
  const slots: Slot[] = [
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
  const out: Partial<Record<Slot, SlotResolution>> = {};
  await Promise.all(
    slots.map(async (s) => {
      out[s] = await resolveSlot(s, ctx);
    }),
  );
  return out as Record<Slot, SlotResolution>;
}
