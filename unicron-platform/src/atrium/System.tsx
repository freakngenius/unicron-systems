// System.tsx — Sprint 3 Stream D + SY-1
// Atrium System tab root. 10 sub-sections per v3-system.jsx spec.

import { useState } from 'react';
import AgentsGalaxy from './system/AgentsGalaxy';
import TaboosViewer from './system/TaboosViewer';
import RefusalLog from './system/RefusalLog';
import ServicesHealth from './system/ServicesHealth';

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

const DECAY_TOPICS = [
  { topic: 'Pricing FAQ',     weeks: [10,20,28,40,55,62,70,72,78,84,88,92] },
  { topic: 'ICP v1',          weeks: [12,18,24,32,40,48,56,64,72,78,82,86] },
  { topic: 'Onboarding',      weeks: [22,32,38,44,50,56,62,68,72,76,80,84] },
  { topic: 'Pathfinder docs', weeks: [55,42,30,22,18,14,12,10, 9, 8, 8, 8] },
  { topic: 'Metacron design', weeks: [40,32,26,20,18,16,16,14,14,12,10,10] },
  { topic: 'Customer notes',  weeks: [18,14,12,10, 8, 6, 6, 5, 5, 4, 4, 3] },
  { topic: 'Vault hygiene',   weeks: [22,18,14,10, 8, 6, 5, 5, 4, 4, 3, 3] },
];
const WEEK_LABELS = ['W12','W11','W10','W9','W8','W7','W6','W5','W4','W3','W2','W1'];

const MEMORY_RESULTS = [
  { id: 'm-1041', title: 'Pricing v3 — net-15 trial for Northwind', source: 'Decision · May 4',   backlinks: 6,  score: 0.94 },
  { id: 'm-0987', title: 'Helix renewal exposure model',            source: 'Vault · Apr 28',     backlinks: 12, score: 0.89 },
  { id: 'm-0962', title: 'Pathfinder tenant churn signal',          source: 'Signal · Apr 22',    backlinks: 4,  score: 0.81 },
  { id: 'm-0901', title: 'Metacron agent fleet — load shape',       source: 'Architect · Apr 14', backlinks: 9,  score: 0.78 },
];

const SCHEDULED_JOBS_DATA = [
  { id: 'job-01', name: 'Daily digest',              cron: '0 6 * * *',    owner: 'Curator',          lastRun: '06:00',     nextRun: 'Tomorrow 06:00', status: 'ok',   on: true  },
  { id: 'job-02', name: 'Vault decay sweep',         cron: '0 7 * * MON',  owner: 'Janitor',          lastRun: 'Mon 07:00', nextRun: 'Mon 07:00',     status: 'ok',   on: true  },
  { id: 'job-03', name: 'Renewal nudge',             cron: '0 9 * * *',    owner: 'Maya · CSM',       lastRun: '09:00',     nextRun: 'Tomorrow 09:00', status: 'ok',   on: true  },
  { id: 'job-04', name: 'Trend scan',                cron: '0 6 * * *',    owner: 'Trend Scout',      lastRun: '06:00',     nextRun: 'Tomorrow 06:00', status: 'ok',   on: true  },
  { id: 'job-05', name: 'Backup snapshot',           cron: '0 2 * * *',    owner: 'Telemetry',        lastRun: '02:00',     nextRun: 'Tomorrow 02:00', status: 'ok',   on: true  },
  { id: 'job-06', name: 'Stripe re-auth ping',       cron: '0 8 * * MON',  owner: 'Boundary',         lastRun: 'Mon 08:00', nextRun: 'Mon 08:00',     status: 'warn', on: true  },
  { id: 'job-07', name: 'Embedding refresh',         cron: '0 3 * * SUN',  owner: 'Curator',          lastRun: 'Sun 03:00', nextRun: 'Sun 03:00',     status: 'ok',   on: false },
  { id: 'job-08', name: 'Procurement pull (hourly)', cron: '0 * * * *',    owner: 'Procurement Pull', lastRun: '14:00',     nextRun: '15:00',         status: 'ok',   on: true  },
];

const AUDIT_ENTRIES = [
  { ts: 'May 7 · 10:14', actor: 'Keenan G',        action: 'decision.approve',       subject: 'Northwind net-15 billing',   meta: 'audit_id=a-9821' },
  { ts: 'May 7 · 09:30', actor: 'Curator',          action: 'vault.archive',          subject: '12 stale notes',             meta: 'batch=cln-0507'  },
  { ts: 'May 7 · 09:12', actor: 'Curator',          action: 'skill.run',              subject: 'Morning Brief',              meta: 'cost=$0.07'      },
  { ts: 'May 6 · 16:41', actor: 'Taboo Keeper',     action: 'policy.refuse',          subject: 'impersonation',              meta: 'agent=Maya'      },
  { ts: 'May 6 · 11:01', actor: 'Kyle B',           action: 'taboo.override.add',     subject: 'wire-without-co-sign · AWS', meta: 'expires=Jun 5'   },
  { ts: 'May 5 · 14:22', actor: 'Kyle B',           action: 'service.reauth',         subject: 'Slack',                      meta: '—'               },
  { ts: 'May 5 · 09:18', actor: 'System',           action: 'job.toggle',             subject: 'Embedding refresh OFF',      meta: 'by=Kyle'         },
  { ts: 'May 7 · 14:30', actor: 'Procurement Pull', action: 'voice_dispatch',         subject: 'Harris County FCD',          meta: 'cost=$1.84'      },
  { ts: 'May 7 · 13:42', actor: 'Kyle B',           action: 'voice_config_update',    subject: 'Phoenix Procurement cron',   meta: 'cfg-2 updated'   },
  { ts: 'May 7 · 10:58', actor: 'Taboo Keeper',     action: 'voice_taboo_bounce',     subject: 'Reno Capital Projects',      meta: 'no_consent'      },
  { ts: 'May 6 · 18:04', actor: 'Kyle B',           action: 'voice_assistant_update', subject: 'Marie · Zedcor SDR',         meta: 'asst_01HG7QXB'  },
];

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
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#22c55e' }} />
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
                    <span className="flex items-center gap-1.5 mono text-[12.5px]" style={{ color: s.status === 'ok' ? '#22c55e' : '#f59e0b' }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.status === 'ok' ? '#22c55e' : '#f59e0b' }} />
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

// ─── Decay heatmap ────────────────────────────────────────────────────────────

function decayCellColor(v: number): string {
  if (v < 25) return 'rgba(46,142,102,0.85)';
  if (v < 50) return 'rgba(46,142,102,0.45)';
  if (v < 70) return 'rgba(194,138,31,0.55)';
  if (v < 85) return 'rgba(225,75,75,0.45)';
  return 'rgba(225,75,75,0.85)';
}

function DecayHeatmap() {
  return (
    <div className="bg-bg-card border border-border-default rounded-xl p-6">
      <div className="mb-5">
        <div className="mono text-[15px] font-semibold text-text-primary">Signal decay heatmap</div>
        <div className="mono text-[11.5px] text-text-secondary mt-0.5">Topic freshness over the last 12 weeks · darker = staler</div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 600 }}>
          {/* Week labels row */}
          <div className="flex gap-2 mb-2" style={{ paddingLeft: 192 }}>
            {WEEK_LABELS.map(w => (
              <div key={w} className="mono text-center flex-1" style={{ fontSize: 10.5, color: 'rgba(229,229,231,0.4)' }}>{w}</div>
            ))}
          </div>

          {/* Topic rows */}
          {DECAY_TOPICS.map(t => (
            <div key={t.topic} className="flex items-center gap-2 mb-1.5">
              <div className="mono text-[13px] text-text-primary font-medium truncate" style={{ width: 180, flexShrink: 0 }}>
                {t.topic}
              </div>
              <div className="flex gap-1 flex-1">
                {t.weeks.map((v, i) => (
                  <div
                    key={i}
                    title={`${t.topic} · ${WEEK_LABELS[i]} · staleness ${v}`}
                    style={{
                      flex: 1, height: 28, borderRadius: 4, background: decayCellColor(v),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: v > 60 ? '#FFF' : 'rgba(229,229,231,0.85)',
                      fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {v}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-4 justify-end flex-wrap">
        <span className="mono text-[11px] text-text-secondary">Scale:</span>
        {[10, 30, 60, 80, 95].map(v => (
          <span key={v} className="flex items-center gap-1.5 mono text-[11px] text-text-secondary">
            <span style={{ width: 12, height: 12, borderRadius: 3, background: decayCellColor(v), display: 'inline-block' }} />
            {v < 25 ? 'Fresh' : v < 50 ? 'Warm' : v < 70 ? 'Aging' : v < 85 ? 'Stale' : 'Critical'}
          </span>
        ))}
      </div>
    </div>
  );
}

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
            <circle cx="5.5" cy="5.5" r="4" stroke="rgba(229,229,231,0.4)" strokeWidth="1.3"/>
            <path d="M9 9l2.5 2.5" stroke="rgba(229,229,231,0.4)" strokeWidth="1.3" strokeLinecap="round"/>
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
              <line x1="160" y1="130" x2={n.x} y2={n.y} stroke="rgba(229,229,231,0.12)" strokeWidth="1"/>
              <circle cx={n.x} cy={n.y} r="12" fill="#1a1a1e" stroke="rgba(229,229,231,0.2)" strokeWidth="1"/>
              <text x={n.x} y={n.y + (n.y < 130 ? -20 : 24)} textAnchor="middle" fontSize="9.5" fill="rgba(229,229,231,0.5)">{n.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ─── Scheduled jobs ───────────────────────────────────────────────────────────

type GateState = 'idle' | 'validating' | 'ok' | 'blocked';

function GatedButton() {
  const [state, setState] = useState<GateState>('idle');
  const trigger = () => {
    setState('validating');
    setTimeout(() => {
      const pass = Math.random() > 0.15;
      setState(pass ? 'ok' : 'blocked');
      setTimeout(() => setState('idle'), 1400);
    }, 900);
  };
  return (
    <button
      onClick={trigger}
      disabled={state !== 'idle'}
      className="mono text-[11.5px] font-semibold px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-all"
      style={{
        background: state === 'ok' ? 'rgba(34,197,94,0.12)' : state === 'blocked' ? 'rgba(225,75,75,0.12)' : 'transparent',
        border: `1px solid ${state === 'ok' ? '#22c55e' : state === 'blocked' ? '#E14B4B' : 'rgba(229,229,231,0.15)'}`,
        color: state === 'ok' ? '#22c55e' : state === 'blocked' ? '#E14B4B' : 'rgba(229,229,231,0.5)',
      }}
    >
      {state === 'validating' && (
        <span className="w-2 h-2 rounded-full border border-current border-t-transparent animate-spin" />
      )}
      {state === 'idle'       && 'Trigger now'}
      {state === 'validating' && 'Validating…'}
      {state === 'ok'         && '✓ Triggered'}
      {state === 'blocked'    && '✗ Blocked'}
    </button>
  );
}

function ScheduledJobs() {
  const [jobs, setJobs] = useState(SCHEDULED_JOBS_DATA);
  const toggle = (id: string) => setJobs(jobs.map(j => j.id === id ? { ...j, on: !j.on } : j));
  const activeCount = jobs.filter(j => j.on).length;

  return (
    <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border-subtle">
        <div className="mono text-[14px] font-semibold text-text-primary">Scheduled jobs</div>
        <div className="mono text-[11.5px] text-text-secondary mt-0.5">{activeCount} of {jobs.length} active · cron-driven</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              {['', 'Name', 'Cron', 'Owner', 'Last run', 'Next run', 'Status', ''].map((h, i) => (
                <th
                  key={i}
                  className={`px-4 py-2.5 mono text-[11.5px] text-text-secondary font-medium border-b border-border-default ${i === 7 ? 'text-right' : 'text-left'}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((j, idx) => (
              <tr key={j.id} className={idx > 0 ? 'border-t border-border-subtle' : ''} style={{ opacity: j.on ? 1 : 0.5 }}>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggle(j.id)}
                    className="relative inline-block rounded-full transition-colors flex-shrink-0"
                    style={{ width: 30, height: 17, background: j.on ? '#22c55e' : 'rgba(229,229,231,0.15)' }}
                  >
                    <span
                      className="absolute top-0.5 rounded-full bg-white transition-all"
                      style={{ width: 13, height: 13, left: j.on ? 15 : 2 }}
                    />
                  </button>
                </td>
                <td className="px-4 py-3 mono text-[13px] font-medium text-text-primary">{j.name}</td>
                <td className="px-4 py-3 mono text-[11.5px] text-text-secondary">{j.cron}</td>
                <td className="px-4 py-3 mono text-[12px] text-text-secondary">{j.owner}</td>
                <td className="px-4 py-3 mono text-[11.5px] text-text-secondary">{j.lastRun}</td>
                <td className="px-4 py-3 mono text-[11.5px] text-text-secondary">{j.nextRun}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 mono text-[12px]" style={{ color: j.status === 'ok' ? '#22c55e' : '#f59e0b' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: j.status === 'ok' ? '#22c55e' : '#f59e0b' }} />
                    {j.status === 'ok' ? 'Healthy' : 'Warning'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <GatedButton />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Audit log ────────────────────────────────────────────────────────────────

function AuditLog() {
  const [q, setQ] = useState('');
  const filtered = AUDIT_ENTRIES.filter(a =>
    q === '' || (a.actor + a.action + a.subject).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="mono text-[14px] font-semibold text-text-primary">Audit log</div>
          <div className="mono text-[11.5px] text-text-secondary mt-0.5">Every system change · immutable · {AUDIT_ENTRIES.length} entries</div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-raised border border-border-subtle rounded-lg">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="5" cy="5" r="3.5" stroke="rgba(229,229,231,0.4)" strokeWidth="1.2"/>
            <path d="M8 8l2.5 2.5" stroke="rgba(229,229,231,0.4)" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search actor, action, subject…"
            className="bg-transparent outline-none mono text-[12px] text-text-primary placeholder:text-text-secondary w-44"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 680 }}>
          <thead>
            <tr>
              {['Timestamp', 'Actor', 'Action', 'Subject', 'Meta'].map((h, i) => (
                <th key={i} className="text-left px-5 py-2.5 mono text-[11.5px] text-text-secondary font-medium border-b border-border-default">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((a, i) => (
              <tr key={i} className={i > 0 ? 'border-t border-border-subtle' : ''}>
                <td className="px-5 py-3 mono text-[12px] text-text-secondary">{a.ts}</td>
                <td className="px-5 py-3 mono text-[13px] text-text-primary">{a.actor}</td>
                <td className="px-5 py-3">
                  <span className="mono text-[11px] px-1.5 py-0.5 rounded bg-bg-raised text-text-secondary">{a.action}</span>
                </td>
                <td className="px-5 py-3 mono text-[12.5px] text-text-secondary">{a.subject}</td>
                <td className="px-5 py-3 mono text-[11.5px] text-text-secondary">{a.meta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
                  background: on ? 'rgba(229,229,231,0.06)' : 'transparent',
                  border: `1px solid ${on ? 'rgba(229,229,231,0.2)' : 'rgba(229,229,231,0.08)'}`,
                  color: on ? 'rgba(229,229,231,0.9)' : 'rgba(229,229,231,0.35)',
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
              borderTop: i === 0 ? 'none' : '1px solid rgba(229,229,231,0.06)',
            }}
          >
            <div className="mono text-[11.5px] text-text-secondary pt-0.5">{e.ts}</div>
            <div className="flex flex-col items-center">
              <span className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: KIND_COLOR[e.kind] }} />
              {i < visible.length - 1 && (
                <span className="flex-1 w-px mt-1.5" style={{ background: 'rgba(229,229,231,0.06)' }} />
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
        <h1 className="mono text-[18px] text-[#E5E5E7] font-semibold">System</h1>
        <p className="mono text-[11px] text-[rgba(229,229,231,0.5)] mt-1">
          Configure agents, review taboos, audit refused actions, and monitor service health.
        </p>
      </div>

      {/* Sub-tab nav */}
      <nav
        className="flex gap-0.5 border-b border-[#1F1F23] mb-6 overflow-x-auto"
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
                color: isActive ? '#E5E5E7' : 'rgba(229,229,231,0.45)',
                background: isActive ? '#141416' : 'transparent',
              }}
            >
              {tab}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                  style={{ backgroundColor: '#FF6B2B' }}
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
        {active === 'Decay'          && <DecayHeatmap />}
        {active === 'Memory'         && <MemorySearch />}
        {active === 'Scheduled Jobs' && <ScheduledJobs />}
        {active === 'Audit Log'      && <AuditLog />}
        {active === 'Continuity'     && <ContinuityTimeline />}
      </section>
    </div>
  );
}
