// AttentionScorer — Sprint 4 Stream C
//
// Scores items for the Top of Mind panel. Higher score = surfaces higher.
// Score table:
//   open escalation (irreversible priority or break_off_signal)  → 10
//   high-confidence ingest call                                  →  8
//   sprint in-flight with recent state change                    →  7
//   customer health alert (high-priority action_item, no dri)    →  6
//   calendar event in next 4 hours                               →  4

import { getSupabase } from '../../lib/supabase';

export interface ScoredItem {
  id: string;
  score: number;
  label: string;        // short display label
  detail: string | null;
  category: 'escalation' | 'ingest' | 'sprint' | 'health' | 'calendar';
  priority?: string;
  due_at?: string | null;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchEscalations(): Promise<ScoredItem[]> {
  const sb = getSupabase();
  // PGRST106 fix: use ns_list_action_items_escalations RPC
  const { data } = await sb
    .rpc('ns_list_action_items_escalations', { p_limit: 10 });

  return (data ?? []).map((row) => ({
    id: row.id,
    score: 10,
    label: row.title,
    detail: row.description ?? null,
    category: 'escalation' as const,
    priority: row.priority,
    due_at: row.due_at,
  }));
}

async function fetchRecentIngestCalls(): Promise<ScoredItem[]> {
  const sb = getSupabase();
  // PGRST106 fix: use ns_list_ledger_recent_calls RPC
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data } = await sb
    .rpc('ns_list_ledger_recent_calls', { p_since: since48h, p_limit: 5 });

  return (data ?? [])
    .filter((row) => {
      const confidence = (row.insights as Record<string, unknown> | null)?.confidence;
      return typeof confidence === 'number' ? confidence >= 0.7 : true;
    })
    .map((row) => ({
      id: row.id,
      score: 8,
      label: row.content_summary ?? `Call — ${new Date(row.created_at).toLocaleDateString()}`,
      detail: null,
      category: 'ingest' as const,
    }));
}

async function fetchActiveSprintEvents(): Promise<ScoredItem[]> {
  const sb = getSupabase();
  // PGRST106 fix: use ns_list_audit_log_sprint_events RPC
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await sb
    .rpc('ns_list_audit_log_sprint_events', { p_since: since24h, p_limit: 5 });

  return (data ?? []).map((row) => ({
    id: row.id,
    score: 7,
    label: `Sprint event: ${row.action}`,
    detail: `on ${row.table_name}`,
    category: 'sprint' as const,
  }));
}

async function fetchHealthAlerts(): Promise<ScoredItem[]> {
  const sb = getSupabase();
  // PGRST106 fix: use ns_list_action_items_health_alerts RPC
  const { data } = await sb
    .rpc('ns_list_action_items_health_alerts', { p_limit: 5 });

  return (data ?? []).map((row) => ({
    id: row.id,
    score: 6,
    label: row.title,
    detail: row.description ?? null,
    category: 'health' as const,
    priority: row.priority,
    due_at: row.due_at,
  }));
}

async function fetchCalendarItems(): Promise<ScoredItem[]> {
  // Attempt to fetch from /api/atrium/calendar. Gracefully absent if not connected.
  try {
    const res = await fetch('/api/atrium/calendar', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const json = (await res.json()) as Array<{
      id: string;
      summary: string;
      start: string;
    }>;

    const now = Date.now();
    const fourHours = 4 * 60 * 60 * 1000;

    return json
      .filter((ev) => {
        const t = new Date(ev.start).getTime();
        return t >= now && t <= now + fourHours;
      })
      .map((ev) => ({
        id: ev.id,
        score: 4,
        label: ev.summary,
        detail: new Date(ev.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        category: 'calendar' as const,
      }));
  } catch {
    return [];
  }
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

export async function scoreAttentionItems(): Promise<ScoredItem[]> {
  const [escalations, ingest, sprints, health, calendar] = await Promise.allSettled([
    fetchEscalations(),
    fetchRecentIngestCalls(),
    fetchActiveSprintEvents(),
    fetchHealthAlerts(),
    fetchCalendarItems(),
  ]);

  const all: ScoredItem[] = [
    ...(escalations.status === 'fulfilled' ? escalations.value : []),
    ...(ingest.status === 'fulfilled' ? ingest.value : []),
    ...(sprints.status === 'fulfilled' ? sprints.value : []),
    ...(health.status === 'fulfilled' ? health.value : []),
    ...(calendar.status === 'fulfilled' ? calendar.value : []),
  ];

  // Dedupe by id, keep highest score
  const byId = new Map<string, ScoredItem>();
  for (const item of all) {
    const existing = byId.get(item.id);
    if (!existing || item.score > existing.score) byId.set(item.id, item);
  }

  return [...byId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
