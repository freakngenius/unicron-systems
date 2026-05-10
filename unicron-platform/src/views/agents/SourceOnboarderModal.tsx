import { useMemo, useState } from 'react';
import { AgentModalShell } from '../../components/agent-console/AgentModalShell';
import { AgentLiveExecution } from '../../components/agent-console/AgentLiveExecution';
import { AgentHistoryGrid } from '../../components/agent-console/AgentHistoryGrid';
import {
  SourceOnboarderInputForm,
  toOnboardRequest,
  type SourceOnboarderInputFormValues,
} from '../../components/agents/source-onboarder/SourceOnboarderInputForm';
import { SourceOnboarderResultPanel } from '../../components/agents/source-onboarder/SourceOnboarderResultPanel';
import { Tier2ResolveModal } from '../../components/agents/Tier2ResolveModal';
import { sourceOnboarderAgent } from '../../lib/agents/sourceOnboarderAgent';
import {
  appendEvent,
  createDispatch,
  getDispatch,
  rejectDispatch,
  requeueDispatch,
  verifyDispatch,
} from '../../lib/agentConsoleClient';
import type { AgentDispatch } from '../../lib/contracts/agentConsole';
import type {
  OnboardRequest,
  OnboardSyncResponse,
} from '../../lib/contracts/sourceOnboarder';
import type { InboxTicket } from '../../lib/contracts/inbox';

interface Props {
  onClose: () => void;
  bridge?: SourceOnboarderBridge;
}

export interface SourceOnboarderBridge {
  createDispatch: typeof createDispatch;
  appendEvent: typeof appendEvent;
  verifyDispatch: typeof verifyDispatch;
  rejectDispatch: typeof rejectDispatch;
  getDispatch: typeof getDispatch;
  /** Real path: POST /api/sources/onboard?sync=1. */
  onboard: (req: OnboardRequest) => Promise<OnboardSyncResponse>;
  /** Lookup the Tier 2 ticket the agent escalated. */
  fetchTicket: (id: string) => Promise<InboxTicket | null>;
}

const REAL_BRIDGE: SourceOnboarderBridge = {
  createDispatch,
  appendEvent,
  verifyDispatch,
  rejectDispatch,
  getDispatch,
  onboard: realOnboard,
  fetchTicket: realFetchTicket,
};

async function realOnboard(req: OnboardRequest): Promise<OnboardSyncResponse> {
  // Wave 3 Phase B: same-origin proxy injects SOURCE_ONBOARDER_TOKEN server-side.
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  const res = await fetch('/api/sources/onboard-proxy?sync=1', {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`source-onboarder api ${res.status} — ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as OnboardSyncResponse;
  return json;
}

async function realFetchTicket(id: string): Promise<InboxTicket | null> {
  // Pathfinder doesn't ship a single-ticket GET; we fetch the open list and
  // narrow. Acceptable for now since Tier 2 lists are small and refresh on
  // each modal open. Routed through the architect inbox proxy.
  const res = await fetch(
    '/api/architect/inbox-proxy?category=source-discovery&status=open&limit=200',
    { headers: { accept: 'application/json' } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { tickets: InboxTicket[] };
  return json.tickets.find((t) => t.id === id) ?? null;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'dispatching' }
  | { kind: 'running'; dispatch: AgentDispatch }
  | { kind: 'awaiting_review'; dispatch: AgentDispatch; result: OnboardSyncResponse }
  | { kind: 'verified'; dispatch: AgentDispatch; result: OnboardSyncResponse }
  | { kind: 'rejected'; dispatch: AgentDispatch; result: OnboardSyncResponse | null }
  | { kind: 'failed'; error: string };

const ORG_ID = 'pathfinder-default';

export function SourceOnboarderModal({ onClose, bridge = REAL_BRIDGE }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [committing, setCommitting] = useState(false);
  const [tier2Ticket, setTier2Ticket] = useState<InboxTicket | null>(null);

  const status =
    phase.kind === 'idle'
      ? 'idle'
      : phase.kind === 'dispatching' || phase.kind === 'running'
        ? 'running'
        : phase.kind === 'awaiting_review'
          ? 'awaiting_review'
          : phase.kind === 'verified'
            ? 'verified'
            : phase.kind === 'rejected'
              ? 'rejected'
              : 'failed';

  const costUsd = useMemo(() => {
    if (phase.kind === 'awaiting_review' || phase.kind === 'verified') {
      return phase.result.cost_usd;
    }
    return null;
  }, [phase]);

  const handleSubmit = async (values: SourceOnboarderInputFormValues) => {
    setPhase({ kind: 'dispatching' });
    try {
      const request = toOnboardRequest(values);

      const dispatch = await bridge.createDispatch({
        agent_name: sourceOnboarderAgent.name,
        customer_org_id: ORG_ID,
        input_payload: {
          ...request,
          test_only: values.test_only,
          summary: summarizeForTile(request),
        },
      });

      setPhase({ kind: 'running', dispatch });

      let result: OnboardSyncResponse;
      try {
        result = await bridge.onboard(request);
      } catch (e) {
        setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
        return;
      }
      setPhase({
        kind: 'awaiting_review',
        dispatch: { ...dispatch, status: 'awaiting_review' },
        result,
      });
    } catch (e) {
      setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleVerify = async () => {
    if (phase.kind !== 'awaiting_review') return;
    setCommitting(true);
    try {
      const verified = await bridge.verifyDispatch({
        id: phase.dispatch.id,
        verified_by_user_id: 'operator-mock',
        result_payload: {
          source_id: phase.result.source_id,
          adapter_kind: phase.result.adapter_kind,
          session_id: phase.result.session_id,
          summary: summarizeResult(phase.result),
        },
      });
      setPhase({ kind: 'verified', dispatch: verified, result: phase.result });
    } catch (e) {
      setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
    } finally {
      setCommitting(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (phase.kind !== 'awaiting_review') return;
    setCommitting(true);
    try {
      const rejected = await bridge.rejectDispatch({
        id: phase.dispatch.id,
        verified_by_user_id: 'operator-mock',
        rejection_reason: reason,
      });
      setPhase({ kind: 'rejected', dispatch: rejected, result: phase.result });
    } catch (e) {
      setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
    } finally {
      setCommitting(false);
    }
  };

  const handleOpenTier2 = async (ticketId: string) => {
    try {
      const ticket = await bridge.fetchTicket(ticketId);
      setTier2Ticket(ticket);
    } catch (e) {
      setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <>
      <AgentModalShell
        agent={sourceOnboarderAgent}
        status={status}
        costUsd={costUsd}
        recentRunsCount={null}
        onClose={onClose}
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          {phase.kind === 'idle' ? (
            <SourceOnboarderInputForm onSubmit={handleSubmit} />
          ) : null}

          {(phase.kind === 'dispatching' || phase.kind === 'running') && (
            <section className="flex flex-col gap-3" data-testid="source-onboarder-running">
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
                LIVE EXECUTION
              </span>
              {phase.kind === 'running' ? (
                <AgentLiveExecution dispatchId={phase.dispatch.id} />
              ) : (
                <p className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
                  DISPATCHING…
                </p>
              )}
            </section>
          )}

          {(phase.kind === 'awaiting_review' || phase.kind === 'verified') && (
            <SourceOnboarderResultPanel
              result={phase.result}
              onCommit={phase.kind === 'awaiting_review' ? handleVerify : undefined}
              onOpenTier2={handleOpenTier2}
              committing={committing}
              readOnly={phase.kind === 'verified'}
            />
          )}

          {phase.kind === 'rejected' && phase.result ? (
            <SourceOnboarderResultPanel result={phase.result} readOnly />
          ) : null}

          {phase.kind === 'failed' ? (
            <div
              data-testid="source-onboarder-error"
              className="flex flex-col gap-2 border border-rose-400/40 rounded-md bg-bg-panel p-4"
            >
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-rose-400">
                FAILED
              </span>
              <p className="text-[12px] text-text-primary/80">{phase.error}</p>
              <button
                type="button"
                onClick={() => setPhase({ kind: 'idle' })}
                className="self-end mono text-[11px] uppercase tracking-[0.18em] border border-text-primary px-3 py-1 rounded-md text-text-primary hover:bg-text-primary hover:text-bg-base transition-colors"
              >
                RESET
              </button>
            </div>
          ) : null}

          {phase.kind === 'awaiting_review' ? (
            <RejectControls onReject={handleReject} disabled={committing} />
          ) : null}

          <div className="border-t border-border-default pt-6">
            <AgentHistoryGrid
              agentName={sourceOnboarderAgent.name}
              customerOrgId={ORG_ID}
              onRerun={(d) => {
                void requeueDispatch({ dispatch_id: d.id }).catch((err) => {
                  console.error('requeueDispatch failed', err);
                });
              }}
            />
          </div>
        </div>
      </AgentModalShell>

      {tier2Ticket ? (
        <Tier2ResolveModal
          ticket={tier2Ticket}
          onClose={() => setTier2Ticket(null)}
          onResolved={() => setTier2Ticket(null)}
        />
      ) : null}
    </>
  );
}

function RejectControls({
  onReject,
  disabled,
}: {
  onReject: (reason: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="self-end mono text-[11px] uppercase tracking-[0.18em] border border-rose-400/60 text-rose-400 px-3 py-1 rounded-md hover:bg-rose-400 hover:text-bg-base disabled:opacity-50 transition-colors"
        >
          REJECT INSTEAD
        </button>
      ) : (
        <div className="flex flex-col gap-2 border border-border-default rounded-md bg-bg-panel p-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (will surface to next dispatch as input)"
            rows={2}
            className="bg-bg-base border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-primary/30 focus:outline-none focus:border-rose-400/60"
          />
          <button
            type="button"
            onClick={() => onReject(reason.trim())}
            disabled={disabled || reason.trim().length === 0}
            className="self-end mono text-[11px] uppercase tracking-[0.18em] border border-rose-400 text-rose-400 px-3 py-1 rounded-md hover:bg-rose-400 hover:text-bg-base disabled:opacity-50 transition-colors"
          >
            CONFIRM REJECT
          </button>
        </div>
      )}
    </div>
  );
}

function summarizeForTile(req: OnboardRequest): string {
  const target = req.url ?? req.description ?? 'unspecified';
  const adapter = req.hint ?? 'auto';
  const jur = req.jurisdiction ?? '—';
  return `${target} · ${adapter} · ${jur}`;
}

function summarizeResult(result: OnboardSyncResponse): string {
  if (result.status === 'live') {
    return `Tier 1 onboarded · adapter ${result.adapter_kind ?? 'unknown'} · cost $${result.cost_usd.toFixed(2)}`;
  }
  if (result.status === 'human-assist') {
    return `Tier 2 escalated · ticket ${result.ticket_id ?? 'unknown'} · cost $${result.cost_usd.toFixed(2)}`;
  }
  return `${result.status} · cost $${result.cost_usd.toFixed(2)}`;
}
