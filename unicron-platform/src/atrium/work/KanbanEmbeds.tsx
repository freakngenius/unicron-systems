// KanbanEmbeds.tsx — Sprint 4 Stream D
// Read-only view of action_items grouped by kanban_workspace, with status
// columns mirroring the Notion kanban. Data comes from nervous_system tables —
// NOT from the Notion API (no Notion MCP at runtime in this surface).

import { useState, useEffect } from 'react';
import { getSupabase } from '../../lib/supabase';

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
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Map action_items.status → Notion kanban column label
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

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

        if (driFilter) {
          query = query.eq('dri', driFilter);
        }

        const { data, error: err } = await query.returns<ActionItemRow[]>();
        if (err) throw err;
        if (!cancelled) setItems(data ?? []);

        const { data: memberData } = await sb
          .schema('nervous_system')
          .from('team_members')
          .select('id, name')
          .returns<TeamMember[]>();
        if (!cancelled) setMembers(memberData ?? []);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load kanban');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [driFilter]);

  return { items, members, loading, error };
}

// ─── Item Card ────────────────────────────────────────────────────────────────

function KanbanCard({ item }: { item: ActionItemRow }) {
  return (
    <div className="bg-[#1A1A1D] border border-[#1F1F23] rounded-lg px-3 py-2.5 hover:border-[#2A2A2E] transition-colors">
      <div className="flex items-start gap-2 mb-1.5">
        <div
          className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
          style={{ backgroundColor: PRIORITY_COLORS[item.priority] }}
        />
        <div className="mono text-[11px] text-[#E5E5E7] leading-snug">
          {item.title}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {item.team_members && (
          <span className="mono text-[9px] text-[rgba(229,229,231,0.45)]">
            {item.team_members.name}
          </span>
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

// ─── Workspace Column Group ────────────────────────────────────────────────────

function WorkspaceBoard({
  workspace,
  items,
}: {
  workspace: string;
  items: ActionItemRow[];
}) {
  const byStatus = STATUS_COLUMNS.reduce<Record<KanbanStatus, ActionItemRow[]>>(
    (acc, col) => {
      acc[col.key] = items.filter((i) => i.status === col.key);
      return acc;
    },
    { open: [], in_progress: [], blocked: [], done: [], broken_off: [] },
  );

  return (
    <div className="mb-8">
      {/* Workspace header */}
      <div className="mono text-[11px] uppercase tracking-[0.22em] text-[rgba(229,229,231,0.5)] mb-3 flex items-center gap-2">
        <div className="w-1 h-3 rounded bg-[#FF6B2B]" />
        {workspace}
        <span className="mono text-[9px] text-[rgba(229,229,231,0.3)]">
          {items.length} items
        </span>
      </div>

      {/* Columns — horizontal scroll on mobile */}
      <div className="overflow-x-auto">
        <div className="flex gap-3 min-w-[600px]">
          {STATUS_COLUMNS.map((col) => {
            const colItems = byStatus[col.key];
            return (
              <div key={col.key} className="flex-1 min-w-[120px]">
                <div className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] mb-2 flex items-center justify-between">
                  <span>{col.label}</span>
                  <span className="text-[rgba(229,229,231,0.3)]">
                    {colItems.length}
                  </span>
                </div>
                <div className="space-y-1.5 min-h-[40px]">
                  {colItems.map((item) => (
                    <KanbanCard key={item.id} item={item} />
                  ))}
                  {colItems.length === 0 && (
                    <div className="h-8 border border-dashed border-[#1F1F23] rounded-lg flex items-center justify-center">
                      <div className="mono text-[9px] text-[rgba(229,229,231,0.2)]">
                        Empty
                      </div>
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
  const [driFilter, setDriFilter] = useState('');
  const { items, members, loading, error } = useKanbanItems(driFilter);

  // Group by kanban_workspace
  const byWorkspace = items.reduce<Record<string, ActionItemRow[]>>(
    (acc, item) => {
      const ws = item.kanban_workspace ?? 'Unknown';
      (acc[ws] ??= []).push(item);
      return acc;
    },
    {},
  );

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
      {/* DRI filter */}
      <div className="flex items-center gap-3 mb-5">
        <label className="mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)]">
          Filter by DRI
        </label>
        <select
          value={driFilter}
          onChange={(e) => setDriFilter(e.target.value)}
          className="bg-[#141416] border border-[#1F1F23] rounded-lg px-2 py-1 mono text-[11px] text-[#E5E5E7] focus:outline-none"
        >
          <option value="">All team members</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {workspaces.length === 0 ? (
        <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-8 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)] mb-1">
            No kanban items yet
          </div>
          <div className="mono text-[11px] text-[rgba(229,229,231,0.3)] max-w-xs mx-auto">
            Action items with a kanban_workspace set will appear here. Agents
            populate this as they create action items linked to Notion kanban
            cards.
          </div>
        </div>
      ) : (
        workspaces.map((ws) => (
          <WorkspaceBoard key={ws} workspace={ws} items={byWorkspace[ws]} />
        ))
      )}
    </div>
  );
}
