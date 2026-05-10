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
  irreversible: '#EF4444',
  high: '#F59E0B',
  medium: '#3B82F6',
  low: 'rgba(229,229,231,0.35)',
};

// Distinct color per workspace (cycles if more than 5)
const WORKSPACE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

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
    getSupabase()
      .schema('nervous_system')
      .from('team_members')
      .select('id')
      .eq('email', email)
      .maybeSingle()
      .then(({ data }) => setMemberId(data?.id ?? null));
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
        let query = sb
          .schema('nervous_system')
          .from('action_items')
          .select('id, title, priority, status, dri, kanban_workspace, kanban_card_id, team_members(id, name)')
          .not('kanban_workspace', 'is', null)
          .order('created_at', { ascending: false })
          .limit(500);

        if (driFilter) query = query.eq('dri', driFilter);

        const { data, error: err } = await query.returns<ActionItemRow[]>();
        if (err) throw err;
        if (!cancelled) setItems(data ?? []);

        const { data: memberData } = await sb
          .schema('nervous_system')
          .from('team_members')
          .select('id, name, email')
          .returns<TeamMember[]>();
        if (!cancelled) setMembers(memberData ?? []);
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
  const priorityColor = PRIORITY_COLORS[item.priority] ?? 'rgba(229,229,231,0.35)';

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md h-full bg-[#141416] sm:border-l border-[#1F1F23] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#1F1F23] sticky top-0 bg-[#141416] z-10">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: priorityColor }} />
              <div className="mono text-[9px] uppercase tracking-[0.14em]" style={{ color: priorityColor }}>
                {item.priority}
              </div>
            </div>
            <div className="mono text-[13px] font-medium text-[#E5E5E7] leading-snug">{item.title}</div>
          </div>
          <button
            onClick={onClose}
            className="mono text-[11px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.4)] hover:text-[#E5E5E7] transition-colors shrink-0 mt-0.5"
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
              <div key={label} className="bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2">
                <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-0.5">{label}</div>
                <div className="mono text-[11px] text-[rgba(229,229,231,0.85)] capitalize">{value}</div>
              </div>
            ))}
          </div>

          {/* Notion link */}
          {item.kanban_card_id && (
            <div>
              <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-1.5">Notion Card</div>
              <a
                href={`https://notion.so/${item.kanban_card_id.replace(/-/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mono text-[11px] text-[#FF6B2B] hover:underline"
              >
                Open in Notion →
              </a>
            </div>
          )}

          {/* Card ID */}
          <div className="pt-3 border-t border-[#1F1F23]">
            <div className="mono text-[9px] text-[rgba(229,229,231,0.25)] break-all">ID: {item.id}</div>
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
      className="bg-[#1A1A1D] border rounded-lg px-3 py-2.5 hover:border-[#2A2A2E] transition-colors cursor-pointer"
      style={{ borderColor: selected ? '#FF6B2B60' : '#1F1F23' }}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <div
          className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
          style={{ backgroundColor: PRIORITY_COLORS[item.priority] }}
        />
        <div className="mono text-[11px] text-[#E5E5E7] leading-snug">{item.title}</div>
      </div>
      <div className="flex items-center gap-2">
        {item.team_members && (
          <span className="mono text-[9px] text-[rgba(229,229,231,0.45)]">{item.team_members.name}</span>
        )}
        {item.kanban_card_id && (
          <a
            href={`https://notion.so/${item.kanban_card_id.replace(/-/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mono text-[9px] text-[#FF6B2B] hover:underline ml-auto"
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
    <div className="mb-8">
      {/* Colored workspace header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3"
        style={{ background: `${color}14`, borderLeft: `3px solid ${color}` }}
      >
        <div className="mono text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color }}>
          {workspace}
        </div>
        <span className="mono text-[9px] text-[rgba(229,229,231,0.4)]">{items.length} items</span>
      </div>

      {/* Status columns */}
      <div className="overflow-x-auto">
        <div className="flex gap-3 min-w-[600px]">
          {STATUS_COLUMNS.map((col) => {
            const colItems = byStatus[col.key];
            return (
              <div key={col.key} className="flex-1 min-w-[120px]">
                <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-2 flex items-center justify-between">
                  <span>{col.label}</span>
                  <span className="text-[rgba(229,229,231,0.3)]">{colItems.length}</span>
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
                    <div className="h-8 border border-dashed border-[#1F1F23] rounded-lg flex items-center justify-center">
                      <div className="mono text-[9px] text-[rgba(229,229,231,0.2)]">Empty</div>
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
          <div key={i} className="h-32 bg-[#141416] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-5 py-4">
        <div className="mono text-[12px] text-[#EF4444]">{error}</div>
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
              ? 'bg-[#FF6B2B] border-[#FF6B2B] text-white'
              : 'border-[#1F1F23] text-[rgba(229,229,231,0.5)] hover:text-[rgba(229,229,231,0.8)] disabled:opacity-30 disabled:cursor-not-allowed'
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
            className="bg-[#141416] border border-[#1F1F23] rounded-lg px-2 py-1 mono text-[11px] text-[#E5E5E7] focus:outline-none"
          >
            <option value="">All team members</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}

        {myCardsOnly && (
          <span className="mono text-[10px] text-[rgba(229,229,231,0.35)]">
            Showing your cards only
          </span>
        )}
      </div>

      {workspaces.length === 0 ? (
        <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-8 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)] mb-1">
            {myCardsOnly ? 'No cards assigned to you.' : 'No kanban items yet'}
          </div>
          {!myCardsOnly && (
            <div className="mono text-[11px] text-[rgba(229,229,231,0.3)] max-w-xs mx-auto">
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
