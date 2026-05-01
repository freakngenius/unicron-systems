import { useState } from 'react';
import type { DotColor } from '../../data/mocks';
import type { Proposal, ProposalCategory } from '../../lib/contracts/architect';

const dotClass: Record<DotColor, string> = {
  cyan: 'bg-accent-cyan',
  gold: 'bg-accent-gold',
  magenta: 'bg-accent-magenta',
  violet: 'bg-accent-violet',
  white: 'bg-text-primary',
};

const colorByCategory: Record<ProposalCategory, DotColor> = {
  sources: 'cyan',
  agents: 'gold',
  tuning: 'magenta',
};

type Props = {
  proposal: Proposal;
  onApprove: (proposal: Proposal) => void;
  onDismiss: (id: string) => void;
};

export function ProposalCard({ proposal, onApprove, onDismiss }: Props) {
  const [removing, setRemoving] = useState(false);

  const dismiss = () => {
    setRemoving(true);
    window.setTimeout(() => onDismiss(proposal.id), 250);
  };

  const approve = () => {
    setRemoving(true);
    window.setTimeout(() => onApprove(proposal), 250);
  };

  const color = colorByCategory[proposal.category];

  return (
    <article
      className={[
        'bg-bg-card border border-border-default rounded-lg p-6 transition-all',
        removing ? 'animate-slideOutFade pointer-events-none' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <span className={['w-1.5 h-1.5 rounded-full', dotClass[color]].join(' ')} />
        <span className="mono text-[10.5px] uppercase tracking-[0.18em] text-accent-gold/85">
          {proposal.type}
        </span>
        <span className="mono text-[10.5px] text-text-secondary/80 ml-auto tabular-nums">
          {proposal.time}
        </span>
      </div>

      <h3 className="text-[17px] leading-[1.35] text-text-primary mb-2.5">{proposal.headline}</h3>

      <p className="text-[14px] leading-[1.6] text-text-primary/75 mb-5">{proposal.body}</p>

      <div className="bg-bg-base/60 border border-border-default rounded-md p-4 mb-5">
        <div className="mono text-[12px] grid grid-cols-[140px_1fr] gap-y-1.5 gap-x-4">
          {proposal.details.map((d) => (
            <div key={d.k} className="contents">
              <span className="text-text-secondary">{d.k}</span>
              <span className="text-text-primary">{d.v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          className="mono text-[11px] text-text-secondary hover:text-text-primary transition-colors mr-auto"
        >
          auto-accept
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="border border-border-default text-text-primary mono text-[12px] tracking-[0.12em] uppercase py-2.5 px-4 rounded-md hover:border-border-hover transition-colors"
        >
          DISMISS
        </button>
        <button
          type="button"
          onClick={approve}
          className="bg-white text-bg-base mono text-[12px] tracking-[0.12em] uppercase py-2.5 px-4 rounded-md hover:bg-text-primary transition-colors"
        >
          APPROVE
        </button>
      </div>
    </article>
  );
}
