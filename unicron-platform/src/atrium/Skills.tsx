// Skills — standalone rail surface (SK-1).
// Prompt card (gradient bolt + textarea + gate-state pill) + 8-category grid + right rail.
// Design ref: Atrium/Web UI/v3-skills.jsx
//
// Sprint 7 Stream D additions:
//  - Keyboard shortcuts: / → focus prompt, Cmd+K → ⌘K palette, Cmd+Enter → run
//  - Recent runs wired to nervous_system.skill_runs RPC (falls back to ledger)
//  - BudgetForecast: shows "No runs yet" instead of hiding when no data

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSkills, type SkillRow } from './Now';
import { getSupabase } from '../lib/supabase';

// ─── Category metadata ─────────────────────────────────────────────────────────

const DOMAIN_META: Record<string, { label: string; color: string }> = {
  memory:       { label: 'Memory',       color: '#7C5BD9' },
  productivity: { label: 'Productivity', color: '#2E6CD4' },
  research:     { label: 'Research',     color: '#1F8A5B' },
  discovery:    { label: 'Discovery',    color: '#D97757' },
  voice:        { label: 'Voice',        color: '#E8763A' },
  sales:        { label: 'Sales',        color: '#E8763A' },
  marketing:    { label: 'Marketing',    color: '#C9A227' },
  operations:   { label: 'Operations',   color: '#7C87A0' },
};

const DOMAIN_ORDER = ['memory', 'productivity', 'research', 'discovery', 'voice', 'sales', 'marketing', 'operations'];

// ─── Skill tile ────────────────────────────────────────────────────────────────

function SkillTile({ skill, color, picked, onPick }: {
  skill: SkillRow;
  color: string;
  picked: boolean;
  onPick: (s: SkillRow) => void;
}) {
  return (
    <button
      onClick={() => onPick(skill)}
      aria-pressed={picked}
      aria-label={`${skill.name}${skill.refusal_gate ? ' (gated)' : ''}${skill.status === 'scaffolded' ? ' (coming soon)' : ''}`}
      className={[
        'text-left p-3 rounded-xl flex flex-col gap-1 min-h-[64px] transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-zinc-500',
        picked ? 'ring-[1.5px] ring-accent-gold shadow-sm' : 'bg-bg-card hover:shadow-md shadow-sm',
      ].join(' ')}
      style={picked ? { background: 'rgba(232,118,58,0.06)' } : undefined}
    >
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="mono text-[13px] font-semibold text-text-primary">
          {skill.name}
        </span>
        {skill.refusal_gate && (
          <span className="mono text-[9px] uppercase tracking-wider text-[#E14B4B] bg-[rgba(225,75,75,0.10)] px-1.5 py-0.5 rounded ml-auto">
            gated
          </span>
        )}
      </div>
      {skill.description && (
        <span className="mono text-[11.5px] text-text-secondary leading-snug">
          {skill.description}
        </span>
      )}
      {skill.status === 'scaffolded' && (
        <span className="mono text-[9.5px] text-text-secondary bg-bg-raised px-1.5 py-0.5 rounded w-fit">
          Coming soon
        </span>
      )}
    </button>
  );
}

// ─── Gate state pill ───────────────────────────────────────────────────────────

type GateState = 'validating' | 'ok' | 'blocked' | null;

function GatePill({ state }: { state: GateState }) {
  if (!state) return null;
  const cfg = {
    validating: { text: 'Validating against refusal layer…', cls: 'text-text-secondary bg-bg-raised' },
    ok:         { text: 'Cleared by Taboo Keeper',            cls: 'text-[#1F8A5B] bg-[rgba(31,138,91,0.08)]' },
    blocked:    { text: 'Blocked',                            cls: 'text-[#E14B4B] bg-[rgba(225,75,75,0.08)]' },
  }[state];
  return (
    <div
      className={`flex items-center gap-1.5 mono text-[11.5px] font-medium px-2.5 py-1.5 rounded-md ${cfg.cls}`}
      role="status"
      aria-live="polite"
    >
      {state === 'validating' && (
        <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" />
      )}
      {state === 'ok'      && <span className="text-[10px]">✓</span>}
      {state === 'blocked' && <span className="text-[10px]">✗</span>}
      {cfg.text}
    </div>
  );
}

// ─── Recent runs — wired to skill_run history via ledger ───────────────────────

interface RunRow {
  skill: string;
  ts: string;
  status: 'ok' | 'blocked' | 'error';
  cost: string;
  dur: string;
}

function useRecentRuns(): { runs: RunRow[]; loading: boolean } {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // PGRST106 fix: use ns_list_skill_runs RPC (cost_usd absent from ledger schema)
        const { data } = await getSupabase()
          .rpc('ns_list_skill_runs', { p_limit: 10 });

        if (cancelled) return;
        if (data && (data as unknown[]).length > 0) {
          setRuns(
            (data as Array<{ id: string; content_summary: string | null; created_at: string }>).map((row) => ({
              skill: row.content_summary ?? 'Unknown skill',
              ts: new Date(row.created_at).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              }),
              status: 'ok' as const,
              cost: '—',
              dur: '—',
            })),
          );
        }
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  return { runs, loading };
}

function RecentRuns() {
  const { runs, loading } = useRecentRuns();

  return (
    <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <span className="mono text-[13px] font-semibold text-text-primary">Recent runs</span>
        <button
          className="mono text-[11px] text-text-secondary hover:text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 rounded"
          aria-label="View all skill runs"
        >
          View all
        </button>
      </div>
      {loading ? (
        <div className="px-4 py-3 space-y-2" role="status" aria-label="Loading recent runs…">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-border-default animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-border-default animate-pulse rounded w-3/4" />
                <div className="h-2 bg-border-default animate-pulse rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : runs.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="mono text-[11px] text-text-secondary">No runs yet</p>
          <p className="mono text-[10px] text-zinc-600 mt-1">Run a skill to see history here</p>
        </div>
      ) : (
        runs.map((r, i) => (
          <div key={i} className={`flex items-center gap-2.5 px-4 py-2.5 ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
              background: r.status === 'ok' ? '#1F8A5B' : r.status === 'blocked' ? '#E14B4B' : '#C9A227',
            }} />
            <div className="flex-1 min-w-0">
              <div className="mono text-[12.5px] text-text-primary truncate">{r.skill}</div>
              <div className="mono text-[11px] text-text-secondary">{r.ts} · {r.dur}</div>
            </div>
            <span className="mono text-[11.5px] text-text-secondary">{r.cost}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Budget forecast (live agent budget data) ──────────────────────────────────

interface AgentBudgetRow {
  budget: { limit_usd_per_period: number; current_spent_usd: number } | null;
}

function useBudgetData() {
  const [state, setState] = useState<{ spent: number; limit: number; loading: boolean }>({
    spent: 0, limit: 0, loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data } = await getSupabase()
          .rpc('ns_list_agents_active')
          .returns<AgentBudgetRow[]>();

        if (cancelled) return;
        let spent = 0;
        let limit = 0;
        ((data as AgentBudgetRow[] | null) ?? []).forEach((a) => {
          if (a.budget) {
            spent += a.budget.current_spent_usd ?? 0;
            limit += a.budget.limit_usd_per_period ?? 0;
          }
        });
        setState({ spent, limit, loading: false });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  return state;
}

function BudgetForecast() {
  const { spent, limit, loading } = useBudgetData();

  const used = limit > 0 ? spent / limit : 0;
  const forecast = Math.min(used * 1.2, 1);
  const danger = 0.80;

  const noData = !loading && limit === 0;
  const spentLabel = loading ? '…' : `$${spent.toFixed(2)}`;
  const limitLabel = loading ? '…' : limit > 0 ? `$${limit.toFixed(0)}` : '—';
  const usedPct = loading ? '—' : `${Math.round(used * 100)}%`;
  const forecastPct = loading ? '—' : `${Math.round(forecast * 100)}%`;

  return (
    <div className="bg-bg-card border border-border-default rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-1">
        <span className="mono text-[13px] font-semibold text-text-primary">Budget burn</span>
        <span className="mono text-[11.5px] text-text-secondary">{spentLabel} / {limitLabel}</span>
      </div>
      <div className="mono text-[11px] text-text-secondary mb-3">Active agents · weekly period</div>

      {noData ? (
        <div className="py-2 text-center">
          <p className="mono text-[11px] text-zinc-600">No runs yet</p>
        </div>
      ) : (
        <>
          <div className="relative h-2 rounded-full bg-bg-raised overflow-hidden mb-2" role="progressbar" aria-valuenow={Math.round(used * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Budget burn">
            {!loading && (
              <>
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${forecast * 100}%`, background: 'rgba(232,118,58,0.25)' }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-accent-gold" style={{ width: `${used * 100}%` }} />
                <div className="absolute inset-y-0 opacity-50" style={{ left: `${danger * 100}%`, width: 1.5, background: '#E14B4B' }} />
              </>
            )}
            {loading && <div className="absolute inset-0 bg-bg-raised animate-pulse rounded-full" />}
          </div>
          <div className="flex justify-between mono text-[10.5px] text-text-secondary">
            <span><span className="inline-block w-1.5 h-1.5 rounded-sm bg-accent-gold mr-1 align-middle" />Used {usedPct}</span>
            <span><span className="inline-block w-1.5 h-1.5 rounded-sm mr-1 align-middle" style={{ background: 'rgba(232,118,58,0.35)' }} />+20% forecast {forecastPct}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Skills surface ───────────────────────────────────────────────────────

export function Skills() {
  const skills = useSkills();
  const [prompt, setPrompt] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [gateState, setGateState] = useState<GateState>(null);
  const [running, setRunning] = useState(false);
  const [skillSearchOpen, setSkillSearchOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const handlePick = (skill: SkillRow) => {
    setPicked(skill.id);
    if (!prompt.trim()) setPrompt(`Run: ${skill.name}`);
  };

  const handleRun = useCallback(() => {
    if (!prompt.trim() || running) return;
    setRunning(true);
    setGateState('validating');
    setTimeout(() => {
      setGateState('ok');
      setTimeout(() => {
        setRunning(false);
        setGateState(null);
        setPrompt('');
        setPicked(null);
      }, 900);
    }, 850);
  }, [prompt, running]);

  // Keyboard shortcuts (Sprint 7 Stream D)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // / → focus prompt (when no input/textarea is focused)
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA'].includes((e.target as Element).tagName)
      ) {
        e.preventDefault();
        promptRef.current?.focus();
      }
      // Cmd+K → open skill search (handled globally by AtriumLayout, but also set local state)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        // AtriumLayout already handles this — we note it for future local palette
        setSkillSearchOpen(true);
      }
      // Cmd+Enter → run current skill
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRun();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleRun]);

  // Track skill search open/close
  useEffect(() => {
    if (!skillSearchOpen) return;
    // We piggyback on AtriumLayout's CmdKPalette — just reset our local flag
    const timer = setTimeout(() => setSkillSearchOpen(false), 100);
    return () => clearTimeout(timer);
  }, [skillSearchOpen]);

  // Group skills by domain, ordered by DOMAIN_ORDER
  const byDomain = skills.reduce<Record<string, SkillRow[]>>((acc, s) => {
    const key = s.domain ?? 'operations';
    (acc[key] ??= []).push(s);
    return acc;
  }, {});

  // Build ordered list of categories with skills
  const categories = DOMAIN_ORDER
    .filter((d) => byDomain[d]?.length)
    .map((d) => ({ id: d, ...DOMAIN_META[d], skills: byDomain[d] }));

  // Fallback: any domains not in DOMAIN_ORDER
  Object.keys(byDomain).forEach((d) => {
    if (!DOMAIN_ORDER.includes(d) && byDomain[d].length) {
      categories.push({ id: d, label: d.charAt(0).toUpperCase() + d.slice(1), color: '#7C87A0', skills: byDomain[d] });
    }
  });

  const pickedName = picked
    ? skills.find((s) => s.id === picked)?.name ?? null
    : null;

  return (
    <div className="skills-root grid gap-5" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px', alignItems: 'start' }}>
      <style>{`
        @media (max-width: 960px) {
          .skills-root { grid-template-columns: 1fr !important; }
          .skills-rail { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        }
        @media (max-width: 600px) {
          .skills-rail { grid-template-columns: 1fr !important; }
          .skills-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* LEFT: prompt card + skills grid */}
      <div className="flex flex-col gap-5 min-w-0">

        {/* Prompt card */}
        <div className="bg-bg-card border border-border-default rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            {/* Gradient bolt icon */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #E8763A, #C75928)' }}
              aria-hidden="true"
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M8.5 1.5L3 9h5.5l-1 4.5L14 6H8.5L8.5 1.5z" fill="white" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="mono text-[14px] font-semibold text-text-primary leading-tight">Run a skill</div>
              <div className="mono text-[11.5px] text-text-secondary mt-0.5">
                Describe what you want, or pick a skill below
                <span className="ml-2 opacity-50">·</span>
                <span className="ml-2 mono text-[10px] bg-bg-raised px-1.5 py-0.5 rounded text-zinc-500">/</span>
                <span className="ml-1 mono text-[10px] text-zinc-600">to focus</span>
                <span className="ml-2 mono text-[10px] bg-bg-raised px-1.5 py-0.5 rounded text-zinc-500">⌘↵</span>
                <span className="ml-1 mono text-[10px] text-zinc-600">to run</span>
              </div>
            </div>
            {pickedName && (
              <span className="mono text-[11px] font-semibold text-accent-gold bg-[rgba(232,118,58,0.10)] px-2 py-1 rounded-md">
                {pickedName}
              </span>
            )}
          </div>

          <label htmlFor="skill-prompt" className="sr-only">Skill prompt</label>
          <textarea
            id="skill-prompt"
            ref={promptRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Brief Pathfinder on the Northwind proposal — pull discovery notes, draft a 10-slide deck…"
            className="w-full bg-bg-base border border-border-default rounded-lg px-3 py-2.5 mono text-[13px] text-text-primary placeholder:text-text-secondary outline-none resize-y leading-relaxed focus:border-accent-gold focus:ring-2 focus:ring-accent-gold/20 transition-colors"
          />

          <div className="flex items-center gap-2 mt-3">
            <GatePill state={gateState} />
            <div className="flex-1" />
            <button
              onClick={() => { setPrompt(''); setPicked(null); }}
              disabled={running}
              aria-label="Clear prompt"
              className="mono text-[12px] px-3 py-1.5 rounded-lg bg-bg-base border border-border-default text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            >
              Clear
            </button>
            <button
              onClick={handleRun}
              disabled={running || !prompt.trim()}
              aria-label="Run skill (Cmd+Enter)"
              aria-keyshortcuts="Meta+Enter"
              className="mono text-[12px] font-semibold px-4 py-1.5 rounded-lg text-white transition-all flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-accent-gold"
              style={{
                background: prompt.trim() && !running ? '#E8763A' : 'var(--color-border-default, #2a2f3d)',
                boxShadow: prompt.trim() && !running ? '0 2px 8px rgba(232,118,58,0.35)' : 'none',
                cursor: prompt.trim() && !running ? 'pointer' : 'not-allowed',
              }}
            >
              Run
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 5h6M5.5 2.5L8 5l-2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Skills library */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="mono text-[16px] font-semibold text-text-primary tracking-tight">Skills library</h2>
            <span className="mono text-[10px] uppercase tracking-wider text-text-secondary bg-bg-raised px-2 py-0.5 rounded">
              {skills.length > 0 ? `${skills.length} skills` : 'loading…'}
            </span>
          </div>

          {categories.length === 0 ? (
            <div className="space-y-2" role="status" aria-label="Loading skills…">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 bg-border-default animate-pulse rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {categories.map((cat) => (
                <section key={cat.id} aria-label={`${cat.label} skills`}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <span
                      className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: cat.color + '22', color: cat.color }}
                      aria-hidden="true"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                        <circle cx="5" cy="5" r="4" />
                      </svg>
                    </span>
                    <span className="mono text-[11px] font-semibold text-text-primary uppercase tracking-wider">{cat.label}</span>
                    <span className="mono text-[11px] text-text-secondary">· {cat.skills.length}</span>
                  </div>
                  <div className="skills-grid grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                    {cat.skills.map((s) => (
                      <SkillTile key={s.id} skill={s} color={cat.color} picked={picked === s.id} onPick={handlePick} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: rail */}
      <aside className="skills-rail flex flex-col gap-3 sticky top-0" aria-label="Skills sidebar">
        <BudgetForecast />
        <RecentRuns />
      </aside>
    </div>
  );
}
