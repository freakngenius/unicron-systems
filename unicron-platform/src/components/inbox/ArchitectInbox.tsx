import { useMemo, useState } from 'react';
import {
  proposals as initialProposals,
  type Proposal,
  type ProposalCategory,
} from '../../data/mocks';
import { ProposalCard } from './ProposalCard';
import { useSystem, type AgentDef, type DataSource } from '../../context/SystemContext';

type Filter = 'all' | ProposalCategory;

export function ArchitectInbox() {
  const [items, setItems] = useState<Proposal[]>(initialProposals);
  const [filter, setFilter] = useState<Filter>('all');
  const { addAgent, addDataSource, updateAgent, config } = useSystem();

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

  const remove = (id: string) => setItems((prev) => prev.filter((p) => p.id !== id));

  const approve = (proposal: Proposal) => {
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
      // Mitose an extra PermitWatcher instance to handle the new feed.
      const permit = config.agents.find(
        (a) => a.layer === 2 && a.role === 'PermitWatcher',
      );
      if (permit) {
        const replica: AgentDef = {
          ...permit,
          id: `${permit.id}-travis-${Date.now()}`,
        };
        addAgent(replica);
      }
    } else if (proposal.category === 'agents') {
      // SubcontractorIntel — Layer 3 signal agent.
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
      // Tighten GeoMapper passRate slightly to reflect tightened radius.
      const geo = config.agents.find((a) => a.role === 'GeoMapper');
      if (geo) {
        updateAgent(geo.id, {
          passRate: Math.max(0.4, geo.passRate * 0.92),
          instruction: geo.instruction + '\n\n[tuned] radius constraint: 20mi.',
        });
      }
    }
    remove(proposal.id);
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

      <div className="flex flex-col gap-4">
        {visible.length === 0 ? (
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
