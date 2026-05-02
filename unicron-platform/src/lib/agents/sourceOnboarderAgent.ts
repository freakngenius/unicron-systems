// Registry entry for the Source Onboarder agent (Phase 1 / Stream M2).

import { lazy } from 'react';
import type { AgentDefinition } from '../agentRegistry';

const SourceOnboarderModal = lazy(() =>
  import('../../views/agents/SourceOnboarderModal').then((m) => ({
    default: m.SourceOnboarderModal,
  })),
);

export const sourceOnboarderAgent: AgentDefinition = {
  name: 'source-onboarder',
  displayName: 'Source Onboarder',
  role: 'the investigation board',
  icon: 'SO',
  modalComponent: SourceOnboarderModal,
};
