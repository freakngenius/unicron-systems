// KanbanEmbeds.tsx — Sprint 4 Stream D / W-4 upgrade
// W-4: colored workspace board headers, My Cards toggle, slide-out card detail.

import { useState, useEffect } from 'react';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionItemRow {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'irreversible';
  status: 'open' | 'in_progress' | 'done' | 'blocked' | 'broken_off';
  dri: string | null;
  kanban_workspace: string | null;
  kanban_card_id: string | null;
  team_members: { id: string; name: string } | null;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLUMNS = [
  { key: 'open', label: 'Backlog' },
  { key: 'in_progress', label: 'In Process' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
  { key: 'broken_off', label: 'Broken Off' },
] as const;

type KanbanStatus = (typeof STATUS_COLUMNS)[number]['key'];

const PRIORITY_COLORS: Record<string, string> = {
  irreversible: '#E14B4B',
  high: '#C28A1F',
  medium: '#6081BE',
  low: 'var(--text-lo)',
};

// v3 palette: Pathfinder orange, Metacron violet, Internal blue, sky, sage
const WORKSPACE_COLORS = ['#E8763A', '#7355E5', '#2E6CD4', '#0EA5E9', '#2E8E66'];

function workspaceColor(index: number): string {
  return WORKSPACE_COLORS[index % WORKSPACE_COLORS.length];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useCurrentMember() {
  const auth = useAuth();
  const [memberId, setMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status !== 'signed-in') return;
    const email = auth.user.email;
    if (!email) return;
    // PGRST106 fix: use ns_get_team_member_by_email RPC
    getSupabase()
      .rpc('ns_get_team_member_by_email', { p_email: email })
      .then(({ data }) => {
        const rows = data as Array<{ id: string }> | null;
        setMemberId(rows?.[0]?.id ?? null);
      });
  }, [auth.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return memberId;
}

function useKanbanItems(driFilter: string) {
  const [items, setItems] = useState<ActionItemRow[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const sb = getSupabase();

    async function load() {
      try {
        // PGRST106 fix: use ns_list_action_items_kanban RPC
        const { data, error: err } = await sb.rpc('ns_list_action_items_kanban', {
          p_dri_filter: driFilter || null,
          p_limit: 500,
        });
        if (err) throw err;

        // Map flat dri_id/dri_name back to the nested team_members shape the component expects
        const mapped: ActionItemRow[] = ((data as Array<{
          id: string; title: string; priority: string; status: string;
          dri: string | null; kanban_workspace: string | null; kanban_card_id: string | null;
          dri_id: string | null; dri_name: string | null;
        }>) ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          priority: row.priority as ActionItemRow['priority'],
          status: row.status as ActionItemRow['status'],
          dri: row.dri,
          kanban_workspace: row.kanban_workspace,
          kanban_card_id: row.kanban_card_id,
          team_members: row.dri_id ? { id: row.dri_id, name: row.dri_name ?? '' } : null,
        }));
        if (!cancelled) setItems(mapped);

        const { data: memberData } = await sb.rpc('ns_list_team_members');
        if (!cancelled) setMembers((memberData as TeamMember[] | null) ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load kanban');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [driFilter]);

  return { items, members, loading, error };
}

// ─── Slide-out detail panel ───────────────────────────────────────────────────

function CardSlideOut({ item, onClose }: { item: ActionItemRow; onClose: () => void }) {
  const priorityColor = PRIORITY_COLORS[item.priority] ?? 'var(--text-lo)';

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md h-full bg-bg-card sm:border-l border-border-default overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border-default sticky top-0 bg-bg-card z-10">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: priorityColor }} />
              <div className="mono text-[9px] uppercase tracking-[0.14em]" style={{ color: priorityColor }}>
                {item.priority}
              </div>
            </div>
            <div className="mono text-[13px] font-medium text-text-primary leading-snug">{item.title}</div>
          </div>
          <button
            onClick={onClose}
            className="mono text-[11px] uppercase tracking-[0.14em] text-text-muted hover:text-text-primary transition-colors shrink-0 mt-0.5"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-5 space-y-4 flex-1">
          {/* Fields grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Status', value: item.status.replace(/_/g, ' ') },
              { label: 'Workspace', value: item.kanban_workspace ?? '—' },
              { label: 'DRI', value: item.team_members?.name ?? '—' },
              { label: 'Priority', value: item.priority },
            ].map(({ label, value }) => (
              <div key={label} className="bg-bg-raised border border-border-default rounded-lg px-3 py-2">
                <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted mb-0.5">{label}</div>
                <div className="mono text-[11px] text-text-primary capitalize">{value}</div>
              </div>
            ))}
          </div>

          {/* Notion link */}
          {item.kanban_card_id && (
            <div>
              <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted mb-1.5">Notion Card</div>
              <a
                href={`https://notion.so/${item.kanban_card_id.replace(/-/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mono text-[11px] text-accent-orange hover:underline"
              >
                Open in Notion →
              </a>
            </div>
          )}

          {/* Card ID */}
          <div className="pt-3 border-t border-border-default">
            <div className="mono text-[9px] text-text-faint break-all">ID: {item.id}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Item card ────────────────────────────────────────────────────────────────

function KanbanCard({ item, onSelect, selected }: { item: ActionItemRow; onSelect: () => void; selected: boolean }) {
  return (
    <div
      onClick={onSelect}
      className="bg-bg-raised border rounded-lg px-3 py-2.5 hover:border-border-hover transition-colors cursor-pointer"
      style={{ borderColor: selected ? 'rgba(232,118,58,0.38)' : 'var(--border-default)' }}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <div
          className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
          style={{ backgroundColor: PRIORITY_COLORS[item.priority] }}
        />
        <div className="mono text-[11px] text-text-primary leading-snug">{item.title}</div>
      </div>
      <div className="flex items-center gap-2">
        {item.team_members && (
          <span className="mono text-[9px] text-text-muted">{item.team_members.name}</span>
        )}
        {item.kanban_card_id && (
          <a
            href={`https://notion.so/${item.kanban_card_id.replace(/-/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mono text-[9px] text-accent-orange hover:underline ml-auto"
          >
            Notion →
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Workspace board ──────────────────────────────────────────────────────────

function WorkspaceBoard({
  workspace,
  items,
  color,
  selectedId,
  onSelectItem,
}: {
  workspace: string;
  items: ActionItemRow[];
  color: string;
  selectedId: string | null;
  onSelectItem: (item: ActionItemRow) => void;
}) {
  const byStatus = STATUS_COLUMNS.reduce<Record<KanbanStatus, ActionItemRow[]>>(
    (acc, col) => { acc[col.key] = items.filter((i) => i.status === col.key); return acc; },
    { open: [], in_progress: [], blocked: [], done: [], broken_off: [] },
  );

  return (
    <div
      className="mb-8 bg-bg-card rounded-xl overflow-hidden"
      style={{
        borderTop: `3px solid ${color}`,
        boxShadow: '0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)',
      }}
    >
      {/* Workspace header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-default">
        <div className="mono text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color }}>
          {workspace}
        </div>
        <span className="mono text-[9px] text-text-muted">{items.length} items</span>
      </div>

      {/* Status columns */}
      <div className="p-4 overflow-x-auto">
        <div className="flex gap-3 min-w-[600px]">
          {STATUS_COLUMNS.map((col) => {
            const colItems = byStatus[col.key];
            return (
              <div key={col.key} className="flex-1 min-w-[120px]">
                <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted mb-2 flex items-center justify-between">
                  <span>{col.label}</span>
                  <span className="text-text-muted">{colItems.length}</span>
                </div>
                <div className="space-y-1.5 min-h-[40px]">
                  {colItems.map((item) => (
                    <KanbanCard
                      key={item.id}
                      item={item}
                      selected={selectedId === item.id}
                      onSelect={() => onSelectItem(item)}
                    />
                  ))}
                  {colItems.length === 0 && (
                    <div className="h-8 border border-dashed border-border-default rounded-lg flex items-center justify-center">
                      <div className="mono text-[9px] text-text-faint">Empty</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function KanbanEmbeds() {
  const currentMemberId = useCurrentMember();
  const [myCardsOnly, setMyCardsOnly] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ActionItemRow | null>(null);

  const driFilter = myCardsOnly && currentMemberId ? currentMemberId : '';
  const { items, members, loading, error } = useKanbanItems(driFilter);

  const byWorkspace = items.reduce<Record<string, ActionItemRow[]>>((acc, item) => {
    const ws = item.kanban_workspace ?? 'Unknown';
    (acc[ws] ??= []).push(item);
    return acc;
  }, {});
  const workspaces = Object.keys(byWorkspace).sort();

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-32 bg-bg-card rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-xl px-5 py-4">
        <div className="mono text-[12px] text-[#E14B4B]">{error}</div>
      </div>
    );
  }

  return (
    <div>
      {/* Controls row */}
      <div className="flex items-center gap-3 mb-5">
        {/* My Cards toggle */}
        <button
          onClick={() => setMyCardsOnly((v) => !v)}
          disabled={!currentMemberId}
          className={`mono text-[10px] uppercase tracking-[0.14em] px-3 py-1.5 rounded-lg border transition-colors ${
            myCardsOnly
              ? 'bg-accent-orange border-accent text-white'
              : 'border-border-default text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed'
          }`}
        >
          My Cards
        </button>

        {/* DRI dropdown for non-self filtering */}
        {!myCardsOnly && (
          <select
            onChange={(e) => {
              if (e.target.value && e.target.value !== currentMemberId) {
                setMyCardsOnly(false);
              }
            }}
            className="bg-bg-card border border-border-default rounded-lg px-2 py-1 mono text-[11px] text-text-primary focus:outline-none"
          >
            <option value="">All team members</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}

        {myCardsOnly && (
          <span className="mono text-[10px] text-text-muted">
            Showing your cards only
          </span>
        )}
      </div>

      {workspaces.length === 0 ? (
        <div className="bg-bg-card border border-border-default rounded-xl px-5 py-8 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-muted mb-1">
            {myCardsOnly ? 'No cards assigned to you.' : 'No kanban items yet'}
          </div>
          {!myCardsOnly && (
            <div className="mono text-[11px] text-text-muted max-w-xs mx-auto">
              Action items with a kanban_workspace set will appear here.
            </div>
          )}
        </div>
      ) : (
        workspaces.map((ws, idx) => (
          <WorkspaceBoard
            key={ws}
            workspace={ws}
            items={byWorkspace[ws]}
            color={workspaceColor(idx)}
            selectedId={selectedItem?.id ?? null}
            onSelectItem={(item) => setSelectedItem(selectedItem?.id === item.id ? null : item)}
          />
        ))
      )}

      {selectedItem && (
        <CardSlideOut item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}
