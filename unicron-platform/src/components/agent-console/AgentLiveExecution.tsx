import { useEffect, useState } from 'react';
import type {
  AgentDispatchEvent,
  AgentDispatchEventType,
} from '../../lib/contracts/agentConsole';
import { ALL_EVENT_TYPES } from '../../lib/contracts/agentConsole';
import { listEvents, subscribeToEvents } from '../../lib/agentConsoleClient';

interface Props {
  dispatchId: string;
  /** Restrict the rendered log to a subset of event types. Default: all. */
  eventTypeFilter?: ReadonlyArray<AgentDispatchEventType>;
  /**
   * Override the subscribe function (test seam). When omitted, the real
   * Supabase Realtime subscription is used.
   */
  subscribeFn?: typeof subscribeToEvents;
  /** Override the initial-history fetcher (test seam). */
  loadInitial?: typeof listEvents;
}

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

export function AgentLiveExecution({
  dispatchId,
  eventTypeFilter,
  subscribeFn = subscribeToEvents,
  loadInitial = listEvents,
}: Props) {
  const [events, setEvents] = useState<AgentDispatchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEvents([]);

    loadInitial(dispatchId)
      .then((initial) => {
        if (cancelled) return;
        setEvents(initial);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    const unsubscribe = subscribeFn(dispatchId, (event) => {
      setEvents((prev) =>
        prev.some((e) => e.id === event.id) ? prev : [...prev, event],
      );
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [dispatchId, subscribeFn, loadInitial]);

  const allowedTypes = eventTypeFilter ?? ALL_EVENT_TYPES;
  const visible = events.filter((e) => allowedTypes.includes(e.event_type));

  return (
    <div
      className="flex flex-col gap-2 font-mono text-[12px]"
      data-testid="agent-live-execution"
    >
      {loading ? (
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
          LOADING…
        </div>
      ) : error ? (
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400">
          ERROR — {error}
        </div>
      ) : visible.length === 0 ? (
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
          NO EVENTS YET
        </div>
      ) : (
        visible.map((event) => (
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
                {formatTime(event.created_at)}
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

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
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
