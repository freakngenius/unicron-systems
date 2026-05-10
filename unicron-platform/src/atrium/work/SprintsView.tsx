// SprintsView.tsx — Sprint 4 Stream D
// Sprint tracking from nervous_system.audit_log rows where action LIKE
// 'sprint_%'. Groups by sprint number and shows a log feed for the active
// sprint. Renders a styled empty state if no sprint data exists yet.

import { useState, useEffect } from 'react';
import { getSupabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditRow {
  id: string;
  action: string;
  table_name: string | null;
  actor_id: string | null;
  payload: {
    sprint_number?: number | string;
    sprint_name?: string;
    surface?: string;
    status?: string;
    dri?: string;
    kanban_card_url?: string;
  } | null;
  created_at: string;
}

interface SprintGroup {
  number: string; // e.g. "4", "3"
  name: string;
  rows: AuditRow[];
  latestStatus: string;
  surface: string;
  dri: string;
  kanbanCardUrl: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractSprintNumber(action: string, payload: AuditRow['payload']): string {
  if (payload?.sprint_number !== undefined)
    return String(payload.sprint_number);
  // Try parsing from action string: 'sprint_4_start', 'sprint_3_complete' etc.
  const m = /sprint[_-](\d+)/i.exec(action);
  return m ? m[1] : 'unknown';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useSprints() {
  const [groups, setGroups] = useState<SprintGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const sb = getSupabase();

    async function load() {
      try {
        // PGRST106 fix: use ns_list_audit_log_sprints RPC
        const { data, error: err } = await sb
          .rpc('ns_list_audit_log_sprints', { p_limit: 500 });

        if (err) throw err;
        const rows = data ?? [];

        if (!cancelled) {
          setEmpty(rows.length === 0);

          // Group by sprint number
          const grouped: Record<string, AuditRow[]> = {};
          for (const row of rows) {
            const num = extractSprintNumber(row.action, row.payload);
            (grouped[num] ??= []).push(row);
          }

          const result: SprintGroup[] = Object.entries(grouped)
            .sort(([a], [b]) => {
              const na = parseInt(a, 10) || 0;
              const nb = parseInt(b, 10) || 0;
              return nb - na; // descending — most recent sprint first
            })
            .map(([num, sprintRows]) => {
              const latest = sprintRows[0]; // already sorted desc
              const meta = latest.payload;
              return {
                number: num,
                name: meta?.sprint_name ?? `Sprint ${num}`,
                rows: sprintRows,
                latestStatus: meta?.status ?? latest.action,
                surface: meta?.surface ?? '—',
                dri: meta?.dri ?? '—',
                kanbanCardUrl: meta?.kanban_card_url ?? null,
              };
            });

          setGroups(result);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load sprints');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { groups, loading, error, empty };
}

// ─── Sprint Log Feed ──────────────────────────────────────────────────────────

function SprintLogFeed({ rows }: { rows: AuditRow[] }) {
  const display = rows.slice(0, 20);
  return (
    <div className="mt-3 space-y-1">
      {display.map((row) => (
        <div
          key={row.id}
          className="flex items-start gap-3 px-3 py-2 bg-bg-raised border border-border-default rounded-lg"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-border-strong mt-1.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <div className="mono text-[11px] text-text-primary truncate">
                {row.action}
              </div>
              <div className="mono text-[9px] text-text-muted shrink-0">
                {formatTime(row.created_at)}
              </div>
            </div>
            {row.actor && (
              <div className="mono text-[9px] text-text-muted mt-0.5">
                {row.actor}
                {row.table_name && ` · ${row.table_name}`}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Sprint Card ──────────────────────────────────────────────────────────────

function SprintCard({
  group,
  isActive,
}: {
  group: SprintGroup;
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(isActive);

  return (
    <div
      className="border rounded-xl overflow-hidden"
      style={{
        borderColor: isActive ? 'rgba(232,118,58,0.40)' : 'var(--border-default)',
        background: isActive ? 'rgba(232,118,58,0.06)' : 'var(--bg-elevated)',
      }}
    >
      {/* Card header */}
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          {isActive && (
            <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse shrink-0" />
          )}
          <div>
            <div className="mono text-[13px] text-text-primary font-medium">
              {group.name}
            </div>
            <div className="mono text-[10px] text-text-secondary mt-0.5 flex items-center gap-2">
              <span>{group.surface}</span>
              <span>·</span>
              <span>DRI: {group.dri}</span>
              <span>·</span>
              <span>{group.rows.length} log entries</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {group.kanbanCardUrl && (
            <a
              href={group.kanbanCardUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mono text-[9px] uppercase tracking-[0.12em] text-accent-orange hover:underline"
            >
              Notion →
            </a>
          )}
          <span className="mono text-[11px] text-text-muted bg-bg-raised px-2 py-0.5 rounded">
            {group.latestStatus}
          </span>
          <span className="mono text-[11px] text-text-muted">
            {expanded ? '↑' : '↓'}
          </span>
        </div>
      </div>

      {/* Log feed */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-border-default">
          <SprintLogFeed rows={group.rows} />
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function SprintsView() {
  const { groups, loading, error, empty } = useSprints();

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 bg-bg-card rounded-xl animate-pulse" />
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

  if (empty) {
    return (
      <div className="bg-bg-card border border-border-default rounded-xl px-6 py-10 text-center">
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-muted mb-2">
          No sprint data yet
        </div>
        <div className="mono text-[11px] text-text-muted max-w-sm mx-auto leading-relaxed">
          Sprint tracking begins once Conductor sprints land. The Orchestrator
          writes audit_log entries with action matching <code className="text-text-secondary">sprint_*</code>{' '}
          as it dispatches each sprint.
        </div>
      </div>
    );
  }

  // Treat the highest-numbered sprint as "active" if its status is not 'complete'
  const firstGroup = groups[0];
  const activeSprintNumber =
    firstGroup &&
    firstGroup.latestStatus !== 'complete' &&
    firstGroup.latestStatus !== 'done'
      ? firstGroup.number
      : null;

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <SprintCard
          key={group.number}
          group={group}
          isActive={group.number === activeSprintNumber}
        />
      ))}
    </div>
  );
}
