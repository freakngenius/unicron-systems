// ActionItems.tsx — Sprint 4 Stream D
// Full table view of nervous_system.action_items with filters, sort, bulk
// actions, and a detail panel.

import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';
import { patchActionItem } from '../../lib/actionItemsClient';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
}

interface ActionItemRow {
  id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'irreversible';
  status: 'open' | 'in_progress' | 'done' | 'blocked' | 'broken_off';
  dri: string | null;
  surface: string | null;
  source: string | null;
  source_type: string | null;
  due_at: string | null;
  ledger_id: string | null;
  kanban_card_id: string | null;
  kanban_workspace: string | null;
  evidence_quote: string | null;
  created_at: string;
  team_members: { name: string } | null;
}

type SortField = 'priority' | 'due_at' | 'created_at' | 'title' | 'status';
type SortDir = 'asc' | 'desc';

const PRIORITY_ORDER: Record<string, number> = {
  irreversible: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_COLORS: Record<string, string> = {
  irreversible: '#EF4444',
  high: '#F59E0B',
  medium: '#3B82F6',
  low: 'rgba(229,229,231,0.4)',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
  broken_off: 'Broken Off',
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useActionItems() {
  const [items, setItems] = useState<ActionItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = getSupabase();
    try {
      // PGRST106 fix: nervous_system not in PostgREST db-schemas.
      // ns_list_action_items() returns dri_name in place of the team_members(name) join.
      const { data, error: err } = await sb
        .rpc('ns_list_action_items', { p_limit: 200 });

      if (err) throw err;

      // Map flat dri_name back to the nested team_members shape the component expects
      const mapped: ActionItemRow[] = ((data as Array<ActionItemRow & { dri_name: string | null }>) ?? [])
        .map((row) => ({
          ...row,
          team_members: row.dri_name ? { name: row.dri_name } : null,
        }));
      setItems(mapped);

      const { data: memberData } = await sb.rpc('ns_list_team_members');
      setMembers((memberData as TeamMember[] | null) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load action items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, members, reload: load };
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  item,
  onClose,
  onUpdate,
}: {
  item: ActionItemRow;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleClose() {
    setSaving(true);
    setErr(null);
    try {
      await patchActionItem(item.id, { closed: true, status: 'done' });
      onUpdate();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to close item');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md h-full bg-[#141416] border-l border-[#1F1F23] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F1F23] sticky top-0 bg-[#141416] z-10">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.5)]">
            Action Item
          </div>
          <button
            onClick={onClose}
            className="mono text-[11px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.5)] hover:text-[#E5E5E7] transition-colors"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-5 flex-1">
          {/* Title + priority */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium,
                }}
              />
              <span
                className="mono text-[9px] uppercase tracking-[0.16em]"
                style={{ color: PRIORITY_COLORS[item.priority] }}
              >
                {item.priority}
              </span>
            </div>
            <div className="mono text-[15px] text-[#E5E5E7] font-medium leading-snug">
              {item.title}
            </div>
            {item.description && (
              <div className="mono text-[12px] text-[rgba(229,229,231,0.6)] mt-2 leading-relaxed">
                {item.description}
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="space-y-2">
            {[
              { label: 'DRI', value: item.team_members?.name ?? item.dri ?? '—' },
              { label: 'Status', value: STATUS_LABELS[item.status] ?? item.status },
              { label: 'Surface', value: item.surface ?? '—' },
              { label: 'Source', value: item.source ?? item.source_type ?? '—' },
              {
                label: 'Due',
                value: item.due_at
                  ? new Date(item.due_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '—',
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-baseline gap-3">
                <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] w-16 shrink-0">
                  {label}
                </div>
                <div className="mono text-[12px] text-[rgba(229,229,231,0.8)]">
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Evidence quote */}
          {item.evidence_quote && (
            <div>
              <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-2">
                Evidence
              </div>
              <blockquote className="border-l-2 border-[#FF6B2B] pl-3 mono text-[11px] text-[rgba(229,229,231,0.7)] italic leading-relaxed">
                {item.evidence_quote}
              </blockquote>
            </div>
          )}

          {/* Linked ledger */}
          {item.ledger_id && (
            <div>
              <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-1">
                Ledger Row
              </div>
              <div className="mono text-[11px] text-[rgba(229,229,231,0.6)] font-mono break-all">
                {item.ledger_id}
              </div>
            </div>
          )}

          {/* Notion link */}
          {item.kanban_card_id && (
            <div>
              <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-1">
                Notion Card
              </div>
              <a
                href={`https://notion.so/${item.kanban_card_id.replace(/-/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mono text-[11px] text-[#FF6B2B] hover:underline break-all"
              >
                Open in Notion
              </a>
            </div>
          )}

          {/* Error */}
          {err && (
            <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg px-3 py-2">
              <div className="mono text-[11px] text-[#EF4444]">{err}</div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-[#1F1F23] flex gap-2">
          <button
            onClick={() => void handleClose()}
            disabled={saving || item.status === 'done'}
            className="flex-1 mono text-[11px] uppercase tracking-[0.12em] py-2 bg-[#FF6B2B] text-white rounded-lg hover:bg-[#e55a1a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? '…' : 'Mark Done'}
          </button>
          <button
            onClick={onClose}
            className="mono text-[11px] uppercase tracking-[0.12em] px-4 py-2 border border-[#1F1F23] text-[rgba(229,229,231,0.5)] rounded-lg hover:border-[#2A2A2E] hover:text-[#E5E5E7] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Filters bar ──────────────────────────────────────────────────────────────

interface Filters {
  dri: string;
  priority: string[];
  status: string[];
  source: string;
}

function FiltersBar({
  filters,
  setFilters,
  members,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  members: TeamMember[];
}) {
  const [expanded, setExpanded] = useState(false);

  const filterContent = (
    <div className="flex flex-wrap gap-3 items-center">
      {/* DRI */}
      <div className="flex items-center gap-2">
        <label className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)]">
          DRI
        </label>
        <select
          value={filters.dri}
          onChange={(e) => setFilters({ ...filters, dri: e.target.value })}
          className="bg-[#141416] border border-[#1F1F23] rounded-lg px-2 py-1 mono text-[11px] text-[#E5E5E7] focus:outline-none"
        >
          <option value="">All</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Priority multi */}
      <div className="flex items-center gap-2">
        <span className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)]">
          Priority
        </span>
        {['irreversible', 'high', 'medium', 'low'].map((p) => (
          <button
            key={p}
            onClick={() =>
              setFilters({
                ...filters,
                priority: filters.priority.includes(p)
                  ? filters.priority.filter((x) => x !== p)
                  : [...filters.priority, p],
              })
            }
            className="mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded border transition-colors"
            style={{
              borderColor: filters.priority.includes(p)
                ? PRIORITY_COLORS[p]
                : '#1F1F23',
              color: filters.priority.includes(p)
                ? PRIORITY_COLORS[p]
                : 'rgba(229,229,231,0.45)',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Status multi */}
      <div className="flex items-center gap-2">
        <span className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)]">
          Status
        </span>
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <button
            key={k}
            onClick={() =>
              setFilters({
                ...filters,
                status: filters.status.includes(k)
                  ? filters.status.filter((x) => x !== k)
                  : [...filters.status, k],
              })
            }
            className="mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded border transition-colors"
            style={{
              borderColor: filters.status.includes(k) ? '#FF6B2B' : '#1F1F23',
              color: filters.status.includes(k)
                ? '#FF6B2B'
                : 'rgba(229,229,231,0.45)',
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Source text */}
      <input
        value={filters.source}
        onChange={(e) => setFilters({ ...filters, source: e.target.value })}
        placeholder="Filter source…"
        className="bg-[#141416] border border-[#1F1F23] rounded-lg px-3 py-1 mono text-[11px] text-[#E5E5E7] placeholder:text-[rgba(229,229,231,0.3)] focus:outline-none w-32"
      />

      {/* Clear */}
      <button
        onClick={() =>
          setFilters({ dri: '', priority: [], status: [], source: '' })
        }
        className="mono text-[9px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.4)] hover:text-[#E5E5E7] transition-colors"
      >
        Clear
      </button>
    </div>
  );

  return (
    <div className="mb-4">
      {/* Mobile: toggle button */}
      <div className="sm:hidden mb-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mono text-[10px] uppercase tracking-[0.14em] px-3 py-1.5 border border-[#1F1F23] rounded-lg text-[rgba(229,229,231,0.5)] hover:text-[#E5E5E7] hover:border-[#2A2A2E] transition-colors"
        >
          {expanded ? 'Hide Filters' : 'Filters'}
        </button>
      </div>
      {/* Desktop always visible; mobile: toggle */}
      <div className={['hidden sm:flex', expanded ? ' !flex' : ''].join('')}>
        {filterContent}
      </div>
    </div>
  );
}

// ─── Bulk Actions ─────────────────────────────────────────────────────────────

function BulkActions({
  selectedIds,
  members,
  onComplete,
}: {
  selectedIds: string[];
  members: TeamMember[];
  onComplete: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (selectedIds.length === 0) return null;

  async function applyToAll(patch: Parameters<typeof patchActionItem>[1]) {
    setBusy(true);
    setErr(null);
    try {
      await Promise.all(selectedIds.map((id) => patchActionItem(id, patch)));
      onComplete();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Bulk action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 px-4 py-3 bg-[#1A1A1D] border border-[#2A2A2E] rounded-xl flex flex-wrap items-center gap-3">
      <div className="mono text-[11px] text-[rgba(229,229,231,0.6)]">
        {selectedIds.length} selected
      </div>

      <select
        disabled={busy}
        onChange={(e) => {
          if (e.target.value) void applyToAll({ dri: e.target.value });
          e.target.value = '';
        }}
        className="bg-[#141416] border border-[#1F1F23] rounded-lg px-2 py-1 mono text-[11px] text-[#E5E5E7] focus:outline-none disabled:opacity-50"
      >
        <option value="">Reassign DRI…</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <select
        disabled={busy}
        onChange={(e) => {
          if (e.target.value) void applyToAll({ status: e.target.value as ActionItemRow['status'] });
          e.target.value = '';
        }}
        className="bg-[#141416] border border-[#1F1F23] rounded-lg px-2 py-1 mono text-[11px] text-[#E5E5E7] focus:outline-none disabled:opacity-50"
      >
        <option value="">Change Status…</option>
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>

      <button
        disabled={busy}
        onClick={() => void applyToAll({ closed: true, status: 'done' })}
        className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1 bg-[#EF4444]/20 border border-[#EF4444]/40 text-[#EF4444] rounded-lg hover:bg-[#EF4444]/30 transition-colors disabled:opacity-50"
      >
        {busy ? '…' : 'Close All'}
      </button>

      {err && (
        <div className="mono text-[10px] text-[#EF4444]">{err}</div>
      )}
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function SortHeader({
  field,
  label,
  sortField,
  sortDir,
  onSort,
}: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <th
      className="text-left px-3 py-2 mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] cursor-pointer hover:text-[#E5E5E7] transition-colors whitespace-nowrap select-none"
      onClick={() => onSort(field)}
    >
      {label}
      {active && (
        <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
      )}
    </th>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ActionItems() {
  const { items, loading, error, members, reload } = useActionItems();
  const [filters, setFilters] = useState<Filters>({
    dri: '',
    priority: [],
    status: [],
    source: '',
  });
  const [sortField, setSortField] = useState<SortField>('priority');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ActionItemRow | null>(null);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: string[]) {
    if (ids.every((id) => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(ids));
    }
  }

  // Apply filters
  const filtered = items.filter((item) => {
    if (filters.dri && item.dri !== filters.dri) return false;
    if (filters.priority.length > 0 && !filters.priority.includes(item.priority))
      return false;
    if (filters.status.length > 0 && !filters.status.includes(item.status))
      return false;
    if (
      filters.source &&
      !(item.source ?? item.source_type ?? '')
        .toLowerCase()
        .includes(filters.source.toLowerCase())
    )
      return false;
    return true;
  });

  // Apply sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'priority') {
      cmp =
        (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
    } else if (sortField === 'due_at') {
      if (!a.due_at && !b.due_at) cmp = 0;
      else if (!a.due_at) cmp = 1;
      else if (!b.due_at) cmp = -1;
      else cmp = new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    } else if (sortField === 'created_at') {
      cmp =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    } else if (sortField === 'title') {
      cmp = a.title.localeCompare(b.title);
    } else if (sortField === 'status') {
      cmp = a.status.localeCompare(b.status);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const sortedIds = sorted.map((i) => i.id);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-[#141416] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-5 py-4">
        <div className="mono text-[12px] text-[#EF4444]">{error}</div>
        <button
          onClick={() => void reload()}
          className="mono text-[10px] uppercase tracking-[0.12em] mt-2 text-[rgba(229,229,231,0.5)] hover:text-[#E5E5E7] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <FiltersBar filters={filters} setFilters={setFilters} members={members} />

      <BulkActions
        selectedIds={Array.from(selected)}
        members={members}
        onComplete={() => {
          setSelected(new Set());
          void reload();
        }}
      />

      {sorted.length === 0 ? (
        <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-8 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)] mb-1">
            No action items
          </div>
          <div className="mono text-[11px] text-[rgba(229,229,231,0.3)]">
            Action items are created by agents and the Orchestrator as signals
            are processed.
          </div>
        </div>
      ) : (
        /* Horizontally scrollable table with sticky first column on mobile */
        <div className="overflow-x-auto rounded-xl border border-[#1F1F23]">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-[#141416] border-b border-[#1F1F23]">
                {/* Checkbox — sticky on mobile */}
                <th className="px-3 py-2 sticky left-0 bg-[#141416] z-10">
                  <input
                    type="checkbox"
                    checked={
                      sortedIds.length > 0 &&
                      sortedIds.every((id) => selected.has(id))
                    }
                    onChange={() => toggleAll(sortedIds)}
                    className="accent-[#FF6B2B]"
                  />
                </th>
                <SortHeader
                  field="title"
                  label="Title"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <th className="text-left px-3 py-2 mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] whitespace-nowrap">
                  DRI
                </th>
                <th className="text-left px-3 py-2 mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] whitespace-nowrap">
                  Surface
                </th>
                <SortHeader
                  field="priority"
                  label="Priority"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  field="status"
                  label="Status"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  field="due_at"
                  label="Due"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <th className="text-left px-3 py-2 mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] whitespace-nowrap">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-[#1F1F23] hover:bg-[#1A1A1D] transition-colors cursor-pointer group"
                  onClick={() => setDetail(item)}
                >
                  {/* Checkbox — sticky on mobile; stop propagation so row click doesn't fire */}
                  <td
                    className="px-3 py-2.5 sticky left-0 bg-[#141416] group-hover:bg-[#1A1A1D] transition-colors z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(item.id);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="accent-[#FF6B2B]"
                    />
                  </td>
                  <td className="px-3 py-2.5 min-w-[180px] max-w-[280px]">
                    <div className="mono text-[12px] text-[#E5E5E7] truncate">
                      {item.title}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="mono text-[11px] text-[rgba(229,229,231,0.7)]">
                      {item.team_members?.name ?? '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="mono text-[11px] text-[rgba(229,229,231,0.6)]">
                      {item.surface ?? '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span
                      className="mono text-[9px] uppercase tracking-[0.12em]"
                      style={{ color: PRIORITY_COLORS[item.priority] }}
                    >
                      {item.priority}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="mono text-[10px] text-[rgba(229,229,231,0.6)]">
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="mono text-[11px] text-[rgba(229,229,231,0.5)]">
                      {item.due_at
                        ? new Date(item.due_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="mono text-[11px] text-[rgba(229,229,231,0.5)]">
                      {item.source ?? item.source_type ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel */}
      {detail && (
        <DetailPanel
          item={detail}
          onClose={() => setDetail(null)}
          onUpdate={() => void reload()}
        />
      )}
    </div>
  );
}
