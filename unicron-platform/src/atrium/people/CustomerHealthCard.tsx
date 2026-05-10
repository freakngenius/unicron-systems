// CustomerHealthCard.tsx — Sprint 5 Stream E
// Drill-in modal/panel for a customer: engagement depth, last contact,
// sentiment signal, recent activity feed, open action items.

import { useState, useEffect } from 'react';
import type { Customer } from './CustomersPipeline';
import { getSupabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LedgerEntry {
  id: string;
  source_type: string;
  content_summary: string | null;
  created_at: string;
  sentiment_score: number | null;
  customer_id: string | null;
  participants: unknown | null;
}

interface ActionItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  assigned_to: string | null;
}

interface HealthData {
  interactions30d: number;
  engagementBySource: Record<string, number>;
  lastEntry: LedgerEntry | null;
  avgSentiment: number | null;
  recentActivity: LedgerEntry[];
  openActions: ActionItem[];
  loading: boolean;
  error: string | null;
}

// ─── Data hook ────────────────────────────────────────────────────────────────

function useHealthData(customerId: string): HealthData {
  const [data, setData] = useState<HealthData>({
    interactions30d: 0,
    engagementBySource: {},
    lastEntry: null,
    avgSentiment: null,
    recentActivity: [],
    openActions: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    async function load() {
      try {
        const [ledgerRes, actionsRes] = await Promise.all([
          // Ledger entries for this customer in last 30d
          sb
            .schema('nervous_system')
            .from('ledger')
            .select('id, source_type, content_summary, created_at, sentiment_score, customer_id, participants')
            .eq('customer_id', customerId)
            .gte('created_at', since30d)
            .order('created_at', { ascending: false })
            .limit(50),
          // Open action items for this customer
          sb
            .schema('nervous_system')
            .from('action_items')
            .select('id, title, status, priority, due_at, assigned_to')
            .eq('customer_id', customerId)
            .eq('status', 'open')
            .order('due_at', { ascending: true })
            .limit(10),
        ]);

        if (cancelled) return;

        const entries = (ledgerRes.data as LedgerEntry[] | null) ?? [];
        const actions = (actionsRes.data as ActionItem[] | null) ?? [];

        // Engagement by source type
        const bySource: Record<string, number> = {};
        for (const e of entries) {
          bySource[e.source_type] = (bySource[e.source_type] ?? 0) + 1;
        }

        // Avg sentiment
        const withSentiment = entries.filter((e) => e.sentiment_score !== null);
        const avgSentiment =
          withSentiment.length > 0
            ? withSentiment.reduce((sum, e) => sum + (e.sentiment_score ?? 0), 0) /
              withSentiment.length
            : null;

        setData({
          interactions30d: entries.length,
          engagementBySource: bySource,
          lastEntry: entries[0] ?? null,
          avgSentiment,
          recentActivity: entries.slice(0, 10),
          openActions: actions,
          loading: false,
          error: null,
        });
      } catch (e) {
        if (!cancelled) {
          setData((d) => ({
            ...d,
            loading: false,
            error: e instanceof Error ? e.message : 'Failed to load health data',
          }));
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [customerId]);

  return data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

function sentimentLabel(score: number): { label: string; color: string } {
  if (score >= 0.5) return { label: 'Positive', color: 'var(--ok)' };
  if (score >= 0) return { label: 'Neutral', color: 'var(--text-md)' };
  if (score >= -0.5) return { label: 'Slightly negative', color: 'var(--warn)' };
  return { label: 'Negative', color: 'var(--err)' };
}

const SOURCE_ICONS: Record<string, string> = {
  call: '📞',
  slack: '💬',
  email: '✉️',
  voice_memo: '🎙️',
  apple_note: '📝',
  cowork_session: '🤝',
  agent_run: '🤖',
  manual: '⌨️',
};

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  customer: Customer;
  onClose: () => void;
}

export function CustomerHealthCard({ customer, onClose }: Props) {
  const health = useHealthData(customer.id);

  // Notes as string for display
  const notesDisplay: string | null = (() => {
    if (customer.notes === null || customer.notes === undefined) return null;
    if (typeof customer.notes === 'string') return customer.notes;
    try { return JSON.stringify(customer.notes, null, 2); } catch { return String(customer.notes); }
  })();

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--bg-overlay)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
        zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(var(--detail-w), 92vw)',
          background: 'var(--bg-elevated)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-12px 0 32px rgba(0,0,0,0.4)',
          height: '100%', overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
          animation: 'slideIn 300ms var(--ease)',
        }}
      >
        <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>
              Customer Health
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 500, color: 'var(--text-hi)', letterSpacing: -0.3 }}>
              {customer.name}
            </div>
            {customer.primary_contact && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-md)', marginTop: 4 }}>
                {customer.primary_contact}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ color: 'var(--text-md)', padding: 6, flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 22, flex: 1 }}>

          {/* Engagement summary */}
          <section>
            <SectionLabel>Engagement (last 30 days)</SectionLabel>
            {health.loading ? (
              <SkeletonBlock height={60} />
            ) : health.error ? (
              <ErrorNote message={health.error} />
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}>
                <MetricMini label="Interactions" value={health.interactions30d} />
                <MetricMini
                  label="Avg Sentiment"
                  value={
                    health.avgSentiment !== null
                      ? (() => {
                          const s = sentimentLabel(health.avgSentiment);
                          return <span style={{ color: s.color }}>{s.label}</span>;
                        })()
                      : '—'
                  }
                />
              </div>
            )}
          </section>

          {/* Engagement by source */}
          {!health.loading && !health.error && Object.keys(health.engagementBySource).length > 0 && (
            <section>
              <SectionLabel>By Source</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(health.engagementBySource)
                  .sort(([, a], [, b]) => b - a)
                  .map(([src, count]) => {
                    const total = health.interactions30d || 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={src} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                          <span style={{ color: 'var(--text-md)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {SOURCE_ICONS[src] ?? '⚡'} {src}
                          </span>
                          <span style={{ color: 'var(--text-hi)', fontFamily: 'var(--font-mono)' }}>
                            {count} ({pct}%)
                          </span>
                        </div>
                        <div style={{ height: 4, background: 'var(--bg-raised)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 999 }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {/* Last contact */}
          {!health.loading && health.lastEntry && (
            <section>
              <SectionLabel>Last Contact</SectionLabel>
              <div style={{
                padding: '10px 14px', background: 'var(--bg-surface)',
                border: '1px solid var(--border-faint)', borderRadius: 'var(--r-md)',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{SOURCE_ICONS[health.lastEntry.source_type] ?? '⚡'}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-hi)' }}>
                    {health.lastEntry.source_type}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-lo)', fontFamily: 'var(--font-mono)' }}>
                    {formatRelative(health.lastEntry.created_at)}
                  </span>
                </div>
                {health.lastEntry.content_summary && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-md)', lineHeight: 1.4 }}>
                    {health.lastEntry.content_summary}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Contract / notes */}
          {notesDisplay && (
            <section>
              <SectionLabel>Notes / Contract Milestones</SectionLabel>
              <div style={{
                padding: '10px 14px', background: 'var(--bg-surface)',
                border: '1px solid var(--border-faint)', borderRadius: 'var(--r-md)',
                fontFamily: typeof customer.notes === 'string' ? 'inherit' : 'var(--font-mono)',
                fontSize: 'var(--text-xs)', color: 'var(--text-md)',
                whiteSpace: 'pre-wrap', lineHeight: 1.5,
                maxHeight: 160, overflowY: 'auto',
              }}>
                {notesDisplay}
              </div>
            </section>
          )}

          {/* Recent activity feed */}
          <section>
            <SectionLabel>Recent Activity</SectionLabel>
            {health.loading ? (
              <SkeletonBlock height={120} />
            ) : health.recentActivity.length === 0 ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-lo)', fontStyle: 'italic' }}>
                No activity found.
              </div>
            ) : (
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-faint)',
                borderRadius: 'var(--r-md)', overflow: 'hidden',
              }}>
                {health.recentActivity.map((e, i) => (
                  <div
                    key={e.id}
                    style={{
                      padding: '9px 14px', display: 'flex', gap: 10,
                      borderTop: i === 0 ? 'none' : '1px solid var(--border-faint)',
                    }}
                  >
                    <span style={{ fontSize: 13, flexShrink: 0, paddingTop: 1 }}>
                      {SOURCE_ICONS[e.source_type] ?? '⚡'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 'var(--text-xs)', color: 'var(--text-hi)',
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      }}>
                        {e.content_summary ?? e.source_type}
                      </div>
                      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-lo)', marginTop: 2 }}>
                        {e.source_type} · {formatRelative(e.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Open action items */}
          <section>
            <SectionLabel>Open Action Items</SectionLabel>
            {health.loading ? (
              <SkeletonBlock height={60} />
            ) : health.openActions.length === 0 ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-lo)', fontStyle: 'italic' }}>
                No open action items.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {health.openActions.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      padding: '9px 14px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-faint)',
                      borderRadius: 'var(--r-md)',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-hi)' }}>{a.title}</div>
                      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-lo)', marginTop: 2 }}>
                        {a.assigned_to ?? 'unassigned'}
                        {a.due_at && (
                          <span style={{ marginLeft: 8 }}>
                            due {new Date(a.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <PriorityBadge priority={a.priority} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 'var(--text-2xs)', color: 'var(--text-lo)',
      textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600,
      marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      padding: '10px 14px',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-faint)',
      borderRadius: 'var(--r-md)',
    }}>
      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 600, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function SkeletonBlock({ height }: { height: number }) {
  return (
    <div style={{
      height, background: 'var(--bg-surface)', borderRadius: 'var(--r-md)',
      animation: 'pulse 1.5s ease-in-out infinite',
    }}>
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div style={{
      padding: '8px 12px', background: 'var(--err-soft)',
      border: '1px solid rgba(221,98,98,0.25)', borderRadius: 'var(--r-md)',
      fontSize: 'var(--text-xs)', color: 'var(--err)',
    }}>
      {message}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const s =
    priority === 'high'
      ? { bg: 'var(--err-soft)', fg: 'var(--err)', bd: 'rgba(221,98,98,0.25)' }
      : priority === 'med'
      ? { bg: 'var(--warn-soft)', fg: 'var(--warn)', bd: 'rgba(217,162,58,0.25)' }
      : { bg: 'var(--bg-raised)', fg: 'var(--text-md)', bd: 'var(--border-subtle)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: s.bg, color: s.fg, border: `1px solid ${s.bd}`,
      padding: '2px 7px', borderRadius: 'var(--r-pill)',
      fontSize: 'var(--text-2xs)', fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {priority}
    </span>
  );
}
