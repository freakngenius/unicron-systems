// VoiceTab.tsx — System > Voice sub-tab
// Structural port of V3VoiceSystemTab from v3-voice.jsx.
// Atrium audit fix #18 — wired to live /api/voice/* endpoints (shared with Products > Voice surfaces).

import React, { useEffect, useMemo, useState } from 'react';
import { X, Check, Plus, ChevronDown, Phone } from 'lucide-react';
import { voiceFetch } from '../lib/voiceFetch';

// ── Token shortcuts ───────────────────────────────────────────────────────────
const GREEN  = '#2E8E66';
const AMBER  = '#C28A1F';
const RED    = '#E14B4B';
const BLUE   = '#2E6CD4';
const ORANGE = '#E8763A';

// ── Types ─────────────────────────────────────────────────────────────────────

interface VoiceOffice {
  id: string;
  name: string;
  phone: string;
  city: string;
  customer: string;
  cron: string;
  cron_summary: string;
  window: number;
  last_pull: string;
  projects_sourced: number;
  attempts: number;
  why: string;
  disclosure: string;
}

interface VoiceConfig {
  id: string;
  customer: string;
  caller_brand: string;
  offices: string[];
  cron_summary: string;
  last_success: string;
  monthly_burn: number;
  active: boolean;
}

interface VoiceLiveCall {
  id: string;
  caller_brand: string;
  office: string;
  agent: string;
  status: 'in-conversation' | 'ringing' | 'queued' | 'ended';
  duration: number;
}

interface VapiAssistant {
  id: string;
  name: string;
  model: string;
  voice: string;
  variables: string[];
  persistent_id: string;
}

interface VoiceSource {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'archived';
  configs: number;
}

interface VoiceAttempt {
  id: string;
  ts: string;
  office: string;
  config: string;
  status: 'completed' | 'failed' | 'dispatched' | 'pending';
  duration: string;
  cost: number;
  structured: boolean;
  bounce: string | null;
  error?: string;
}

// ── Live API response shapes ─────────────────────────────────────────────────
//
// These mirror the shapes returned by /api/voice/procurement-configs,
// /api/voice/sources, and /api/voice/activity (see VoiceAgentsView,
// VoiceCampaignsView, VoiceActivityView in src/atrium/products/voice/).

type ApiTargetOffice = {
  key?: string;
  office_name?: string;
  phone?: string;
  city?: string;
  enabled?: boolean;
  cron_expression?: string;
  cron_summary?: string;
  pull_window_days?: number;
  last_pull_at?: string | null;
  projects_sourced?: number;
  attempts?: number;
  why_priority?: string;
  disclosure_text?: string;
};

type ApiProcurementConfig = {
  id: string;
  customer_org_id: string;
  config_name: string;
  is_active: boolean;
  pull_objective?: string;
  agent_name?: string;
  caller_brand?: string;
  vapi_assistant_id: string | null;
  voice_agent_source_id: string | null;
  target_offices: ApiTargetOffice[] | null;
  cron_summary?: string;
  last_success_at?: string | null;
  monthly_burn_usd?: number | null;
  created_at: string;
};

type ApiVoiceSource = {
  id: string;
  source_name: string;
  customer_org_id: string;
  agent_type: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  vapi_assistant_id: string | null;
  has_draft: boolean;
  use_case_label: string | null;
  vertical: string | null;
  updated_at: string;
  vapi_model?: string | null;
  vapi_voice_id?: string | null;
  variable_schema?: { variables?: Array<{ name?: string } | string> } | null;
  configs_count?: number | null;
};

type ApiActivityEvent = {
  id: string;
  type: 'call' | 'project' | 'cron_attempt';
  ts: string;
  title: string;
  subtitle: string;
  status?: string | null;
  customer_org_id?: string;
  ref?: { kind: string; id: string };
  meta?: { duration_seconds?: number; cost_usd?: number | null; vapi_call_id?: string } & Record<string, unknown>;
};

// ── Adapters (API → UI shapes) ───────────────────────────────────────────────

function officeKey(cfgId: string, t: ApiTargetOffice, idx: number): string {
  return `${cfgId}::${t.key ?? `idx${idx}`}`;
}

function deriveOffices(configs: ApiProcurementConfig[]): VoiceOffice[] {
  const out: VoiceOffice[] = [];
  for (const cfg of configs) {
    const targets = Array.isArray(cfg.target_offices) ? cfg.target_offices : [];
    targets.forEach((t, i) => {
      out.push({
        id: officeKey(cfg.id, t, i),
        name: t.office_name ?? t.key ?? 'Unnamed office',
        phone: t.phone ?? '—',
        city: t.city ?? '—',
        customer: cfg.customer_org_id,
        cron: t.cron_expression ?? '',
        cron_summary: t.cron_summary ?? cfg.cron_summary ?? '—',
        window: typeof t.pull_window_days === 'number' ? t.pull_window_days : 30,
        last_pull: t.last_pull_at ?? '—',
        projects_sourced: t.projects_sourced ?? 0,
        attempts: t.attempts ?? 0,
        why: t.why_priority ?? '',
        disclosure: t.disclosure_text ?? '',
      });
    });
  }
  return out;
}

function deriveConfigs(configs: ApiProcurementConfig[]): VoiceConfig[] {
  return configs.map(cfg => ({
    id: cfg.id,
    customer: cfg.customer_org_id,
    caller_brand: cfg.caller_brand ?? cfg.agent_name ?? '—',
    offices: Array.isArray(cfg.target_offices)
      ? cfg.target_offices.map((t, i) => officeKey(cfg.id, t, i))
      : [],
    cron_summary: cfg.cron_summary ?? '—',
    last_success: cfg.last_success_at ?? '—',
    monthly_burn: cfg.monthly_burn_usd ?? 0,
    active: !!cfg.is_active,
  }));
}

function deriveAssistants(sources: ApiVoiceSource[]): VapiAssistant[] {
  return sources
    .filter(s => !!s.vapi_assistant_id)
    .map(s => {
      const rawVars = s.variable_schema?.variables ?? [];
      const variables = rawVars.map(v =>
        typeof v === 'string' ? v : (v?.name ?? '')
      ).filter(Boolean);
      return {
        id: s.vapi_assistant_id as string,
        name: s.source_name,
        model: s.vapi_model ?? '—',
        voice: s.vapi_voice_id ?? '—',
        variables,
        persistent_id: s.vapi_assistant_id as string,
      };
    });
}

function deriveSources(sources: ApiVoiceSource[]): VoiceSource[] {
  return sources.map(s => ({
    id: s.id,
    name: s.source_name,
    type: s.agent_type,
    status: s.status === 'archived' ? 'archived' : 'active',
    configs: s.configs_count ?? 0,
  }));
}

function activeCallStatus(s: string | null | undefined): VoiceLiveCall['status'] | null {
  if (!s) return null;
  const v = s.toLowerCase();
  if (v === 'in-progress' || v === 'in_progress' || v === 'in-conversation') return 'in-conversation';
  if (v === 'ringing' || v === 'dialing') return 'ringing';
  if (v === 'queued' || v === 'scheduled') return 'queued';
  return null; // ended / completed / failed → not "in flight"
}

function deriveLiveCalls(events: ApiActivityEvent[]): VoiceLiveCall[] {
  const out: VoiceLiveCall[] = [];
  for (const e of events) {
    if (e.type !== 'call') continue;
    const status = activeCallStatus(e.status);
    if (!status) continue;
    out.push({
      id: e.id,
      caller_brand: e.customer_org_id ?? '—',
      office: e.subtitle?.split(' — ')[0] ?? e.title,
      agent: e.title,
      status,
      duration: typeof e.meta?.duration_seconds === 'number' ? e.meta!.duration_seconds : 0,
    });
  }
  return out;
}

function attemptStatus(s: string | null | undefined): VoiceAttempt['status'] {
  const v = (s ?? '').toLowerCase();
  if (v === 'completed' || v === 'succeeded' || v === 'success') return 'completed';
  if (v === 'failed' || v === 'error') return 'failed';
  if (v === 'dispatched' || v === 'claimed' || v === 'in_progress' || v === 'in-progress') return 'dispatched';
  return 'pending';
}

function formatTs(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return t.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function formatDurationSec(sec: number | undefined): string {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function deriveAttempts(events: ApiActivityEvent[]): VoiceAttempt[] {
  return events
    .filter(e => e.type === 'cron_attempt' || e.type === 'call')
    .map(e => {
      const isCall = e.type === 'call';
      const durSec = typeof e.meta?.duration_seconds === 'number' ? e.meta!.duration_seconds : undefined;
      return {
        id: e.id,
        ts: formatTs(e.ts),
        office: e.subtitle?.split(' — ')[0] ?? '—',
        config: e.ref?.id ? e.ref.id.slice(0, 8) : '—',
        status: attemptStatus(e.status),
        duration: isCall ? formatDurationSec(durSec) : '—',
        cost: typeof e.meta?.cost_usd === 'number' ? (e.meta!.cost_usd as number) : 0,
        structured: isCall && (e.status ?? '').toLowerCase() === 'completed',
        bounce: null,
        error: (e.status ?? '').toLowerCase() === 'failed' ? (e.status ?? undefined) : undefined,
      } as VoiceAttempt;
    });
}

// ── Primitives ────────────────────────────────────────────────────────────────

function StatusPill({ tone, children }: { tone: 'ok' | 'warn' | 'err' | 'info' | 'neutral'; children: React.ReactNode }) {
  const colors: Record<string, [string, string]> = {
    ok:      [GREEN,  'rgba(79,178,134,0.12)'],
    warn:    [AMBER,  'rgba(217,162,58,0.12)'],
    err:     [RED,    'rgba(221,98,98,0.12)'],
    info:    [BLUE,   'rgba(46,108,212,0.12)'],
    neutral: ['var(--text-lo)', 'var(--bg-raised)'],
  };
  const [color, bg] = colors[tone] ?? colors.neutral;
  return (
    <span className="mono" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
      color, background: bg, textTransform: 'capitalize',
    }}>
      {children}
    </span>
  );
}

function GatedAction({
  children,
  onCommit,
  taboo,
  label = 'Validating',
  delay = 800,
}: {
  children: React.ReactElement;
  onCommit?: () => void;
  taboo?: string | boolean;
  label?: string;
  delay?: number;
}) {
  const [state, setState] = useState<'idle' | 'validating' | 'bounced' | 'done'>('idle');

  const fire = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (state === 'validating') return;
    setState('validating');
    setTimeout(() => {
      if (taboo) {
        setState('bounced');
        setTimeout(() => setState('idle'), 2400);
        return;
      }
      setState('done');
      onCommit?.();
      setTimeout(() => setState('idle'), 900);
    }, delay);
  };

  const trigger = React.cloneElement(children, { onClick: fire });

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      {trigger}
      {state === 'validating' && (
        <span className="mono" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, color: AMBER, background: 'rgba(217,162,58,0.10)',
          padding: '2px 7px', borderRadius: 4,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: AMBER }}/>
          {label}…
        </span>
      )}
      {state === 'done' && (
        <span className="mono" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, color: GREEN, background: 'rgba(79,178,134,0.10)',
          padding: '2px 7px', borderRadius: 4,
        }}>
          <Check size={9}/> Committed
        </span>
      )}
      {state === 'bounced' && (
        <span className="mono" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, color: RED, background: 'rgba(221,98,98,0.10)',
          padding: '2px 7px', borderRadius: 4,
        }}>
          <X size={9}/> Bounced — {typeof taboo === 'string' ? taboo : 'taboo violation'}
        </span>
      )}
    </span>
  );
}

function CollapseSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 text-left flex items-center gap-2.5 cursor-pointer"
      >
        <ChevronDown
          size={13}
          className="text-text-lo flex-shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
        <span className="mono text-[15px] font-semibold text-text-primary">{title}</span>
        {count != null && (
          <span className="mono text-[12px] text-text-lo">· {count}</span>
        )}
      </button>
      {open && (
        <div className="border-t border-border-subtle">{children}</div>
      )}
    </div>
  );
}

// ── Loading / error helpers ───────────────────────────────────────────────────

function SectionLoading({ label }: { label: string }) {
  return (
    <div className="mono text-[12.5px] text-text-lo px-5 py-4 italic">
      Loading {label}…
    </div>
  );
}

function SectionError({ label, error }: { label: string; error: string }) {
  return (
    <div className="mono text-[12.5px] px-5 py-4" style={{ color: RED }}>
      Failed to load {label}: {error}
    </div>
  );
}

// ── VoiceLive strip ───────────────────────────────────────────────────────────

function VoiceLive({
  calls,
  loading,
  error,
}: {
  calls: VoiceLiveCall[];
  loading: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const statusTone = (s: VoiceLiveCall['status']): 'ok' | 'info' | 'neutral' | 'warn' =>
    s === 'in-conversation' ? 'ok' : s === 'ringing' ? 'info' : 'neutral';

  return (
    <div className="bg-bg-card border border-border-default rounded-xl p-4 sticky top-0 z-10">
      <div className="flex items-baseline gap-2.5 mb-3">
        <h3 className="mono text-[14px] font-semibold text-text-primary flex items-center gap-2">
          <span style={{ width: 8, height: 8, borderRadius: 999, background: GREEN, display: 'inline-block' }}/>
          Live calls
        </h3>
        <span className="mono text-[12px] text-text-lo">
          {loading ? 'loading…' : `${calls.length} in flight`}
        </span>
      </div>
      {error ? (
        <div className="mono text-[12.5px] py-2" style={{ color: RED }}>
          Failed to load live calls: {error}
        </div>
      ) : loading ? (
        <div className="mono text-[12.5px] text-text-lo py-2 italic">Loading live calls…</div>
      ) : calls.length === 0 ? (
        <div className="mono text-[12.5px] text-text-lo py-2 italic">No calls in flight.</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto">
          {calls.map(c => (
            <button
              key={c.id}
              onClick={() => setOpen(c.id)}
              className="flex-none text-left w-[280px] p-3 rounded-lg border border-border-subtle flex flex-col gap-2 cursor-pointer"
              style={{ background: 'var(--bg-surface)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="mono text-[12px] font-semibold text-text-primary flex items-center gap-1.5">
                  <Phone size={11} color={ORANGE}/>
                  {c.caller_brand}
                </span>
                <StatusPill tone={statusTone(c.status)}>{c.status}</StatusPill>
              </div>
              <div className="mono text-[12px] text-text-secondary leading-snug">→ {c.office}</div>
              <div className="flex items-center justify-between mono text-[11px]">
                <span className="text-text-lo">{c.agent}</span>
                <span className="text-text-secondary">
                  {Math.floor(c.duration / 60)}:{String(c.duration % 60).padStart(2, '0')}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && (
        <div
          onClick={() => setOpen(null)}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(11,21,48,0.32)' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-[520px] bg-bg-card rounded-xl p-6 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="mono text-[18px] font-semibold text-text-primary flex items-center gap-2">
                <Phone size={16} color={ORANGE}/> Mid-call observer
              </h3>
              <button onClick={() => setOpen(null)} className="p-1.5 text-text-lo">
                <X size={14}/>
              </button>
            </div>
            <div
              className="mono text-[12.5px] text-text-secondary leading-relaxed italic rounded-lg p-3.5"
              style={{ background: 'var(--bg-surface)' }}
            >
              Streaming transcript view wires up post-Sprint 7.<br/>
              Will show live caption from Deepgram + agent response in alternating bubbles.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Office editor (inline expandable) ────────────────────────────────────────

function OfficeEditor({ office }: { office: VoiceOffice }) {
  const [phone,      setPhone]      = useState(office.phone);
  const [cron,       setCron]       = useState(office.cron);
  const [windowDays, setWindowDays] = useState(String(office.window));
  const [why,        setWhy]        = useState(office.why);
  const [disclosure, setDisclosure] = useState(office.disclosure);

  const inputClass = 'mono text-[12px] w-full px-2.5 py-1.5 rounded-md border border-border-default bg-bg-surface text-text-primary outline-none';

  return (
    <div className="bg-bg-card rounded-lg p-3.5 border border-border-subtle">
      <div className="flex items-center gap-2.5 mb-3">
        <Phone size={12} color={ORANGE}/>
        <span className="mono text-[13px] font-semibold text-text-primary">{office.name}</span>
        <span className="mono text-[11px] text-text-lo">· {office.city}</span>
        <div className="flex-1"/>
        <span className="mono text-[11px] text-text-lo">Last pull: {office.last_pull}</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5 mb-2.5">
        {[
          { label: 'Phone',              value: phone,      set: setPhone,      type: 'text'   },
          { label: 'Cron expression',    value: cron,       set: setCron,       type: 'text'   },
          { label: 'Pull window (days)', value: windowDays, set: setWindowDays, type: 'number' },
        ].map(({ label, value, set, type }) => (
          <label key={label} className="flex flex-col gap-1">
            <span className="mono text-[10.5px] text-text-lo uppercase tracking-[0.04em] font-semibold">{label}</span>
            <input
              value={value}
              onChange={e => set(e.target.value)}
              type={type}
              className={inputClass}
            />
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        {[
          { label: 'Why priority',   value: why,        set: setWhy        },
          { label: 'Disclosure text', value: disclosure, set: setDisclosure },
        ].map(({ label, value, set }) => (
          <label key={label} className="flex flex-col gap-1">
            <span className="mono text-[10.5px] text-text-lo uppercase tracking-[0.04em] font-semibold">{label}</span>
            <input value={value} onChange={e => set(e.target.value)} className={inputClass}/>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        <button className="mono text-[12px] text-text-lo px-2.5 py-1.5">Cancel</button>
        {/* TODO(audit#18): wire to PATCH /api/voice/procurement-configs (office row) — currently fake-validates client-side only. */}
        <GatedAction onCommit={() => undefined} label="Validating cron">
          <button className="mono text-[12px] font-medium px-3 py-1.5 rounded-md text-white flex items-center gap-1.5" style={{ background: 'var(--text-primary)' }}>
            Save changes
          </button>
        </GatedAction>
      </div>
    </div>
  );
}

// ── Configs table ─────────────────────────────────────────────────────────────

function VoiceConfigs({
  configs,
  offices,
  customer,
  loading,
  error,
}: {
  configs: VoiceConfig[];
  offices: VoiceOffice[];
  customer: string;
  loading: boolean;
  error: string | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const filtered = customer === 'all' ? configs : configs.filter(c => c.customer === customer);

  return (
    <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border-subtle flex items-baseline gap-2.5">
        <h3 className="mono text-[15px] font-semibold text-text-primary">Procurement pull configs</h3>
        <span className="mono text-[12px] text-text-lo">
          {loading ? 'loading…' : `${filtered.length} configs · procurement_pull_configs table`}
        </span>
      </div>
      {error ? (
        <SectionError label="configs" error={error}/>
      ) : loading ? (
        <SectionLoading label="configs"/>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 700 }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)' }}>
                {['Customer','Caller brand','Offices','Cron','Last success','Monthly','Active',''].map((h, i) => (
                  <th
                    key={i}
                    className="mono text-[11px] font-semibold text-text-lo uppercase tracking-[0.05em] border-b border-border-subtle"
                    style={{ padding: '10px 18px', textAlign: i === 5 || i === 6 ? 'right' : 'left' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(cfg => {
                const cfgOffices = offices.filter(o => cfg.offices.includes(o.id));
                const isOpen = expanded === cfg.id;
                return (
                  <React.Fragment key={cfg.id}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : cfg.id)}
                      className="cursor-pointer border-b border-border-subtle"
                    >
                      <td style={{ padding: '12px 18px' }}>
                        <span className="mono text-[13px] text-text-primary font-medium capitalize">{cfg.customer}</span>
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <span className="mono text-[13px] text-text-secondary">{cfg.caller_brand}</span>
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <span className="mono text-[13px] text-text-secondary">{cfg.offices.length}</span>
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <span className="mono text-[12px] text-text-secondary">{cfg.cron_summary}</span>
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <span className="mono text-[12.5px] text-text-secondary">{cfg.last_success}</span>
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                        <span className="mono text-[13px] font-medium text-text-primary">${cfg.monthly_burn.toFixed(2)}</span>
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        {/* TODO(audit#18): wire to PATCH /api/voice/procurement-configs { id, is_active } — currently fake-validates client-side only. */}
                        <GatedAction onCommit={() => undefined} label="Updating">
                          <button style={{
                            position: 'relative', width: 36, height: 20, borderRadius: 999,
                            background: cfg.active ? GREEN : 'var(--border-default)',
                            cursor: 'pointer', padding: 0, border: 'none',
                          }}>
                            <span style={{
                              position: 'absolute', top: 2, left: cfg.active ? 18 : 2,
                              width: 16, height: 16, borderRadius: '50%', background: '#FFF',
                              transition: 'left 200ms',
                            }}/>
                          </button>
                        </GatedAction>
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                        <ChevronDown
                          size={12}
                          className="text-text-lo transition-transform"
                          style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                        />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} style={{ padding: '0 18px 18px', background: 'var(--bg-surface)' }}>
                          <div className="flex flex-col gap-2.5 pt-3">
                            <div className="mono text-[11px] text-text-lo uppercase font-semibold tracking-[0.05em]">
                              Offices in this config ({cfgOffices.length})
                            </div>
                            {cfgOffices.map(o => <OfficeEditor key={o.id} office={o}/>)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── JSON editor slide-out ─────────────────────────────────────────────────────

function JSONEditor({ assistant, onClose }: { assistant: VapiAssistant; onClose: () => void }) {
  const sampleJSON = JSON.stringify({
    name: assistant.name,
    model: { provider: 'anthropic', model: 'claude-sonnet-4-5', temperature: 0.4 },
    voice: { provider: '11labs', voiceId: assistant.voice, stability: 0.6, similarityBoost: 0.75 },
    transcriber: { provider: 'deepgram', model: 'nova-3', language: 'en' },
    firstMessage: 'Hi, this is {{caller_first_name}} from {{customer_brand}} — calling about your published procurement bids.',
    serverUrl: 'https://atrium.unicron.systems/voice/webhook',
    variableValues: { target_office: '{{target_office}}', disclosure_text: '{{disclosure_text}}' },
    apiKey: '***NEVER_EXPOSED_TO_CLIENT***',
  }, null, 2);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      style={{ background: 'rgba(11,21,48,0.35)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-[580px] bg-bg-card flex flex-col overflow-auto"
      >
        <div className="px-5 py-5 border-b border-border-subtle flex items-center justify-between">
          <div>
            <div className="mono text-[11px] text-text-lo uppercase font-semibold tracking-[0.05em]">Vapi assistant</div>
            <h3 className="mono text-[18px] font-semibold text-text-primary mt-1">{assistant.name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-lo"><X size={14}/></button>
        </div>
        <div className="p-5 flex flex-col gap-4 flex-1">
          <pre
            className="mono text-[12px] leading-relaxed rounded-lg p-4 overflow-auto"
            style={{ background: '#0F1A33', color: '#E2E8F4', whiteSpace: 'pre-wrap' }}
          >
            {sampleJSON}
          </pre>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="mono text-[12px] text-text-secondary px-3.5 py-2">Cancel</button>
            {/* TODO(audit#18): wire to PATCH /api/voice/sources/:id (assistant JSON) — currently fake-validates client-side only. */}
            <GatedAction onCommit={onClose} label="Validating">
              <button className="mono text-[12px] font-medium px-3.5 py-2 rounded-md text-white" style={{ background: 'var(--text-primary)' }}>
                Save
              </button>
            </GatedAction>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Assistants panel ──────────────────────────────────────────────────────────

function VoiceAssistants({
  assistants,
  loading,
  error,
}: {
  assistants: VapiAssistant[];
  loading: boolean;
  error: string | null;
}) {
  const [editing, setEditing] = useState<VapiAssistant | null>(null);
  return (
    <CollapseSection title="Vapi assistants" count={loading ? undefined : assistants.length} defaultOpen>
      {error ? (
        <SectionError label="assistants" error={error}/>
      ) : loading ? (
        <SectionLoading label="assistants"/>
      ) : assistants.length === 0 ? (
        <div className="mono text-[12.5px] text-text-lo px-5 py-4 italic">No Vapi assistants linked.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 640 }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)' }}>
                {['Assistant','Model','Voice','Variables','Persistent ID',''].map((h, i) => (
                  <th
                    key={i}
                    className="mono text-[11px] font-semibold text-text-lo uppercase tracking-[0.05em] border-b border-border-subtle"
                    style={{ padding: '10px 18px', textAlign: 'left' }}
                  >{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assistants.map(a => (
                <tr key={a.id} className="border-b border-border-subtle">
                  <td style={{ padding: '12px 18px' }}>
                    <span className="mono text-[13px] font-medium text-text-primary">{a.name}</span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className="mono text-[12px] text-text-secondary">{a.model}</span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className="mono text-[12px] text-text-secondary">{a.voice}</span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <div className="flex flex-wrap gap-1">
                      {a.variables.map((v, i) => (
                        <span key={i} className="mono text-[10.5px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>
                          {v}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className="mono text-[11px] text-text-lo">{a.persistent_id}</span>
                  </td>
                  <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                    <button
                      onClick={() => setEditing(a)}
                      className="mono text-[12px] px-2.5 py-1 rounded border border-border-default text-text-secondary"
                      style={{ background: 'var(--bg-surface)' }}
                    >
                      Edit JSON
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <JSONEditor assistant={editing} onClose={() => setEditing(null)}/>}
    </CollapseSection>
  );
}

// ── Sources panel ─────────────────────────────────────────────────────────────

function VoiceSources({
  sources,
  loading,
  error,
}: {
  sources: VoiceSource[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <CollapseSection title="Sources" count={loading ? undefined : sources.length}>
      {error ? (
        <SectionError label="sources" error={error}/>
      ) : loading ? (
        <SectionLoading label="sources"/>
      ) : sources.length === 0 ? (
        <div className="mono text-[12.5px] text-text-lo px-5 py-4 italic">No sources configured.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ background: 'var(--bg-surface)' }}>
                {['Name','Type','Status','Configs'].map((h, i) => (
                  <th key={i} className="mono text-[11px] font-semibold text-text-lo uppercase tracking-[0.05em] border-b border-border-subtle" style={{ padding: '10px 18px', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map(s => (
                <tr key={s.id} className="border-b border-border-subtle">
                  <td style={{ padding: '12px 18px' }}>
                    <span className="mono text-[13px] text-text-primary">{s.name}</span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className="mono text-[10.5px] font-semibold uppercase tracking-[0.04em] px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>
                      {s.type}
                    </span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <StatusPill tone={s.status === 'active' ? 'ok' : 'neutral'}>{s.status}</StatusPill>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className="mono text-[13px] text-text-secondary">{s.configs}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapseSection>
  );
}

// ── Attempts log ──────────────────────────────────────────────────────────────

function VoiceAttempts({
  attempts,
  loading,
  error,
}: {
  attempts: VoiceAttempt[];
  loading: boolean;
  error: string | null;
}) {
  const [statusFilter, setStatusFilter] = useState('all');
  const statuses = ['all', 'pending', 'dispatched', 'completed', 'failed'] as const;
  const filtered = attempts.filter(a => statusFilter === 'all' || a.status === statusFilter);

  const attemptTone = (s: VoiceAttempt['status']): 'ok' | 'err' | 'info' | 'warn' =>
    s === 'completed' ? 'ok' : s === 'failed' ? 'err' : s === 'dispatched' ? 'info' : 'warn';

  return (
    <CollapseSection title="Call attempts" count={loading ? undefined : attempts.length}>
      {error ? (
        <SectionError label="attempts" error={error}/>
      ) : loading ? (
        <SectionLoading label="attempts"/>
      ) : (
        <>
          <div className="px-4 py-3 border-b border-border-subtle flex gap-1.5 flex-wrap">
            {statuses.map(s => {
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="mono text-[11.5px] font-medium px-3 py-1 rounded-full capitalize border transition-colors"
                  style={{
                    background: active ? 'var(--text-primary)' : 'transparent',
                    color:      active ? '#FFF' : 'var(--text-secondary)',
                    borderColor: active ? 'var(--text-primary)' : 'var(--border-default)',
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 640 }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)' }}>
                  {['Timestamp','Office','Config','Status','Duration','Cost','Result'].map((h, i) => (
                    <th
                      key={i}
                      className="mono text-[11px] font-semibold text-text-lo uppercase tracking-[0.05em] border-b border-border-subtle"
                      style={{ padding: '10px 18px', textAlign: i >= 4 ? 'right' : 'left' }}
                    >{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="mono text-[12.5px] text-text-lo italic" style={{ padding: '14px 18px' }}>
                      No call attempts.
                    </td>
                  </tr>
                ) : filtered.map(a => (
                  <tr key={a.id} className="border-b border-border-subtle">
                    <td style={{ padding: '10px 18px' }}>
                      <span className="mono text-[12px] text-text-secondary">{a.ts}</span>
                    </td>
                    <td style={{ padding: '10px 18px' }}>
                      <span className="mono text-[12.5px] text-text-primary">{a.office}</span>
                    </td>
                    <td style={{ padding: '10px 18px' }}>
                      <span className="mono text-[11px] px-1.5 py-0.5 rounded" style={{ color: BLUE, background: 'rgba(46,108,212,0.10)' }}>{a.config}</span>
                    </td>
                    <td style={{ padding: '10px 18px' }}>
                      <StatusPill tone={attemptTone(a.status)}>{a.status}</StatusPill>
                    </td>
                    <td style={{ padding: '10px 18px', textAlign: 'right' }}>
                      <span className="mono text-[12px] text-text-secondary">{a.duration}</span>
                    </td>
                    <td style={{ padding: '10px 18px', textAlign: 'right' }}>
                      <span className="mono text-[12px] text-text-secondary">${a.cost.toFixed(2)}</span>
                    </td>
                    <td style={{ padding: '10px 18px', textAlign: 'right' }}>
                      {a.bounce ? (
                        <StatusPill tone="err">{a.bounce}</StatusPill>
                      ) : a.structured ? (
                        <span className="mono text-[11px]" style={{ color: GREEN }}>✓ structured_data</span>
                      ) : a.error ? (
                        <span className="mono text-[11px]" style={{ color: RED }}>{a.error}</span>
                      ) : (
                        <span className="mono text-[11px] text-text-lo">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </CollapseSection>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export default function VoiceTab() {
  const [customer, setCustomer] = useState('all');

  // procurement_pull_configs → offices + configs
  const [apiConfigs, setApiConfigs] = useState<ApiProcurementConfig[] | null>(null);
  const [configsError, setConfigsError] = useState<string | null>(null);

  // voice_agent_sources → assistants + sources
  const [apiSources, setApiSources] = useState<ApiVoiceSource[] | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  // activity feed → live calls + attempts
  const [apiEvents, setApiEvents] = useState<ApiActivityEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    voiceFetch('/api/voice/procurement-configs')
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status}: ${await r.text().catch(() => '')}`);
        const j = (await r.json()) as { configs?: ApiProcurementConfig[]; error?: string };
        if (cancelled) return;
        if (j.error) setConfigsError(j.error);
        else setApiConfigs(j.configs ?? []);
      })
      .catch((e: Error) => { if (!cancelled) setConfigsError(e.message); });

    voiceFetch('/api/voice/sources')
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status}: ${await r.text().catch(() => '')}`);
        const j = (await r.json()) as { sources?: ApiVoiceSource[]; error?: string };
        if (cancelled) return;
        if (j.error) setSourcesError(j.error);
        else setApiSources(j.sources ?? []);
      })
      .catch((e: Error) => { if (!cancelled) setSourcesError(e.message); });

    voiceFetch('/api/voice/activity?limit=100&exclude_mock=1')
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status}: ${await r.text().catch(() => '')}`);
        const j = (await r.json()) as { events?: ApiActivityEvent[]; error?: string };
        if (cancelled) return;
        if (j.error) setEventsError(j.error);
        else setApiEvents(j.events ?? []);
      })
      .catch((e: Error) => { if (!cancelled) setEventsError(e.message); });

    return () => { cancelled = true; };
  }, []);

  const offices    = useMemo(() => apiConfigs ? deriveOffices(apiConfigs)    : [], [apiConfigs]);
  const configs    = useMemo(() => apiConfigs ? deriveConfigs(apiConfigs)    : [], [apiConfigs]);
  const assistants = useMemo(() => apiSources ? deriveAssistants(apiSources) : [], [apiSources]);
  const sources    = useMemo(() => apiSources ? deriveSources(apiSources)    : [], [apiSources]);
  const liveAll    = useMemo(() => apiEvents  ? deriveLiveCalls(apiEvents)   : [], [apiEvents]);
  const attempts   = useMemo(() => apiEvents  ? deriveAttempts(apiEvents)    : [], [apiEvents]);

  const liveFiltered = customer === 'all'
    ? liveAll
    : liveAll.filter(c => c.caller_brand.toLowerCase().includes(customer));

  const configsLoading = apiConfigs === null && !configsError;
  const sourcesLoading = apiSources === null && !sourcesError;
  const eventsLoading  = apiEvents  === null && !eventsError;

  return (
    <div className="flex flex-col gap-4">
      {/* Header: customer filter + new config */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="mono text-[20px] font-semibold text-text-primary flex items-center gap-2.5">
          <Phone size={18} color={ORANGE}/> Voice
        </h2>
        <span className="mono text-[13px] text-text-lo">Configs · live calls · assistants · attempts</span>
        <div className="flex-1"/>
        <label className="inline-flex items-center gap-2">
          <span className="mono text-[12px] text-text-secondary font-medium">Customer</span>
          <select
            value={customer}
            onChange={e => setCustomer(e.target.value)}
            className="mono text-[13px] px-2.5 py-1.5 rounded-md border border-border-default bg-bg-card text-text-primary outline-none"
          >
            <option value="all">All</option>
            <option value="zedcor">Zedcor</option>
            <option value="realberry">Realberry</option>
            <option value="northwind">Northwind</option>
          </select>
        </label>
        {/* TODO(audit#18): wire to POST /api/voice/procurement-configs (new config) — currently fake-validates client-side only. */}
        <GatedAction onCommit={() => undefined} label="Validating">
          <button className="mono text-[12px] font-medium px-3 py-1.5 rounded-md text-white flex items-center gap-1.5" style={{ background: 'var(--text-primary)' }}>
            <Plus size={11}/> New config
          </button>
        </GatedAction>
      </div>

      <VoiceLive
        calls={liveFiltered}
        loading={eventsLoading}
        error={eventsError}
      />
      <VoiceConfigs
        configs={configs}
        offices={offices}
        customer={customer}
        loading={configsLoading}
        error={configsError}
      />
      <VoiceAssistants
        assistants={assistants}
        loading={sourcesLoading}
        error={sourcesError}
      />
      <VoiceSources
        sources={sources}
        loading={sourcesLoading}
        error={sourcesError}
      />
      <VoiceAttempts
        attempts={attempts}
        loading={eventsLoading}
        error={eventsError}
      />
    </div>
  );
}
