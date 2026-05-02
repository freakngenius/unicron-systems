// Registry entry for the Coverage Expansion agent (Phase 1 / Stream M1).
//
// The modal owns the dispatch flow because the form is too custom to fit
// `AgentInputForm`'s generic field schema (chip inputs, radius slider, etc).
// The registry entry therefore exposes a `modalComponent` that AgentsView
// renders when the operator clicks the tile, plus a `dispatchHandler` that
// other surfaces (deep links, future cron-driven runs) can call without
// rendering the modal.

import { lazy } from 'react';
import type { AgentDefinition } from '../agentRegistry';
import { createDispatch } from '../agentConsoleClient';
import { createCoverageGoal } from '../coverageClient';

const CoverageExpansionModal = lazy(() =>
  import('../../views/agents/CoverageExpansionModal').then((m) => ({
    default: m.CoverageExpansionModal,
  })),
);

export const coverageExpansionAgent: AgentDefinition = {
  name: 'coverage-expansion',
  displayName: 'Coverage Expansion',
  role: 'the goal-setting desk',
  icon: 'CX',
  // formSchema is intentionally omitted — the modal renders CoverageInputForm
  // directly because the field shape exceeds AgentInputForm's primitives.
  modalComponent: CoverageExpansionModal,
  dispatchHandler: async (input) => {
    // Programmatic dispatch path (no modal). The modal calls the same two
    // sinks directly so the rendered flow doesn't double-dispatch.
    const goalRequest = input as unknown as Parameters<typeof createCoverageGoal>[0];
    if (!goalRequest.goal_text) {
      throw new Error('coverage-expansion dispatch requires goal_text');
    }
    const goalResponse = await createCoverageGoal(goalRequest);
    const orgId =
      (input as { customer_org_id?: unknown }).customer_org_id;
    const dispatch = await createDispatch({
      agent_name: 'coverage-expansion',
      customer_org_id: typeof orgId === 'string' ? orgId : 'pathfinder-default',
      input_payload: {
        ...goalRequest,
        goal_id: goalResponse.goal_id,
      },
    });
    return { dispatchId: dispatch.id };
  },
};
