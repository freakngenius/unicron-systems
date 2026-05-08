// AgentsGalaxy.tsx — Sprint 3 Stream D
// Displays all agents from nervous_system.agents via ns_list_agents() RPC.
// Click a card to open the detail panel on the right.

import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Budget {
  limit_usd_per_period: number;
  current_spent_usd: number;
  period_days: number;
  resets_at: string;
}

interface Config {
  watches_agents: string[];
  watches_signal_topics: string[];
}

interface Agent {
  id: string;
  name: string;
  archetype: string;
  specialty: string | null;
  active: boolean;
  budget: Budget | null;
  config: Config | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ARCHETYPE_COLORS: Record<string, { dot: string; label: string; border: string }> = {
  orchestrator: {
    dot: '#FF6B2B',
    label: '#FF6B2B',
    border: '#FF6B2B40',
  },
  analyst: {
    dot: '#3B82F6',
    label: '#3B82F6',
    border: '#3B82F640',
  },
  elder: {
    dot: '#A855F7',
    label: '#A855F7',
    border: '#A855F740',
  },
  taboo_keeper: {
    dot: '#EF4444',
    label: '#EF4444',
    border: '#EF444440',
  },
  specialist: {
    dot: '#22C55E',
    label: '#22C55E',
    border: '#22C55E40',
  },
};

const DEFAULT_COLOR = {
  dot: '#6B7280',
  label: '#6B7280',
  border: '#6B728040',
};

function archetypeColor(arch: string) {
  return ARCHETYPE_COLORS[arch] ?? DEFAULT_COLOR;
}

async function fetchAgents(): Promise<Agent[]> {
  const { data, error } = await getSupabase().rpc('ns_list_agents');
  if (error) {
    console.error('[AgentsGalaxy] fetchAgents error:', error.message);
    return [];
  }
  return (data as Agent[]) ?? [];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentsGalaxy() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Agent | null>(null);

  useEffect(() => {
    fetchAgents().then((a) => {
      setAgents(a);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 bg-[#141416] rounded-xl animate-pulse border border-[#1F1F23]" />
        ))}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-8 text-center">
        <div className="mono text-[11px] text-[rgba(229,229,231,0.5)]">
          No agents registered yet.
        </div>
        <div className="mono text-[9px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.3)] mt-1">
          Sprint 3 Analyst + Elder seed on first Inngest run
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      {/* Agent grid */}
      <div className={`flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 ${selected ? 'min-w-0' : ''}`}>
        {agents.map((agent) => {
          const color = archetypeColor(agent.archetype);
          const budgetPct =
            agent.budget && agent.budget.limit_usd_per_period > 0
              ? Math.round(
                  (agent.budget.current_spent_usd / agent.budget.limit_usd_per_period) * 100,
                )
              : 0;
          const isSelected = selected?.id === agent.id;

          return (
            <button
              key={agent.id}
              onClick={() => setSelected(isSelected ? null : agent)}
              className="bg-[#141416] hover:bg-[#1A1A1D] rounded-xl p-4 text-left border transition-all"
              style={{
                borderColor: isSelected ? color.border : '#1F1F23',
                boxShadow: isSelected ? `0 0 0 1px ${color.dot}40` : 'none',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor: agent.active ? '#22C55E' : '#6B7280',
                    boxShadow: agent.active ? '0 0 4px #22C55E60' : 'none',
                  }}
                />
                <span className="mono text-[12px] text-[#E5E5E7] font-medium truncate">
                  {agent.name}
                </span>
              </div>
              <div className="mono text-[10px] uppercase tracking-[0.12em] mb-2" style={{ color: color.label }}>
                {agent.archetype}
              </div>
              {agent.budget && (
                <div className="mt-2">
                  <div className="flex justify-between mono text-[9px] text-[rgba(229,229,231,0.4)] mb-1">
                    <span>Budget</span>
                    <span>
                      ${agent.budget.current_spent_usd.toFixed(2)} /{' '}
                      ${agent.budget.limit_usd_per_period}
                    </span>
                  </div>
                  <div className="w-full bg-[#1F1F23] rounded-full h-1">
                    <div
                      className="h-1 rounded-full transition-all"
                      style={{
                        width: `${Math.min(budgetPct, 100)}%`,
                        backgroundColor: budgetPct > 80 ? '#EF4444' : '#FF6B2B',
                      }}
                    />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-72 shrink-0 bg-[#141416] rounded-xl p-5 border border-[#1F1F23] self-start">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: selected.active ? '#22C55E' : '#6B7280' }}
            />
            <h3 className="mono text-[14px] text-[#E5E5E7] font-medium truncate">{selected.name}</h3>
          </div>
          <div
            className="mono text-[10px] uppercase tracking-[0.12em] mb-3"
            style={{ color: archetypeColor(selected.archetype).label }}
          >
            {selected.archetype} · {selected.active ? 'Active' : 'Inactive'}
          </div>

          {selected.specialty && (
            <p className="mono text-[12px] text-[rgba(229,229,231,0.7)] mb-4 leading-relaxed">
              {selected.specialty}
            </p>
          )}

          {selected.budget && (
            <div className="mb-4">
              <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-1">
                Budget
              </div>
              <div className="mono text-[12px] text-[#E5E5E7]">
                ${selected.budget.current_spent_usd.toFixed(2)} / $
                {selected.budget.limit_usd_per_period}
              </div>
              <div className="mono text-[10px] text-[rgba(229,229,231,0.4)] mt-0.5">
                Resets {new Date(selected.budget.resets_at).toLocaleDateString()} ·{' '}
                {selected.budget.period_days}d period
              </div>
            </div>
          )}

          {selected.config &&
            (selected.config.watches_agents?.length > 0 ||
              selected.config.watches_signal_topics?.length > 0) && (
              <div className="mb-4">
                <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-1">
                  Watches
                </div>
                {selected.config.watches_agents?.length > 0 && (
                  <div className="mono text-[10px] text-[rgba(229,229,231,0.6)] mb-0.5">
                    Agents: {selected.config.watches_agents.join(', ')}
                  </div>
                )}
                {selected.config.watches_signal_topics?.length > 0 && (
                  <div className="mono text-[10px] text-[rgba(229,229,231,0.6)]">
                    Topics: {selected.config.watches_signal_topics.join(', ')}
                  </div>
                )}
              </div>
            )}

          <div className="pt-3 border-t border-[#1F1F23] space-y-1">
            <div className="mono text-[9px] text-[rgba(229,229,231,0.3)] break-all">
              ID: {selected.id}
            </div>
            <div className="mono text-[9px] text-[rgba(229,229,231,0.3)]">
              Created: {new Date(selected.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
