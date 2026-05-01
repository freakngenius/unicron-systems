// Live activity feed reads from `pathfinder.agent_log` (anon SELECT allowed by
// RLS, see Pathfinder/supabase/migrations/0004_rls.sql).
//
// Initial fetch returns the 20 most recent rows ordered by ts desc. A Supabase
// Realtime subscription on the same table prepends new INSERTs as they arrive.
//
// Schema reference: Pathfinder/supabase/migrations/0002_tables.sql:
//   pathfinder.agent_log(id, agent_name, event_type, event_data jsonb,
//                        latency_ms, model_used, ts)
// agent_name CHECK was widened in 0005_agent_expansion_layer1.sql to:
//   ingestor, ranker, adjacent, verifier, outreach, pulse, competitive,
//   briefing, customer-intel, eval

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

export type AgentName =
  | 'ingestor'
  | 'ranker'
  | 'adjacent'
  | 'verifier'
  | 'outreach'
  | 'pulse'
  | 'competitive'
  | 'briefing'
  | 'customer-intel'
  | 'eval';

export type AgentLogRow = {
  id: number;
  agent_name: AgentName;
  event_type: string;
  event_data: Record<string, unknown>;
  latency_ms: number | null;
  model_used: string | null;
  ts: string; // ISO timestamp
};

const FEED_LIMIT = 20;

export type ActivityState = {
  rows: AgentLogRow[];
  loading: boolean;
  error: string | null;
};

export function useActivityFeed(limit = FEED_LIMIT): ActivityState {
  const [rows, setRows] = useState<AgentLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();

    async function loadInitial() {
      const { data, error: queryError } = await supabase
        .schema('pathfinder')
        .from('agent_log')
        .select('id,agent_name,event_type,event_data,latency_ms,model_used,ts')
        .order('ts', { ascending: false })
        .limit(limit);

      if (cancelled) return;

      if (queryError) {
        setError(queryError.message);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as AgentLogRow[]);
      setLoading(false);
    }

    loadInitial();

    const channel = supabase
      .channel('unicron-activity-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'pathfinder', table: 'agent_log' },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as AgentLogRow;
          setRows((curr) => [row, ...curr].slice(0, limit));
        },
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [limit]);

  return { rows, loading, error };
}

// Pure formatter — exported for tests + reuse in onboarding/visualizer.
export function formatTimestamp(iso: string, now = Date.now()): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '—';
  const deltaSec = Math.max(0, Math.round((now - ts) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const deltaMin = Math.round(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const deltaHr = Math.round(deltaMin / 60);
  if (deltaHr < 24) return `${deltaHr}h ago`;
  const deltaDay = Math.round(deltaHr / 24);
  return `${deltaDay}d ago`;
}

const dotColorByAgent: Record<AgentName, 'cyan' | 'gold' | 'magenta' | 'violet' | 'white'> = {
  ingestor: 'cyan',
  ranker: 'gold',
  adjacent: 'magenta',
  verifier: 'magenta',
  outreach: 'gold',
  pulse: 'violet',
  competitive: 'magenta',
  briefing: 'white',
  'customer-intel': 'cyan',
  eval: 'violet',
};

export function dotColorFor(agent: string): 'cyan' | 'gold' | 'magenta' | 'violet' | 'white' {
  return dotColorByAgent[agent as AgentName] ?? 'white';
}

export function formatRowText(row: AgentLogRow): string {
  const data = row.event_data ?? {};
  const detail =
    typeof data.detail === 'string'
      ? (data.detail as string)
      : typeof data.message === 'string'
        ? (data.message as string)
        : typeof data.summary === 'string'
          ? (data.summary as string)
          : null;
  const head = `${row.agent_name} · ${row.event_type}`;
  return detail ? `${head} · ${detail}` : head;
}
