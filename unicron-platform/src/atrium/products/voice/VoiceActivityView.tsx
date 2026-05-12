// VoiceActivityView — Atrium Products → Voice Agents → Activity sub-sub-tab.
//
// Full grid + DetailPanel slide-over translated from prototype
// src/app/activity/page.tsx (ActivityPageV3, EventRow, EventIcon, DetailPanel,
// CallDetail, Meta, statusTone, fmtAgo).
//
// Cost is surfaced in two places per spec:
//   1. Events grid: dedicated cost column ($X.XXX from meta.cost_usd).
//   2. CallDetail Summary panel: Cost meta row ($X.XXX from transcript.cost_usd).
//
// Atrium deltas (vs prototype):
//   - voiceFetch attaches bearer JWT on every call.
//   - Endpoints repointed to /api/voice/* (activity, transcripts/[id]).
//   - Active-calls polling (/api/calls/active) is deferred to Phase 9.5 — the
//     foundation merge included api/voice/calls/active but the LiveStrip
//     component plus ArtifactPanel/QualityScorePanel/AutopilotActionsPanel/
//     SignalsPanel/Extraction depend on additional endpoints that haven't been
//     ported yet. The grid + DetailPanel + CallDetail Summary + Transcript +
//     Recording + Structured data are shipped today.

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { voiceFetch } from '../../lib/voiceFetch';
import {
  V3PanelCard,
  V3StatusPill,
  V3EmptyState,
  V3Btn,
} from './components/v3primitives';
import { I } from './components/icons';

type Event = {
  id: string;
  type: 'call' | 'project' | 'cron_attempt';
  ts: string;
  title: string;
  subtitle: string;
  status?: string | null;
  customer_org_id?: string;
  ref?: { kind: string; id: string };
  meta?: Record<string, unknown> | null;
};

type Transcript = {
  id: string;
  call_status: string;
  to_phone: string;
  from_phone: string;
  contact_name: string | null;
  duration_seconds: number | null;
  summary: string | null;
  outcome: string | null;
  ended_at: string | null;
  created_at: string;
  transcript: unknown;
  structured_data: Record<string, unknown> | null;
  recording_url: string | null;
  customer_org_id: string;
  cost_usd: number | string | null;
  cost_breakdown: Record<string, unknown> | null;
  vapi_org_id: string | null;
};

const TYPE_OPTIONS: { value: Event['type'] | 'all'; label: string; dot: string }[] = [
  { value: 'all', label: 'All events', dot: 'var(--v3-ink-lo)' },
  { value: 'call', label: 'Voice calls', dot: 'var(--v3-orange)' },
  { value: 'project', label: 'Leads landed', dot: 'var(--v3-green)' },
  { value: 'cron_attempt', label: 'Scheduled runs', dot: 'var(--v3-blue)' },
];

function statusTone(s: string): 'ok' | 'err' | 'info' | 'neutral' {
  const ok = ['completed', 'ended', 'answered', 'captured', 'active', 'ingested'];
  const err = ['failed', 'errored', 'no-answer', 'busy'];
  const info = ['queued', 'claimed', 'dialing', 'in-progress', 'ringing', 'forwarding'];
  if (ok.includes(s)) return 'ok';
  if (err.includes(s)) return 'err';
  if (info.includes(s)) return 'info';
  return 'neutral';
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function formatCost(c: number | string | null | undefined): string {
  if (c == null) return '';
  const n = Number(c);
  if (!Number.isFinite(n)) return '';
  return `$${n.toFixed(3)}`;
}

export function VoiceActivityView() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Event['type'] | 'all'>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('');
  const [selected, setSelected] = useState<Event | null>(null);
  const [detail, setDetail] = useState<Transcript | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const params = new URLSearchParams();
        params.set('limit', '100');
        params.set('exclude_mock', '1');
        if (filter !== 'all') params.set('types', filter);
        if (customerFilter) params.set('customer_org_id', customerFilter);
        const r = await voiceFetch(`/api/voice/activity?${params.toString()}`);
        if (!r.ok) throw new Error(`${r.status}: ${await r.text().catch(() => '')}`);
        const j = (await r.json()) as { events?: Event[]; error?: string };
        if (cancelled) return;
        if (j.error) setError(j.error);
        else setEvents(j.events ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void tick();
    const iv = setInterval(() => { void tick(); }, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [filter, customerFilter]);

  useEffect(() => {
    setDetail(null);
    if (!selected || selected.type !== 'call' || !selected.ref) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await voiceFetch(`/api/voice/transcripts/${selected.ref!.id}`);
        if (!r.ok) return;
        const j = (await r.json()) as { transcript?: Transcript };
        if (!cancelled) setDetail(j.transcript ?? null);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [selected]);

  const customers = useMemo(() => {
    const set = new Set<string>();
    for (const e of events ?? []) if (e.customer_org_id) set.add(e.customer_org_id);
    return Array.from(set).sort();
  }, [events]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: (events ?? []).length };
    for (const e of events ?? []) c[e.type] = (c[e.type] ?? 0) + 1;
    return c;
  }, [events]);

  return (
    <div style={{ minWidth: 0, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--v3-ink-lo)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.4, marginBottom: 4 }}>
            Activity
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--v3-ink-md)' }}>
            Live calls, leads landed, and scheduled runs across every campaign.
          </div>
        </div>
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          style={{
            height: 32,
            padding: '0 10px',
            borderRadius: 8,
            border: '1px solid var(--v3-line-strong)',
            background: 'var(--v3-surface)',
            color: 'var(--v3-ink)',
            fontSize: 13,
            minWidth: 160,
            cursor: 'pointer',
          }}
        >
          <option value="">All customers</option>
          {customers.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
        {/* Filter sidebar */}
        <aside>
          <V3PanelCard padding={16}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: 'var(--v3-ink-lo)',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                marginBottom: 10,
              }}
            >
              Filter
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {TYPE_OPTIONS.map((opt) => {
                const on = filter === opt.value;
                const count = counts[opt.value] ?? 0;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFilter(opt.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: 'none',
                      background: on ? 'rgba(96,129,190,0.10)' : 'transparent',
                      color: on ? 'var(--v3-blue)' : 'var(--v3-ink)',
                      fontSize: 13,
                      fontWeight: on ? 600 : 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: opt.dot,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1 }}>{opt.label}</span>
                    <span
                      className="v3-mono"
                      style={{
                        fontSize: 11,
                        color: on ? 'var(--v3-blue)' : 'var(--v3-ink-lo)',
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </V3PanelCard>
        </aside>

        {/* Feed */}
        <div style={{ minWidth: 0 }}>
          {error && (
            <V3PanelCard padding={0}>
              <V3EmptyState title="Failed to load activity" description={error} />
            </V3PanelCard>
          )}
          {!error && events === null && (
            <V3PanelCard padding={16}>
              <div style={{ color: 'var(--v3-ink-lo)', fontSize: 13 }}>Loading activity…</div>
            </V3PanelCard>
          )}
          {!error && events && events.length === 0 && (
            <V3PanelCard padding={0}>
              <V3EmptyState
                title="No activity yet"
                description="Once calls dial and leads land, you'll see them flow here in real time."
              />
            </V3PanelCard>
          )}
          {!error && events && events.length > 0 && (
            <V3PanelCard padding={0}>
              <div style={{ display: 'grid' }}>
                {events.map((e, i) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    last={i === events.length - 1}
                    selected={selected?.id === e.id}
                    onClick={() => setSelected(e)}
                  />
                ))}
              </div>
            </V3PanelCard>
          )}
        </div>
      </div>

      {selected && (
        <DetailPanel
          event={selected}
          detail={detail}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function EventRow({
  event,
  last,
  selected,
  onClick,
}: {
  event: Event;
  last: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const costStr = formatCost((event.meta?.cost_usd as number | string | null | undefined) ?? null);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1.4fr 2.2fr 110px 70px 84px',
        gap: 14,
        alignItems: 'center',
        padding: '12px 18px',
        textAlign: 'left',
        border: 'none',
        borderBottom: last ? 'none' : '1px solid var(--v3-line-soft)',
        background: selected ? 'rgba(96,129,190,0.08)' : 'var(--v3-surface)',
        color: 'var(--v3-ink)',
        cursor: 'pointer',
        width: '100%',
      }}
    >
      <EventIcon type={event.type} />
      <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            color: 'var(--v3-ink)',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {event.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--v3-ink-lo)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {event.customer_org_id ?? '—'}
        </div>
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: 'var(--v3-ink-md)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {event.subtitle}
      </div>
      <div>
        {event.status && (
          <V3StatusPill tone={statusTone(event.status)}>{event.status}</V3StatusPill>
        )}
      </div>
      <div
        className="v3-mono"
        style={{ fontSize: 11, color: 'var(--v3-ink-lo)', textAlign: 'right' }}
      >
        {costStr}
      </div>
      <div
        className="v3-mono"
        style={{ fontSize: 11, color: 'var(--v3-ink-lo)', textAlign: 'right' }}
      >
        {fmtAgo(event.ts)}
      </div>
    </button>
  );
}

function EventIcon({ type }: { type: Event['type'] }) {
  const icons: Record<Event['type'], ReactNode> = {
    call: <I.PhoneCall size={14} />,
    project: <I.Sparkle size={14} />,
    cron_attempt: <I.Clock size={14} />,
  };
  const tones: Record<Event['type'], { bg: string; fg: string }> = {
    call: { bg: 'rgba(232,118,58,0.12)', fg: 'var(--v3-orange)' },
    project: { bg: 'rgba(46,142,102,0.12)', fg: 'var(--v3-green)' },
    cron_attempt: { bg: 'rgba(96,129,190,0.12)', fg: 'var(--v3-blue)' },
  };
  const t = tones[type];
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        background: t.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: t.fg,
      }}
    >
      {icons[type]}
    </div>
  );
}

function DetailPanel({
  event,
  detail,
  onClose,
}: {
  event: Event;
  detail: Transcript | null;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,21,48,0.32)',
        zIndex: 60,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 80%)',
          height: '100%',
          background: 'var(--v3-surface)',
          boxShadow: '-30px 0 80px rgba(11,21,48,0.18)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid var(--v3-line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            position: 'sticky',
            top: 0,
            background: 'var(--v3-surface)',
            zIndex: 1,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--v3-ink-lo)',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              {event.type === 'call' ? 'Voice call' : event.type === 'project' ? 'Lead landed' : 'Scheduled run'}
            </div>
            <div
              className="v3-display"
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--v3-ink)',
                letterSpacing: -0.3,
              }}
            >
              {event.title}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--v3-ink-lo)',
                marginTop: 4,
              }}
            >
              {event.customer_org_id ?? '—'} · {fmtAgo(event.ts)}
            </div>
          </div>
          <V3Btn kind="ghost" onClick={onClose} icon={<I.X size={12} />}>
            Close
          </V3Btn>
        </div>

        <div
          style={{
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {event.type === 'call' ? (
            <CallDetail detail={detail} />
          ) : (
            <V3PanelCard>
              <div style={{ fontSize: 13.5, color: 'var(--v3-ink)', lineHeight: 1.5 }}>
                {event.subtitle}
              </div>
              {event.meta && (
                <pre
                  className="v3-mono"
                  style={{
                    fontSize: 11.5,
                    color: 'var(--v3-ink-md)',
                    background: 'var(--v3-bg-soft)',
                    padding: 14,
                    borderRadius: 8,
                    marginTop: 14,
                    overflowX: 'auto',
                  }}
                >
                  {JSON.stringify(event.meta, null, 2)}
                </pre>
              )}
            </V3PanelCard>
          )}
        </div>
      </div>
    </div>
  );
}

function CallDetail({ detail }: { detail: Transcript | null }) {
  if (!detail) {
    return (
      <div style={{ color: 'var(--v3-ink-lo)', fontSize: 13, padding: 12 }}>
        Loading transcript…
      </div>
    );
  }

  const turns: Array<{ role?: string; text?: string; message?: string }> = Array.isArray(detail.transcript)
    ? (detail.transcript as Array<{ role?: string; text?: string; message?: string }>)
    : Array.isArray(((detail.transcript as { turns?: unknown[] } | null)?.turns))
      ? ((detail.transcript as { turns: Array<{ role?: string; text?: string; message?: string }> }).turns)
      : [];

  return (
    <>
      <V3PanelCard title="Summary">
        {detail.summary ? (
          <div style={{ fontSize: 13.5, color: 'var(--v3-ink)', lineHeight: 1.5 }}>
            {detail.summary}
          </div>
        ) : (
          <div style={{ color: 'var(--v3-ink-lo)', fontSize: 13 }}>No summary yet.</div>
        )}
        <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
          <Meta label="Status" value={detail.call_status} />
          <Meta label="Outcome" value={detail.outcome ?? '—'} />
          <Meta
            label="Duration"
            value={detail.duration_seconds ? `${detail.duration_seconds}s` : '—'}
          />
          <Meta label="To" value={detail.to_phone} />
          <Meta
            label="Cost"
            value={formatCost(detail.cost_usd) || '—'}
          />
          {detail.vapi_org_id && (
            <Meta label="Vapi org" value={detail.vapi_org_id.slice(0, 10) + '…'} />
          )}
        </div>
      </V3PanelCard>

      {detail.recording_url && (
        <V3PanelCard title="Recording">
          <audio
            controls
            src={detail.recording_url}
            style={{ width: '100%', height: 56, borderRadius: 8 }}
          />
          <div style={{ fontSize: 11, color: 'var(--v3-ink-lo)', marginTop: 6 }}>
            <a
              href={detail.recording_url}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--v3-blue)' }}
            >
              Open in new tab
            </a>
          </div>
        </V3PanelCard>
      )}

      <V3PanelCard title="Transcript">
        {turns.length === 0 ? (
          <div style={{ color: 'var(--v3-ink-lo)', fontSize: 13 }}>
            No transcript turns recorded.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
            {turns.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13 }}>
                <span
                  style={{
                    fontWeight: 600,
                    color: t.role === 'assistant' ? 'var(--v3-orange)' : 'var(--v3-blue)',
                    minWidth: 80,
                  }}
                >
                  {t.role ?? 'unknown'}:
                </span>
                <span style={{ color: 'var(--v3-ink)', flex: 1 }}>
                  {t.text ?? t.message ?? ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </V3PanelCard>

      {detail.cost_breakdown && (
        <V3PanelCard title="Cost breakdown">
          <pre
            className="v3-mono"
            style={{
              fontSize: 11.5,
              color: 'var(--v3-ink-md)',
              background: 'var(--v3-bg-soft)',
              padding: 14,
              borderRadius: 8,
              overflowX: 'auto',
              margin: 0,
            }}
          >
            {JSON.stringify(detail.cost_breakdown, null, 2)}
          </pre>
        </V3PanelCard>
      )}

      {detail.structured_data && (
        <V3PanelCard title="Structured data">
          <pre
            className="v3-mono"
            style={{
              fontSize: 11.5,
              color: 'var(--v3-ink-md)',
              background: 'var(--v3-bg-soft)',
              padding: 14,
              borderRadius: 8,
              overflowX: 'auto',
              margin: 0,
            }}
          >
            {JSON.stringify(detail.structured_data, null, 2)}
          </pre>
        </V3PanelCard>
      )}
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--v3-ink-lo)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--v3-ink)', fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}
