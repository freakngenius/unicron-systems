import { useEffect, useMemo, useRef, useState } from 'react';
import { Visualizer } from '../visualizer/Visualizer';
import { useSystem } from '../../context/SystemContext';
import { useSettings } from '../SettingsContext';
import {
  subscribeToEvents,
  listEvents,
} from '../../lib/agentConsoleClient';
import type { AgentDispatchEvent } from '../../lib/contracts/agentConsole';
import type { SystemConfig } from '../../context/SystemContext';

type Props = {
  /**
   * Optional parent dispatch ID. When provided, progress messages are driven
   * by Realtime inserts on `unicron.agent_dispatch_events` filtered by
   * `dispatch_id`. When absent we fall back to a scripted timeline derived
   * from the deployed `SystemConfig` so the UI structure ships ahead of the
   * backend wiring (see operator-todos/2026-05-03-cluster-build-progress-events.md).
   */
  dispatchId?: string;
  /** Called when the build is complete and the operator should see Phase 2. */
  onComplete: () => void;
};

const FALLBACK_DURATION_MS = 6500;
const TICK_MS = 90;

export function BuildingCluster({ dispatchId, onComplete }: Props) {
  const { config } = useSystem();
  const { settings } = useSettings();

  const timeline = useMemo(() => buildScriptedTimeline(config), [config]);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string>(timeline[0] ?? 'Initializing');
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (dispatchId) return;
    if (timeline.length === 0) {
      onCompleteRef.current();
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(1, elapsed / FALLBACK_DURATION_MS);
      setProgress(pct);
      const idx = Math.min(timeline.length - 1, Math.floor(pct * timeline.length));
      setMessage(timeline[idx]);
      if (pct < 1) {
        raf = window.requestAnimationFrame(step);
      } else {
        window.setTimeout(() => onCompleteRef.current(), 350);
      }
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [dispatchId, timeline]);

  useEffect(() => {
    if (!dispatchId) return;
    let cancelled = false;
    let seen = 0;
    let total = Math.max(timeline.length, 8);

    const apply = (events: AgentDispatchEvent[]) => {
      if (cancelled || events.length === 0) return;
      seen += events.length;
      const last = events[events.length - 1];
      const text = formatEventMessage(last);
      if (text) setMessage(text);
      const isTerminal = events.some((e) => e.payload?.terminal === true);
      const denom = Math.max(total, seen + (isTerminal ? 0 : 1));
      total = denom;
      const pct = Math.min(1, seen / denom);
      setProgress(pct);
      if (isTerminal) {
        window.setTimeout(() => {
          if (!cancelled) onCompleteRef.current();
        }, 250);
      }
    };

    const interval = window.setInterval(() => {
      setProgress((p) => Math.min(0.95, p + 0.005));
    }, TICK_MS);

    listEvents(dispatchId)
      .then((events) => apply(events))
      .catch(() => {});

    const unsubscribe = subscribeToEvents(dispatchId, (event) => {
      apply([event]);
    });

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [dispatchId, timeline.length]);

  return (
    <div className="w-full max-w-[720px] px-6 flex flex-col items-center text-center py-12">
      <div className="relative w-[400px] h-[400px]">
        <Visualizer
          config={config}
          showInternalCostMetrics={settings.showInternalCostMetrics}
          reducedMotion={settings.reducedMotion}
          density="compact"
          showHud={false}
        />
      </div>

      <h2 className="text-[28px] leading-[1.2] text-text-primary mt-8 mb-3">
        Building Cluster
      </h2>

      <div className="w-full max-w-[480px] mb-4">
        <div className="h-[6px] w-full rounded-full bg-bg-card border border-border-default overflow-hidden">
          <div
            className="h-full bg-accent-gold transition-[width] duration-200 ease-out"
            style={{ width: `${Math.round(progress * 100)}%` }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          />
        </div>
      </div>

      <p className="text-[13px] text-text-secondary mb-2">
        Please wait, this may take a few minutes
      </p>

      <p
        className="mono text-[11px] uppercase tracking-[0.2em] text-accent-gold min-h-[1.5em]"
        aria-live="polite"
      >
        {message}
      </p>
    </div>
  );
}

function buildScriptedTimeline(config: SystemConfig): string[] {
  const sources = config.dataSources.filter((d) => d.enabled);
  const agents = config.agents.filter((a) => a.enabled);
  const watchers = agents.filter((a) => a.layer === 2);

  const steps: string[] = [];
  for (const src of sources) {
    steps.push(`Connecting to ${src.label}`);
  }
  for (const agent of agents) {
    steps.push(`Creating ${agent.role} agent`);
  }
  for (const w of watchers) {
    steps.push(`Validating ${w.role}`);
  }
  steps.push('Bringing cluster online');
  return steps;
}

function formatEventMessage(event: AgentDispatchEvent): string | null {
  const p = event.payload ?? {};
  if (typeof p.message === 'string') return p.message;
  if (typeof p.label === 'string') return p.label;
  if (typeof p.action === 'string' && typeof p.target === 'string') {
    return `${p.action} ${p.target}`;
  }
  if (event.event_type === 'tool_call' && typeof p.tool === 'string') {
    return `Calling ${p.tool}`;
  }
  if (event.event_type === 'decision' && typeof p.decision === 'string') {
    return p.decision;
  }
  if (event.event_type === 'reasoning' && typeof p.summary === 'string') {
    return p.summary;
  }
  return null;
}
