import type { ReactNode } from 'react';
import type { AgentDefinition } from '../../lib/agentRegistry';
import type { AgentDispatchStatus } from '../../lib/contracts/agentConsole';

interface Props {
  agent: AgentDefinition;
  status?: AgentDispatchStatus | 'idle';
  costUsd?: number | null;
  recentRunsCount?: number | null;
  onClose: () => void;
  footer?: ReactNode;
  children?: ReactNode;
}

const STATUS_LABEL: Record<AgentDispatchStatus | 'idle', string> = {
  idle: 'IDLE',
  queued: 'QUEUED',
  running: 'RUNNING',
  awaiting_review: 'AWAITING REVIEW',
  verified: 'VERIFIED',
  rejected: 'REJECTED',
  failed: 'FAILED',
};

const STATUS_TONE: Record<AgentDispatchStatus | 'idle', string> = {
  idle: 'text-text-primary/40 border-border-default',
  queued: 'text-text-primary/60 border-border-default',
  running: 'text-accent-gold border-accent-gold/40',
  awaiting_review: 'text-accent-gold border-accent-gold/40',
  verified: 'text-emerald-400 border-emerald-400/40',
  rejected: 'text-rose-400 border-rose-400/40',
  failed: 'text-rose-400 border-rose-400/40',
};

export function AgentModalShell({
  agent,
  status = 'idle',
  costUsd,
  recentRunsCount,
  onClose,
  footer,
  children,
}: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${agent.displayName} agent console`}
      className="fixed inset-0 z-50 flex flex-col bg-bg-base"
    >
      <header className="flex items-center justify-between border-b border-border-default px-6 py-4">
        <div className="flex items-center gap-4">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border-default bg-bg-panel mono text-[14px]"
          >
            {agent.icon}
          </div>
          <div className="flex flex-col">
            <span className="mono text-[13px] tracking-wide text-text-primary">
              {agent.displayName}
            </span>
            <span className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/50">
              {agent.role}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <span
            className={[
              'mono text-[10px] uppercase tracking-[0.18em] border rounded-md px-2 py-1',
              STATUS_TONE[status],
            ].join(' ')}
            data-testid="agent-status-pill"
          >
            {STATUS_LABEL[status]}
          </span>
          <span className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
            COST{' '}
            <span className="text-text-primary/70">
              {formatCost(costUsd)}
            </span>
          </span>
          <span className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
            7d{' '}
            <span className="text-text-primary/70">
              {recentRunsCount ?? 0}
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/60 hover:text-text-primary"
          >
            CLOSE
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-6 py-6">{children}</main>

      {footer ? (
        <footer className="border-t border-border-default px-6 py-3">{footer}</footer>
      ) : null}
    </div>
  );
}

function formatCost(cost: number | null | undefined): string {
  if (cost == null) return '$0.000';
  return `$${cost.toFixed(3)}`;
}
