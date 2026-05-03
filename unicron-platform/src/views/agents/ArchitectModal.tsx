import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentModalShell } from '../../components/agent-console/AgentModalShell';
import { AgentLiveExecution } from '../../components/agent-console/AgentLiveExecution';
import { AgentHistoryGrid } from '../../components/agent-console/AgentHistoryGrid';
import { architectAgent } from '../../lib/agents/architectAgent';
import {
  appendEvent,
  createDispatch,
  getDispatch,
  rejectDispatch,
  requeueDispatch,
  verifyDispatch,
} from '../../lib/agentConsoleClient';
import {
  postArchitectDecompose,
  postArchitectTune,
  postArchitectDiscover,
} from '../../lib/architectModesClient';
import type {
  AgentDispatch,
  AgentDispatchEvent,
  AgentDispatchEventType,
} from '../../lib/contracts/agentConsole';
import type {
  DecompositionApiResponse,
  TuningApiResponse,
  DiscoveryApiResponse,
  ArchitectProposalRow,
  TuningProposalDetails,
  DiscoveryProposalDetails,
} from '../../lib/contracts/architect';

interface Props {
  onClose: () => void;
  bridge?: ArchitectBridge;
}

export type ArchitectMode = 'decomposition' | 'tuning' | 'discovery';

export interface ArchitectBridge {
  createDispatch: typeof createDispatch;
  appendEvent: typeof appendEvent;
  verifyDispatch: typeof verifyDispatch;
  rejectDispatch: typeof rejectDispatch;
  getDispatch: typeof getDispatch;
  postArchitectDecompose: typeof postArchitectDecompose;
  postArchitectTune: typeof postArchitectTune;
  postArchitectDiscover: typeof postArchitectDiscover;
}

const REAL_BRIDGE: ArchitectBridge = {
  createDispatch,
  appendEvent,
  verifyDispatch,
  rejectDispatch,
  getDispatch,
  postArchitectDecompose,
  postArchitectTune,
  postArchitectDiscover,
};

type Result =
  | { mode: 'decomposition'; data: DecompositionApiResponse }
  | { mode: 'tuning'; data: TuningApiResponse }
  | { mode: 'discovery'; data: DiscoveryApiResponse };

type Phase =
  | { kind: 'idle' }
  | { kind: 'dispatching' }
  | { kind: 'running'; dispatch: AgentDispatch; mode: ArchitectMode }
  | { kind: 'awaiting_review'; dispatch: AgentDispatch; result: Result }
  | { kind: 'verified'; dispatch: AgentDispatch; result: Result }
  | { kind: 'rejected'; dispatch: AgentDispatch; result: Result | null }
  | { kind: 'failed'; error: string };

const ARCHITECT_API_MOCK = import.meta.env.VITE_ARCHITECT_API_ENABLED !== 'true';
const ORG_ID = 'pathfinder-default';

export function ArchitectModal({ onClose, bridge = REAL_BRIDGE }: Props) {
  const [mode, setMode] = useState<ArchitectMode>('decomposition');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [committing, setCommitting] = useState(false);
  const [mockEvents, setMockEvents] = useState<AgentDispatchEvent[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelRef.current?.(), []);

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
      return phase.result.data.cost_usd;
    }
    return null;
  }, [phase]);

  const dispatchMode = async (
    inputPayload: Record<string, unknown>,
    fetchResult: () => Promise<Result>,
  ) => {
    setPhase({ kind: 'dispatching' });
    setMockEvents([]);
    try {
      const dispatch = isMockRuntime
        ? synthesizeDispatch(mode, inputPayload)
        : await bridge.createDispatch({
            agent_name: architectAgent.name,
            customer_org_id: ORG_ID,
            input_payload: { mode, ...inputPayload, summary: summarizeForTile(mode, inputPayload) },
          });
      setPhase({ kind: 'running', dispatch, mode });

      // Architect endpoints return reasoning at completion (no SSE). We
      // animate by streaming a synthesized timeline of "thinking" events
      // while the actual fetch resolves in parallel.
      const fetchPromise = fetchResult().catch((e) => {
        setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
        return null as Result | null;
      });

      cancelRef.current = streamThinking(
        bridge,
        dispatch.id,
        isMockRuntime,
        (e) => setMockEvents((prev) => [...prev, e]),
        async () => {
          const result = await fetchPromise;
          if (!result) return;
          // Append each reasoning line as a final event so the live panel
          // shows the actual output before flipping to result panel.
          for (const line of resultReasoning(result)) {
            const event: AgentDispatchEvent = {
              id: cryptoRandomId(),
              dispatch_id: dispatch.id,
              event_type: 'reasoning',
              payload: { text: line },
              created_at: new Date().toISOString(),
            };
            if (isMockRuntime) {
              setMockEvents((prev) => [...prev, event]);
            } else {
              void bridge.appendEvent({
                dispatch_id: dispatch.id,
                event_type: 'reasoning',
                payload: { text: line },
              });
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
            cost_usd: phase.result.data.cost_usd,
            duration_ms: phase.result.data.duration_ms,
          }
        : await bridge.verifyDispatch({
            id: phase.dispatch.id,
            verified_by_user_id: 'operator-mock',
            result_payload: { mode: phase.result.mode, summary: summarizeResult(phase.result) },
          });
      setPhase({ kind: 'verified', dispatch: verified, result: phase.result });
    } catch (e) {
      setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <AgentModalShell
      agent={architectAgent}
      status={status}
      costUsd={costUsd}
      recentRunsCount={null}
      onClose={onClose}
    >
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <ModeTabs current={mode} onChange={setMode} disabled={phase.kind !== 'idle'} />

        {phase.kind === 'idle' ? (
          mode === 'decomposition' ? (
            <DecompositionForm
              onSubmit={async (req) =>
                dispatchMode(req as unknown as Record<string, unknown>, async () => ({
                  mode: 'decomposition',
                  data: await bridge.postArchitectDecompose(req),
                }))
              }
            />
          ) : mode === 'tuning' ? (
            <TuningForm
              onSubmit={async (req) =>
                dispatchMode(req as unknown as Record<string, unknown>, async () => ({
                  mode: 'tuning',
                  data: await bridge.postArchitectTune(req),
                }))
              }
            />
          ) : (
            <DiscoveryForm
              onSubmit={async (req) =>
                dispatchMode(req as unknown as Record<string, unknown>, async () => ({
                  mode: 'discovery',
                  data: await bridge.postArchitectDiscover(req),
                }))
              }
            />
          )
        ) : null}

        {(phase.kind === 'dispatching' || phase.kind === 'running') && (
          <section className="flex flex-col gap-3" data-testid="architect-running">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
              LIVE EXECUTION · {mode.toUpperCase()}
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
          <ResultPanel
            result={phase.result}
            onCommit={phase.kind === 'awaiting_review' ? handleVerify : undefined}
            committing={committing}
            readOnly={phase.kind === 'verified'}
          />
        )}

        {phase.kind === 'failed' ? (
          <div
            data-testid="architect-error"
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

        <div className="border-t border-border-default pt-6">
          <AgentHistoryGrid
            agentName={architectAgent.name}
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
  );
}

// ---------------------------------------------------------------------------
// Sub-components — mode tabs + per-mode form + result renderers.
// ---------------------------------------------------------------------------

function ModeTabs({
  current,
  onChange,
  disabled,
}: {
  current: ArchitectMode;
  onChange: (m: ArchitectMode) => void;
  disabled?: boolean;
}) {
  const modes: { id: ArchitectMode; label: string; sub: string }[] = [
    { id: 'decomposition', label: 'DECOMPOSITION', sub: 'new vertical' },
    { id: 'tuning', label: 'TUNING', sub: 'weekly per-org' },
    { id: 'discovery', label: 'DISCOVERY', sub: 'continuous source finding' },
  ];
  return (
    <div className="flex gap-2" data-testid="architect-mode-tabs">
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          disabled={disabled}
          data-testid={`architect-mode-${m.id}`}
          aria-current={current === m.id ? 'true' : 'false'}
          className={[
            'flex-1 flex flex-col items-start gap-0.5 border rounded-md px-3 py-2',
            current === m.id
              ? 'border-accent-gold/60 bg-bg-panel'
              : 'border-border-default hover:border-border-default/70',
            disabled ? 'opacity-50 cursor-not-allowed' : '',
          ].join(' ')}
        >
          <span className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary">
            {m.label}
          </span>
          <span className="mono text-[10px] tracking-[0.04em] text-text-primary/50">{m.sub}</span>
        </button>
      ))}
    </div>
  );
}

function DecompositionForm({
  onSubmit,
}: {
  onSubmit: (req: { buyer_pain_prompt: string; vertical_id?: string }) => void | Promise<void>;
}) {
  const [prompt, setPrompt] = useState('');
  const [verticalId, setVerticalId] = useState('pathfinder-default');
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      data-testid="architect-decomposition-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        if (prompt.trim().length < 10) {
          setErr('Buyer pain prompt must be at least 10 characters.');
          return;
        }
        await onSubmit({ buyer_pain_prompt: prompt.trim(), vertical_id: verticalId });
      }}
      className="flex flex-col gap-4"
    >
      <FieldRow label="BUYER PAIN" hint="Describe who you sell to and what signal precedes their need.">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          placeholder="e.g. distributors of temporary construction-site security want to know about new commercial builds before incumbents"
          data-testid="architect-decomposition-prompt"
          className={inputClass}
        />
      </FieldRow>
      <FieldRow label="VERTICAL">
        <select
          value={verticalId}
          onChange={(e) => setVerticalId(e.target.value)}
          className={inputClass}
          data-testid="architect-decomposition-vertical"
        >
          <option value="pathfinder-default">pathfinder-default</option>
          <option value="construction-security">construction-security</option>
        </select>
      </FieldRow>
      {err ? (
        <p data-testid="architect-form-error" className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400">
          {err}
        </p>
      ) : null}
      <button
        type="submit"
        data-testid="architect-dispatch-button"
        className="self-end mono text-[11px] uppercase tracking-[0.18em] border border-text-primary px-4 py-2 rounded-md text-text-primary hover:bg-text-primary hover:text-bg-base transition-colors"
      >
        DISPATCH
      </button>
    </form>
  );
}

function TuningForm({
  onSubmit,
}: {
  onSubmit: (req: { vertical_id?: string; feedback_window_days?: number }) => void | Promise<void>;
}) {
  const [verticalId, setVerticalId] = useState('pathfinder-default');
  const [windowDays, setWindowDays] = useState(7);
  return (
    <form
      data-testid="architect-tuning-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit({ vertical_id: verticalId, feedback_window_days: windowDays });
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldRow label="VERTICAL">
          <select
            value={verticalId}
            onChange={(e) => setVerticalId(e.target.value)}
            data-testid="architect-tuning-vertical"
            className={inputClass}
          >
            <option value="pathfinder-default">pathfinder-default</option>
            <option value="construction-security">construction-security</option>
          </select>
        </FieldRow>
        <FieldRow label="LOOKBACK">
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            data-testid="architect-tuning-window"
            className={inputClass}
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </FieldRow>
      </div>
      <button
        type="submit"
        data-testid="architect-dispatch-button"
        className="self-end mono text-[11px] uppercase tracking-[0.18em] border border-text-primary px-4 py-2 rounded-md text-text-primary hover:bg-text-primary hover:text-bg-base transition-colors"
      >
        DISPATCH
      </button>
    </form>
  );
}

function DiscoveryForm({
  onSubmit,
}: {
  onSubmit: (req: { vertical_id?: string; context?: Record<string, unknown> }) => void | Promise<void>;
}) {
  const [verticalId, setVerticalId] = useState('pathfinder-default');
  const [geo, setGeo] = useState('');
  return (
    <form
      data-testid="architect-discovery-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit({
          vertical_id: verticalId,
          context: geo.trim() ? { geographic_focus: geo.trim() } : undefined,
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldRow label="VERTICAL">
          <select
            value={verticalId}
            onChange={(e) => setVerticalId(e.target.value)}
            data-testid="architect-discovery-vertical"
            className={inputClass}
          >
            <option value="pathfinder-default">pathfinder-default</option>
            <option value="construction-security">construction-security</option>
          </select>
        </FieldRow>
        <FieldRow label="GEOGRAPHIC FOCUS (OPTIONAL)">
          <input
            type="text"
            value={geo}
            onChange={(e) => setGeo(e.target.value)}
            placeholder="e.g. Pittsburgh metro"
            data-testid="architect-discovery-geo"
            className={inputClass}
          />
        </FieldRow>
      </div>
      <button
        type="submit"
        data-testid="architect-dispatch-button"
        className="self-end mono text-[11px] uppercase tracking-[0.18em] border border-text-primary px-4 py-2 rounded-md text-text-primary hover:bg-text-primary hover:text-bg-base transition-colors"
      >
        DISPATCH
      </button>
    </form>
  );
}

function ResultPanel({
  result,
  onCommit,
  committing,
  readOnly,
}: {
  result: Result;
  onCommit?: () => void | Promise<void>;
  committing?: boolean;
  readOnly?: boolean;
}) {
  return (
    <section
      data-testid="architect-result-panel"
      data-result-mode={result.mode}
      className="flex flex-col gap-4"
    >
      <header className="flex items-baseline justify-between gap-4">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
          RESULT · {result.mode.toUpperCase()}
        </span>
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
          ${result.data.cost_usd.toFixed(2)} · {(result.data.duration_ms / 1000).toFixed(1)}s
        </span>
      </header>

      {result.mode === 'decomposition' ? (
        <DecompositionResult data={result.data} />
      ) : result.mode === 'tuning' ? (
        <TuningResult data={result.data} />
      ) : (
        <DiscoveryResult data={result.data} />
      )}

      {!readOnly && onCommit ? (
        <footer className="flex items-center justify-between border-t border-border-default pt-4">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
            Verify spawns dependent jobs (Phase 2 — currently records the verification only).
          </span>
          <button
            type="button"
            onClick={onCommit}
            disabled={committing}
            data-testid="architect-commit-button"
            className="mono text-[11px] uppercase tracking-[0.18em] border border-emerald-400/60 text-emerald-400 px-4 py-2 rounded-md hover:bg-emerald-400 hover:text-bg-base disabled:opacity-50 transition-colors"
          >
            {committing ? 'COMMITTING…' : 'VERIFY'}
          </button>
        </footer>
      ) : null}
    </section>
  );
}

function DecompositionResult({ data }: { data: DecompositionApiResponse }) {
  const a = data.architecture;
  return (
    <div data-testid="architect-decomposition-result" className="flex flex-col gap-4">
      <Block label="BUYER" body={a.buyer} />
      <Block label="BUYING SIGNAL" body={a.buying_signal} />
      <div>
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
          DATA SOURCES PROPOSED ({a.data_sources_proposed.length})
        </span>
        <ul className="flex flex-col gap-1 mt-2">
          {a.data_sources_proposed.map((s, i) => (
            <li
              key={`${s.type}-${i}`}
              className="border border-border-default rounded-md bg-bg-panel px-3 py-2 text-[12px] text-text-primary/80"
            >
              <span className="mono text-[11px] text-text-primary">{s.type}</span> ·{' '}
              {s.jurisdictions.join(', ')} · est {s.expected_daily_volume}/day
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="DAILY QUALIFIED" value={String(a.estimates.daily_qualified_volume)} />
        <Stat label="COST PER LEAD" value={`$${a.estimates.cost_per_lead_usd.toFixed(2)}`} />
        <Stat label="CONFIDENCE" value={a.estimates.architecture_confidence.toUpperCase()} />
      </div>
      {a.open_questions.length > 0 ? (
        <div>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
            OPEN QUESTIONS ({a.open_questions.length})
          </span>
          <ul className="list-disc list-inside text-[12px] text-text-primary/70 mt-1">
            {a.open_questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function TuningResult({ data }: { data: TuningApiResponse }) {
  return (
    <div data-testid="architect-tuning-result" className="flex flex-col gap-3">
      <p className="text-[12px] text-text-primary/80">{data.summary}</p>
      <ul className="flex flex-col gap-2">
        {data.proposals.map((p) => {
          const d = p.details as TuningProposalDetails | null;
          return (
            <li
              key={p.id}
              data-testid="architect-tuning-row"
              className="border border-border-default rounded-md bg-bg-panel p-3 flex flex-col gap-2"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="mono text-[11px] text-text-primary">{p.headline}</span>
                <span className="mono text-[10px] uppercase tracking-[0.18em] text-accent-gold">
                  conf {(p.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-[12px] text-text-primary/70">{p.body}</p>
              {d ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-text-primary/60">
                  <span>shadow: {d.shadow_test.wins}W/{d.shadow_test.losses}L of {d.shadow_test.sample_size}</span>
                  <span>win-rate: {(d.shadow_test.win_rate * 100).toFixed(0)}%</span>
                  <span>side-fx: {(d.shadow_test.side_effect_rate * 100).toFixed(1)}%</span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {data.rejected.length > 0 ? (
        <div className="text-[11px] text-text-primary/40">
          {data.rejected.length} rejected:
          {data.rejected.map((r) => ` ${r.cluster_key} (${r.reason})`).join(';')}
        </div>
      ) : null}
    </div>
  );
}

function DiscoveryResult({ data }: { data: DiscoveryApiResponse }) {
  return (
    <div data-testid="architect-discovery-result" className="flex flex-col gap-3">
      <p className="text-[12px] text-text-primary/80">{data.summary}</p>
      <ul className="flex flex-col gap-2">
        {data.proposals.map((p) => {
          const d = p.details as DiscoveryProposalDetails | null;
          return (
            <li
              key={p.id}
              data-testid="architect-discovery-row"
              className="border border-border-default rounded-md bg-bg-panel p-3 flex items-center justify-between gap-3"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <span className="mono text-[11px] text-text-primary truncate">{p.headline}</span>
                <span className="mono text-[10px] text-text-primary/50 truncate">
                  {d?.source_url ?? '—'}
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-[10px] text-text-primary/60 mono uppercase tracking-[0.14em]">
                <span>{d?.tier?.replace('_', ' ')}</span>
                <span>+{d?.lift_per_day?.toFixed(1) ?? '—'}/day</span>
                <span>conf {(p.confidence * 100).toFixed(0)}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers — synthetic dispatch, mock event timeline, layout primitives.
// ---------------------------------------------------------------------------

const THINKING_TIMELINE: ReadonlyArray<{
  delayMs: number;
  event_type: 'reasoning' | 'tool_call' | 'tool_result' | 'partial_output' | 'decision';
  payload: Record<string, unknown>;
}> = [
  { delayMs: 200, event_type: 'reasoning', payload: { text: 'Loading buyer/vertical context.' } },
  { delayMs: 400, event_type: 'tool_call', payload: { tool: 'load-context', args: {} } },
  { delayMs: 500, event_type: 'tool_result', payload: { ok: true } },
  { delayMs: 300, event_type: 'reasoning', payload: { text: 'Composing reasoning chain.' } },
];

function streamThinking(
  bridge: ArchitectBridge,
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
    const entry = THINKING_TIMELINE[cursor];
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

function resultReasoning(result: Result): string[] {
  if (result.mode === 'decomposition') return result.data.reasoning;
  if (result.mode === 'tuning') return [result.data.summary];
  return [result.data.summary];
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `evt-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function synthesizeDispatch(
  mode: ArchitectMode,
  inputPayload: Record<string, unknown>,
): AgentDispatch {
  const now = new Date().toISOString();
  return {
    id: cryptoRandomId(),
    agent_name: architectAgent.name,
    customer_org_id: ORG_ID,
    dispatched_by_user_id: null,
    input_payload: { mode, ...inputPayload, summary: summarizeForTile(mode, inputPayload) },
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

function summarizeForTile(mode: ArchitectMode, input: Record<string, unknown>): string {
  if (mode === 'decomposition') {
    const prompt = (input.buyer_pain_prompt as string | undefined) ?? '';
    return `decomposition · ${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}`;
  }
  if (mode === 'tuning') {
    return `tuning · ${input.vertical_id ?? 'pathfinder-default'} · ${input.feedback_window_days ?? 7}d`;
  }
  const ctx = (input.context as { geographic_focus?: string } | undefined) ?? {};
  return `discovery · ${input.vertical_id ?? 'pathfinder-default'} · ${ctx.geographic_focus ?? 'no geo'}`;
}

function summarizeResult(result: Result): string {
  if (result.mode === 'decomposition') {
    return `${result.data.architecture.data_sources_proposed.length} sources · ${result.data.architecture.estimates.daily_qualified_volume}/day · ${result.data.architecture.estimates.architecture_confidence}`;
  }
  if (result.mode === 'tuning') {
    return `${result.data.proposals.length} tuning proposals · ${result.data.rejected.length} rejected`;
  }
  return `${result.data.proposals.length} candidates · ${result.data.rejected.length} rejected`;
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
    <div className="flex flex-col gap-2 font-mono text-[12px]" data-testid="agent-live-execution">
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

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mono text-[10px] tracking-[0.04em] text-text-primary/30">{hint}</span>
      ) : null}
    </label>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">{label}</span>
      <p className="text-[12px] text-text-primary/80 mt-1">{body}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border border-border-default rounded-md bg-bg-panel px-3 py-2">
      <span className="mono text-[9px] uppercase tracking-[0.18em] text-text-primary/40">{label}</span>
      <span className="mono text-[14px] text-text-primary">{value}</span>
    </div>
  );
}

const inputClass =
  'bg-bg-panel border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-primary/30 focus:outline-none focus:border-accent-gold/60 disabled:opacity-50';

// ArchitectProposalRow re-exported for any consumer that filters tuning/discovery
// proposals by id.
export type { ArchitectProposalRow };
