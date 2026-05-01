// Subscribe to `pathfinder.agent_runs` so the visualizer pulses every time a
// real agent run lands. The cron + Inngest pipeline lives in Pathfinder; this
// file is the read-only Stream C consumer.
//
// Schema reference: Pathfinder/supabase/migrations/0002_tables.sql,
//   pathfinder.agent_runs(id, agent_name, started_at, completed_at,
//                         records_processed, records_new, status,
//                         error_message)
// Realtime publication: 0003_realtime.sql adds the table to
//   `supabase_realtime`. RLS allows anon SELECT.

import { useEffect, useState, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import type { AgentName } from './activity';

export type AgentRunRow = {
  id: number;
  agent_name: AgentName;
  started_at: string;
  completed_at: string | null;
  records_processed: number;
  records_new: number;
  status: 'running' | 'success' | 'failed';
  error_message: string | null;
};

export type RunPulse = {
  agentName: AgentName;
  runId: number;
  startedAt: string;
  /** Strictly-monotonic counter so React effects re-fire even on duplicate runIds. */
  key: number;
};

export type AgentRunsState = {
  /** Most-recent → oldest, capped at `limit`. */
  rows: AgentRunRow[];
  /** Last pulse, or null until the first new INSERT lands. */
  lastPulse: RunPulse | null;
  loading: boolean;
  error: string | null;
};

export function useAgentRuns(limit = 30): AgentRunsState {
  const [rows, setRows] = useState<AgentRunRow[]>([]);
  const [lastPulse, setLastPulse] = useState<RunPulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pulseCounter = useRef(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();

    async function loadInitial() {
      const { data, error: queryError } = await supabase
        .schema('pathfinder')
        .from('agent_runs')
        .select(
          'id,agent_name,started_at,completed_at,records_processed,records_new,status,error_message',
        )
        .order('started_at', { ascending: false })
        .limit(limit);

      if (cancelled) return;
      if (queryError) {
        setError(queryError.message);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as AgentRunRow[]);
      setLoading(false);
    }
    loadInitial();

    const channel = supabase
      .channel('unicron-agent-runs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'pathfinder', table: 'agent_runs' },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as AgentRunRow;
          setRows((curr) => [row, ...curr].slice(0, limit));
          pulseCounter.current += 1;
          setLastPulse({
            agentName: row.agent_name,
            runId: row.id,
            startedAt: row.started_at,
            key: pulseCounter.current,
          });
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

  return { rows, lastPulse, loading, error };
}
