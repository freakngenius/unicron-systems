// SettingsConnections.tsx — Sprint 8 F4
//
// Renders the five OAuth integrations (Slack, Gmail, Calendar, Notion, GitHub)
// for the Atrium settings drawer. Sourced from
// public.ns_list_integration_connections (Supabase RPC) which filters
// nervous_system.connected_services by category='integration' and orders by
// the spec-defined display_order.
//
// Atrium doesn't use a real React router today (events-based tab switching +
// a settings drawer per src/atrium/navigation.ts). The /settings/connections
// "route" is satisfied by this component mounted inside the existing Settings
// drawer; openAtriumSettings('connections') scrolls to its anchor.

import { useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase';

interface IntegrationRow {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'expired' | string;
  last_sync: string | null;
  notes: string | null;
  reconnect_url: string | null;
  display_order: number;
}

function statusColor(status: string): string {
  if (status === 'connected' || status === 'healthy') return 'text-[#2E8E66]';
  if (status === 'expired' || status === 'degraded') return 'text-[#d28b2a]';
  return 'text-text-secondary';
}

function statusDotColor(status: string): string {
  if (status === 'connected' || status === 'healthy') return 'bg-[#2E8E66]';
  if (status === 'expired' || status === 'degraded') return 'bg-[#d28b2a]';
  return 'bg-border-default';
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function SettingsConnections() {
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const sb = getSupabase();
      const { data, error } = await sb.rpc('ns_list_integration_connections');
      if (cancelled) return;
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      setRows((data as IntegrationRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      id="settings-connections"
      className="flex flex-col gap-2 border-t border-border-subtle pt-4 mt-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)] font-semibold">
          Connections
        </h3>
        <span className="mono text-[9px] text-text-muted">
          /settings/connections · {rows.length} integrations
        </span>
      </div>
      {loading && (
        <div className="mono text-[10px] text-text-muted">Loading integrations…</div>
      )}
      {err && (
        <div className="mono text-[10px] text-[#c44]">Error: {err}</div>
      )}
      {!loading && !err && rows.length === 0 && (
        <div className="mono text-[10px] text-text-muted">
          No integration rows in nervous_system.connected_services where category=&apos;integration&apos;.
          Apply migration 20260513_connections_route.sql.
        </div>
      )}
      <div className="flex flex-col divide-y divide-border-subtle">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-4 py-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor(row.status)}`} />
              <div className="min-w-0 flex flex-col">
                <span className="mono text-[12px] text-text-primary truncate">{row.name}</span>
                {row.notes && (
                  <span className="mono text-[10px] text-text-muted truncate">{row.notes}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`mono text-[10px] ${statusColor(row.status)}`}>{row.status}</span>
              <span className="mono text-[10px] text-text-muted">
                last sync {formatRelative(row.last_sync)}
              </span>
              {row.reconnect_url && (
                <a
                  href={row.reconnect_url}
                  target={row.reconnect_url.startsWith('http') ? '_blank' : undefined}
                  rel={row.reconnect_url.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="mono text-[10px] uppercase tracking-[0.12em] text-text-secondary hover:text-text-primary underline-offset-2 hover:underline"
                >
                  {row.status === 'connected' ? 'Manage' : 'Reconnect'}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
