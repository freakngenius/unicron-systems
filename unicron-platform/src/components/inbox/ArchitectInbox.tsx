import { useEffect, useMemo, useState } from 'react';
import { ProposalCard } from './ProposalCard';
import { useSystem, type AgentDef, type DataSource } from '../../context/SystemContext';
import {
  approveProposal,
  dismissProposal,
  listProposals,
} from '../../lib/architectClient';
import type { Proposal, ProposalCategory } from '../../lib/contracts/architect';

type Filter = 'all' | ProposalCategory;

// TODO[stream-d-contract,src/components/inbox/ArchitectInbox.tsx:fallbackApply]:
// When VITE_ARCHITECT_API_ENABLED=true, the server-side approve handler
// owns the SystemContext mutation; the response carries the new
// SystemConfig. Until D ships we fall back to client-side apply with
// hardcoded category-keyed handlers (matches the pre-C3 demo behavior).

export function ArchitectInbox() {
  const [items, setItems] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const { addAgent, addDataSource, updateAgent, config } = useSystem();

  useEffect(() => {
    let cancelled = false;
    listProposals()
      .then((res) => {
        if (cancelled) return;
        setItems(res.proposals);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const all = items.length;
    const sources = items.filter((i) => i.category === 'sources').length;
    const agents = items.filter((i) => i.category === 'agents').length;
    const tuning = items.filter((i) => i.category === 'tuning').length;
    return { all, sources, agents, tuning };
  }, [items]);

  const visible = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((i) => i.category === filter);
  }, [items, filter]);

  const remove = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
    dismissProposal(id).catch(() => {
      // Surface in console; not blocking the UI optimistic-remove.
    });
  };

  const fallbackApply = (proposal: Proposal) => {
    if (proposal.apply) {
      const a = proposal.apply;
      if (a.kind === 'add-source') {
        addDataSource(a.source);
        if (a.watcher) addAgent(a.watcher);
      } else if (a.kind === 'add-agent') {
        addAgent(a.agent);
      } else if (a.kind === 'update-agent') {
        updateAgent(a.agentId, a.patch);
      }
      return;
    }
    // Pre-C3 hardcoded category fallbacks (preserved so the demo path still
    // works when running against the mock client without `apply` payloads).
    if (proposal.category === 'sources') {
      const src: DataSource = {
        id: `src-travis-${Date.now()}`,
        type: 'permits',
        label: 'Travis County permit portal',
        jurisdiction: 'Travis County, TX',
        pollFrequencyMs: 60 * 60 * 1000,
        enabled: true,
        watcherRole: 'PermitWatcher',
        weight: 0.18,
      };
      addDataSource(src);
      const permit = config.agents.find(
        (a) => a.layer === 2 && a.role === 'PermitWatcher',
      );
      if (permit) {
        const replica: AgentDef = { ...permit, id: `${permit.id}-travis-${Date.now()}` };
        addAgent(replica);
      }
    } else if (proposal.category === 'agents') {
      const agent: AgentDef = {
        id: `a-subcontractor-${Date.now()}`,
        layer: 3,
        role: 'SubcontractorIntel',
        instruction:
          'Identify the subcontractor relationship pattern for the GC and surface it before outreach.',
        inputFrom: ['a-geo'],
        outputTo: ['a-ranker'],
        dwellMs: 8000,
        passRate: 0.55,
        enabled: true,
      };
      addAgent(agent);
    } else if (proposal.category === 'tuning') {
      const geo = config.agents.find((a) => a.role === 'GeoMapper');
      if (geo) {
        updateAgent(geo.id, {
          passRate: Math.max(0.4, geo.passRate * 0.92),
          instruction: geo.instruction + '\n\n[tuned] radius constraint: 20mi.',
        });
      }
    }
  };

  const approve = async (proposal: Proposal) => {
    setItems((prev) => prev.filter((p) => p.id !== proposal.id));
    try {
      await approveProposal(proposal.id);
    } catch (e: unknown) {
      console.warn('approveProposal failed', e);
    }
    fallbackApply(proposal);
  };

  const pills: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'sources', label: 'Sources', count: counts.sources },
    { id: 'agents', label: 'Agents', count: counts.agents },
    { id: 'tuning', label: 'Tuning', count: counts.tuning },
  ];

  return (
    <div className="max-w-[800px] mx-auto px-6 py-12">
      <h1 className="text-[22px] text-text-primary mb-2">ARCHITECT INBOX</h1>
      <p className="text-[15px] text-text-secondary mb-8">
        proposals from the system that need your attention
      </p>

      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {pills.map((p) => {
          const active = filter === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setFilter(p.id)}
              className={[
                'mono text-[12px] uppercase tracking-[0.12em] py-2 px-3 rounded-md border transition-colors',
                active
                  ? 'border-text-primary text-text-primary'
                  : 'border-border-default text-text-secondary hover:text-text-primary hover:border-border-hover',
              ].join(' ')}
            >
              {p.label} ({p.count})
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mono text-[11px] text-accent-magenta border border-accent-magenta/40 rounded-md p-3 mb-4">
          inbox error: {error}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="bg-bg-card border border-border-default rounded-lg p-6 mono text-[11px] uppercase tracking-[0.18em] text-text-secondary">
            loading proposals…
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-bg-card border border-border-default rounded-lg p-10 text-center">
            <div className="mono text-[12px] uppercase tracking-[0.18em] text-text-secondary mb-1">
              inbox clear
            </div>
            <p className="text-[14px] text-text-primary/70">
              no proposals match this filter. the architect is still watching.
            </p>
          </div>
        ) : (
          visible.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              onApprove={approve}
              onDismiss={remove}
            />
          ))
        )}
      </div>
    </div>
  );
}
