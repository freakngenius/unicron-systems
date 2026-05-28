'use client';

import type { RecentRun, RunStatusResponse } from './RunPanel';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function LiveProgress({
  running,
  progress,
  lastRun,
  hydrated,
}: {
  running: boolean;
  progress: RunStatusResponse | null;
  lastRun: RecentRun | null;
  hydrated: boolean;
}) {
  if (running) {
    const pct = Math.max(0, Math.min(100, progress?.percent_complete ?? 0));
    const step = progress?.current_step ?? 'Starting…';
    return (
      <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
        <div className="flex items-center justify-between text-xs font-medium text-neutral-700">
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500"
              aria-hidden
            />
            {step}
          </span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded bg-neutral-200">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (!hydrated) {
    return <div className="text-xs text-neutral-400">Loading status…</div>;
  }

  if (!lastRun) {
    return (
      <div className="text-xs text-neutral-500">
        No runs yet — click Run Zedcor to fire one.
      </div>
    );
  }

  const leads = lastRun.summary?.projects_inserted ?? 0;
  const at = lastRun.completed_at ?? lastRun.started_at;
  return (
    <div className="text-xs text-neutral-600">
      <span className="inline-flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-neutral-400" aria-hidden />
        Idle · last run {formatTime(at)} · {leads} lead{leads === 1 ? '' : 's'}
      </span>
    </div>
  );
}
