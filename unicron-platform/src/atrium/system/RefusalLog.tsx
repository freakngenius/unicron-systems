// RefusalLog.tsx — Sprint 3 Stream D
// Audit surface for Taboo Keeper bounces.
// Queries nervous_system.audit_log where action = 'taboo_bounce'.

import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RefusalPayload {
  action_type?: string;
  matched_taboo?: string;
  reason?: string;
  override_status?: string;
  agent_name?: string;
}

interface RefusalEntry {
  id: string;
  created_at: string;
  action: string;
  payload: RefusalPayload | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RefusalLog() {
  const [entries, setEntries] = useState<RefusalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // PGRST106 fix: nervous_system is not in PostgREST db-schemas.
    // Use public.ns_list_audit_log_taboo() SECURITY DEFINER RPC instead.
    getSupabase()
      .rpc('ns_list_audit_log_taboo', { p_limit: 50 })
      .then(({ data, error }) => {
        if (error) {
          console.error('[RefusalLog] fetch error:', error.message);
        }
        setEntries((data as RefusalEntry[]) ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 bg-[#141416] rounded-lg animate-pulse border border-[#1F1F23]" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-8 text-center">
        <div className="mono text-[11px] text-[rgba(229,229,231,0.5)]">
          No taboo bounces recorded yet.
        </div>
        <div className="mono text-[9px] uppercase tracking-[0.14em] text-[rgba(229,229,231,0.3)] mt-1">
          The system is clean.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-left border-b border-[#1F1F23]">
            <th className="pb-3 pr-4 mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] font-normal">
              When
            </th>
            <th className="pb-3 pr-4 mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] font-normal">
              Agent
            </th>
            <th className="pb-3 pr-4 mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] font-normal">
              Action type
            </th>
            <th className="pb-3 pr-4 mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] font-normal">
              Taboo matched
            </th>
            <th className="pb-3 mono text-[9px] uppercase tracking-[0.16em] text-[rgba(229,229,231,0.4)] font-normal">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const isOverridden = e.payload?.override_status === 'overridden';
            return (
              <tr
                key={e.id}
                className="border-b border-[#1A1A1D] hover:bg-[#141416] transition-colors"
              >
                <td className="py-3 pr-4 mono text-[11px] text-[rgba(229,229,231,0.6)] whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="py-3 pr-4 mono text-[11px] text-[rgba(229,229,231,0.6)]">
                  {e.payload?.agent_name ?? '—'}
                </td>
                <td className="py-3 pr-4 mono text-[11px] text-[rgba(229,229,231,0.7)]">
                  {e.payload?.action_type ?? 'unknown'}
                </td>
                <td className="py-3 pr-4 mono text-[11px] text-[#EF4444]">
                  {e.payload?.matched_taboo ?? '—'}
                </td>
                <td className="py-3">
                  <span
                    className="mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded"
                    style={
                      isOverridden
                        ? { background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }
                        : { background: 'rgba(239,68,68,0.15)', color: '#EF4444' }
                    }
                  >
                    {e.payload?.override_status ?? 'bounced'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 mono text-[9px] text-[rgba(229,229,231,0.3)]">
        Showing last 50 events · {entries.length} total displayed
      </div>
    </div>
  );
}
