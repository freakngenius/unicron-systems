'use client';

import { useState } from 'react';
import type { RecentRun } from './RunPanel';

const ZEDCOR_NOTION_DB_URL = 'https://www.notion.so/856b43a02b4d43649344c5e1a05d206d';

function formatStarted(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDuration(ms: number | null): string {
  if (ms == null || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  return `${s}s`;
}

function statusPill(status: string): { label: string; classes: string } {
  switch (status) {
    case 'success':
      return { label: 'success', classes: 'bg-emerald-100 text-emerald-900 border-emerald-200' };
    case 'partial_failure':
      return { label: 'partial', classes: 'bg-amber-100 text-amber-900 border-amber-200' };
    case 'failed':
      return { label: 'failed', classes: 'bg-rose-100 text-rose-900 border-rose-200' };
    case 'running':
      return { label: 'running', classes: 'bg-sky-100 text-sky-900 border-sky-200' };
    default:
      return { label: status, classes: 'bg-neutral-100 text-neutral-700 border-neutral-200' };
  }
}

export function RecentRunsTable({ runs, hydrated }: { runs: RecentRun[]; hydrated: boolean }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div>
      <h2 className="text-sm font-semibold text-neutral-900">Recent runs</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Last 20 manual runs for the Zedcor org. Click a row for the full summary.
      </p>
      <div className="mt-4 overflow-hidden rounded-md border border-neutral-200">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
              <th className="px-3 py-2">Run #</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Projects</th>
              <th className="px-3 py-2">Sources</th>
              <th className="px-3 py-2">Runner</th>
              <th className="px-3 py-2">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 bg-white">
            {!hydrated && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-xs text-neutral-400">
                  Loading…
                </td>
              </tr>
            )}
            {hydrated && runs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-xs text-neutral-500">
                  No runs yet.
                </td>
              </tr>
            )}
            {runs.map((r) => {
              const pill = statusPill(r.status);
              const isOpen = expanded === r.run_id;
              const filterUrl = `${ZEDCOR_NOTION_DB_URL}?run_id=${r.run_id}`;
              return (
                <>
                  <tr
                    key={r.run_id}
                    className="cursor-pointer hover:bg-neutral-50"
                    onClick={() => setExpanded(isOpen ? null : r.run_id)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">#{r.run_id}</td>
                    <td className="px-3 py-2 text-xs text-neutral-700">
                      {formatStarted(r.started_at)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${pill.classes}`}
                      >
                        {pill.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-neutral-900">
                      {r.summary?.projects_inserted ?? '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-neutral-700">
                      {r.summary?.sources_hit ?? '—'}/{r.summary?.sources_polled ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-600">{r.runner}</td>
                    <td className="px-3 py-2 tabular-nums text-xs text-neutral-700">
                      {formatDuration(r.duration_ms)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${r.run_id}-detail`} className="bg-neutral-50">
                      <td colSpan={7} className="px-3 py-3">
                        <div className="space-y-2">
                          <a
                            href={filterUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block text-xs font-medium text-sky-700 hover:underline"
                          >
                            Filter Notion DB by run_id={r.run_id} →
                          </a>
                          <pre className="overflow-x-auto rounded border border-neutral-200 bg-white p-3 font-mono text-[11px] text-neutral-700">
                            {JSON.stringify(
                              {
                                run_id: r.run_id,
                                started_at: r.started_at,
                                completed_at: r.completed_at,
                                status: r.status,
                                runner: r.runner,
                                duration_ms: r.duration_ms,
                                summary: r.summary,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
