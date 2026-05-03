import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentModalShell } from '../../components/agent-console/AgentModalShell';
import { AgentLiveExecution } from '../../components/agent-console/AgentLiveExecution';
import { AgentHistoryGrid } from '../../components/agent-console/AgentHistoryGrid';
import {
  CoverageInputForm,
  toScopeConstraints,
  type CoverageInputFormValues,
} from '../../components/agents/coverage/CoverageInputForm';
import { CoverageResultPanel } from '../../components/agents/coverage/CoverageResultPanel';
import { coverageExpansionAgent } from '../../lib/agents/coverageExpansionAgent';
import {
  appendEvent,
  createDispatch,
  getDispatch,
  rejectDispatch,
  requeueDispatch,
  verifyDispatch,
} from '../../lib/agentConsoleClient';
import {
  createCoverageGoal,
  getCoverageGoal,
  runCoverageGoal,
} from '../../lib/coverageClient';
import {
  coverageDispatchesMock,
  coverageMockLiveEvents,
} from '../../data/mocks';
import type {
  AgentDispatch,
  AgentDispatchEvent,
  AgentDispatchEventType,
} from '../../lib/contracts/agentConsole';
import type { CoverageGoalDetail } from '../../lib/contracts/coverage';

interface Props {
  onClose: () => void;
  /** Test seam — when set, dispatch flow uses these mock callbacks instead of real Supabase / fetch. */
  bridge?: DispatchBridge;
}

/**
 * The dispatch flow has six side-effects: insert dispatch row, POST to
 * Stream E /api/coverage/goals, append live events, verify dispatch row, POST
 * to /api/coverage/goals/[id]/run, fetch goal detail. Bundling them into a
 * single bridge makes it trivial to unit-test the modal's state machine
 * without touching Supabase or fetch.
 */
export interface DispatchBridge {
  createDispatch: typeof createDispatch;
  appendEvent: typeof appendEvent;
  verifyDispatch: typeof verifyDispatch;
  rejectDispatch: typeof rejectDispatch;
  getDispatch: typeof getDispatch;
  createCoverageGoal: typeof createCoverageGoal;
  getCoverageGoal: typeof getCoverageGoal;
  runCoverageGoal: typeof runCoverageGoal;
}

const REAL_BRIDGE: DispatchBridge = {
  createDispatch,
  appendEvent,
  verifyDispatch,
  rejectDispatch,
  getDispatch,
  createCoverageGoal,
  getCoverageGoal,
  runCoverageGoal,
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'dispatching' }
  | { kind: 'running'; dispatch: AgentDispatch; goalId: string }
  | { kind: 'awaiting_review'; dispatch: AgentDispatch; detail: CoverageGoalDetail }
  | { kind: 'verified'; dispatch: AgentDispatch; detail: CoverageGoalDetail }
  | { kind: 'rejected'; dispatch: AgentDispatch; detail: CoverageGoalDetail | null }
  | { kind: 'failed'; error: string };

const MOCK_MODE = import.meta.env.VITE_COVERAGE_API_ENABLED !== 'true';
const ORG_ID = 'pathfinder-default';
const BASELINE_LEAD_COUNT = 142;

export function CoverageExpansionModal({ onClose, bridge = REAL_BRIDGE }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [committing, setCommitting] = useState(false);
  const [mockEvents, setMockEvents] = useState<AgentDispatchEvent[]>([]);
  // Used by the mock-mode timer to cancel pending appends on unmount.
  const cancelMockRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelMockRef.current?.(), []);

  // Runtime mock-mode: VITE_COVERAGE_API_ENABLED=false AND no test bridge override.
  // When true, the dispatch row insert + live event subscription bypass Supabase
  // entirely. Tests inject `bridge` explicitly so they continue to assert the
  // bridge calls; runtime callers without `bridge` get a fully synthetic flow
  // that works without Supabase auth.
  const isMockRuntime = MOCK_MODE && bridge === REAL_BRIDGE;

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
      return phase.detail.goal.total_cost_usd;
    }
    return null;
  }, [phase]);

  const handleSubmit = async (values: CoverageInputFormValues) => {
    setPhase({ kind: 'dispatching' });
    setMockEvents([]);
    try {
      const goalRequest = {
        vertical_id: values.vertical_id,
        goal_text: values.goal_text,
        scope_constraints: toScopeConstraints(values),
        budget_usd: values.budget_usd ?? undefined,
      };
      const goalResponse = await bridge.createCoverageGoal(goalRequest);

      const dispatch = isMockRuntime
        ? synthesizeDispatch(goalRequest, values)
        : await bridge.createDispatch({
            agent_name: coverageExpansionAgent.name,
            customer_org_id: ORG_ID,
            input_payload: {
              ...goalRequest,
              summary: summarizeForTile(values),
            },
          });

      setPhase({ kind: 'running', dispatch, goalId: goalResponse.goal_id });

      if (MOCK_MODE) {
        cancelMockRef.current = streamMockEvents(
          bridge,
          dispatch.id,
          isMockRuntime,
          (e) => setMockEvents((prev) => [...prev, e]),
          async () => {
            const detail = await bridge.getCoverageGoal(goalResponse.goal_id);
            setPhase({
              kind: 'awaiting_review',
              dispatch: { ...dispatch, status: 'awaiting_review' },
              detail,
            });
          },
        );
      }
    } catch (e) {
      setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleVerify = async () => {
    if (phase.kind !== 'awaiting_review') return;
    setCommitting(true);
    try {
      // TODO(Phase 1F): also write pathfinder.agent_verifications row.
      // Tracked at MEMORY/operator-todos/2026-05-02-pathfinder-needs-verification-bridge.md.
      const verified = isMockRuntime
        ? {
            ...phase.dispatch,
            status: 'verified' as const,
            verified_by_user_id: 'operator-mock',
            verified_at: new Date().toISOString(),
            result_payload: {
              goal_id: phase.detail.goal.id,
              summary: summarizeResult(phase.detail),
            },
          }
        : await bridge.verifyDispatch({
            id: phase.dispatch.id,
            verified_by_user_id: 'operator-mock',
            result_payload: {
              goal_id: phase.detail.goal.id,
              summary: summarizeResult(phase.detail),
              total_sources_onboarded: phase.detail.goal.total_sources_onboarded,
              total_sources_assist_queued: phase.detail.goal.total_sources_assist_queued,
              total_estimated_lift: phase.detail.goal.total_estimated_lift,
            },
          });
      if (!isMockRuntime) {
        await bridge.runCoverageGoal(phase.detail.goal.id);
      }
      setPhase({ kind: 'verified', dispatch: verified, detail: phase.detail });
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
      setPhase({ kind: 'rejected', dispatch: rejected, detail: phase.detail });
    } catch (e) {
      setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
    } finally {
      setCommitting(false);
    }
  };

  const handleHistoryClick = (dispatch: AgentDispatch) => {
    if (!dispatch.result_payload || typeof dispatch.result_payload !== 'object') return;
    const goalId = (dispatch.result_payload as { goal_id?: unknown }).goal_id;
    if (typeof goalId !== 'string') return;
    void (async () => {
      try {
        const detail = await bridge.getCoverageGoal(goalId);
        setPhase({
          kind: dispatch.status === 'verified' ? 'verified' : 'awaiting_review',
          dispatch,
          detail,
        });
      } catch (e) {
        setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
      }
    })();
  };

  return (
    <AgentModalShell
      agent={coverageExpansionAgent}
      status={status}
      costUsd={costUsd}
      recentRunsCount={MOCK_MODE ? coverageDispatchesMock.length : null}
      onClose={onClose}
    >
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        {phase.kind === 'idle' ? (
          <CoverageInputForm onSubmit={handleSubmit} />
        ) : null}

        {(phase.kind === 'dispatching' || phase.kind === 'running') && (
          <section className="flex flex-col gap-3" data-testid="coverage-running">
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
          <CoverageResultPanel
            detail={phase.detail}
            baselineLeadCount={BASELINE_LEAD_COUNT}
            onCommit={phase.kind === 'awaiting_review' ? handleVerify : undefined}
            committing={committing}
            readOnly={phase.kind === 'verified'}
            onTier2Click={(c) => {
              // Coordinator note: M2 ships Tier2ResolveModal. Until then, the
              // click is a no-op surface — operators resolve via the existing
              // Architect Inbox until M2 lands. Tracked at
              // MEMORY/operator-todos/2026-05-02-stream-e-coverage-http-routes.md.
              void c;
            }}
          />
        )}

        {phase.kind === 'rejected' && phase.detail ? (
          <CoverageResultPanel detail={phase.detail} readOnly />
        ) : null}

        {phase.kind === 'failed' ? (
          <div
            data-testid="coverage-error"
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
            agentName={coverageExpansionAgent.name}
            customerOrgId={ORG_ID}
            initialDispatches={MOCK_MODE ? coverageDispatchesMock : undefined}
            onTileClick={handleHistoryClick}
            onRerun={(d) => {
              void requeueDispatch({ dispatch_id: d.id }).catch((err) => {
                console.error('requeueDispatch failed', err);
              });
            }}
          />
        </div>
      </div>
    </AgentModalShell>
  );
}

/**
 * Walk the mock event timeline forward. In runtime mock mode, push synthetic
 * events to the local renderer; otherwise call `bridge.appendEvent` so tests
 * can assert the call shape (and a real Supabase client receives them in
 * non-runtime-mock cases). Returns a cancel function that aborts pending
 * entries on unmount.
 */
function streamMockEvents(
  bridge: DispatchBridge,
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
    const entry = coverageMockLiveEvents[cursor];
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
  goalRequest: { goal_text: string; vertical_id?: string | null; scope_constraints?: unknown; budget_usd?: number },
  values: CoverageInputFormValues,
): AgentDispatch {
  const now = new Date().toISOString();
  return {
    id: cryptoRandomId(),
    agent_name: coverageExpansionAgent.name,
    customer_org_id: ORG_ID,
    dispatched_by_user_id: null,
    input_payload: {
      ...goalRequest,
      summary: summarizeForTile(values),
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

function summarizeForTile(values: CoverageInputFormValues): string {
  const metro = values.metros[0] ?? 'unspecified metro';
  return `${metro} · ${values.target_lead_count} leads · ${values.signal_keywords.slice(0, 3).join(' / ')}`.trim();
}

function summarizeResult(detail: CoverageGoalDetail): string {
  const g = detail.goal;
  return `${g.total_sources_onboarded} Tier 1 onboarded · ${g.total_sources_assist_queued} Tier 2 queued · est. +${g.total_estimated_lift.toFixed(1)} leads/day`;
}
