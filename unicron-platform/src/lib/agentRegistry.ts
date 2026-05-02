// Central agent catalog. Phase 0.5 ships an empty registry; Phase 1 streams
// (Coverage Expansion, Source Onboarder, Architect, Cross-Pollination) call
// `registerAgent(...)` to populate it.

import type { ReactNode } from 'react';
import type { AgentDispatch } from './contracts/agentConsole';

export interface AgentFormFieldOption {
  value: string;
  label: string;
}

export interface AgentFormField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  required?: boolean;
  placeholder?: string;
  /** Required when `type === 'select'`. */
  options?: ReadonlyArray<AgentFormFieldOption>;
}

export interface AgentFormSchema {
  fields: ReadonlyArray<AgentFormField>;
}

export type AgentDispatchHandler = (
  input: Record<string, unknown>,
) => Promise<{ dispatchId: string }>;

export type AgentResultRenderer = (dispatch: AgentDispatch) => ReactNode;

export interface AgentDefinition {
  /** Stable slug used to match `agent_dispatches.agent_name` and the URL slot. */
  name: string;
  /** Display name shown in tiles and headers. */
  displayName: string;
  /** One-line role description. */
  role: string;
  /**
   * Icon glyph. Phase 0.5 accepts a string (emoji or short label) for empty-state
   * rendering; Phase 3 polish replaces with a React component or asset reference.
   */
  icon: string;
  /** Optional form schema for the input panel. Phase 1 streams provide. */
  formSchema?: AgentFormSchema;
  /** Optional custom result renderer; falls back to the generic JSON dump. */
  resultRenderer?: AgentResultRenderer;
  /** Dispatch handler — Phase 1 streams provide; foundation has no built-in. */
  dispatchHandler?: AgentDispatchHandler;
}

const registry = new Map<string, AgentDefinition>();

export function registerAgent(def: AgentDefinition): void {
  if (registry.has(def.name)) {
    throw new Error(`Agent '${def.name}' is already registered`);
  }
  registry.set(def.name, def);
}

export function getAgent(name: string): AgentDefinition | undefined {
  return registry.get(name);
}

export function listAgents(): AgentDefinition[] {
  return [...registry.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
}

export function hasAgents(): boolean {
  return registry.size > 0;
}

// Test seam — clears the registry between tests.
export function __resetRegistryForTests(): void {
  registry.clear();
}
