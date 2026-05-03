// Registry entry for the Architect agent (Phase 1 / Stream M4).
//
// Three sub-modes (decomposition / tuning / discovery) live behind the
// modal's tab state — the AgentDefinition exposes a single modalComponent.

import { lazy } from 'react';
import type { AgentDefinition } from '../agentRegistry';

const ArchitectModal = lazy(() =>
  import('../../views/agents/ArchitectModal').then((m) => ({ default: m.ArchitectModal })),
);

export const architectAgent: AgentDefinition = {
  name: 'architect',
  displayName: 'Architect',
  role: 'the planning desk',
  icon: 'AR',
  modalComponent: ArchitectModal,
};
