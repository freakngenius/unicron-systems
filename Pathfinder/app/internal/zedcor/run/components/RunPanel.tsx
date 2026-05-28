'use client';

// RunPanel.tsx — client root for /internal/zedcor/run. Owns top-level state:
// in-flight run polling, recent runs list, scheduled toggle state, error banner.

import { useCallback, useEffect, useRef, useState } from 'react';
import { RunButton } from './RunButton';
import { LiveProgress, type LastSummary } from './LiveProgress';
import { ScheduledToggle } from './ScheduledToggle';
import { SendDigestPanel } from './SendDigestPanel';
import { RecentRunsTable } from './RecentRunsTable';

export type RunSummary = {
  sources_polled?: number;
  sources_hit?: number;
  sources_empty?: number;
  sources_failed?: number;
  projects_inserted?: number;
  projects_deduped?: number;
  notion_writes?: number;
  notion_dedupes?: number;
};

export type RecentRun = {
  run_id: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  runner: string;
  summary: RunSummary | null;
  duration_ms: number | null;
};

type RecentRunsResponse = {
  current_state: { manual_only: boolean; scheduled_enabled: boolean };
  runs: RecentRun[];
};

export type RunStatusResponse = {
  run_id: number;
  finished: boolean;
  status: string;
  current_step: string;
  percent_complete: number;
  summary?: RunSummary | null;
};

export function RunPanel() {
  const [currentRunId, setCurrentRunId] = useState<number | null>(null);
  const [progress, setProgress] = useState<RunStatusResponse | null>(null);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [scheduledEnabled, setScheduledEnabled] = useState(false);
  const [pollErrSticky, setPollErrSticky] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSummary, setLastSummary] = useState<LastSummary | null>(null);
  const runStartedAtRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const errCountRef = useRef(0);

  const refreshRecent = useCallback(async () => {
    try {
      const res = await fetch('/pathfinder/api/zedcor/recent-runs', { cache: 'no-store' });
      if (!res.ok) {
        setBanner({ tone: 'error', text: `recent-runs returned ${res.status}` });
        return;
      }
      const json = (await res.json()) as RecentRunsResponse;
      setRecentRuns(json.runs);
      setScheduledEnabled(json.current_state.scheduled_enabled);
      setBanner(null);
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  // Polling loop: every 1.5s while a run is in flight. Three consecutive failures
  // flip a sticky banner but keep polling. On finish, capture the summary into
  // lastSummary so the UI can show "Run #N · X projects · Y sources · Zs" even
  // after currentRunId clears.
  useEffect(() => {
    if (currentRunId == null) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    const runId = currentRunId;
    errCountRef.current = 0;
    setPollErrSticky(false);
    const tick = async () => {
      try {
        const res = await fetch(`/pathfinder/api/zedcor/run-status?run_id=${runId}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as RunStatusResponse;
        errCountRef.current = 0;
        setProgress(json);
        if (json.finished) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          const startedAt = runStartedAtRef.current ?? Date.now();
          const durationMs = Math.max(0, Date.now() - startedAt);
          setLastSummary({
            runId,
            summary: (json.summary ?? {}) as RunSummary,
            durationMs,
          });
          setCurrentRunId(null);
          runStartedAtRef.current = null;
          void refreshRecent();
        }
      } catch {
        errCountRef.current += 1;
        if (errCountRef.current >= 3) setPollErrSticky(true);
      }
    };
    void tick();
    intervalRef.current = setInterval(tick, 1500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [currentRunId, refreshRecent]);

  const handleRun = useCallback(async () => {
    setProgress(null);
    setPollErrSticky(false);
    setBanner(null);
    setLastSummary(null);
    setSubmitting(true);
    runStartedAtRef.current = Date.now();
    try {
      const res = await fetch('/pathfinder/api/zedcor/run-orchestrator', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if (res.status === 503 && body.code === 'schema_pending_z1a') {
          setBanner({
            tone: 'info',
            text: 'Backend schema not yet migrated — waiting on Sprint Z1A. Stub will resume once the migration lands in main.',
          });
        } else {
          setBanner({
            tone: 'error',
            text: body.error ?? `run-orchestrator returned ${res.status}`,
          });
        }
        runStartedAtRef.current = null;
        return;
      }
      const body = (await res.json()) as { run_id: number };
      setCurrentRunId(body.run_id);
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
      runStartedAtRef.current = null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const handleToggle = useCallback(
    async (next: boolean) => {
      const prev = scheduledEnabled;
      setScheduledEnabled(next);
      try {
        const res = await fetch('/pathfinder/api/zedcor/toggle-scheduled', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: next }),
        });
        if (!res.ok) throw new Error(`toggle returned ${res.status}`);
        const body = (await res.json()) as { scheduled_enabled: boolean };
        setScheduledEnabled(body.scheduled_enabled);
        setBanner(null);
      } catch (e) {
        setScheduledEnabled(prev);
        setBanner({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
      }
    },
    [scheduledEnabled],
  );

  const lastRun = recentRuns[0] ?? null;

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={
            banner.tone === 'error'
              ? 'rounded border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900'
              : 'rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900'
          }
        >
          {banner.text}
        </div>
      )}
      {pollErrSticky && currentRunId != null && (
        <div className="rounded border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          Status temporarily unavailable — run continues in background.
        </div>
      )}
      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <RunButton
          onClick={handleRun}
          disabled={submitting || currentRunId != null}
          pending={submitting || currentRunId != null}
        />
        <div className="mt-4">
          <LiveProgress
            running={currentRunId != null}
            pending={submitting}
            progress={progress}
            lastRun={lastRun}
            lastSummary={lastSummary}
            hydrated={hydrated}
          />
        </div>
      </section>
      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <ScheduledToggle enabled={scheduledEnabled} onChange={handleToggle} hydrated={hydrated} />
      </section>
      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <SendDigestPanel />
      </section>
      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <RecentRunsTable runs={recentRuns} hydrated={hydrated} />
      </section>
    </div>
  );
}
