// ContinuityTimeline.tsx — S4c
// Reads ns_continuity_log_latest and renders parsed entries from the vault
// wiki/memory/elder/continuity.md file as a timeline. Empty state explains
// that the continuity-ingest cron populates this view from the vault.

import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

interface ContinuityEntry {
  id: string;
  entry_date: string | null;
  title: string | null;
  body: string;
  tags: string[];
  ingested_at: string;
}

export default function ContinuityTimeline() {
  const [entries, setEntries] = useState<ContinuityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();
    sb.rpc('ns_continuity_log_latest', { p_limit: 50 }).then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setEntries([]);
        return;
      }
      setEntries((data ?? []) as ContinuityEntry[]);
    });
    return () => { cancelled = true; };
  }, []);

  if (entries === null) {
    return (
      <div className="bg-bg-card border border-border-default rounded-xl px-5 py-4 mono text-[11px] text-text-muted">
        Loading continuity log…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="bg-bg-card border border-border-default rounded-xl px-6 py-12 text-center">
        <div className="text-[14px] text-text-primary font-semibold mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
          Continuity ingest has no entries yet
        </div>
        <div className="text-[12px] text-text-muted max-w-md mx-auto leading-relaxed">
          The <code>continuity-ingest-cron</code> Inngest job parses{' '}
          <code>wiki/memory/elder/continuity.md</code> hourly. When the vault file
          exists and contains <code>---</code>-delimited entries, they appear here.
          {error && (
            <div className="mt-2 text-text-muted">RPC error: {error}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="bg-bg-card border border-border-default rounded-xl px-5 py-4"
        >
          <div className="flex items-baseline justify-between mb-2">
            <div className="flex items-baseline gap-3">
              {entry.entry_date && (
                <span className="mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  {entry.entry_date}
                </span>
              )}
              {entry.title && (
                <span className="text-[14px] font-medium text-text-primary" style={{ fontFamily: 'var(--font-display)' }}>
                  {entry.title}
                </span>
              )}
            </div>
            <span className="mono text-[9px] text-text-muted">
              {new Date(entry.ingested_at).toLocaleDateString()}
            </span>
          </div>
          {entry.body && (
            <pre className="mono text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap">
              {entry.body}
            </pre>
          )}
          {entry.tags.length > 0 && (
            <div className="mt-2 flex gap-1.5 flex-wrap">
              {entry.tags.map((tag) => (
                <span
                  key={tag}
                  className="mono text-[9px] uppercase tracking-[0.14em] text-text-muted border border-border-default rounded px-1.5 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
