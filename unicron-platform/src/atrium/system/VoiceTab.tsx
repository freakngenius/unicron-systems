// VoiceTab.tsx — System > Voice sub-tab
// Structural port of V3VoiceSystemTab from v3-voice.jsx.
// Static scaffold; live Supabase wiring deferred to Sprint 8.

import React, { useState } from 'react';
import { X, Check, Plus, ChevronDown, Phone } from 'lucide-react';

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

// ── Static demo data ──────────────────────────────────────────────────────────

const VOICE_OFFICES: VoiceOffice[] = [
  { id: 'off-1', name: 'Harris County Flood Control District', phone: '+1 (713) 684-4000', city: 'Houston, TX',       customer: 'zedcor',    cron: '0 10 1 * *',    cron_summary: '1st of month · 10:00 CT',  window: 30, last_pull: 'Apr 1 · 10:01', projects_sourced: 14, attempts: 27, why: 'Largest infra spend in Harris county', disclosure: 'Hi, this is Marie from Zedcor — calling about your published procurement bids.' },
  { id: 'off-2', name: 'City of Houston Public Works',         phone: '+1 (832) 393-9100', city: 'Houston, TX',       customer: 'zedcor',    cron: '0 10 1,15 * *', cron_summary: '1st & 15th · 10:00 CT',   window: 14, last_pull: 'May 1 · 10:01', projects_sourced: 8,  attempts: 22, why: 'Frequent bid cycles', disclosure: 'Hi, this is Marie from Zedcor — calling about your published procurement bids.' },
  { id: 'off-3', name: 'Phoenix Procurement',                  phone: '+1 (602) 262-7181', city: 'Phoenix, AZ',       customer: 'zedcor',    cron: '0 10 1 * *',    cron_summary: '1st of month · 10:00 PT',  window: 30, last_pull: 'May 1 · 10:01', projects_sourced: 6,  attempts: 11, why: 'New AZ market entry', disclosure: 'Hi, this is Marie from Zedcor — calling about your published procurement bids.' },
  { id: 'off-4', name: 'Tucson Streets Dept',                  phone: '+1 (520) 791-3154', city: 'Tucson, AZ',        customer: 'zedcor',    cron: '0 10 5 * *',    cron_summary: '5th of month · 10:00 PT',  window: 30, last_pull: 'May 5 · 10:02', projects_sourced: 3,  attempts: 7,  why: 'Companion to Phoenix', disclosure: 'Hi, this is Marie from Zedcor — calling about your published procurement bids.' },
  { id: 'off-5', name: 'Reno Capital Projects',                phone: '+1 (775) 334-2350', city: 'Reno, NV',          customer: 'zedcor',    cron: '0 11 1 * *',    cron_summary: '1st of month · 11:00 PT',  window: 30, last_pull: '—',            projects_sourced: 0,  attempts: 1,  why: 'Pilot — activating', disclosure: 'Hi, this is Marie from Zedcor — calling about your published procurement bids.' },
  { id: 'off-6', name: 'Albuquerque Public Works',             phone: '+1 (505) 768-3500', city: 'Albuquerque, NM',   customer: 'realberry', cron: '0 9 1 * *',     cron_summary: '1st of month · 09:00 MT',  window: 30, last_pull: 'May 1 · 09:00', projects_sourced: 2,  attempts: 4,  why: 'Initial Realberry outreach', disclosure: 'Hi, I\'m with Realberry — calling about your current procurement schedule.' },
];

const VOICE_CONFIGS: VoiceConfig[] = [
  { id: 'cfg-1', customer: 'zedcor',    caller_brand: 'Marie (Zedcor SDR)',  offices: ['off-1','off-2'], cron_summary: '1st of month · 10:00 CT', last_success: 'May 1 · 10:01', monthly_burn: 142.30, active: true  },
  { id: 'cfg-2', customer: 'zedcor',    caller_brand: 'Marie (Zedcor SDR)',  offices: ['off-3','off-4'], cron_summary: '1st & 5th · 10:00 PT',   last_success: 'May 5 · 10:02', monthly_burn: 88.10,  active: true  },
  { id: 'cfg-3', customer: 'zedcor',    caller_brand: 'Marie (Zedcor SDR)',  offices: ['off-5'],         cron_summary: '1st of month · 11:00 PT', last_success: '—',             monthly_burn: 0.0,    active: false },
  { id: 'cfg-4', customer: 'realberry', caller_brand: 'Tom (Realberry rep)', offices: ['off-6'],         cron_summary: '1st of month · 09:00 MT', last_success: 'May 1 · 09:00', monthly_burn: 34.20,  active: true  },
];

const VOICE_LIVE: VoiceLiveCall[] = [
  { id: 'lv-1', caller_brand: 'Marie (Zedcor SDR)',  office: 'Harris County Flood Control District', agent: 'Procurement Pull', status: 'in-conversation', duration: 184 },
  { id: 'lv-2', caller_brand: 'Tom (Realberry rep)', office: 'Albuquerque Public Works',             agent: 'Procurement Pull', status: 'ringing',         duration: 12  },
  { id: 'lv-3', caller_brand: 'Pathfinder SDR',      office: '—',                                   agent: 'SDR Outbound',     status: 'queued',          duration: 0   },
];

const VAPI_ASSISTANTS: VapiAssistant[] = [
  { id: 'asst_marie_zedcor',      name: 'Marie · Zedcor SDR',    model: 'Claude Sonnet 4.5', voice: 'EL_voice_marie_warm',  variables: ['target_office','disclosure_text','why_priority','caller_first_name'], persistent_id: 'asst_01HG7QXB2K…' },
  { id: 'asst_tom_realberry',     name: 'Tom · Realberry SDR',   model: 'Claude Sonnet 4.5', voice: 'EL_voice_tom_neutral', variables: ['target_office','disclosure_text','caller_first_name'],                persistent_id: 'asst_01HG7R8N9M…' },
  { id: 'asst_discovery_inbound', name: 'Discovery (inbound)',   model: 'Claude Sonnet 4.5', voice: 'EL_voice_neutral_pro', variables: ['caller_phone','customer_brand'],                                       persistent_id: 'asst_01HG7T2P4Q…' },
  { id: 'asst_pf_sdr',            name: 'Pathfinder SDR',        model: 'Claude Sonnet 4.5', voice: 'EL_voice_alex_calm',   variables: ['target_prospect','value_prop','first_name'],                            persistent_id: 'asst_01HG7V0R6S…' },
];

const VOICE_SOURCES: VoiceSource[] = [
  { id: 'src-1', name: 'procurement_offices',  type: 'procurement_office', status: 'active',   configs: 3 },
  { id: 'src-2', name: 'sdr_prospects_q2',     type: 'sdr_database',       status: 'active',   configs: 1 },
  { id: 'src-3', name: 'discovery_inbound',    type: 'discovery_inbound',  status: 'active',   configs: 0 },
  { id: 'src-4', name: 'sdr_prospects_q1',     type: 'sdr_database',       status: 'archived', configs: 0 },
];

const VOICE_ATTEMPTS: VoiceAttempt[] = [
  { id: 'att-1041', ts: 'May 7 · 14:30', office: 'Harris County FCD',        config: 'cfg-1', status: 'completed',  duration: '4m 32s', cost: 1.84, structured: true,  bounce: null },
  { id: 'att-1040', ts: 'May 7 · 14:24', office: 'Albuquerque Public Works', config: 'cfg-4', status: 'completed',  duration: '2m 11s', cost: 0.92, structured: true,  bounce: null },
  { id: 'att-1039', ts: 'May 7 · 13:18', office: 'City of Houston PW',       config: 'cfg-1', status: 'failed',     duration: '0m 08s', cost: 0.05, structured: false, bounce: null, error: 'no_answer' },
  { id: 'att-1038', ts: 'May 7 · 11:02', office: 'Tucson Streets Dept',      config: 'cfg-2', status: 'completed',  duration: '3m 47s', cost: 1.61, structured: true,  bounce: null },
  { id: 'att-1037', ts: 'May 7 · 10:58', office: 'Reno Capital Projects',    config: 'cfg-3', status: 'dispatched', duration: '—',      cost: 0.00, structured: false, bounce: 'no_consent_recorded' },
  { id: 'att-1036', ts: 'May 7 · 10:01', office: 'Phoenix Procurement',      config: 'cfg-2', status: 'completed',  duration: '5m 02s', cost: 2.08, structured: true,  bounce: null },
  { id: 'att-1035', ts: 'May 6 · 14:30', office: 'Harris County FCD',        config: 'cfg-1', status: 'completed',  duration: '3m 19s', cost: 1.42, structured: true,  bounce: null },
  { id: 'att-1034', ts: 'May 6 · 13:30', office: 'City of Houston PW',       config: 'cfg-1', status: 'completed',  duration: '4m 05s', cost: 1.71, structured: true,  bounce: null },
  { id: 'att-1033', ts: 'May 5 · 10:02', office: 'Tucson Streets Dept',      config: 'cfg-2', status: 'completed',  duration: '3m 12s', cost: 1.34, structured: true,  bounce: null },
  { id: 'att-1032', ts: 'May 5 · 09:58', office: 'Phoenix Procurement',      config: 'cfg-2', status: 'pending',    duration: '—',      cost: 0.00, structured: false, bounce: null },
];

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

// ── VoiceLive strip ───────────────────────────────────────────────────────────

function VoiceLive({ calls }: { calls: VoiceLiveCall[] }) {
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
        <span className="mono text-[12px] text-text-lo">{calls.length} in flight</span>
      </div>
      {calls.length === 0 ? (
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

function VoiceConfigs({ configs, offices, customer }: { configs: VoiceConfig[]; offices: VoiceOffice[]; customer: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const filtered = customer === 'all' ? configs : configs.filter(c => c.customer === customer);

  return (
    <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border-subtle flex items-baseline gap-2.5">
        <h3 className="mono text-[15px] font-semibold text-text-primary">Procurement pull configs</h3>
        <span className="mono text-[12px] text-text-lo">{filtered.length} configs · procurement_pull_configs table</span>
      </div>
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

function VoiceAssistants() {
  const [editing, setEditing] = useState<VapiAssistant | null>(null);
  return (
    <CollapseSection title="Vapi assistants" count={VAPI_ASSISTANTS.length} defaultOpen>
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
            {VAPI_ASSISTANTS.map(a => (
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
      {editing && <JSONEditor assistant={editing} onClose={() => setEditing(null)}/>}
    </CollapseSection>
  );
}

// ── Sources panel ─────────────────────────────────────────────────────────────

function VoiceSources() {
  return (
    <CollapseSection title="Sources" count={VOICE_SOURCES.length}>
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
            {VOICE_SOURCES.map(s => (
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
    </CollapseSection>
  );
}

// ── Attempts log ──────────────────────────────────────────────────────────────

function VoiceAttempts() {
  const [statusFilter, setStatusFilter] = useState('all');
  const statuses = ['all', 'pending', 'dispatched', 'completed', 'failed'] as const;
  const filtered = VOICE_ATTEMPTS.filter(a => statusFilter === 'all' || a.status === statusFilter);

  const attemptTone = (s: VoiceAttempt['status']): 'ok' | 'err' | 'info' | 'warn' =>
    s === 'completed' ? 'ok' : s === 'failed' ? 'err' : s === 'dispatched' ? 'info' : 'warn';

  return (
    <CollapseSection title="Call attempts" count={VOICE_ATTEMPTS.length}>
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
            {filtered.map(a => (
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
    </CollapseSection>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export default function VoiceTab() {
  const [customer, setCustomer] = useState('all');
  const liveFiltered = customer === 'all'
    ? VOICE_LIVE
    : VOICE_LIVE.filter(c => c.caller_brand.toLowerCase().includes(customer));

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
        <GatedAction onCommit={() => undefined} label="Validating">
          <button className="mono text-[12px] font-medium px-3 py-1.5 rounded-md text-white flex items-center gap-1.5" style={{ background: 'var(--text-primary)' }}>
            <Plus size={11}/> New config
          </button>
        </GatedAction>
      </div>

      <VoiceLive calls={liveFiltered}/>
      <VoiceConfigs configs={VOICE_CONFIGS} offices={VOICE_OFFICES} customer={customer}/>
      <VoiceAssistants/>
      <VoiceSources/>
      <VoiceAttempts/>
    </div>
  );
}
