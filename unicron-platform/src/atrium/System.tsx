// System.tsx — Sprint 3 Stream D + SY-1 + Sprint 7 Stream C
// Atrium System tab root. 10 sub-sections per v3-system.jsx spec.
// Sprint 7 Stream C: AuditLog, DecayHeatmap, ScheduledJobs wired to live DB.

import { useState } from 'react';
import AgentsGalaxy from './system/AgentsGalaxy';
import TaboosViewer from './system/TaboosViewer';
import RefusalLog from './system/RefusalLog';
import ServicesHealth from './system/ServicesHealth';
import AuditLogComponent from './system/AuditLog';
import DecayHeatmapComponent from './system/DecayHeatmap';
import ScheduledJobsComponent from './system/ScheduledJobs';

// ─── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_TABS = [
  'Agents', 'Taboos', 'Refusal Log', 'Services',
  'Voice', 'Decay', 'Memory', 'Scheduled Jobs', 'Audit Log', 'Continuity',
] as const;
type SystemTab = (typeof SYSTEM_TABS)[number];

// ─── Static demo data ─────────────────────────────────────────────────────────

const VOICE_AGENTS = [
  { name: 'Discovery (inbound)', role: 'Inbound discovery calls',   last: 'May 7 · 11:42', cost: 0.84, success: 0.96, runs: 88  },
  { name: 'SDR Outbound',        role: 'Cold outbound prospecting', last: 'May 7 · 13:18', cost: 1.12, success: 0.71, runs: 142 },
  { name: 'Procurement Pull',    role: 'Cron-driven bid pulls',     last: 'May 7 · 14:30', cost: 1.62, success: 0.83, runs: 261 },
];

const VOICE_SERVICES = [
  { name: 'Vapi',       status: 'ok',   latency: '284ms', quota: '38%', errRate: '0.4%', note: undefined                   },
  { name: 'ElevenLabs', status: 'warn', latency: '612ms', quota: '71%', errRate: '1.2%', note: 'p95 latency above SLA'     },
  { name: 'Deepgram',   status: 'ok',   latency: '118ms', quota: '22%', errRate: '0.1%', note: undefined                   },
];


const MEMORY_RESULTS = [
  { id: 'm-1041', title: 'Pricing v3 — net-15 trial for Northwind', source: 'Decision · May 4',   backlinks: 6,  score: 0.94 },
  { id: 'm-0987', title: 'Helix renewal exposure model',            source: 'Vault · Apr 28',     backlinks: 12, score: 0.89 },
  { id: 'm-0962', title: 'Pathfinder tenant churn signal',          source: 'Signal · Apr 22',    backlinks: 4,  score: 0.81 },
  { id: 'm-0901', title: 'Metacron agent fleet — load shape',       source: 'Architect · Apr 14', backlinks: 9,  score: 0.78 },
];

// ScheduledJobs, AuditLog, and DecayHeatmap are now live-DB components imported above.


const CONTINUITY_EVENTS = [
  { ts: 'May 7 · 10:14', kind: 'decision', who: 'Keenan G',     title: 'Approved net-15 billing for Northwind',   detail: '1-year auto-renew with 30-day pilot extension.' },
  { ts: 'May 6 · 17:55', kind: 'signal',   who: 'Trend Scout',  title: 'Competitor priced new tier at $1,200/mo', detail: '3 sources cross-referenced; promoted to vault.' },
  { ts: 'May 6 · 11:01', kind: 'override', who: 'Kyle B',       title: 'Lifted wire-co-sign for AWS auto-pay',    detail: 'Expires Jun 5. Audit_id a-9772.'               },
  { ts: 'May 5 · 14:22', kind: 'decision', who: 'Curtis L',     title: 'Pathfinder pricing v3 ready for review',  detail: 'Tier 2 margin still under 40%; Kyle to approve Friday.' },
  { ts: 'May 4 · 09:30', kind: 'refusal',  who: 'Taboo Keeper', title: 'Blocked customer-list egress',            detail: 'Pipe Hunter attempted external send. severity=high.' },
  { ts: 'May 2 · 13:00', kind: 'decision', who: 'Kyle B',       title: 'Helix renewal moves to red watch',        detail: 'Champion left; new buyer cold. Triage Wed.'    },
];

const KIND_COLOR: Record<string, string> = {
  decision: '#2E6CD4',
  signal:   '#1F8A5B',
  override: '#E8763A',
  refusal:  '#E14B4B',
};

// ─── Voice tab ────────────────────────────────────────────────────────────────

function VoiceTab() {
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border-subtle">
          <div className="mono text-[14px] font-semibold text-text-primary">Voice agents</div>
          <div className="mono text-[11.5px] text-text-secondary mt-0.5">{VOICE_AGENTS.length} active · Vapi orchestration</div>
        </div>
        {VOICE_AGENTS.map((a, i) => (
          <div key={a.name} className={`flex items-center gap-4 px-5 py-3.5 ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#4FB286' }} />
            <div className="flex-1 min-w-0">
              <div className="mono text-[13px] font-medium text-text-primary">{a.name}</div>
              <div className="mono text-[11.5px] text-text-secondary mt-0.5">{a.role}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="mono text-[12.5px] text-text-primary">{Math.round(a.success * 100)}% structured</div>
              <div className="mono text-[11px] text-text-secondary">${a.cost.toFixed(2)}/call · {a.runs} runs</div>
            </div>
            <div className="mono text-[11px] text-text-secondary flex-shrink-0 hidden sm:block">last {a.last}</div>
          </div>
        ))}
      </div>

      <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border-subtle">
          <div className="mono text-[14px] font-semibold text-text-primary">Voice services</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                {['Service', 'Status', 'Latency', 'Quota', 'Err rate', 'Note'].map((h, i) => (
                  <th key={i} className="text-left px-5 py-2.5 mono text-[11.5px] text-text-secondary border-b border-border-default font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VOICE_SERVICES.map((s, i) => (
                <tr key={s.name} className={i > 0 ? 'border-t border-border-subtle' : ''}>
                  <td className="px-5 py-3 mono text-[13px] font-medium text-text-primary">{s.name}</td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1.5 mono text-[12.5px]" style={{ color: s.status === 'ok' ? '#4FB286' : '#D9A23A' }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.status === 'ok' ? '#4FB286' : '#D9A23A' }} />
                      {s.status === 'ok' ? 'Healthy' : 'Degraded'}
                    </span>
                  </td>
                  <td className="px-5 py-3 mono text-[12.5px] text-text-secondary">{s.latency}</td>
                  <td className="px-5 py-3 mono text-[12.5px] text-text-secondary">{s.quota}</td>
                  <td className="px-5 py-3 mono text-[12.5px] text-text-secondary">{s.errRate}</td>
                  <td className="px-5 py-3 mono text-[11.5px] text-text-secondary">{s.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Decay heatmap — live component imported from system/DecayHeatmap.tsx ─────
// (Sprint 7 Stream C — replaced static stub with DB-backed component)

// ─── Memory search ────────────────────────────────────────────────────────────

function MemorySearch() {
  const [q, setQ] = useState('renewal');
  const filtered = MEMORY_RESULTS.filter(r =>
    q === '' || (r.title + r.source).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="memory-search-grid grid gap-5" style={{ gridTemplateColumns: '1fr 340px' }}>
      <style>{`@media (max-width: 900px) { .memory-search-grid { grid-template-columns: 1fr !important; } }`}</style>
      <div className="bg-bg-card border border-border-default rounded-xl p-5">
        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-bg-raised border border-border-subtle rounded-lg mb-4">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="5.5" cy="5.5" r="4" stroke="rgba(255,255,255,0.25)" strokeWidth="1.3"/>
            <path d="M9 9l2.5 2.5" stroke="rgba(255,255,255,0.25)" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Semantic search vault + ledger…"
            className="flex-1 bg-transparent outline-none mono text-[13px] text-text-primary placeholder:text-text-secondary"
          />
          <span className="mono text-[11px] text-text-secondary">{filtered.length} results · 142ms</span>
        </div>
        {filtered.map((r, i) => (
          <div key={r.id} className={`py-4 ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
            <div className="flex items-baseline gap-2.5 mb-1 flex-wrap">
              <span className="mono text-[11px] text-text-secondary">{r.id}</span>
              <span className="mono text-[14px] font-medium text-text-primary">{r.title}</span>
            </div>
            <div className="mono text-[12px] text-text-secondary flex gap-3 flex-wrap">
              <span>{r.source}</span>
              <span>·</span>
              <span>{r.backlinks} backlinks</span>
              <span>·</span>
              <span>score {r.score.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-bg-card border border-border-default rounded-xl p-5" style={{ alignSelf: 'start' }}>
        <div className="mono text-[13px] font-semibold text-text-primary mb-3">Backlinks · m-1041</div>
        <svg viewBox="0 0 320 260" style={{ width: '100%', height: 260 }}>
          <circle cx="160" cy="130" r="24" fill="#2E6CD4"/>
          <text x="160" y="134" textAnchor="middle" fontSize="10" fontWeight="600" fill="#FFF">m-1041</text>
          {[
            { label: 'Helix renewal',   x: 50,  y: 55  },
            { label: 'PF churn',        x: 270, y: 70  },
            { label: 'Metacron load',   x: 55,  y: 210 },
            { label: 'Pricing v2',      x: 265, y: 210 },
            { label: 'Q1 retro',        x: 160, y: 25  },
            { label: 'Northwind notes', x: 160, y: 235 },
          ].map((n, i) => (
            <g key={i}>
              <line x1="160" y1="130" x2={n.x} y2={n.y} stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>
              <circle cx={n.x} cy={n.y} r="12" fill="#0A0C10" stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>
              <text x={n.x} y={n.y + (n.y < 130 ? -20 : 24)} textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,0.32)">{n.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ─── Scheduled jobs + Audit log — live components imported above ──────────────
// (Sprint 7 Stream C — replaced static stubs with DB-backed components)

// ─── Continuity timeline ──────────────────────────────────────────────────────

const FILTER_DEFS = [
  { id: 'decision', label: 'Decisions' },
  { id: 'signal',   label: 'Signals'   },
  { id: 'override', label: 'Overrides' },
  { id: 'refusal',  label: 'Refusals'  },
];

function ContinuityTimeline() {
  const [filters, setFilters] = useState({ decision: true, signal: true, override: true, refusal: true });
  const toggle = (id: string) => setFilters(f => ({ ...f, [id]: !f[id as keyof typeof f] }));
  const visible = CONTINUITY_EVENTS.filter(e => filters[e.kind as keyof typeof filters]);

  return (
    <div className="bg-bg-card border border-border-default rounded-xl p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <div className="mono text-[15px] font-semibold text-text-primary">Continuity timeline</div>
          <div className="mono text-[11.5px] text-text-secondary mt-0.5">Decisions, signals, overrides, refusals — chronological</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTER_DEFS.map(f => {
            const on = filters[f.id as keyof typeof filters];
            return (
              <button
                key={f.id}
                onClick={() => toggle(f.id)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full mono text-[11.5px] font-medium transition-all"
                style={{
                  background: on ? 'rgba(255,255,255,0.04)' : 'transparent',
                  border: `1px solid ${on ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)'}`,
                  color: on ? 'var(--text-hi)' : 'var(--text-lo)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: KIND_COLOR[f.id], opacity: on ? 1 : 0.3 }} />
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {visible.map((e, i) => (
          <div
            key={i}
            className="grid gap-3"
            style={{
              gridTemplateColumns: '110px 20px 1fr',
              padding: '14px 0',
              borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <div className="mono text-[11.5px] text-text-secondary pt-0.5">{e.ts}</div>
            <div className="flex flex-col items-center">
              <span className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: KIND_COLOR[e.kind] }} />
              {i < visible.length - 1 && (
                <span className="flex-1 w-px mt-1.5" style={{ background: 'rgba(255,255,255,0.04)' }} />
              )}
            </div>
            <div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="mono text-[10px] font-semibold uppercase tracking-wider" style={{ color: KIND_COLOR[e.kind] }}>{e.kind}</span>
                <span className="mono text-[13.5px] font-medium text-text-primary">{e.title}</span>
                <span className="mono text-[11.5px] text-text-secondary">· {e.who}</span>
              </div>
              <div className="mono text-[12.5px] text-text-secondary mt-1 leading-relaxed">{e.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function System() {
  const [active, setActive] = useState<SystemTab>('Agents');

  return (
    <div className="max-w-5xl w-full">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="mono text-[18px] text-text-primary font-semibold">System</h1>
        <p className="mono text-[11px] text-text-secondary mt-1">
          Configure agents, review taboos, audit refused actions, and monitor service health.
        </p>
      </div>

      {/* Sub-tab nav */}
      <nav
        className="flex gap-0.5 border-b border-border-default mb-6 overflow-x-auto"
        aria-label="System sub-tabs"
        role="tablist"
      >
        {SYSTEM_TABS.map((tab) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              aria-controls={`system-panel-${tab.replace(/\s+/g, '-').toLowerCase()}`}
              onClick={() => setActive(tab)}
              className="mono text-[11px] uppercase tracking-[0.12em] px-4 py-2.5 rounded-t-lg transition-colors relative whitespace-nowrap flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              style={{
                color: isActive ? 'var(--text-hi)' : 'var(--text-lo)',
                background: isActive ? 'var(--bg-elevated)' : 'transparent',
              }}
            >
              {tab}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Sub-tab content */}
      <section
        id={`system-panel-${active.replace(/\s+/g, '-').toLowerCase()}`}
        role="tabpanel"
        aria-label={active}
      >
        {active === 'Agents'         && <AgentsGalaxy />}
        {active === 'Taboos'         && <TaboosViewer />}
        {active === 'Refusal Log'    && <RefusalLog />}
        {active === 'Services'       && <ServicesHealth />}
        {active === 'Voice'          && <VoiceTab />}
        {active === 'Decay'          && <DecayHeatmapComponent />}
        {active === 'Memory'         && <MemorySearch />}
        {active === 'Scheduled Jobs' && <ScheduledJobsComponent />}
        {active === 'Audit Log'      && <AuditLogComponent />}
        {active === 'Continuity'     && <ContinuityTimeline />}
      </section>
    </div>
  );
}
