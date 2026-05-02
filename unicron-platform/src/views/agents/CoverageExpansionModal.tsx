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
import type { AgentDispatch } from '../../lib/contracts/agentConsole';
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
  // Used by the mock-mode timer to cancel pending appends on unmount.
  const cancelMockRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelMockRef.current?.(), []);

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
    try {
      const goalRequest = {
        vertical_id: values.vertical_id,
        goal_text: values.goal_text,
        scope_constraints: toScopeConstraints(values),
        budget_usd: values.budget_usd ?? undefined,
      };
      const goalResponse = await bridge.createCoverageGoal(goalRequest);

      const dispatch = await bridge.createDispatch({
        agent_name: coverageExpansionAgent.name,
        customer_org_id: ORG_ID,
        input_payload: {
          ...goalRequest,
          summary: summarizeForTile(values),
        },
      });

      setPhase({ kind: 'running', dispatch, goalId: goalResponse.goal_id });

      if (MOCK_MODE) {
        cancelMockRef.current = streamMockEvents(bridge, dispatch.id, async () => {
          const detail = await bridge.getCoverageGoal(goalResponse.goal_id);
          setPhase({
            kind: 'awaiting_review',
            dispatch: { ...dispatch, status: 'awaiting_review' },
            detail,
          });
        });
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
      const verified = await bridge.verifyDispatch({
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
      await bridge.runCoverageGoal(phase.detail.goal.id);
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
      const rejected = await bridge.rejectDispatch({
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
              <AgentLiveExecution dispatchId={phase.dispatch.id} />
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
          />
        </div>
      </div>
    </AgentModalShell>
  );
}

/**
 * Walk the mock event timeline forward, calling `appendEvent` for each entry.
 * Returns a cancel function that aborts pending entries on unmount.
 */
function streamMockEvents(
  bridge: DispatchBridge,
  dispatchId: string,
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
        void bridge.appendEvent({
          dispatch_id: dispatchId,
          event_type: entry.event_type,
          payload: entry.payload,
        });
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
