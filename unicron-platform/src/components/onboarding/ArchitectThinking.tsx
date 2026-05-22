// Conversational onboarding Architect step.
//
// SPEC: Company Docs/Metacron/SPEC - Conversational Architect.md
//
// The thinking state is a multi-turn conversation: each operator message is
// appended to `constraints[]` and the next call to postDecomposition produces
// a fresh architect turn. The right-pane canvas + BusinessSummaryPanel always
// reflect the latest architect turn. APPROVE & DEPLOY operates on the latest
// turn and carries its `session_id` through `ApproveMeta`.
//
// Layout:
//   LEFT 1/3 — fixed BusinessSummaryPanel above; scrollable conversation
//              thread below; pinned composer + action buttons at the bottom.
//   RIGHT 2/3 — ArchitectCanvas bound to the latest architect turn.

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSettings } from '../SettingsContext';
import { postDecomposition } from '../../lib/architectClient';
import {
  architectureToLines,
  architectureToSystemConfig,
} from '../../lib/architectAdapters';
import { listCustomerOrgs } from '../../lib/customersClient';
import { ArchitectCanvas } from './ArchitectCanvas';
import type {
  BusinessSummary,
  DecompositionArchitecture,
  DecompositionResponse,
} from '../../lib/contracts/architect';
import type { SystemConfig } from '../../context/SystemContext';
import { ArchitectureEditor } from './ArchitectureEditor';
import { ApproveDeployModal, deriveDefaultName } from './ApproveDeployModal';
import type { CustomerIntake } from './CustomerIntakeModal';
import {
  BusinessSummaryPanel,
  type BusinessSummaryStatus,
} from '../BusinessSummaryPanel';

// 16-turn cap per SPEC; mirrors the `constraints[]` length cap enforced by
// Pathfinder's `/api/architect/decompose` route handler.
const MAX_OPERATOR_TURNS = 16;
const REVEAL_INTERVAL_MS = 60;

export type ApproveMeta = {
  name: string;
  slug: string;
  architecture: DecompositionArchitecture;
  /**
   * The latest architect turn's `session_id`. Carried through so downstream
   * persistence (architect-session-org-link) keeps pointing at the live
   * blueprint rather than the first turn. Null when no architect turn has
   * landed (first decomposition failed before any session existed).
   */
  session_id: string | null;
};

type ChatMessage =
  | { kind: 'operator'; id: string; text: string }
  | {
      kind: 'architect';
      id: string;
      turnIndex: number;
      response: DecompositionResponse;
    }
  | { kind: 'thinking'; id: string }
  | { kind: 'error'; id: string; message: string };

type Props = {
  buyerPain: string;
  /**
   * Captured up-front via CustomerIntakeModal before decomposition kicks off.
   * Forwarded to postDecomposition on every turn so the proxy stamps the
   * intake onto architect_sessions.input_payload.customer_intake.
   */
  customerIntake?: CustomerIntake;
  onApprove: (config: SystemConfig, meta: ApproveMeta) => Promise<void> | void;
};

export function ArchitectThinking({ buyerPain, customerIntake, onApprove }: Props) {
  const { settings } = useSettings();

  // Conversation state.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [operatorTurns, setOperatorTurns] = useState<string[]>([]);
  const [latestArchitect, setLatestArchitect] = useState<DecompositionResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [composer, setComposer] = useState('');
  const [editing, setEditing] = useState(false);

  // Approve modal state.
  const [pending, setPending] = useState<{
    architecture: DecompositionArchitecture;
    config: SystemConfig;
    sessionId: string | null;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [existingSlugs, setExistingSlugs] = useState<string[]>([]);

  // Operator-edited business_summary; overrides the latest architecture's
  // business_summary until Approve/Deploy. Reset on each new buyerPain.
  const [summaryEdits, setSummaryEdits] = useState<BusinessSummary | null>(null);
  const [customerDisplayName, setCustomerDisplayName] = useState(
    customerIntake?.name ?? '',
  );

  // Type-on animation cursor for the LATEST architect turn only. Older
  // turns are rendered fully — the cursor resets to 0 when a new turn lands.
  const [revealed, setRevealed] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const intakeForDecompose = useMemo(
    () =>
      customerIntake
        ? {
            name: customerIntake.name,
            slug: customerIntake.slug,
            contact_name: customerIntake.contactName,
          }
        : undefined,
    [customerIntake],
  );

  // `runTurn` lives behind a ref + effect so the initial-decomposition
  // effect can fire exactly once per onboarding without listing runTurn
  // as a dependency — listing it caused the effect to re-fire when
  // buyerPain/intake changed reference identity in subsequent renders,
  // double-firing the first decomposition. Re-binding the ref's value
  // inside an unconditional effect keeps the closure fresh.
  const runTurnRef = useRef<(turns: string[]) => Promise<void>>(async () => {});
  useEffect(() => {
    runTurnRef.current = async (nextOperatorTurns: string[]) => {
      setSending(true);
      const thinkingId = makeId('thinking');
      setMessages((prev) => [...prev, { kind: 'thinking', id: thinkingId }]);
      try {
        const res = await postDecomposition({
          buyerPain,
          customerIntake: intakeForDecompose,
          constraints: nextOperatorTurns,
        });
        // Reset the reveal cursor in the SAME render batch as appending
        // the new architect turn — otherwise the new latest turn briefly
        // renders with the prior turn's cursor value (instant render when
        // new turn has fewer lines; partial-then-blank flicker otherwise)
        // before the latestArchitect-dep'd effect runs setRevealed(0).
        setRevealed(0);
        setMessages((prev) => {
          const next = prev.filter((m) => m.id !== thinkingId);
          const turnIndex = next.filter((m) => m.kind === 'architect').length;
          return [
            ...next,
            { kind: 'architect', id: makeId('arch'), turnIndex, response: res },
          ];
        });
        setLatestArchitect(res);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== thinkingId),
          { kind: 'error', id: makeId('err'), message },
        ]);
      } finally {
        setSending(false);
      }
    };
  });
  const runTurn = useCallback(
    (turns: string[]) => runTurnRef.current(turns),
    [],
  );

  // Initial decomposition — turn 1 with empty constraints. Keyed on
  // buyerPain so a fresh onboarding (different pain text) starts clean.
  // Guarded by a ref so React 19 StrictMode's double-invoked effects
  // don't fire two initial decompositions on the same pain.
  const initFiredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (initFiredForRef.current === buyerPain) return;
    initFiredForRef.current = buyerPain;
    setMessages([]);
    setOperatorTurns([]);
    setLatestArchitect(null);
    setComposer('');
    setEditing(false);
    setPending(null);
    setServerError(null);
    setSummaryEdits(null);
    setRevealed(0);
    void runTurnRef.current([]);
  }, [buyerPain]);

  useEffect(() => {
    let cancelled = false;
    listCustomerOrgs()
      .then((orgs) => {
        if (cancelled) return;
        setExistingSlugs(orgs.map((o) => o.slug));
      })
      .catch(() => {
        // Non-fatal — modal still validates server-side.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Drive the type-on animation for the LATEST architect turn whenever it
  // changes. Older turns render fully.
  const latestTurnLines = useMemo(() => {
    if (!latestArchitect) return [] as string[];
    return architectureToLines(
      latestArchitect.architecture,
      [],
      latestArchitect.costUsd,
      { includeOpenQuestions: false },
    )
      .filter((l) => settings.showInternalCostMetrics || l.kind !== 'cost')
      .map((l) => l.text);
  }, [latestArchitect, settings.showInternalCostMetrics]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRevealed(0);
  }, [latestArchitect]);

  useEffect(() => {
    if (!latestTurnLines.length) return;
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setRevealed((curr) => {
        if (curr >= latestTurnLines.length) {
          if (intervalRef.current) window.clearInterval(intervalRef.current);
          return curr;
        }
        return curr + 1;
      });
    }, REVEAL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [latestTurnLines]);

  // Auto-scroll the thread to the latest message on append. scrollIntoView
  // is not implemented in jsdom, so guard for tests.
  useEffect(() => {
    if (typeof threadEndRef.current?.scrollIntoView === 'function') {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  const latestArchTurnIndex = useMemo(() => {
    let last = -1;
    for (const m of messages) {
      if (m.kind === 'architect') last = m.turnIndex;
    }
    return last;
  }, [messages]);

  const conversationLimitReached = operatorTurns.length >= MAX_OPERATOR_TURNS;
  const latestTurnDone = revealed >= latestTurnLines.length;
  const canApprove = !!latestArchitect && latestTurnDone && !sending;

  const composeArchitecture = (
    base: DecompositionArchitecture,
  ): DecompositionArchitecture => {
    const summary = summaryEdits ?? base.business_summary;
    return summary ? { ...base, business_summary: summary } : base;
  };

  const sendComposer = useCallback(async () => {
    const text = composer.trim();
    if (!text || sending || conversationLimitReached) return;
    const operatorMessageId = makeId('op');
    setMessages((prev) => [
      ...prev,
      { kind: 'operator', id: operatorMessageId, text },
    ]);
    const nextTurns = [...operatorTurns, text];
    setOperatorTurns(nextTurns);
    setComposer('');
    await runTurn(nextTurns);
  }, [composer, conversationLimitReached, operatorTurns, runTurn, sending]);

  const seedComposerFromQuestion = (question: string) => {
    if (sending || conversationLimitReached) return;
    const label = shortQuestionLabel(question);
    setComposer((prev) => {
      const seed = `Re: ${label} — `;
      if (prev.length === 0) return seed;
      // Don't clobber existing operator typing.
      return prev.startsWith('Re: ') ? prev : `${seed}${prev}`;
    });
    composerRef.current?.focus();
  };

  const handleApply = (next: DecompositionArchitecture) => {
    const composed = composeArchitecture(next);
    const nextConfig = architectureToSystemConfig(composed, buyerPain);
    setPending({
      architecture: composed,
      config: { ...nextConfig, status: 'live' },
      sessionId: latestArchitect?.sessionId ?? null,
    });
    setServerError(null);
    setEditing(false);
  };

  const handleApprove = () => {
    if (!latestArchitect) return;
    setPending({
      architecture: composeArchitecture(latestArchitect.architecture),
      config: { ...latestArchitect.recommendedConfig, status: 'live' },
      sessionId: latestArchitect.sessionId,
    });
    setServerError(null);
  };

  const handleSummaryEdit = (
    field: keyof BusinessSummary,
    value: string,
  ) => {
    const baseline =
      summaryEdits ??
      latestArchitect?.architecture.business_summary ?? {
        lead_type: '',
        business_area: '',
        problem_solved: '',
        what_they_get: '',
      };
    setSummaryEdits({ ...baseline, [field]: value });
  };

  const summaryToRender: BusinessSummary | null =
    summaryEdits ?? latestArchitect?.architecture.business_summary ?? null;
  const lastMessageIsError = messages[messages.length - 1]?.kind === 'error';
  const summaryStatus: BusinessSummaryStatus =
    lastMessageIsError && !latestArchitect
      ? 'error'
      : !latestArchitect
      ? 'loading'
      : summaryToRender
      ? 'ready'
      : 'error';

  const handleConfirm = async ({ name, slug }: { name: string; slug: string }) => {
    if (!pending) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await onApprove(pending.config, {
        name,
        slug,
        architecture: pending.architecture,
        session_id: pending.sessionId,
      });
    } catch (e) {
      setServerError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="architect-thinking-v2"
      className="grid grid-cols-[1fr_2fr] w-full h-[calc(100vh-56px)] bg-bg-base"
    >
      {/* LEFT PANE — conversation thread */}
      <div
        data-testid="architect-thinking-text-pane"
        className="h-full flex flex-col border-r border-border-default bg-bg-card"
      >
        {/* Top scrollable region: BusinessSummary + thread */}
        <div
          data-testid="architect-thinking-thread"
          className="flex-1 overflow-y-auto"
        >
          <div className="flex flex-col gap-6 px-6 py-6">
            <BusinessSummaryPanel
              summary={summaryToRender}
              customerName={customerDisplayName}
              onEdit={handleSummaryEdit}
              status={summaryStatus}
              errorMessage={
                lastMessageIsError && !latestArchitect
                  ? 'Architect decomposition failed. Send a message in the composer to retry.'
                  : undefined
              }
            />

            {editing && latestArchitect ? (
              <div className="bg-bg-card border border-border-default rounded-lg p-5">
                <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-4">
                  ARCHITECT · EDIT ARCHITECTURE
                </div>
                <ArchitectureEditor
                  architecture={latestArchitect.architecture}
                  onApply={handleApply}
                  onCancel={() => setEditing(false)}
                />
              </div>
            ) : (
              <ConversationThread
                buyerPain={buyerPain}
                messages={messages}
                latestArchTurnIndex={latestArchTurnIndex}
                latestTurnRevealed={revealed}
                latestTurnLines={latestTurnLines}
                onQuestionClick={seedComposerFromQuestion}
                disabledQuestions={sending || conversationLimitReached}
              />
            )}
            <div ref={threadEndRef} />
          </div>
        </div>

        {/* Pinned composer + action buttons */}
        <div
          data-testid="architect-thinking-composer"
          className="border-t border-border-default bg-bg-card px-6 py-4 flex flex-col gap-3"
        >
          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              disabled={!canApprove}
              onClick={handleApprove}
              data-testid="architect-approve-button"
              className={[
                'bg-accent-primary text-white mono text-[12px] tracking-[0.12em] uppercase py-2.5 px-4 rounded-md transition-all',
                canApprove
                  ? 'hover:bg-accent-primary/90'
                  : 'opacity-40 cursor-not-allowed',
              ].join(' ')}
            >
              APPROVE & DEPLOY
            </button>
            <button
              type="button"
              disabled={!latestArchitect || sending}
              onClick={() => setEditing(true)}
              className={[
                'border border-border-default text-text-primary mono text-[12px] tracking-[0.12em] uppercase py-2.5 px-4 rounded-md transition-colors',
                latestArchitect && !sending
                  ? 'hover:border-border-hover'
                  : 'opacity-40 cursor-not-allowed',
              ].join(' ')}
            >
              EDIT ARCHITECTURE
            </button>
          </div>

          <Composer
            ref={composerRef}
            value={composer}
            disabled={sending || conversationLimitReached}
            placeholder={
              conversationLimitReached
                ? 'Conversation limit reached — Approve & Deploy or Edit Architecture.'
                : sending
                ? 'Architect is thinking…'
                : 'Answer an open question or refine the architecture…'
            }
            onChange={setComposer}
            onSend={sendComposer}
          />
        </div>
      </div>

      {/* RIGHT PANE — canvas bound to the LATEST architect turn */}
      <div data-testid="architect-thinking-canvas-pane" className="h-full w-full relative">
        <ArchitectCanvas
          architecture={latestArchitect?.architecture ?? null}
          loadingLabel={
            !latestArchitect && lastMessageIsError
              ? 'Architect · decomposition failed'
              : !latestArchitect
              ? 'Architect · decomposing'
              : undefined
          }
          edgeAttached
        />
      </div>

      {pending ? (
        <ApproveDeployModal
          defaultName={customerIntake?.name ?? deriveDefaultName(buyerPain)}
          defaultSlug={customerIntake?.slug}
          existingSlugs={existingSlugs}
          submitting={submitting}
          serverError={serverError}
          onCancel={() => {
            if (submitting) return;
            setPending(null);
          }}
          onConfirm={handleConfirm}
          onNameChange={setCustomerDisplayName}
        />
      ) : null}
    </div>
  );
}

// ---- Sub-components ------------------------------------------------------

type ThreadProps = {
  buyerPain: string;
  messages: ChatMessage[];
  latestArchTurnIndex: number;
  latestTurnRevealed: number;
  latestTurnLines: string[];
  onQuestionClick: (q: string) => void;
  disabledQuestions: boolean;
};

function ConversationThread({
  buyerPain,
  messages,
  latestArchTurnIndex,
  latestTurnRevealed,
  latestTurnLines,
  onQuestionClick,
  disabledQuestions,
}: ThreadProps) {
  return (
    <div className="flex flex-col gap-4">
      <OperatorMessage text={buyerPain} label="OPERATOR · BUYER PAIN" />

      {messages.map((m) => {
        if (m.kind === 'operator') {
          return <OperatorMessage key={m.id} text={m.text} label="OPERATOR" />;
        }
        if (m.kind === 'error') {
          return (
            <div
              key={m.id}
              data-testid="architect-error-message"
              className="mono text-[11px] text-accent-magenta border border-accent-magenta/40 rounded-md p-3"
            >
              architect error: {m.message}
            </div>
          );
        }
        if (m.kind === 'thinking') {
          return (
            <div
              key={m.id}
              data-testid="architect-thinking-indicator"
              className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold flex items-center gap-2 px-1"
            >
              <span>Architect is thinking</span>
              <Ellipsis />
            </div>
          );
        }
        const isLatest = m.turnIndex === latestArchTurnIndex;
        return (
          <ArchitectMessage
            key={m.id}
            response={m.response}
            isLatest={isLatest}
            revealed={isLatest ? latestTurnRevealed : latestTurnLines.length}
            lines={isLatest ? latestTurnLines : null}
            onQuestionClick={onQuestionClick}
            disabledQuestions={disabledQuestions || !isLatest}
            answered={!isLatest}
          />
        );
      })}
    </div>
  );
}

function OperatorMessage({ text, label }: { text: string; label: string }) {
  return (
    <div
      data-testid="operator-message"
      className="bg-bg-base border border-border-default rounded-lg p-4"
    >
      <div className="mono text-[10px] uppercase tracking-[0.22em] text-text-tertiary mb-2">
        {label}
      </div>
      <div className="text-[13px] leading-[1.55] text-text-primary whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

type ArchitectMessageProps = {
  response: DecompositionResponse;
  isLatest: boolean;
  revealed: number;
  /** When latest: the in-progress reveal lines. When older: null (full render). */
  lines: string[] | null;
  onQuestionClick: (q: string) => void;
  disabledQuestions: boolean;
  answered: boolean;
};

function ArchitectMessage({
  response,
  isLatest,
  revealed,
  lines,
  onQuestionClick,
  disabledQuestions,
  answered,
}: ArchitectMessageProps) {
  // For non-latest turns, render the full line set (no reveal cursor).
  const fullLines = useMemo(() => {
    if (lines) return lines;
    return architectureToLines(
      response.architecture,
      [],
      response.costUsd,
      { includeOpenQuestions: false },
    )
      .filter((l) => l.kind !== 'cost')
      .map((l) => l.text);
  }, [lines, response]);

  const visibleLines = isLatest ? fullLines.slice(0, revealed) : fullLines;
  const showCursor = isLatest && revealed < fullLines.length;

  return (
    <div
      data-testid="architect-message"
      data-turn-latest={isLatest ? 'true' : 'false'}
      className="bg-bg-card border border-border-default rounded-lg p-4"
    >
      <div className="mono text-[10px] uppercase tracking-[0.22em] text-accent-gold mb-3">
        ARCHITECT · DECOMPOSITION
      </div>
      <pre className="mono text-[12px] leading-[1.65] text-text-primary whitespace-pre-wrap">
        {visibleLines.map((line, i) => (
          <Line key={i} text={line} />
        ))}
        {showCursor && (
          <span className="inline-block w-[6px] h-[12px] bg-accent-gold align-baseline animate-pulseDot" />
        )}
      </pre>

      {response.architecture.open_questions.length > 0 && (
        <div className="mt-4 flex flex-col gap-1">
          <div className="mono text-[10px] uppercase tracking-[0.22em] text-text-tertiary mb-1">
            OPEN QUESTIONS
          </div>
          {response.architecture.open_questions.map((q, i) => (
            <button
              key={i}
              type="button"
              disabled={disabledQuestions}
              onClick={() => onQuestionClick(q)}
              data-testid="architect-open-question"
              className={[
                'text-left text-[12px] leading-[1.5] py-1.5 px-2 rounded-md transition-colors border border-transparent',
                answered
                  ? 'text-text-tertiary line-through cursor-default'
                  : disabledQuestions
                  ? 'text-text-secondary opacity-60 cursor-not-allowed'
                  : 'text-text-primary hover:bg-bg-base hover:border-border-default cursor-pointer',
              ].join(' ')}
            >
              {answered ? '✓ ' : '? '}
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type ComposerProps = {
  value: string;
  disabled: boolean;
  placeholder: string;
  onChange: (v: string) => void;
  onSend: () => void;
};

const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  { value, disabled, placeholder, onChange, onSend },
  ref,
) {
  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={ref}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            onSend();
          }
        }}
        rows={3}
        data-testid="architect-composer"
        className={[
          'w-full resize-none bg-bg-base border border-border-default rounded-md',
          'mono text-[12px] leading-[1.55] text-text-primary placeholder:text-text-tertiary',
          'p-3 focus:outline-none focus:border-border-hover transition-colors',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      />
      <div className="flex justify-end">
        <button
          type="button"
          disabled={disabled || value.trim().length === 0}
          onClick={onSend}
          data-testid="architect-composer-send"
          className={[
            'mono text-[11px] tracking-[0.12em] uppercase py-2 px-4 rounded-md transition-all',
            !disabled && value.trim().length > 0
              ? 'bg-accent-gold text-bg-base hover:bg-accent-gold/90'
              : 'bg-bg-base border border-border-default text-text-tertiary opacity-50 cursor-not-allowed',
          ].join(' ')}
        >
          Send
        </button>
      </div>
    </div>
  );
});

function Line({ text }: { text: string }) {
  if (text.includes('[INTERNAL ONLY]')) {
    const idx = text.indexOf('[INTERNAL ONLY]');
    return (
      <span className="block">
        {text.slice(0, idx)}
        <span className="text-accent-gold">[INTERNAL ONLY]</span>
      </span>
    );
  }
  return <span className="block">{text || ' '}</span>;
}

function Ellipsis() {
  return (
    <span className="inline-flex">
      <span className="animate-ellipsis" style={{ animationDelay: '0s' }}>
        .
      </span>
      <span className="animate-ellipsis" style={{ animationDelay: '0.2s' }}>
        .
      </span>
      <span className="animate-ellipsis" style={{ animationDelay: '0.4s' }}>
        .
      </span>
    </span>
  );
}

// ---- Helpers -------------------------------------------------------------

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function shortQuestionLabel(q: string): string {
  // First clause, capped at 60 chars.
  const trimmed = q.trim().replace(/[?]+$/, '');
  const firstSentence = trimmed.split(/[.\n]/)[0] ?? trimmed;
  return firstSentence.length > 60
    ? `${firstSentence.slice(0, 57).trimEnd()}…`
    : firstSentence;
}
