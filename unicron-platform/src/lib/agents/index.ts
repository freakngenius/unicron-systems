// Centralised agent registration. Imported as a side-effect by AgentsView so
// every Phase 1 stream's agent definition is registered at module-load time.
//
// Idempotent: each `registerAgent` call is guarded by `getAgent(name)` so the
// module can be safely re-imported (tests, HMR) without throwing.

import { coverageExpansionAgent } from './coverageExpansionAgent';
import { sourceOnboarderAgent } from './sourceOnboarderAgent';
import { architectAgent } from './architectAgent';
import { getAgent, registerAgent } from '../agentRegistry';

const ALL_AGENTS = [coverageExpansionAgent, sourceOnboarderAgent, architectAgent];

for (const agent of ALL_AGENTS) {
  if (!getAgent(agent.name)) registerAgent(agent);
}

export {};
