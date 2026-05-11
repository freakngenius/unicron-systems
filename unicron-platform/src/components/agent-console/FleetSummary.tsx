// FleetSummary.tsx — Pass 3 of the Metacron → Atrium rebrand.
//
// Renders a top-level "Fleet Summary" overview of the Nervous-System agent
// fleet (Analyst, Elder, Orchestrator, Taboo Keeper) as a cluster of cards.
// Sits ABOVE the existing per-agent registry grid in <AgentsView>.
//
// Data source: GET /api/atrium/products/metacron → `agents` (rpc:
// nervous_system.ns_list_agents).
//
// Migrated from src/atrium/products/MetacronProduct.tsx (Pass 1) — see PR
// #297 + Pass 3 spec for the consolidation rationale.

import { useEffect, useState } from 'react';

interface AgentRow {
  id: string;
  name: string;
  archetype: string;
  specialty: string | null;
  active: boolean;
}

interface MetacronStats {
  agents: AgentRow[];
}

const ARCHETYPE_COLORS: Record<string, string> = {
  orchestrator: 'var(--accent)',
  analyst:      '#6081BE',
  elder:        '#8B7CD8',
  taboo_keeper: '#E14B4B',
  specialist:   '#2E8E66',
};

function archetypeColor(a: string) {
  return ARCHETYPE_COLORS[a] ?? '#6B7280';
}

export function FleetSummary() {
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/atrium/products/metacron')
      .then(async (res) => {
        const json = (await res.json()) as MetacronStats & { error?: string };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (cancelled) return;
        setAgents(json.agents ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mb-8" aria-label="Fleet Summary">
      <div className="flex items-center justify-between mb-3">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          Fleet Summary
        </div>
        {agents && (
          <span className="mono text-[10px] text-text-muted">
            {agents.filter((a) => a.active).length} active
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-bg-card rounded-xl animate-pulse" />
          ))}
        </div>
      ) : err ? (
        <div className="bg-[#C28A1F]/10 border border-[#C28A1F]/30 rounded-xl px-4 py-3">
          <div className="mono text-[11px] text-[#C28A1F]">
            Live data unavailable: {err}
          </div>
        </div>
      ) : !agents || agents.length === 0 ? (
        <div className="bg-bg-card border border-border-default rounded-xl px-5 py-6 text-center">
          <div className="mono text-[11px] text-text-muted">
            No agents found in nervous_system.agents.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="fleet-summary-grid">
          {agents.map((agent) => {
            const color = archetypeColor(agent.archetype);
            return (
              <div
                key={agent.id}
                className="bg-bg-card border rounded-xl px-4 py-4 flex items-start gap-3"
                style={{ borderColor: color + '33' }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                  style={{ backgroundColor: agent.active ? color : '#6B7280' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="mono text-[13px] font-semibold text-text-primary">
                    {agent.name}
                  </div>
                  <div
                    className="mono text-[9px] uppercase tracking-[0.12em] mt-0.5"
                    style={{ color }}
                  >
                    {agent.archetype.replace('_', ' ')}
                  </div>
                  {agent.specialty && (
                    <div className="mono text-[10px] text-text-muted mt-1 leading-relaxed line-clamp-2">
                      {agent.specialty}
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  <span
                    className="mono text-[9px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
                    style={{
                      background: (agent.active ? color : '#6B7280') + '22',
                      color: agent.active ? color : '#6B7280',
                    }}
                  >
                    {agent.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
