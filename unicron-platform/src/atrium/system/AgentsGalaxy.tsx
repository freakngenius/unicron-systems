// AgentsGalaxy.tsx — Sprint 3 Stream D + SY-2
// Displays all agents from nervous_system.agents via ns_list_agents() RPC.
// Galaxy: SVG concentric rings visualization. Roster: card grid below.
// Click a node or card to open the detail panel.

import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import AgentDetailModal, { type AgentRecord } from './AgentDetailModal';

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
  connected_tools?: string[];
  connected_agents?: string[];
  connected_sections?: string[];
  data_sources?: string[];
}

interface Agent {
  id: string;
  name: string;
  archetype: string;
  specialty: string | null;
  description?: string | null;
  guiding_prompt?: string | null;
  schedule_cron?: string | null;
  active: boolean;
  budget: Budget | null;
  config: Config | null;
  last_run_at?: string | null;
  last_run_synthetic?: boolean | null;
  created_at: string;
  updated_at?: string;
  // R7 Option 2: demo-flagged agents render at 60% opacity + DEMO pill;
  // real agents render at 100% with live load percentage.
  demo?: boolean;
}

// 8 design-fiction archetypes per R7 Option 2 — render alongside the 4 real
// agents (Analyst, Elder, Orchestrator, Taboo Keeper) returned by ns_list_agents.
// Demo agents land in upcoming sprints; until then they communicate the target
// fleet shape so the constellation reads as v3 design intent.
const DEMO_AGENTS: Agent[] = [
  { id: 'demo-pathfinder',  name: 'Pathfinder',  archetype: 'operator',  specialty: 'Customer-facing lead intelligence — Sprint 6',  active: false, budget: null, config: null, created_at: '', demo: true },
  { id: 'demo-curator',     name: 'Curator',     archetype: 'curator',   specialty: 'Vault hygiene + decay sweeps — Sprint 6',        active: false, budget: null, config: null, created_at: '', demo: true },
  { id: 'demo-researcher',  name: 'Researcher',  archetype: 'research',  specialty: 'Deep dives + source verification — Sprint 7',    active: false, budget: null, config: null, created_at: '', demo: true },
  { id: 'demo-trend-scout', name: 'Trend Scout', archetype: 'research',  specialty: 'Competitor + market trend monitor — Sprint 7',   active: false, budget: null, config: null, created_at: '', demo: true },
  { id: 'demo-pipe-hunter', name: 'Pipe Hunter', archetype: 'sales',     specialty: 'Cross-pollination + lead surface — Sprint 6',    active: false, budget: null, config: null, created_at: '', demo: true },
  { id: 'demo-architect',   name: 'Architect',   archetype: 'builder',   specialty: 'Proposes + tunes system config — Sprint 5+',     active: false, budget: null, config: null, created_at: '', demo: true },
  { id: 'demo-boundary',    name: 'Boundary',    archetype: 'guardian',  specialty: 'Tier-2 source + adjacency guardrails — Sprint 7',active: false, budget: null, config: null, created_at: '', demo: true },
  { id: 'demo-janitor',     name: 'Janitor',     archetype: 'operator',  specialty: 'Sweeps stale state + rotates secrets — Sprint 7',active: false, budget: null, config: null, created_at: '', demo: true },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ARCHETYPE_COLORS: Record<string, { dot: string; label: string; border: string }> = {
  orchestrator: {
    dot: 'var(--accent)',
    label: 'var(--accent)',
    border: 'rgba(232,118,58,0.25)',
  },
  analyst: {
    dot: '#6081BE',
    label: '#6081BE',
    border: 'rgba(111,149,214,0.25)',
  },
  elder: {
    dot: '#8B7CD8',
    label: '#8B7CD8',
    border: '#8B7CD840',
  },
  taboo_keeper: {
    dot: '#E14B4B',
    label: '#E14B4B',
    border: 'rgba(221,98,98,0.25)',
  },
  specialist: {
    dot: '#2E8E66',
    label: '#2E8E66',
    border: 'rgba(79,178,134,0.25)',
  },
  // R7 Option 2 — design-fiction archetypes for the 8 demo agents
  operator: { dot: '#6081BE', label: '#6081BE', border: 'rgba(96,129,190,0.25)' },
  curator:  { dot: '#7355E5', label: '#7355E5', border: 'rgba(115,85,229,0.25)' },
  research: { dot: '#5BB5BC', label: '#5BB5BC', border: 'rgba(91,181,188,0.25)' },
  sales:    { dot: '#E8763A', label: '#E8763A', border: 'rgba(232,118,58,0.25)' },
  builder:  { dot: '#C28A1F', label: '#C28A1F', border: 'rgba(194,138,31,0.25)' },
  guardian: { dot: '#E14B4B', label: '#E14B4B', border: 'rgba(225,75,75,0.25)' },
};

const DEFAULT_COLOR = {
  dot: '#6B7280',
  label: '#6B7280',
  border: '#6B728040',
};

function archetypeColor(arch: string) {
  return ARCHETYPE_COLORS[arch] ?? DEFAULT_COLOR;
}

// Archetype → ring index mapping for galaxy layout.
// Real agents inner; demo-fiction outer per R7 Option 2.
const RING_ARCHETYPES = [
  ['taboo_keeper', 'orchestrator'],            // inner — core/guardian (real)
  ['analyst', 'elder', 'guardian'],            // mid — insight/memory + fictional guardian
  ['specialist', 'operator', 'curator', 'research', 'sales', 'builder'], // outer — fiction
];

const RING_RADII = [72, 130, 182];

// ─── Galaxy SVG ───────────────────────────────────────────────────────────────

function AgentGalaxySVG({
  agents,
  selectedId,
  onSelect,
}: {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (a: Agent | null) => void;
}) {
  const cx = 300;
  const cy = 155;

  // Distribute agents into rings
  const byRing: Agent[][] = [[], [], []];
  agents.forEach((a) => {
    const ri = RING_ARCHETYPES.findIndex((archs) => archs.includes(a.archetype));
    (ri >= 0 ? byRing[ri] : byRing[2]).push(a);
  });

  // Compute node positions
  const nodes = byRing.flatMap((ring, ri) =>
    ring.map((agent, i) => {
      const theta =
        ring.length === 1
          ? -Math.PI / 2
          : (i / ring.length) * Math.PI * 2 - Math.PI / 2;
      const loadFrac =
        agent.budget && agent.budget.limit_usd_per_period > 0
          ? Math.min(agent.budget.current_spent_usd / agent.budget.limit_usd_per_period, 1)
          : 0.25;
      return {
        agent,
        x: cx + Math.cos(theta) * RING_RADII[ri],
        y: cy + Math.sin(theta) * RING_RADII[ri],
        r: 8 + loadFrac * 6,
      };
    })
  );

  const archetypes = [...new Set(agents.map((a) => a.archetype))];

  return (
    <div className="bg-bg-card border border-border-default rounded-xl p-4 mb-5">
      <div className="mono text-[12px] font-semibold text-text-primary mb-1">Agent fleet</div>
      <div className="mono text-[10px] text-text-muted mb-3">
        {agents.length} agents · click a node to inspect
      </div>
      <svg viewBox="0 0 600 310" style={{ width: '100%', height: 280 }}>
        <defs>
          <radialGradient id="galaxyGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(232,118,58,0.08)" />
            <stop offset="100%" stopColor="rgba(20,20,22,0)" />
          </radialGradient>
        </defs>
        <rect width="600" height="310" fill="url(#galaxyGlow)" />

        {/* Concentric dashed rings */}
        {RING_RADII.map((r) => (
          <circle
            key={r}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
        ))}

        {/* Center core */}
        <circle cx={cx} cy={cy} r={22} fill="var(--accent)" />
        <circle cx={cx} cy={cy} r={22} fill="none" stroke="rgba(232,118,58,0.14)" strokeWidth={9} />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#FFF" fontFamily="monospace">
          CORE
        </text>

        {/* Agent nodes — demo-flagged render at 60% opacity with DEMO pill */}
        {nodes.map(({ agent, x, y, r }) => {
          const color = archetypeColor(agent.archetype).dot;
          const isSelected = selectedId === agent.id;
          const label = agent.name.length > 13 ? agent.name.slice(0, 12) + '…' : agent.name;
          const nodeOpacity = agent.demo ? 0.6 : (agent.active ? 0.88 : 0.35);
          return (
            <g
              key={agent.id}
              onClick={() => onSelect(isSelected ? null : agent)}
              style={{ cursor: 'pointer' }}
            >
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeWidth="1" opacity={agent.demo ? 0.08 : 0.14} />
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={color}
                opacity={nodeOpacity}
              />
              {agent.demo && (
                <circle cx={x} cy={y} r={r + 2} fill="none" stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
              )}
              {isSelected && (
                <circle cx={x} cy={y} r={r + 4} fill="none" stroke={color} strokeWidth="1.5" opacity="0.65" />
              )}
              {!agent.demo && !agent.active && (
                <circle cx={x} cy={y} r={r + 3} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" strokeDasharray="2 3" />
              )}
              <text
                x={x}
                y={y + r + 13}
                textAnchor="middle"
                fontSize="10"
                fill={agent.demo ? 'rgba(126,138,163,0.85)' : 'rgba(70,80,106,0.85)'}
                fontFamily="monospace"
              >
                {label}
              </text>
              {agent.demo && (
                <g transform={`translate(${x + r - 1}, ${y - r - 8})`}>
                  <rect x={-13} y={-7} width={26} height={11} rx={2} fill="rgba(96,129,190,0.15)" stroke="rgba(96,129,190,0.45)" strokeWidth="0.5" />
                  <text x={0} y={1.5} textAnchor="middle" fontSize="7" fontWeight="700" fill="#6081BE" fontFamily="monospace">
                    DEMO
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Archetype legend */}
      {archetypes.length > 0 && (
        <div className="flex flex-wrap gap-4 mt-2 justify-center">
          {archetypes.map((arch) => (
            <div key={arch} className="flex items-center gap-1.5 mono text-[10px] text-text-secondary">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: archetypeColor(arch).dot }} />
              <span style={{ textTransform: 'capitalize' }}>{arch.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchAgents(): Promise<Agent[]> {
  const { data, error } = await getSupabase().rpc('ns_list_agents');
  if (error) {
    console.error('[AgentsGalaxy] fetchAgents error:', error.message);
    return [];
  }
  return (data as Agent[]) ?? [];
}

// ─── Component ────────────────────────────────────────────────────────────────

async function fetchActorId(): Promise<string | null> {
  const sb = getSupabase();
  const { data: sessionData } = await sb.auth.getSession();
  const email = sessionData.session?.user?.email;
  if (!email) return null;
  const { data, error } = await sb.rpc('ns_get_team_member_by_email', { p_email: email });
  if (error) {
    console.warn('[AgentsGalaxy] fetchActorId error:', error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row?.id as string | undefined) ?? null;
}

export default function AgentsGalaxy() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);

  async function refresh() {
    const real = await fetchAgents();
    const realFlagged = real.map((a) => ({ ...a, demo: false }));
    setAgents([...realFlagged, ...DEMO_AGENTS]);
  }

  useEffect(() => {
    fetchAgents().then((real) => {
      const realFlagged = real.map((a) => ({ ...a, demo: false }));
      setAgents([...realFlagged, ...DEMO_AGENTS]);
      setLoading(false);
    });
    fetchActorId().then(setActorId);
  }, []);

  function openAgent(a: Agent | null) {
    setSelected(a);
    if (a && !a.demo) {
      setEditing(a);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 bg-bg-card rounded-xl animate-pulse border border-border-default" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* SVG galaxy visualization */}
      <AgentGalaxySVG agents={agents} selectedId={selected?.id ?? null} onSelect={openAgent} />

      {/* Roster + detail panel — real agents sort first per R7 Option 2 */}
      <div className="flex gap-4">
      {/* Agent grid */}
      <div className={`flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 ${selected ? 'min-w-0' : ''}`}>
        {[...agents].sort((a, b) => Number(!!a.demo) - Number(!!b.demo)).map((agent) => {
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
              onClick={() => openAgent(isSelected ? null : agent)}
              className="bg-bg-card hover:bg-bg-raised rounded-xl p-4 text-left border transition-all relative"
              style={{
                borderColor: isSelected ? color.border : 'var(--border-default)',
                boxShadow: isSelected ? `0 0 0 1px ${color.dot}40` : 'none',
                opacity: agent.demo ? 0.6 : 1,
              }}
            >
              {agent.demo && (
                <span className="absolute top-2 right-2 text-[9px] uppercase tracking-[0.12em] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(96,129,190,0.12)', color: '#6081BE' }}>
                  DEMO
                </span>
              )}
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor: agent.demo ? '#BAC2D2' : (agent.active ? '#2E8E66' : '#6B7280'),
                    boxShadow: agent.active && !agent.demo ? '0 0 4px #2E8E6660' : 'none',
                  }}
                />
                <span className="mono text-[12px] text-text-primary font-medium truncate">
                  {agent.name}
                </span>
              </div>
              <div className="mono text-[10px] uppercase tracking-[0.12em] mb-2" style={{ color: color.label }}>
                {agent.archetype.replace(/_/g, ' ')}
              </div>
              {agent.budget && (
                <div className="mt-2">
                  <div className="flex justify-between mono text-[9px] text-text-muted mb-1">
                    <span>Budget</span>
                    <span>
                      ${agent.budget.current_spent_usd.toFixed(2)} /{' '}
                      ${agent.budget.limit_usd_per_period}
                    </span>
                  </div>
                  <div className="w-full bg-bg-raised rounded-full h-1">
                    <div
                      className="h-1 rounded-full transition-all"
                      style={{
                        width: `${Math.min(budgetPct, 100)}%`,
                        backgroundColor: budgetPct > 80 ? '#E14B4B' : 'var(--accent)',
                      }}
                    />
                  </div>
                </div>
              )}
              {agent.demo && (
                <div className="mt-2 text-[10px] text-text-muted leading-snug">
                  Demo data — production agents land in upcoming sprints
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-72 shrink-0 bg-bg-card rounded-xl p-5 border border-border-default self-start" style={{ minWidth: '18rem' }}>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: selected.active ? '#2E8E66' : '#6B7280' }}
            />
            <h3 className="mono text-[14px] text-text-primary font-medium truncate">{selected.name}</h3>
          </div>
          <div
            className="mono text-[10px] uppercase tracking-[0.12em] mb-3"
            style={{ color: archetypeColor(selected.archetype).label }}
          >
            {selected.archetype} · {selected.active ? 'Active' : 'Inactive'}
          </div>

          {selected.specialty && (
            <p className="mono text-[12px] text-text-secondary mb-4 leading-relaxed">
              {selected.specialty}
            </p>
          )}

          {selected.budget && (
            <div className="mb-4">
              <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted mb-1">
                Budget
              </div>
              <div className="mono text-[12px] text-text-primary">
                ${selected.budget.current_spent_usd.toFixed(2)} / $
                {selected.budget.limit_usd_per_period}
              </div>
              <div className="mono text-[10px] text-text-muted mt-0.5">
                Resets {new Date(selected.budget.resets_at).toLocaleDateString()} ·{' '}
                {selected.budget.period_days}d period
              </div>
            </div>
          )}

          {selected.config &&
            (selected.config.watches_agents?.length > 0 ||
              selected.config.watches_signal_topics?.length > 0) && (
              <div className="mb-4">
                <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted mb-1">
                  Watches
                </div>
                {selected.config.watches_agents?.length > 0 && (
                  <div className="mono text-[10px] text-text-secondary mb-0.5">
                    Agents: {selected.config.watches_agents.join(', ')}
                  </div>
                )}
                {selected.config.watches_signal_topics?.length > 0 && (
                  <div className="mono text-[10px] text-text-secondary">
                    Topics: {selected.config.watches_signal_topics.join(', ')}
                  </div>
                )}
              </div>
            )}

          <div className="pt-3 border-t border-border-default space-y-1">
            <div className="mono text-[9px] text-text-muted break-all">
              ID: {selected.id}
            </div>
            <div className="mono text-[9px] text-text-muted">
              Created: {new Date(selected.created_at).toLocaleDateString()}
            </div>
            {!selected.demo && (
              <button
                onClick={() => setEditing(selected)}
                className="mt-2 mono text-[11px] px-3 py-1.5 rounded border border-border-default text-text-secondary hover:text-text-primary w-full text-left"
              >
                Edit in cockpit →
              </button>
            )}
          </div>
        </div>
      )}
      </div>
      {editing && (
        <AgentDetailModal
          agentId={editing.id}
          initialAgent={editing as AgentRecord}
          actorId={actorId}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); }}
        />
      )}
    </div>
  );
}
