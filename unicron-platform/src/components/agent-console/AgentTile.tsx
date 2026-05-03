import type { AgentDispatch, AgentDispatchStatus } from '../../lib/contracts/agentConsole';

interface Props {
  dispatch: AgentDispatch;
  onClick?: (dispatch: AgentDispatch) => void;
  /**
   * When provided AND `dispatch.status === 'failed'`, renders an inline
   * "RE-RUN" action that copies the failed dispatch into a fresh queued row
   * (see `requeueDispatch` in `agentConsoleClient`). The click is stopped
   * from bubbling so the surrounding tile click handler does not also fire.
   */
  onRerun?: (dispatch: AgentDispatch) => void;
}

const STATUS_TONE: Record<AgentDispatchStatus, string> = {
  queued: 'text-text-primary/50 border-border-default',
  running: 'text-accent-gold border-accent-gold/40',
  awaiting_review: 'text-accent-gold border-accent-gold/40',
  verified: 'text-emerald-400 border-emerald-400/40',
  rejected: 'text-rose-400 border-rose-400/40',
  failed: 'text-rose-400 border-rose-400/40',
};

const STATUS_LABEL: Record<AgentDispatchStatus, string> = {
  queued: 'QUEUED',
  running: 'RUNNING',
  awaiting_review: 'AWAITING REVIEW',
  verified: 'VERIFIED',
  rejected: 'REJECTED',
  failed: 'FAILED',
};

export function AgentTile({ dispatch, onClick, onRerun }: Props) {
  const summary = summarize(dispatch);
  const interactive = onClick !== undefined;
  const showRerun = onRerun !== undefined && dispatch.status === 'failed';
  // Use a div + role=button so we can nest the inline RE-RUN button without
  // creating an invalid <button> inside <button>.
  const handleActivate = () => {
    if (interactive) onClick?.(dispatch);
  };
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : -1}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleActivate();
        }
      }}
      aria-disabled={!interactive}
      data-testid="agent-tile"
      data-dispatch-id={dispatch.id}
      data-dispatch-status={dispatch.status}
      className={[
        'flex flex-col gap-2 text-left border border-border-default rounded-md bg-bg-panel p-3',
        interactive
          ? 'hover:border-accent-gold/60 transition-colors cursor-pointer'
          : 'cursor-default',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
          {formatTime(dispatch.created_at)}
        </span>
        <span
          className={[
            'mono text-[9px] uppercase tracking-[0.18em] border rounded-md px-2 py-0.5',
            STATUS_TONE[dispatch.status],
          ].join(' ')}
        >
          {STATUS_LABEL[dispatch.status]}
        </span>
      </div>
      <p className="text-[12px] text-text-primary/80 line-clamp-2">{summary}</p>
      <div className="flex items-center gap-3 mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
        <span>COST {formatCost(dispatch.cost_usd)}</span>
        {dispatch.verified_at ? (
          <span className="text-emerald-400">✓ {dispatch.verified_at.slice(0, 10)}</span>
        ) : null}
        {showRerun ? (
          <button
            type="button"
            data-testid="rerun-button"
            onClick={(e) => {
              e.stopPropagation();
              onRerun?.(dispatch);
            }}
            className="ml-auto mono text-[10px] uppercase tracking-[0.18em] border border-accent-gold/40 text-accent-gold rounded-md px-2 py-0.5 hover:bg-accent-gold/10 transition-colors"
          >
            RE-RUN
          </button>
        ) : null}
      </div>
    </div>
  );
}

function summarize(d: AgentDispatch): string {
  if (d.result_payload && typeof d.result_payload === 'object' && 'summary' in d.result_payload) {
    const s = (d.result_payload as { summary?: unknown }).summary;
    if (typeof s === 'string' && s.length > 0) return s;
  }
  if (d.input_payload && typeof d.input_payload === 'object' && 'summary' in d.input_payload) {
    const s = (d.input_payload as { summary?: unknown }).summary;
    if (typeof s === 'string' && s.length > 0) return s;
  }
  try {
    return JSON.stringify(d.input_payload).slice(0, 140);
  } catch {
    return d.id;
  }
}

function formatCost(cost: number | null): string {
  if (cost == null) return '$0.000';
  return `$${cost.toFixed(3)}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
