// VoiceAccountView — Atrium Products → Voice Agents → Account sub-sub-tab.
//
// Vapi account + spend surface. KPI tiles, reconcile panel, spend-by-agent
// table, last-30-days daily mini-chart, top-10 most expensive calls.
//
// Translated from prototype src/app/account/page.tsx. Atrium deltas:
//   - voiceFetch attaches bearer JWT on every call.
//   - Endpoints repointed to /api/voice/account + /api/voice/reconcile-costs.
//   - Wrapped in <div className="atrium-v3"> for CSS scope.

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { voiceFetch } from '../../lib/voiceFetch';
import {
  V3PanelCard,
  V3Btn,
  V3StatusPill,
  V3EmptyState,
} from './components/v3primitives';
import { I } from './components/icons';

type AccountSummary = {
  ok: boolean;
  vapi_org_id: string | null;
  lifetime: { calls: number; cost_usd: number; minutes: number };
  totals: {
    d7: { calls: number; cost_usd: number };
    d30: { calls: number; cost_usd: number };
    d90: { calls: number; cost_usd: number };
  };
  by_agent: Array<{
    source_id: string;
    source_name: string;
    agent_type: string | null;
    status: string | null;
    calls: number;
    cost_usd: number;
  }>;
  by_day: Array<{ day: string; calls: number; cost_usd: number }>;
  top_calls: Array<{
    transcript_id: string;
    source_id: string;
    source_name: string;
    to_phone: string | null;
    contact_name: string | null;
    cost_usd: number;
    duration_seconds: number;
    created_at: string;
  }>;
};

type ReconcileStatus = {
  ok: boolean;
  total_with_vapi_id: number;
  missing_cost: number;
};

function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '$0.00';
  if (n >= 100) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function compactDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function VoiceAccountView() {
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [reconcileStatus, setReconcileStatus] = useState<ReconcileStatus | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMsg, setReconcileMsg] = useState<string | null>(null);
  const [agentSort, setAgentSort] = useState<'cost' | 'calls' | 'name'>('cost');

  async function loadAll() {
    setLoading(true);
    setLoadErr(null);
    try {
      const [aRes, rRes] = await Promise.all([
        voiceFetch('/api/voice/account'),
        voiceFetch('/api/voice/reconcile-costs'),
      ]);
      if (!aRes.ok) throw new Error(`account: ${aRes.status}`);
      if (!rRes.ok) throw new Error(`reconcile-costs: ${rRes.status}`);
      const a = (await aRes.json()) as AccountSummary;
      const r = (await rRes.json()) as ReconcileStatus;
      setSummary(a);
      setReconcileStatus(r);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAll(); }, []);

  async function runReconcile() {
    setReconciling(true);
    setReconcileMsg(null);
    try {
      const r = await voiceFetch('/api/voice/reconcile-costs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ max: 100 }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        candidates?: number;
        reconciled?: number;
        failed?: number;
        error?: string;
      };
      if (j.ok) {
        setReconcileMsg(
          `Reconciled ${j.reconciled ?? 0} of ${j.candidates ?? 0} candidates (${j.failed ?? 0} failed)`
        );
        await loadAll();
      } else {
        setReconcileMsg(`Error: ${j.error ?? 'unknown'}`);
      }
    } catch (e) {
      setReconcileMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setReconciling(false);
    }
  }

  const agents = useMemo(() => {
    if (!summary) return [];
    const copy = [...summary.by_agent];
    if (agentSort === 'cost') copy.sort((a, b) => b.cost_usd - a.cost_usd);
    if (agentSort === 'calls') copy.sort((a, b) => b.calls - a.calls);
    if (agentSort === 'name') copy.sort((a, b) => a.source_name.localeCompare(b.source_name));
    return copy;
  }, [summary, agentSort]);

  const maxDailySpend = useMemo(() => {
    if (!summary) return 0;
    return Math.max(0.0001, ...summary.by_day.map((d) => d.cost_usd));
  }, [summary]);

  if (loadErr) {
    return (
      <V3PanelCard title="Voice account">
        <V3EmptyState
          title="Failed to load account"
          description={loadErr}
          action={<V3Btn kind="ghost" icon={<I.Refresh size={12} />} onClick={loadAll}>Retry</V3Btn>}
        />
      </V3PanelCard>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <V3PanelCard
        title="Vapi account"
        subtitle={
          summary?.vapi_org_id
            ? `Account ID ${summary.vapi_org_id}`
            : 'Account ID will appear after the next end-of-call webhook fires'
        }
        action={
          <V3Btn kind="ghost" icon={<I.Refresh size={12} />} onClick={loadAll}>
            Refresh
          </V3Btn>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <KpiTile
            label="Lifetime spend"
            value={usd(summary?.lifetime.cost_usd)}
            sub={`${summary?.lifetime.calls ?? 0} calls · ${(summary?.lifetime.minutes ?? 0).toFixed(1)} min`}
          />
          <KpiTile
            label="Spend · 7d"
            value={usd(summary?.totals.d7.cost_usd)}
            sub={`${summary?.totals.d7.calls ?? 0} calls`}
          />
          <KpiTile
            label="Spend · 30d"
            value={usd(summary?.totals.d30.cost_usd)}
            sub={`${summary?.totals.d30.calls ?? 0} calls`}
          />
          <KpiTile
            label="Spend · 90d"
            value={usd(summary?.totals.d90.cost_usd)}
            sub={`${summary?.totals.d90.calls ?? 0} calls`}
          />
        </div>
      </V3PanelCard>

      <V3PanelCard
        title="Cost data health"
        subtitle="Backfills missing cost rows by pulling the Vapi call detail. Safe to run anytime."
        action={
          <V3Btn
            kind="primary"
            icon={<I.Refresh size={12} />}
            onClick={runReconcile}
            disabled={reconciling}
          >
            {reconciling ? 'Reconciling…' : 'Reconcile now'}
          </V3Btn>
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 13 }}>
          <div>
            <div style={{ color: 'var(--v3-ink-lo)', fontSize: 11 }}>Calls with Vapi ID</div>
            <div style={{ fontWeight: 600, fontSize: 18 }}>{reconcileStatus?.total_with_vapi_id ?? 0}</div>
          </div>
          <div>
            <div style={{ color: 'var(--v3-ink-lo)', fontSize: 11 }}>Missing cost</div>
            <div
              style={{
                fontWeight: 600,
                fontSize: 18,
                color: (reconcileStatus?.missing_cost ?? 0) > 0 ? 'var(--v3-amber)' : 'var(--v3-ink)',
              }}
            >
              {reconcileStatus?.missing_cost ?? 0}
            </div>
          </div>
          {reconcileMsg && <V3StatusPill tone="info">{reconcileMsg}</V3StatusPill>}
        </div>
      </V3PanelCard>

      <V3PanelCard
        title="Spend by agent · 90d"
        subtitle="Cost per agent across the last 90 days. Click a column header to sort."
      >
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--v3-ink-lo)', fontSize: 11 }}>
              <Th onClick={() => setAgentSort('name')} active={agentSort === 'name'}>Agent</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th onClick={() => setAgentSort('calls')} active={agentSort === 'calls'} align="right">Calls</Th>
              <Th onClick={() => setAgentSort('cost')} active={agentSort === 'cost'} align="right">Cost</Th>
              <Th align="right">Avg/call</Th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 16, textAlign: 'center', color: 'var(--v3-ink-lo)' }}>
                  {loading ? 'Loading…' : 'No spend yet'}
                </td>
              </tr>
            ) : (
              agents.map((a) => (
                <tr key={a.source_id} style={rowStyle}>
                  <td style={cellStyle}>
                    <div style={{ fontWeight: 600 }}>{a.source_name}</div>
                  </td>
                  <td style={{ ...cellStyle, color: 'var(--v3-ink-lo)' }}>{a.agent_type ?? '—'}</td>
                  <td style={cellStyle}>
                    <V3StatusPill
                      tone={
                        a.status === 'active' ? 'ok' : a.status === 'paused' ? 'warn' : 'neutral'
                      }
                    >
                      {a.status ?? '?'}
                    </V3StatusPill>
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{a.calls}</td>
                  <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>
                    {usd(a.cost_usd)}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', color: 'var(--v3-ink-lo)' }}>
                    {a.calls > 0 ? usd(a.cost_usd / a.calls) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </V3PanelCard>

      <V3PanelCard
        title="Daily spend · last 30 days"
        subtitle="Each bar is one day. Hover for detail."
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
          {(summary?.by_day ?? []).slice(-30).map((d) => {
            const pct = (d.cost_usd / maxDailySpend) * 100;
            return (
              <div
                key={d.day}
                title={`${d.day}: ${usd(d.cost_usd)} (${d.calls} calls)`}
                style={{
                  flex: 1,
                  height: `${Math.max(pct, 2)}%`,
                  background: pct > 0 ? 'var(--v3-blue)' : 'var(--v3-line)',
                  borderRadius: 2,
                  minHeight: 2,
                }}
              />
            );
          })}
          {(summary?.by_day ?? []).length === 0 && (
            <div style={{ color: 'var(--v3-ink-lo)', fontSize: 12 }}>
              {loading ? 'Loading…' : 'No daily data yet'}
            </div>
          )}
        </div>
      </V3PanelCard>

      <V3PanelCard
        title="Top 10 most expensive calls · 90d"
        subtitle="Sorted by cost descending."
      >
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--v3-ink-lo)', fontSize: 11 }}>
              <Th>When</Th>
              <Th>Agent</Th>
              <Th>Contact</Th>
              <Th align="right">Duration</Th>
              <Th align="right">Cost</Th>
            </tr>
          </thead>
          <tbody>
            {(summary?.top_calls ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: 'var(--v3-ink-lo)' }}>
                  {loading ? 'Loading…' : 'No call cost data yet'}
                </td>
              </tr>
            ) : (
              summary!.top_calls.map((c) => (
                <tr key={c.transcript_id} style={rowStyle}>
                  <td style={{ ...cellStyle, color: 'var(--v3-ink-lo)' }}>
                    {compactDate(c.created_at)}
                  </td>
                  <td style={cellStyle}>{c.source_name}</td>
                  <td style={cellStyle}>{c.contact_name ?? c.to_phone ?? '—'}</td>
                  <td style={{ ...cellStyle, textAlign: 'right', color: 'var(--v3-ink-lo)' }}>
                    {c.duration_seconds}s
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>
                    {usd(c.cost_usd)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </V3PanelCard>
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      style={{
        padding: '14px 16px',
        border: '1px solid var(--v3-line)',
        borderRadius: 10,
        background: 'var(--v3-surface)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--v3-ink-lo)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--v3-ink-lo)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

const rowStyle: CSSProperties = { borderTop: '1px solid var(--v3-line)' };
const cellStyle: CSSProperties = { padding: '10px 8px' };

function Th({
  children,
  onClick,
  active,
  align,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  align?: 'left' | 'right';
}) {
  return (
    <th
      onClick={onClick}
      style={{
        padding: '8px 8px',
        textAlign: align ?? 'left',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        fontWeight: 600,
        cursor: onClick ? 'pointer' : 'default',
        color: active ? 'var(--v3-blue)' : undefined,
        borderBottom: '1px solid var(--v3-line)',
      }}
    >
      {children}
    </th>
  );
}
