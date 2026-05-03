// Registry entry for the Cross-Pollination Engine agent (Phase 1 / Stream M5).

import { lazy } from 'react';
import type { AgentDefinition } from '../agentRegistry';

const CrossPollinationModal = lazy(() =>
  import('../../views/agents/CrossPollinationModal').then((m) => ({
    default: m.CrossPollinationModal,
  })),
);

export const crossPollinationAgent: AgentDefinition = {
  name: 'cross-pollination',
  displayName: 'Cross-Pollination',
  role: 'the relationship matcher',
  icon: 'XP',
  modalComponent: CrossPollinationModal,
};
