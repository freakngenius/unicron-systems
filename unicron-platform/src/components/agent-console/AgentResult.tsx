import { useState } from 'react';
import type { AgentDefinition } from '../../lib/agentRegistry';
import type { AgentDispatch } from '../../lib/contracts/agentConsole';
import { isTerminal } from '../../lib/contracts/agentConsole';

interface Props {
  agent: AgentDefinition;
  dispatch: AgentDispatch;
  onVerify: () => void | Promise<void>;
  onReject: (reason: string) => void | Promise<void>;
}

export function AgentResult({ agent, dispatch, onVerify, onReject }: Props) {
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState<'verify' | 'reject' | null>(null);

  const terminal = isTerminal(dispatch.status);

  const handleVerify = async () => {
    if (busy) return;
    setBusy('verify');
    try {
      await onVerify();
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    if (busy || rejectReason.trim().length === 0) return;
    setBusy('reject');
    try {
      await onReject(rejectReason.trim());
      setRejectReason('');
      setShowReject(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="agent-result">
      <div className="flex flex-col gap-2">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
          RESULT
        </span>
        {agent.resultRenderer ? (
          agent.resultRenderer(dispatch)
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-[12px] text-text-primary/80 bg-bg-panel border border-border-default rounded-md p-3">
            {dispatch.result_payload
              ? JSON.stringify(dispatch.result_payload, null, 2)
              : '(no result yet)'}
          </pre>
        )}
      </div>

      {dispatch.rejection_reason ? (
        <div className="flex flex-col gap-1">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-rose-400">
            REJECTION REASON
          </span>
          <p className="text-[12px] text-text-primary/80">{dispatch.rejection_reason}</p>
        </div>
      ) : null}

      {!terminal ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleVerify}
              disabled={busy !== null}
              className="mono text-[11px] uppercase tracking-[0.18em] border border-emerald-400/60 text-emerald-400 px-4 py-2 rounded-md hover:bg-emerald-400 hover:text-bg-base disabled:opacity-50 transition-colors"
            >
              {busy === 'verify' ? 'VERIFYING…' : 'VERIFY'}
            </button>
            <button
              type="button"
              onClick={() => setShowReject((v) => !v)}
              disabled={busy !== null}
              className="mono text-[11px] uppercase tracking-[0.18em] border border-rose-400/60 text-rose-400 px-4 py-2 rounded-md hover:bg-rose-400 hover:text-bg-base disabled:opacity-50 transition-colors"
            >
              REJECT
            </button>
          </div>
          {showReject ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (will surface to the agent's next dispatch as input)"
                rows={3}
                className="bg-bg-panel border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-primary/30 focus:outline-none focus:border-rose-400/60"
              />
              <button
                type="button"
                onClick={handleReject}
                disabled={busy !== null || rejectReason.trim().length === 0}
                className="self-end mono text-[11px] uppercase tracking-[0.18em] border border-rose-400 text-rose-400 px-4 py-2 rounded-md hover:bg-rose-400 hover:text-bg-base disabled:opacity-50 transition-colors"
              >
                {busy === 'reject' ? 'REJECTING…' : 'CONFIRM REJECT'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
