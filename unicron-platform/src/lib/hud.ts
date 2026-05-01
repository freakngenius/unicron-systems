// Real HUD counters wired to Supabase + Pathfinder cost-summary.
//
// signals.processed   = sum(agent_runs.records_processed)
// signals.rejected    = total agent_log rows with event_type matching 'rejected'
// decisions.made      = total agent_log rows with event_type matching 'qualified' / 'ranked'
// reports.delivered   = total agent_runs where agent_name = 'briefing' and status = 'success'
// nodes.active        = count distinct agent_name with at least one run in last 60s
// value.surfaced      = sum(adjacent_targets.branch_count_estimate * 100k)  (placeholder until verifier ships value)
// cost.per.report     = llm_calls.total_cost_usd / max(reports.delivered, 1)
//
// All counters fetch on mount, then refresh on a single Realtime channel
// covering both `agent_log` and `agent_runs`. Cost-summary is polled every
// 60 s with the configured base URL (cross-origin GET, no auth — the endpoint
// is public-read).

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import type { HudSnapshot } from '../components/visualizer/types';

const REFRESH_MS = 15_000; // re-aggregate every 15s
const COST_REFRESH_MS = 60_000;

type CostSummary = {
  llm_calls?: {
    total_count?: number;
    total_cost_usd?: number;
  };
  total_ranked?: number;
};

const emptyHud: HudSnapshot = {
  signalsProcessed: 0,
  signalsRejected: 0,
  decisionsMade: 0,
  valueSurfaced: 0,
  reportsDelivered: 0,
  activeNodes: 0,
  costPerReport: 0,
};

async function fetchAggregate(): Promise<HudSnapshot> {
  const supabase = getSupabase();

  const [runsSum, rejected, decisions, reports, recentRuns] = await Promise.all([
    supabase
      .schema('pathfinder')
      .from('agent_runs')
      .select('records_processed,records_new', { count: 'exact', head: false })
      .limit(5000),
    supabase
      .schema('pathfinder')
      .from('agent_log')
      .select('id', { count: 'exact', head: true })
      .ilike('event_type', '%rejected%'),
    supabase
      .schema('pathfinder')
      .from('agent_log')
      .select('id', { count: 'exact', head: true })
      .or('event_type.ilike.%qualified%,event_type.ilike.%ranked%'),
    supabase
      .schema('pathfinder')
      .from('agent_runs')
      .select('id', { count: 'exact', head: true })
      .eq('agent_name', 'briefing')
      .eq('status', 'success'),
    supabase
      .schema('pathfinder')
      .from('agent_runs')
      .select('agent_name,started_at')
      .gte('started_at', new Date(Date.now() - 60_000).toISOString()),
  ]);

  const runsRows = (runsSum.data ?? []) as { records_processed: number | null }[];
  const signalsProcessed = runsRows.reduce((s, r) => s + (r.records_processed ?? 0), 0);

  const recent = (recentRuns.data ?? []) as { agent_name: string }[];
  const activeNodes = new Set(recent.map((r) => r.agent_name)).size;

  return {
    signalsProcessed,
    signalsRejected: rejected.count ?? 0,
    decisionsMade: decisions.count ?? 0,
    reportsDelivered: reports.count ?? 0,
    activeNodes,
    valueSurfaced: 0, // populated once Verifier writes a value field; tracked in Stream A
    costPerReport: 0, // overlaid below from cost-summary
  };
}

async function fetchCost(url: string): Promise<{ totalCost: number; totalCount: number } | null> {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const json = (await res.json()) as CostSummary;
    return {
      totalCost: json.llm_calls?.total_cost_usd ?? 0,
      totalCount: json.llm_calls?.total_count ?? 0,
    };
  } catch {
    return null;
  }
}

export type RealHudState = {
  hud: HudSnapshot;
  loading: boolean;
  error: string | null;
};

/**
 * `costSummaryUrl` is the absolute URL of Pathfinder's `/api/cost-summary`.
 * When unset (default), the cost-per-report cell stays at 0 and the rest of
 * the HUD still ticks from Supabase reads.
 */
export function useRealHud(costSummaryUrl?: string): RealHudState {
  const [hud, setHud] = useState<HudSnapshot>(emptyHud);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const next = await fetchAggregate();
        if (cancelled) return;
        setHud((curr) => ({ ...curr, ...next }));
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    }

    refresh();
    const interval = window.setInterval(refresh, REFRESH_MS);

    // Realtime: any new agent_runs / agent_log row triggers an immediate
    // re-aggregate so counters feel live without burning a query per insert.
    const supabase = getSupabase();
    const channel = supabase
      .channel('unicron-hud')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'pathfinder', table: 'agent_runs' },
        () => {
          refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'pathfinder', table: 'agent_log' },
        () => {
          refresh();
        },
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  // Independently poll the cost-summary endpoint (cross-origin Pathfinder API).
  useEffect(() => {
    if (!costSummaryUrl) return;
    let cancelled = false;
    let timer: number | null = null;

    async function tick() {
      const summary = await fetchCost(costSummaryUrl!);
      if (cancelled || !summary) return;
      setHud((curr) => {
        const reports = curr.reportsDelivered || summary.totalCount || 1;
        return {
          ...curr,
          costPerReport: reports > 0 ? summary.totalCost / reports : 0,
        };
      });
    }

    tick();
    timer = window.setInterval(tick, COST_REFRESH_MS);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [costSummaryUrl]);

  return { hud, loading, error };
}
