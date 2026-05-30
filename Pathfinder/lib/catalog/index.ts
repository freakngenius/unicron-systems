// lib/catalog/index.ts, Stream A Foundation.
//
// Single import surface for the catalog. Surface streams import from here.

export type {
  Slot,
  SlotMode,
  Dependency,
  DependencyKind,
  DependencyGate,
  FallbackStrategy,
  ModuleId,
  ModuleDefinition,
  ModuleComponentProps,
  ModuleComponentLoader,
  OrgModuleEntry,
  OrgModulesBlock,
  ResolvedAffordance,
  GateContext,
  GateResolution,
  ValidationError,
  ValidationErrorCode,
  ValidationResult,
  SlotResolution,
} from './types';

export { ALL_SLOTS, MODULE_IDS } from './types';
export { MODULE_REGISTRY, listRegisteredIds, getModuleDefinition } from './registry';
export { validateOrgModules, checkSyncDep } from './validation';
export { resolveGate, resolveAllGates, makeSupabaseGateContext } from './gating';
export { resolveSlot, resolveAllSlots } from './renderer';
