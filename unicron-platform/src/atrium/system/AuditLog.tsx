// AuditLog.tsx — Sprint 7 Stream C Task 3
// Searchable, filterable, paginated audit log viewer backed by ns_list_audit_log RPC.
// Columns: id, table_name, action, actor_id (uuid), payload (jsonb), created_at.

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditRow {
  id:         string;
  table_name: string;
  action:     string;
  actor_id:   string | null;
  payload:    Record<string, unknown> | null;
  created_at: string;
}

interface DrawerState {
  open: boolean;
  row:  AuditRow | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(ts: string): string {
  try {
    const d = new Date(ts);
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${date} · ${time}`;
  } catch {
    return ts;
  }
}

function exportCsv(rows: AuditRow[]): void {
  const headers = ['created_at', 'table_name', 'action', 'actor_id', 'payload'];
  const lines   = rows.map(r => [
    r.created_at,
    r.table_name,
    r.action,
    r.actor_id ?? '',
    JSON.stringify(r.payload ?? {}),
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv  = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 100;

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ drawer, onClose }: { drawer: DrawerState; onClose: () => void }) {
  if (!drawer.open || !drawer.row) return null;
  const r = drawer.row;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="relative h-full flex flex-col overflow-hidden"
        style={{
          width: 'min(480px, 92vw)',
          background: 'var(--bg-elevated)',
          borderLeft: '1px solid rgba(255,255,255,0.04)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.04)]">
          <div>
            <div className="mono text-[13px] font-semibold text-text-primary">{r.action}</div>
            <div className="mono text-[11px] text-text-secondary mt-0.5">{fmtDate(r.created_at)}</div>
          </div>
          <button
            onClick={onClose}
            className="mono text-[11px] text-text-secondary px-2.5 py-1 rounded-md border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.10)] transition-colors"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.14em] text-text-secondary mb-2">Fields</div>
            <div className="bg-bg-raised rounded-lg p-3 space-y-2">
              {[
                ['ID',         r.id],
                ['Table',      r.table_name],
                ['Action',     r.action],
                ['Actor ID',   r.actor_id ?? '—'],
                ['Timestamp',  r.created_at],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3">
                  <span className="mono text-[11px] text-text-secondary w-20 flex-shrink-0">{label}</span>
                  <span className="mono text-[11px] text-text-primary break-all">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {r.payload && Object.keys(r.payload).length > 0 && (
            <div>
              <div className="mono text-[9px] uppercase tracking-[0.14em] text-text-secondary mb-2">Payload</div>
              <pre
                className="mono text-[11px] text-text-primary bg-bg-raised rounded-lg p-3 overflow-x-auto leading-relaxed"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {JSON.stringify(r.payload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuditLog() {
  const [rows,    setRows]    = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [page,    setPage]    = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [drawer,  setDrawer]  = useState<DrawerState>({ open: false, row: null });

  // Filters
  const [q,          setQ]          = useState('');
  const [fTable,     setFTable]     = useState('');
  const [fAction,    setFAction]    = useState('');
  const [fSince,     setFSince]     = useState('');
  const [fUntil,     setFUntil]     = useState('');

  const abortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(async (pageNum: number, reset: boolean) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (fTable)  params.set('table_name', fTable);
    if (fAction) params.set('action', fAction);
    if (fSince)  params.set('since', new Date(fSince).toISOString());
    if (fUntil)  params.set('until', new Date(fUntil + 'T23:59:59').toISOString());
    params.set('limit',  String(PAGE_SIZE));
    params.set('offset', String(pageNum * PAGE_SIZE));

    try {
      const resp = await fetch(`/api/atrium/audit-log?${params}`, { signal: ctrl.signal });
      const json = await resp.json() as { ok: boolean; rows?: AuditRow[]; error?: string };

      if (!json.ok) throw new Error(json.error ?? 'Unknown error');

      const incoming = json.rows ?? [];
      setRows(prev => reset ? incoming : [...prev, ...incoming]);
      setHasMore(incoming.length === PAGE_SIZE);
      setPage(pageNum);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fTable, fAction, fSince, fUntil]);

  // Re-fetch on filter change
  useEffect(() => {
    fetchPage(0, true);
  }, [fetchPage]);

  // Client-side text search across visible rows
  const filtered = q.trim()
    ? rows.filter(r =>
        (r.table_name + r.action + (r.actor_id ?? '') + JSON.stringify(r.payload ?? {}))
          .toLowerCase()
          .includes(q.toLowerCase())
      )
    : rows;

  return (
    <>
      <DetailDrawer drawer={drawer} onClose={() => setDrawer({ open: false, row: null })} />

      <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
        {/* Header + filters */}
        <div className="px-5 py-3.5 border-b border-border-subtle">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
            <div>
              <div className="mono text-[14px] font-semibold text-text-primary">Audit log</div>
              <div className="mono text-[11.5px] text-text-secondary mt-0.5">
                Every system change · immutable · {rows.length} loaded
              </div>
            </div>
            <button
              onClick={() => exportCsv(filtered)}
              className="mono text-[11.5px] px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.07)] text-text-secondary hover:border-border-default hover:text-text-primary transition-colors"
            >
              Export CSV
            </button>
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap gap-2">
            {/* Text search */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-raised border border-border-subtle rounded-lg flex-1 min-w-[200px]">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="5" cy="5" r="3.5" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2"/>
                <path d="M8 8l2.5 2.5" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search actor, action, payload…"
                className="bg-transparent outline-none mono text-[12px] text-text-primary placeholder:text-text-secondary flex-1"
              />
            </div>

            {/* Table name filter */}
            <input
              value={fTable}
              onChange={e => setFTable(e.target.value)}
              placeholder="table_name filter"
              className="px-3 py-1.5 bg-bg-raised border border-border-subtle rounded-lg mono text-[12px] text-text-primary placeholder:text-text-secondary outline-none w-40"
            />

            {/* Action filter */}
            <input
              value={fAction}
              onChange={e => setFAction(e.target.value)}
              placeholder="action filter"
              className="px-3 py-1.5 bg-bg-raised border border-border-subtle rounded-lg mono text-[12px] text-text-primary placeholder:text-text-secondary outline-none w-36"
            />

            {/* Date range */}
            <input
              type="date"
              value={fSince}
              onChange={e => setFSince(e.target.value)}
              className="px-3 py-1.5 bg-bg-raised border border-border-subtle rounded-lg mono text-[12px] text-text-primary outline-none"
              style={{ colorScheme: 'dark' }}
            />
            <span className="mono text-[11px] text-text-secondary self-center">to</span>
            <input
              type="date"
              value={fUntil}
              onChange={e => setFUntil(e.target.value)}
              className="px-3 py-1.5 bg-bg-raised border border-border-subtle rounded-lg mono text-[12px] text-text-primary outline-none"
              style={{ colorScheme: 'dark' }}
            />

            {/* Clear filters */}
            {(fTable || fAction || fSince || fUntil || q) && (
              <button
                onClick={() => { setQ(''); setFTable(''); setFAction(''); setFSince(''); setFUntil(''); }}
                className="mono text-[11px] text-text-secondary hover:text-text-primary px-2 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="px-5 py-3 mono text-[11.5px] text-red-400 bg-red-900/10 border-b border-border-subtle">
            Error: {error}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                {['Timestamp', 'Table', 'Action', 'Actor ID', 'Payload preview'].map((h, i) => (
                  <th key={i} className="text-left px-5 py-2.5 mono text-[11.5px] text-text-secondary font-medium border-b border-border-default">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.id}
                  className={`cursor-pointer transition-colors hover:bg-bg-raised ${i > 0 ? 'border-t border-border-subtle' : ''}`}
                  onClick={() => setDrawer({ open: true, row: r })}
                >
                  <td className="px-5 py-3 mono text-[12px] text-text-secondary whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  <td className="px-5 py-3 mono text-[12px] text-text-secondary">{r.table_name}</td>
                  <td className="px-5 py-3">
                    <span className="mono text-[11px] px-1.5 py-0.5 rounded bg-bg-raised text-text-secondary">
                      {r.action}
                    </span>
                  </td>
                  <td className="px-5 py-3 mono text-[11.5px] text-text-secondary" style={{ maxWidth: 140 }}>
                    <span className="truncate block" title={r.actor_id ?? undefined}>
                      {r.actor_id ? r.actor_id.slice(0, 8) + '…' : '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3 mono text-[11px] text-text-secondary" style={{ maxWidth: 240 }}>
                    <span
                      className="truncate block"
                      title={r.payload ? JSON.stringify(r.payload) : undefined}
                    >
                      {r.payload ? JSON.stringify(r.payload).slice(0, 80) : '—'}
                    </span>
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center mono text-[11.5px] text-text-secondary">
                    {rows.length === 0 ? 'No audit log entries yet.' : 'No entries match current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: loading skeleton + pagination */}
        <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-between gap-3 flex-wrap">
          <div className="mono text-[11px] text-text-secondary">
            {loading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full border border-current border-t-transparent animate-spin" />
                Loading…
              </span>
            ) : (
              `${filtered.length} of ${rows.length} entries visible`
            )}
          </div>

          {hasMore && !loading && (
            <button
              onClick={() => fetchPage(page + 1, false)}
              className="mono text-[11.5px] px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.07)] text-text-secondary hover:border-border-default hover:text-text-primary transition-colors"
            >
              Load next {PAGE_SIZE}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
