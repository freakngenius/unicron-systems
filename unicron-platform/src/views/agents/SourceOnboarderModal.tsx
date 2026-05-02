import { useEffect, useMemo, useRef, useState } from 'react';
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
  verifyDispatch,
} from '../../lib/agentConsoleClient';
import {
  sourceOnboarderDispatchesMock,
  sourceOnboarderMockLiveEvents,
  sourceOnboarderMockOnboardResult,
  sourceOnboarderMockTier2Result,
  inboxTicketsMock,
} from '../../data/mocks';
import type {
  AgentDispatch,
  AgentDispatchEvent,
  AgentDispatchEventType,
} from '../../lib/contracts/agentConsole';
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
  /** Real path: POST /api/sources/onboard?sync=1. Mock returns fixture. */
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
  const baseUrlRaw = (import.meta.env.VITE_SOURCE_ONBOARDER_URL as string | undefined) ?? '';
  const baseUrl = baseUrlRaw.replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('VITE_SOURCE_ONBOARDER_URL is not configured for real-mode onboard.');
  }
  const user = import.meta.env.VITE_SOURCE_ONBOARDER_BASIC_USER as string | undefined;
  const pass = import.meta.env.VITE_SOURCE_ONBOARDER_BASIC_PASS as string | undefined;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (user && pass) headers.authorization = `Basic ${btoa(`${user}:${pass}`)}`;
  const res = await fetch(`${baseUrl}/api/sources/onboard?sync=1`, {
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
  // each modal open.
  const baseUrlRaw = (import.meta.env.VITE_ARCHITECT_API_URL as string | undefined) ?? '';
  const baseUrl = baseUrlRaw.replace(/\/+$/, '');
  if (!baseUrl) return null;
  const res = await fetch(
    `${baseUrl}/api/architect/inbox?category=source-discovery&status=open&limit=200`,
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

const ARCHITECT_API_MOCK = import.meta.env.VITE_SOURCE_ONBOARDER_ENABLED !== 'true';
const ORG_ID = 'pathfinder-default';

export function SourceOnboarderModal({ onClose, bridge = REAL_BRIDGE }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [committing, setCommitting] = useState(false);
  const [mockEvents, setMockEvents] = useState<AgentDispatchEvent[]>([]);
  const [tier2Ticket, setTier2Ticket] = useState<InboxTicket | null>(null);
  const cancelMockRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelMockRef.current?.(), []);

  const isMockRuntime = ARCHITECT_API_MOCK && bridge === REAL_BRIDGE;

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
    setMockEvents([]);
    try {
      const request = toOnboardRequest(values);

      const dispatch = isMockRuntime
        ? synthesizeDispatch(request, values)
        : await bridge.createDispatch({
            agent_name: sourceOnboarderAgent.name,
            customer_org_id: ORG_ID,
            input_payload: {
              ...request,
              test_only: values.test_only,
              summary: summarizeForTile(request),
            },
          });

      setPhase({ kind: 'running', dispatch });

      // Real-mode + mock-mode both stream a scripted timeline (real-mode also
      // appends to Supabase so AgentLiveExecution shows it). isMockRuntime
      // skips Supabase and pushes events to local state.
      cancelMockRef.current = streamMockEvents(
        bridge,
        dispatch.id,
        isMockRuntime,
        (e) => setMockEvents((prev) => [...prev, e]),
        async () => {
          // After the scripted timeline lands, fetch the actual onboard result.
          // In mock-runtime, return a fixture; in real-mode, the real
          // bridge.onboard() was actually fetching during the timeline (we
          // started it in the same tick — see onboardPromise below).
          let result: OnboardSyncResponse;
          if (isMockRuntime) {
            // Choose Tier 1 vs Tier 2 fixture based on URL: rss → Tier 2.
            result =
              request.url && request.url.includes('rss')
                ? sourceOnboarderMockTier2Result
                : sourceOnboarderMockOnboardResult;
          } else {
            try {
              result = await bridge.onboard(request);
            } catch (e) {
              setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
              return;
            }
          }
          setPhase({
            kind: 'awaiting_review',
            dispatch: { ...dispatch, status: 'awaiting_review' },
            result,
          });
        },
      );
    } catch (e) {
      setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleVerify = async () => {
    if (phase.kind !== 'awaiting_review') return;
    setCommitting(true);
    try {
      const verified = isMockRuntime
        ? {
            ...phase.dispatch,
            status: 'verified' as const,
            verified_by_user_id: 'operator-mock',
            verified_at: new Date().toISOString(),
            result_payload: {
              source_id: phase.result.source_id,
              adapter_kind: phase.result.adapter_kind,
              summary: summarizeResult(phase.result),
            },
            cost_usd: phase.result.cost_usd,
            duration_ms: phase.result.duration_ms,
          }
        : await bridge.verifyDispatch({
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
      const rejected = isMockRuntime
        ? {
            ...phase.dispatch,
            status: 'rejected' as const,
            verified_by_user_id: 'operator-mock',
            verified_at: new Date().toISOString(),
            rejection_reason: reason,
          }
        : await bridge.rejectDispatch({
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
    if (isMockRuntime) {
      const ticket = inboxTicketsMock.find((t) => t.id === ticketId) ?? null;
      setTier2Ticket(ticket);
      return;
    }
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
        recentRunsCount={isMockRuntime ? sourceOnboarderDispatchesMock.length : null}
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
                isMockRuntime ? (
                  <MockLiveExecutionView events={mockEvents} />
                ) : (
                  <AgentLiveExecution dispatchId={phase.dispatch.id} />
                )
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
              initialDispatches={isMockRuntime ? sourceOnboarderDispatchesMock : undefined}
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

function streamMockEvents(
  bridge: SourceOnboarderBridge,
  dispatchId: string,
  isMockRuntime: boolean,
  onLocalEvent: (event: AgentDispatchEvent) => void,
  onComplete: () => void | Promise<void>,
): () => void {
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cursor = 0;
  const tick = () => {
    if (cancelled) return;
    const entry = sourceOnboarderMockLiveEvents[cursor];
    if (!entry) {
      void onComplete();
      return;
    }
    cursor += 1;
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        if (isMockRuntime) {
          onLocalEvent({
            id: cryptoRandomId(),
            dispatch_id: dispatchId,
            event_type: entry.event_type,
            payload: entry.payload,
            created_at: new Date().toISOString(),
          });
        } else {
          void bridge.appendEvent({
            dispatch_id: dispatchId,
            event_type: entry.event_type,
            payload: entry.payload,
          });
        }
        tick();
      }, entry.delayMs),
    );
  };
  tick();
  return () => {
    cancelled = true;
    timers.forEach(clearTimeout);
  };
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `evt-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function synthesizeDispatch(
  request: OnboardRequest,
  values: SourceOnboarderInputFormValues,
): AgentDispatch {
  const now = new Date().toISOString();
  return {
    id: cryptoRandomId(),
    agent_name: sourceOnboarderAgent.name,
    customer_org_id: ORG_ID,
    dispatched_by_user_id: null,
    input_payload: {
      ...request,
      test_only: values.test_only,
      summary: summarizeForTile(request),
    },
    status: 'running',
    result_payload: null,
    rejection_reason: null,
    verified_by_user_id: null,
    verified_at: null,
    cost_usd: null,
    duration_ms: null,
    agent_run_id: null,
    parent_dispatch_id: null,
    created_at: now,
    updated_at: now,
  };
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

function MockLiveExecutionView({ events }: { events: AgentDispatchEvent[] }) {
  const TYPE_LABEL: Record<AgentDispatchEventType, string> = {
    reasoning: 'REASONING',
    tool_call: 'TOOL CALL',
    tool_result: 'TOOL RESULT',
    partial_output: 'PARTIAL OUTPUT',
    decision: 'DECISION',
    error: 'ERROR',
  };
  const TYPE_TONE: Record<AgentDispatchEventType, string> = {
    reasoning: 'text-text-primary/60',
    tool_call: 'text-accent-gold',
    tool_result: 'text-emerald-400',
    partial_output: 'text-text-primary/80',
    decision: 'text-text-primary',
    error: 'text-rose-400',
  };
  return (
    <div
      className="flex flex-col gap-2 font-mono text-[12px]"
      data-testid="agent-live-execution"
    >
      {events.length === 0 ? (
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
          NO EVENTS YET
        </div>
      ) : (
        events.map((event) => (
          <div
            key={event.id}
            data-testid="agent-live-execution-event"
            data-event-type={event.event_type}
            className="flex flex-col gap-1 border-l border-border-default pl-3"
          >
            <div className="flex items-baseline gap-3">
              <span
                className={[
                  'mono text-[10px] uppercase tracking-[0.18em]',
                  TYPE_TONE[event.event_type],
                ].join(' ')}
              >
                {TYPE_LABEL[event.event_type]}
              </span>
              <span className="mono text-[10px] text-text-primary/30">
                {new Date(event.created_at).toLocaleTimeString()}
              </span>
            </div>
            <pre className="whitespace-pre-wrap text-[12px] text-text-primary/80">
              {formatPayload(event.payload)}
            </pre>
          </div>
        ))
      )}
    </div>
  );
}

function formatPayload(payload: Record<string, unknown>): string {
  if (typeof payload === 'object' && payload !== null && 'text' in payload) {
    const text = (payload as { text?: unknown }).text;
    if (typeof text === 'string') return text;
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
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
