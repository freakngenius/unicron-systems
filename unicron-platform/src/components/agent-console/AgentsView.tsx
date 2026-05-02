import { useState } from 'react';
import type { AgentDefinition } from '../../lib/agentRegistry';
import { listAgents } from '../../lib/agentRegistry';
import { AgentModalShell } from './AgentModalShell';
import { AgentHistoryGrid } from './AgentHistoryGrid';

/**
 * Foundation entry point for the operator-facing Agent Console.
 *
 * Phase 0.5 ships an empty registry — the grid below renders an explicit
 * "no agents registered yet" state. Phase 1 streams (Coverage Expansion,
 * Source Onboarder, Architect, Cross-Pollination) call `registerAgent(...)`
 * to populate the catalog.
 *
 * Routing is deliberately tab-state-only (no react-router); the "/agents"
 * URL fragment is faked via component state so Phase 1 can swap to real
 * routes later without churning the integration surface.
 */
export function AgentsView() {
  const agents = listAgents();
  const [selected, setSelected] = useState<AgentDefinition | null>(null);

  return (
    <div className="px-6 py-8">
      <header className="flex items-baseline justify-between mb-6">
        <h1 className="mono text-[16px] tracking-wide text-text-primary">Agents</h1>
        <span className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
          {agents.length} REGISTERED
        </span>
      </header>

      {agents.length === 0 ? (
        <EmptyState />
      ) : (
        <ul
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="agents-grid"
        >
          {agents.map((agent) => (
            <li key={agent.name}>
              <button
                type="button"
                onClick={() => setSelected(agent)}
                data-testid="agent-card"
                data-agent-name={agent.name}
                className="w-full text-left flex flex-col gap-2 border border-border-default rounded-md bg-bg-panel p-4 hover:border-accent-gold/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border-default bg-bg-base mono text-[14px]"
                  >
                    {agent.icon}
                  </span>
                  <span className="mono text-[13px] tracking-wide text-text-primary">
                    {agent.displayName}
                  </span>
                </div>
                <p className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/50">
                  {agent.role}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <AgentModalShell
          agent={selected}
          status="idle"
          costUsd={null}
          recentRunsCount={null}
          onClose={() => setSelected(null)}
        >
          <div className="max-w-3xl mx-auto flex flex-col gap-8">
            <p className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
              {selected.formSchema
                ? 'INPUT FORM AVAILABLE — phase 1 stream provides dispatch handler'
                : 'INPUT FORM PENDING — phase 1 stream will register'}
            </p>
            <AgentHistoryGrid agentName={selected.name} />
          </div>
        </AgentModalShell>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 border border-border-default border-dashed rounded-md bg-bg-panel py-16"
      data-testid="agents-empty-state"
    >
      <span className="mono text-[12px] uppercase tracking-[0.18em] text-text-primary/50">
        no agents registered yet
      </span>
      <span className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/30 max-w-md text-center">
        phase 1 streams (coverage expansion, source onboarder, architect,
        cross-pollination) ship them. agent foundation, schema, and live-execution
        plumbing are already in place.
      </span>
    </div>
  );
}
