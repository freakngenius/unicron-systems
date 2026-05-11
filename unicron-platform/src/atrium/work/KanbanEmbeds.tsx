// KanbanEmbeds.tsx
// Atrium Work > Kanban — bidirectional mirror of the Internal Org Notion Kanban.
//
// Read path: public.ns_notion_kanban_view(workspace) returns rows from
// nervous_system.notion_kanban_mirror, which the Inngest cron
// (notion-kanban-sync-pull) refreshes every 5 minutes. On mount we also call
// /api/internal/kanban-update?op=pull to force a fresh pull so the surface is
// current without waiting for the next cron tick.
//
// Write path: drag-and-drop posts to /api/internal/kanban-update which PATCHes
// the Notion page Status, upserts the mirror, and writes an audit_log row. The
// Verified column is gated by a confirmation modal — HARD CONSTRAINT 3
// (human-only). The server refuses Verified writes without allow_verified=true.

import { useEffect, useMemo, useState, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MirrorRow {
  notion_page_id: string;
  workspace: string;
  title: string | null;
  status: string | null;
  priority: string | null;
  source: string | null;
  surface: string | null;
  dri_name: string | null;
  verify_criteria: string | null;
  implementation_notes: string | null;
  linked_pr_url: string | null;
  notion_url: string | null;
  notion_last_edited: string | null;
  last_touched: string | null;
  pulled_at: string | null;
}

const STATUS_COLUMNS = [
  { key: 'Not Yet Started', label: 'Not Yet Started',  accent: '#7E8AA3' },
  { key: 'Zedcor Demo',     label: 'Zedcor Demo',      accent: '#E8763A' },
  { key: 'In Process',      label: 'In Process',       accent: '#6081BE' },
  { key: 'Review',          label: 'Review',           accent: '#7355E5' },
  { key: 'Deployed',        label: 'Deployed',         accent: '#2E8E66' },
  { key: 'Bug Fixes',       label: 'Bug Fixes',        accent: '#C28A1F' },
  { key: 'Verified',        label: 'Verified',         accent: '#1F8A5B' },
] as const;

type StatusKey = (typeof STATUS_COLUMNS)[number]['key'];

const PRIORITY_COLORS: Record<string, string> = {
  irreversible: '#E14B4B',
  high:         '#C28A1F',
  medium:       '#6081BE',
  low:          '#7E8AA3',
};

// ─── Data hook ────────────────────────────────────────────────────────────────

function useNotionKanban(workspace: string) {
  const [rows, setRows] = useState<MirrorRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPulled, setLastPulled] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error: err } = await getSupabase()
        .rpc('ns_notion_kanban_view', { p_workspace: workspace });
      if (err) throw err;
      const mapped = (data as MirrorRow[] | null) ?? [];
      setRows(mapped);
      if (mapped.length > 0) {
        const newest = mapped
          .map((r) => r.pulled_at)
          .filter((s): s is string => Boolean(s))
          .sort()
          .pop();
        if (newest) setLastPulled(newest);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load kanban mirror');
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Force a fresh pull from Notion; the server returns counts and the
      // mirror is updated before we re-query.
      const { data } = await getSupabase().auth.getSession();
      const accessToken = data.session?.access_token;
      if (accessToken) {
        await fetch(`/api/internal/kanban-update?op=pull&workspace=${encodeURIComponent(workspace)}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => null);
      }
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [workspace, load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
      // Background refresh on mount so the operator sees current state.
      void refresh();
    })();
    return () => { cancelled = true; };
  }, [load, refresh]);

  return { rows, loading, refreshing, error, lastPulled, load, refresh };
}

// ─── Verified-promotion confirmation modal ────────────────────────────────────

function VerifiedConfirmModal({
  card,
  onConfirm,
  onCancel,
  submitting,
}: {
  card: MirrorRow;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onCancel} />
      <div
        className="relative w-full max-w-md bg-white border border-border-default rounded-2xl"
        style={{ boxShadow: '0 24px 64px rgba(11,21,48,0.22)' }}
      >
        <div className="px-5 py-4 border-b border-border-default">
          <div className="text-[10.5px] uppercase tracking-[0.18em] text-text-muted font-semibold">
            Verified · human-only column
          </div>
          <div className="text-[15px] font-semibold text-text-primary mt-1">
            Promote to Verified?
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="text-[13px] text-text-primary leading-relaxed">
            <span className="font-semibold">{card.title ?? 'Untitled card'}</span> will be
            moved to the Verified column on the Internal Org Notion Kanban.
          </div>
          <div className="text-[12px] text-text-secondary leading-relaxed">
            HARD CONSTRAINT 3 — only a human operator (Kyle, Keenan, or Curtis) may
            promote a card to Verified. Confirm only if you have personally verified
            the work matches its acceptance criteria.
          </div>
          {card.verify_criteria && (
            <div className="bg-bg-raised border border-border-default rounded-md px-3 py-2">
              <div className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold mb-1">
                Verify criteria
              </div>
              <div className="text-[12px] text-text-primary whitespace-pre-wrap">
                {card.verify_criteria}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-3.5 border-t border-border-default flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="text-[12.5px] font-medium px-3.5 py-2 rounded-md border border-border-default text-text-secondary hover:bg-bg-raised disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="text-[12.5px] font-semibold px-3.5 py-2 rounded-md text-white disabled:opacity-50"
            style={{ background: '#1F8A5B' }}
          >
            {submitting ? 'Promoting…' : 'Confirm — Verified'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function KanbanCard({
  row,
  onDragStart,
  onDragEnd,
  draggingId,
}: {
  row: MirrorRow;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  draggingId: string | null;
}) {
  const priorityKey = (row.priority ?? '').toLowerCase();
  const dot = PRIORITY_COLORS[priorityKey] ?? PRIORITY_COLORS.low;
  const dragging = draggingId === row.notion_page_id;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', row.notion_page_id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(row.notion_page_id);
      }}
      onDragEnd={onDragEnd}
      className="bg-white border rounded-lg px-3 py-2.5 transition-colors cursor-grab active:cursor-grabbing"
      style={{
        borderColor: dragging ? '#6081BE' : 'var(--border-default)',
        boxShadow: dragging
          ? '0 2px 6px rgba(96,129,190,0.30)'
          : '0 1px 2px rgba(11,21,48,0.05)',
        opacity: dragging ? 0.6 : 1,
      }}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: dot }} />
        <div className="text-[12px] text-text-primary leading-snug">
          {row.title ?? 'Untitled'}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {row.surface && (
          <span className="text-[9.5px] uppercase tracking-[0.12em] text-text-muted font-semibold">
            {row.surface}
          </span>
        )}
        {row.dri_name && (
          <span className="text-[10.5px] text-text-muted">{row.dri_name}</span>
        )}
        {row.notion_url && (
          <a
            href={row.notion_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] text-[#6081BE] hover:underline ml-auto"
          >
            Notion ↗
          </a>
        )}
        {row.linked_pr_url && (
          <a
            href={row.linked_pr_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] text-[#7355E5] hover:underline"
          >
            PR ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function Column({
  status,
  label,
  accent,
  rows,
  onDropCard,
  draggingId,
  setDraggingId,
  hoverStatus,
  setHoverStatus,
}: {
  status: StatusKey;
  label: string;
  accent: string;
  rows: MirrorRow[];
  onDropCard: (pageId: string, newStatus: StatusKey) => void;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  hoverStatus: StatusKey | null;
  setHoverStatus: (s: StatusKey | null) => void;
}) {
  const hot = hoverStatus === status;
  return (
    <div className="flex-1 min-w-[200px]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
          <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-secondary font-semibold">
            {label}
          </span>
        </div>
        <span className="text-[10.5px] font-mono text-text-muted">{rows.length}</span>
      </div>
      <div
        onDragOver={(e) => {
          if (!draggingId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (hoverStatus !== status) setHoverStatus(status);
        }}
        onDragLeave={(e) => {
          // Only clear if leaving the column container.
          if (e.currentTarget === e.target) setHoverStatus(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const pageId = e.dataTransfer.getData('text/plain');
          setHoverStatus(null);
          if (pageId) onDropCard(pageId, status);
        }}
        className="rounded-lg border border-dashed p-2 space-y-1.5 min-h-[60px] transition-colors"
        style={{
          borderColor: hot ? accent : 'var(--border-subtle)',
          background: hot ? `${accent}10` : 'transparent',
        }}
      >
        {rows.length === 0 ? (
          <div className="text-[10.5px] text-text-faint text-center py-3">
            {hot ? 'Drop to move here' : 'Empty'}
          </div>
        ) : (
          rows.map((r) => (
            <KanbanCard
              key={r.notion_page_id}
              row={r}
              onDragStart={setDraggingId}
              onDragEnd={() => { setDraggingId(null); setHoverStatus(null); }}
              draggingId={draggingId}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function KanbanEmbeds() {
  const workspace = 'internal';
  const { rows, loading, refreshing, error, lastPulled, load, refresh } =
    useNotionKanban(workspace);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverStatus, setHoverStatus] = useState<StatusKey | null>(null);
  const [pending, setPending] = useState<{ row: MirrorRow; status: StatusKey } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [localOverride, setLocalOverride] = useState<Record<string, StatusKey>>({});

  const allRows = rows ?? [];
  const effectiveRows = useMemo(
    () => allRows.map((r) => {
      const override = localOverride[r.notion_page_id];
      return override ? { ...r, status: override } : r;
    }),
    [allRows, localOverride],
  );

  const byStatus = useMemo(() => {
    const groups: Record<string, MirrorRow[]> = {};
    for (const col of STATUS_COLUMNS) groups[col.key] = [];
    const unknown: MirrorRow[] = [];
    for (const r of effectiveRows) {
      const key = (r.status ?? '').trim();
      if (groups[key]) groups[key].push(r);
      else unknown.push(r);
    }
    return { groups, unknown };
  }, [effectiveRows]);

  async function postUpdate(notionPageId: string, status: StatusKey, allowVerified: boolean) {
    const { data: session } = await getSupabase().auth.getSession();
    const accessToken = session.session?.access_token;
    if (!accessToken) {
      throw new Error('Sign in to update kanban — no active Atrium session');
    }
    const res = await fetch('/api/internal/kanban-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        notion_page_id: notionPageId,
        status,
        workspace,
        allow_verified: allowVerified,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const message = typeof data.error === 'string' ? data.error : `HTTP ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  async function handleDrop(pageId: string, newStatus: StatusKey) {
    setDraggingId(null);
    setHoverStatus(null);
    setWriteError(null);

    const card = allRows.find((r) => r.notion_page_id === pageId);
    if (!card) return;
    const currentStatus = (localOverride[pageId] ?? card.status ?? '') as StatusKey | '';
    if (currentStatus === newStatus) return;

    if (newStatus === 'Verified') {
      setPending({ row: card, status: newStatus });
      return;
    }

    // Optimistic local update so the card jumps to the new column immediately.
    setLocalOverride((prev) => ({ ...prev, [pageId]: newStatus }));
    try {
      await postUpdate(pageId, newStatus, false);
      await load();
      setLocalOverride((prev) => {
        const next = { ...prev };
        delete next[pageId];
        return next;
      });
    } catch (err) {
      setLocalOverride((prev) => {
        const next = { ...prev };
        delete next[pageId];
        return next;
      });
      setWriteError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function handleVerifiedConfirm() {
    if (!pending) return;
    setSubmitting(true);
    setWriteError(null);
    const { row, status } = pending;
    setLocalOverride((prev) => ({ ...prev, [row.notion_page_id]: status }));
    try {
      await postUpdate(row.notion_page_id, status, true);
      await load();
      setLocalOverride((prev) => {
        const next = { ...prev };
        delete next[row.notion_page_id];
        return next;
      });
      setPending(null);
    } catch (err) {
      setLocalOverride((prev) => {
        const next = { ...prev };
        delete next[row.notion_page_id];
        return next;
      });
      setWriteError(err instanceof Error ? err.message : 'Verified promotion failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && rows === null) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-32 bg-bg-card rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error && rows === null) {
    return (
      <div className="bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-xl px-5 py-4">
        <div className="text-[12px] text-[#E14B4B]">{error}</div>
        <button
          onClick={() => void load()}
          className="text-[10px] uppercase tracking-[0.12em] mt-2 text-text-secondary hover:text-text-primary"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-[11.5px] text-text-muted">
          Mirroring <span className="font-semibold text-text-secondary">Internal Org Notion Kanban</span> ·
          <span className="ml-1.5">{allRows.length} cards</span>
          {lastPulled && (
            <span className="ml-1.5">
              · last pulled {new Date(lastPulled).toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          className="text-[11px] uppercase tracking-[0.14em] px-3 py-1.5 rounded-md border border-border-default text-text-secondary hover:bg-bg-raised disabled:opacity-50"
        >
          {refreshing ? 'Pulling…' : 'Refresh from Notion'}
        </button>
      </div>

      {writeError && (
        <div className="mb-3 bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-md px-3 py-2 flex items-center justify-between">
          <div className="text-[12px] text-[#E14B4B]">{writeError}</div>
          <button
            onClick={() => setWriteError(null)}
            className="text-[10.5px] text-[#E14B4B] hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="flex gap-3 min-w-max pb-3">
          {STATUS_COLUMNS.map((col) => (
            <Column
              key={col.key}
              status={col.key}
              label={col.label}
              accent={col.accent}
              rows={byStatus.groups[col.key]}
              onDropCard={handleDrop}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              hoverStatus={hoverStatus}
              setHoverStatus={setHoverStatus}
            />
          ))}
        </div>
      </div>

      {byStatus.unknown.length > 0 && (
        <div className="mt-4 bg-bg-raised border border-border-default rounded-md px-3 py-2">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-text-muted font-semibold mb-1">
            Unmapped status ({byStatus.unknown.length})
          </div>
          <div className="text-[11.5px] text-text-secondary">
            {byStatus.unknown.map((r) => r.title ?? r.notion_page_id).join(' · ')}
          </div>
        </div>
      )}

      {pending && (
        <VerifiedConfirmModal
          card={pending.row}
          submitting={submitting}
          onConfirm={() => void handleVerifiedConfirm()}
          onCancel={() => { if (!submitting) setPending(null); }}
        />
      )}
    </div>
  );
}
