// hifi-live.jsx — Live/agentic chrome for Pathfinder.
// Three Computer agents (Ingestor, Ranker, Adjacent), agent status row,
// multi-model routing strip, agent-tinted activity log, pin/score lifecycle.
//
// All live state is owned here and exposed through window.PFLive (a tiny event bus + hooks).

const { BRANCHES, PROJECTS } = window.PFData;

// ─── Agent definitions ─────────────────────────────────────────────
// Three Computer agents. Two get color tints from the existing palette;
// the third (ADJACENT) intentionally renders in mono ink so we don't
// invent a third hue. Distinction is by tint vs. neutral.
const AGENTS = {
  ingestor: { id: 'ingestor', label: 'INGESTOR', tintKey: 'hi'   },
  ranker:   { id: 'ranker',   label: 'RANKER',   tintKey: 'warm' },
  adjacent: { id: 'adjacent', label: 'ADJACENT', tintKey: null   }, // mono
};
function agentTint(a) {
  if (!a) return PF.inkDim;
  const ag = AGENTS[a]; if (!ag) return PF.inkDim;
  return ag.tintKey ? PF[ag.tintKey] : PF.ink;
}

// ─── tiny event bus ────────────────────────────────────────────────
const subs = new Set();
function emit(ev) { subs.forEach(fn => fn(ev)); }
function useBus(filter) {
  const [, force] = React.useReducer(x => x + 1, 0);
  const lastRef = React.useRef(null);
  React.useEffect(() => {
    const fn = (ev) => { if (!filter || filter(ev)) { lastRef.current = ev; force(); } };
    subs.add(fn);
    return () => subs.delete(fn);
  }, []);
  return lastRef.current;
}

// ─── Activity log feed (capped ring buffer) ────────────────────────
const LOG_CAP = 120;
let _log = [];
const _logSubs = new Set();
function pushLog(entry) {
  _log = [entry, ..._log].slice(0, LOG_CAP);
  _logSubs.forEach(fn => fn(_log));
}
function useLog() {
  const [v, setV] = React.useState(_log);
  React.useEffect(() => { _logSubs.add(setV); return () => _logSubs.delete(setV); }, []);
  return v;
}

// ─── Agent fleet live state ────────────────────────────────────────
// status: 'running' | 'idle' | 'scheduled' | 'failed'
let _agents = {
  ingestor: { status: 'running',   lastCycleSec: 720, recordsThisCycle: 18, latMs: 2400, recordsToday: 247 },
  ranker:   { status: 'idle',      lastCycleSec: 240, rankedThisCycle: 0,   latMs: 2100, rankedToday: 47 },
  adjacent: { status: 'scheduled', lastCycleSec: -1,  nextRunLabel: 'fri 09:00 utc', targetsLastWeek: 8 },
};
const _agentSubs = new Set();
function setAgents(next) { _agents = next; _agentSubs.forEach(fn => fn(_agents)); }
function patchAgent(id, patch) {
  setAgents({ ..._agents, [id]: { ..._agents[id], ...patch } });
}
function useAgents() {
  const [v, setV] = React.useState(_agents);
  React.useEffect(() => { _agentSubs.add(setV); return () => _agentSubs.delete(setV); }, []);
  return v;
}

// ─── Multi-model routing state (calls in last hour) ────────────────
// Each model has a purpose, calls-this-hour, and per-call cost in USD.
const MODEL_META = {
  'local-geocoder': { purpose: 'branch matching', costPerCall: 0.0000 },
  'gpt-oss-20b':    { purpose: 'stage classify', costPerCall: 0.00056 },
  'claude-haiku':   { purpose: 'entity dedup',   costPerCall: 0.0019 },
  'claude-sonnet':  { purpose: 'rationale gen',  costPerCall: 0.0054 },
};
let _models = {
  'local-geocoder': 124,
  'gpt-oss-20b':    71,
  'claude-haiku':   31,
  'claude-sonnet':  59,
};
let _rankedThisHour = 142; // for cost-per-ranked-lead
let _modelAvgRoutingMs = 1.2 * 1000;
const _modelSubs = new Set();
function bumpModel(name) {
  _models = { ..._models, [name]: (_models[name] || 0) + 1 };
  _modelSubs.forEach(fn => fn({ models: _models, avgMs: _modelAvgRoutingMs, ranked: _rankedThisHour }));
}
function useModels() {
  const [v, setV] = React.useState({ models: _models, avgMs: _modelAvgRoutingMs, ranked: _rankedThisHour });
  React.useEffect(() => { _modelSubs.add(setV); return () => _modelSubs.delete(setV); }, []);
  return v;
}

// ─── 'new arrivals' set ────────────────────────────────────────────
let _newPins = new Set();
const _newPinSubs = new Set();
function markPinNew(id) {
  _newPins.add(id);
  _newPinSubs.forEach(fn => fn(new Set(_newPins)));
  setTimeout(() => {
    _newPins.delete(id);
    _newPinSubs.forEach(fn => fn(new Set(_newPins)));
  }, 700);
}
function useNewPins() {
  const [v, setV] = React.useState(new Set());
  React.useEffect(() => { _newPinSubs.add(setV); return () => _newPinSubs.delete(setV); }, []);
  return v;
}

// ─── 'just ranked' set (triggers count-up) ─────────────────────────
let _justRanked = new Set();
const _rankSubs = new Set();
function markRanked(id) {
  _justRanked.add(id);
  _rankSubs.forEach(fn => fn(new Set(_justRanked)));
  setTimeout(() => {
    _justRanked.delete(id);
    _rankSubs.forEach(fn => fn(new Set(_justRanked)));
  }, 800);
}
function useJustRanked() {
  const [v, setV] = React.useState(new Set());
  React.useEffect(() => { _rankSubs.add(setV); return () => _rankSubs.delete(setV); }, []);
  return v;
}

// ─── seen modals (for typewriter once) ─────────────────────────────
const _seenModals = new Set();
function isFirstOpen(id) { return !_seenModals.has(id); }
function markSeen(id) { _seenModals.add(id); }

// ─── last ingest time ──────────────────────────────────────────────
let _lastIngest = Date.now();
const _ingestSubs = new Set();
function bumpIngest() { _lastIngest = Date.now(); _ingestSubs.forEach(fn => fn(_lastIngest)); }
function useLastIngest() {
  const [v, setV] = React.useState(_lastIngest);
  React.useEffect(() => { _ingestSubs.add(setV); return () => _ingestSubs.delete(setV); }, []);
  return v;
}

// ─── stats with tick state ─────────────────────────────────────────
let _stats = { new: 247, total: 3402, ranked: 71, err: 0 };
let _statsBumped = { new: 0, total: 0, ranked: 0, err: 0 }; // timestamp of last bump
const _statSubs = new Set();
function bumpStat(key, by = 1) {
  _stats = { ..._stats, [key]: _stats[key] + by };
  _statsBumped = { ..._statsBumped, [key]: Date.now() };
  _statSubs.forEach(fn => fn({ stats: _stats, bumped: _statsBumped }));
}
function useStats() {
  const [v, setV] = React.useState({ stats: _stats, bumped: _statsBumped });
  React.useEffect(() => { _statSubs.add(setV); return () => _statSubs.delete(setV); }, []);
  return v;
}

// ─── simulation loop ───────────────────────────────────────────────
function startSim() {
  if (window.__pfSimStarted) return;
  window.__pfSimStarted = true;

  // seed log — Computer agents reasoning about real work
  const seed = [
    { agent: 'adjacent', text: 'researching multi-branch field-sales orgs · 4 candidates surfaced' },
    { agent: 'ranker',   text: 'PRJ-9F2A11 · score 87 · branch HOU · high-priority' },
    { agent: 'ranker',   text: 'multi-model route · claude-sonnet for rationale · 2.4s' },
    { agent: 'ingestor', text: 'classify stage · pre-budget · announcement-language signal' },
    { agent: 'ingestor', text: 'entity correlate · SAM SOL-2026-04-TxDOT-001 ≈ TxDOT press release apr 22 · merged' },
    { agent: 'ingestor', text: 'fetched usaspending api · 6 federal awards' },
    { agent: 'ingestor', text: 'browsing harriscounty.tx.gov/permits · 12 records' },
  ];
  seed.forEach((e, i) => pushLog({ ...e, ts: new Date(Date.now() - i * 4500) }));

  const INGESTOR_LINES = [
    'browsing harriscounty.tx.gov/permits · {N} records',
    'browsing dallascityhall.com/procurement · {N} records',
    'fetched usaspending api · {N} federal awards',
    'fetched sam.gov · {N} solicitations · {L}ms',
    'fetched news.google query=permit · {N} hits',
    'entity correlate · SAM SOL-2026-04-TxDOT-001 ≈ TxDOT press release apr 22 · merged',
    'entity correlate · usaspending W912HY ≈ harris-co permit 9421 · merged',
    'classify stage · pre-budget · announcement-language signal',
    'classify stage · funded · obligated-amount signal',
    'geocode · {N} candidates · cache hit {C}/{N}',
    'extract value · NAICS 237310 · est. ${V}M · 84% conf',
    'NAICS map · 237310 → unicron-codes · {N} records',
  ];
  const RANKER_LINES = [
    'multi-model route · claude-sonnet for rationale · {L}ms',
    'multi-model route · gpt-oss-20b for triage · {L}ms',
    'PRJ-{ID} · score {S} · branch {B} · high-priority',
    'PRJ-{ID} · score {S} · branch {B}',
    're-rank batch · {N} rows · branch {B}',
    'rationale generated · PRJ-{ID} · 4 evidence anchors',
    'distance-weighted scoring · {N} candidates within 50mi of branch {B}',
    'demoted PRJ-{ID} · stage too early · score {S}',
  ];
  const ADJACENT_LINES = [
    'researching multi-branch field-sales orgs · {N} candidates surfaced',
    'cross-poll edge re-eval · customer {CUST} ↔ opp PRJ-{ID} · {DIST}mi',
    'discovered warm-intro · {CUST} services TxDOT · branch HOU may close DAL opp',
    'enriching customer record · {CUST} · 3 new contacts found',
    'scheduled discovery sweep · 5 branches · runtime ~14m',
    'pruned candidate set · {N} below threshold · keeping {K}',
  ];

  const branchCodes = ['HOU', 'DAL', 'AUS', 'SAT', 'ELP'];
  function fill(line) {
    return line.replaceAll('{N}', 1 + Math.floor(Math.random() * 24))
               .replaceAll('{K}', 1 + Math.floor(Math.random() * 12))
               .replaceAll('{L}', 800 + Math.floor(Math.random() * 2400))
               .replaceAll('{C}', 1 + Math.floor(Math.random() * 6))
               .replaceAll('{S}', 60 + Math.floor(Math.random() * 35))
               .replaceAll('{V}', (1 + Math.random() * 12).toFixed(1))
               .replaceAll('{B}', branchCodes[Math.floor(Math.random() * branchCodes.length)])
               .replaceAll('{ID}', Math.random().toString(36).slice(2, 7).toUpperCase())
               .replaceAll('{CUST}', ['Sterling Industrial', 'Apex Mechanical', 'Cardinal Earthworks', 'Veritas Civil'][Math.floor(Math.random() * 4)])
               .replaceAll('{DIST}', 8 + Math.floor(Math.random() * 42));
  }
  function randAgentLine(forceAgent) {
    const r = Math.random();
    const agent = forceAgent || (r < 0.55 ? 'ingestor' : r < 0.85 ? 'ranker' : 'adjacent');
    const lines = agent === 'ingestor' ? INGESTOR_LINES
                : agent === 'ranker'   ? RANKER_LINES
                :                        ADJACENT_LINES;
    return { agent, text: fill(lines[Math.floor(Math.random() * lines.length)]) };
  }

  // Agent log feed tick
  setInterval(() => {
    const e = randAgentLine();
    pushLog({ ...e, ts: new Date() });
    // bump models when ranker speaks about routing
    if (e.agent === 'ranker' && e.text.includes('multi-model route')) {
      const m = e.text.match(/(claude-sonnet|gpt-oss-20b|claude-haiku|local-geocoder)/);
      if (m) bumpModel(m[1]);
    }
  }, 1400);

  // Agent state jitter — shift status / counters periodically
  setInterval(() => {
    // Ingestor: mostly running, sometimes idle for a beat
    const ingState = Math.random() < 0.85 ? 'running' : 'idle';
    patchAgent('ingestor', {
      status: ingState,
      lastCycleSec: Math.max(0, _agents.ingestor.lastCycleSec + Math.round((Math.random() - 0.55) * 30)),
      latMs: Math.max(800, _agents.ingestor.latMs + Math.round((Math.random() - 0.5) * 240)),
    });
    // Ranker: idle most of the time; flips to running when work is queued
    const rkState = Math.random() < 0.35 ? 'running' : 'idle';
    patchAgent('ranker', {
      status: rkState,
      lastCycleSec: Math.max(0, _agents.ranker.lastCycleSec + Math.round((Math.random() - 0.55) * 30)),
      latMs: Math.max(900, _agents.ranker.latMs + Math.round((Math.random() - 0.5) * 220)),
    });
    // Adjacent: stays scheduled, just nudges next-run countdown copy
    // (no jitter to status)
  }, 2400);

  // Pin lifecycle — Ingestor lands records (sonar) → Ranker scores existing pins (count-up only)
  let pinIdx = 0;
  setInterval(() => {
    const p = PROJECTS[pinIdx % PROJECTS.length];
    pinIdx++;
    // INGESTOR: pin arrival = sonar ping. NOT a re-score.
    markPinNew(p.id);
    pushLog({
      agent: 'ingestor',
      text: `landed ${p.id} · ${p.source} · ${p.dist}`,
      ts: new Date(),
    });
    bumpStat('total', 1);
    bumpIngest();
    patchAgent('ingestor', {
      recordsThisCycle: _agents.ingestor.recordsThisCycle + 1,
      recordsToday: _agents.ingestor.recordsToday + 1,
      status: 'running',
    });
  }, 2600);

  // Independent ranker tick — RANKER: score count-up only, no sonar
  setInterval(() => {
    const p = PROJECTS[Math.floor(Math.random() * PROJECTS.length)];
    markRanked(p.id);
    pushLog({
      agent: 'ranker',
      text: `scored ${p.id} · ${p.score}${p.hi ? ' · high-priority' : ''}`,
      ts: new Date(),
    });
    bumpStat('ranked', 1);
    if (p.hi) bumpStat('new', 1);
    patchAgent('ranker', {
      rankedThisCycle: _agents.ranker.rankedThisCycle + 1,
      rankedToday: _agents.ranker.rankedToday + 1,
      status: 'running',
      lastCycleSec: 0,
    });
    bumpModel(Math.random() < 0.6 ? 'claude-sonnet' : 'gpt-oss-20b');
  }, 4200);
}

// ─── Pulsing live dot ──────────────────────────────────────────────
function PulsingDot({ size = 6, color }) {
  const c = color || PF.hi;
  React.useEffect(() => {
    if (document.getElementById('pf-pulse-kf')) return;
    const s = document.createElement('style'); s.id = 'pf-pulse-kf';
    s.textContent = `
      @keyframes pf-pulse { 0%,100% { transform: scale(1); opacity: 1; }
                            50%      { transform: scale(1.18); opacity: 0.78; } }
      @keyframes pf-pulse-ring { 0% { transform: scale(0.8); opacity: 0.55; }
                                100% { transform: scale(2.4); opacity: 0; } }
      @keyframes pf-flash { 0% { background: ${PF.hiSoft}; }
                            100% { background: transparent; } }
      @keyframes pf-sonar { 0% { r: 4; opacity: 0.7; }
                           100% { r: 18; opacity: 0; } }
      .pf-flash-stat { animation: pf-flash 900ms ease-out; }
      .pf-blink { animation: pf-pulse 1200ms ease-in-out infinite; }
    `;
    document.head.appendChild(s);
  }, []);
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%', background: c,
        animation: 'pf-pulse 1200ms ease-in-out infinite',
      }} />
      <span style={{
        position: 'absolute', inset: -2, borderRadius: '50%',
        border: `1px solid ${c}`, opacity: 0.5,
        animation: 'pf-pulse-ring 1200ms ease-out infinite',
      }} />
    </span>
  );
}

// ─── Ticking 'last ingest · Xs ago' ─────────────────────────────────
function LastIngestCounter({ small }) {
  const lastTs = useLastIngest();
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    const id = setInterval(force, 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, Math.floor((Date.now() - lastTs) / 1000));
  const label = elapsed < 60 ? `${elapsed}s ago`
              : elapsed < 3600 ? `${Math.floor(elapsed/60)}m ${elapsed%60}s ago`
              : `${Math.floor(elapsed/3600)}h ago`;
  return (
    <span className="pf-mono" style={{
      fontSize: small ? 9 : 10, color: PF.inkDim,
      letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>
      Last ingest · <span style={{ color: PF.ink }}>{label}</span>
    </span>
  );
}

// ─── Agent Status row + Multi-model routing strip ──────────────────
// Replaces the old data-pipeline strip. Reads as "agent fleet view":
// three cells, one per Computer agent, each with status + 2-3 metrics.
// A thin model-routing line sits below.

function AgentStatusRow() {
  const agents = useAgents();
  const [collapsed, setCollapsed] = React.useState(false);
  // Constants: agent cells fixed at 92px; expanded model breakdown adds ~92px;
  // collapsed model line adds 28px. Total parent height includes both.
  const AGENTS_H = 64;
  const MODEL_H = collapsed ? 28 : 92;
  const TOTAL = AGENTS_H + MODEL_H;
  React.useEffect(() => {
    // 76 (top offset) + TOTAL + 16 gap = where dock/list should start
    _setHeaderHeight(76 + TOTAL + 16);
  }, [TOTAL]);
  return (
    <div style={{
      position: 'absolute', top: 76, left: 16, right: 16, height: TOTAL,
      background: PF.mapBg, border: `1px solid ${hexAlpha('#ffffff', 0.10)}`,
      borderRadius: PF.r.md, boxShadow: PF.shadow.sm,
      display: 'flex', flexDirection: 'column', zIndex: 4, overflow: 'hidden',
      transition: 'height 180ms ease',
    }}>
      <div style={{ height: AGENTS_H, display: 'flex', alignItems: 'stretch' }}>
        <AgentCell id="ingestor" data={agents.ingestor} showDivider={false} />
        <AgentCell id="ranker"   data={agents.ranker}   showDivider={true} />
        <AgentCell id="adjacent" data={agents.adjacent} showDivider={true} />
      </div>
      <ModelRoutingStrip collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
    </div>
  );
}

function AgentCell({ id, data, showDivider }) {
  const ag = AGENTS[id];
  const tint = agentTint(id);
  const isRunning = data.status === 'running';
  const metrics = metricsFor(id, data);

  return (
    <div style={{
      flex: 1, padding: '8px 16px',
      display: 'flex', flexDirection: 'column', gap: 4,
      position: 'relative', minWidth: 0,
    }}>
      {showDivider && (
        <span style={{
          position: 'absolute', left: 0, top: 12, bottom: 12,
          width: 1, background: 'rgba(255,255,255,0.10)',
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: isRunning ? (ag.tintKey ? tint : '#e6e9ef') : 'rgba(255,255,255,0.20)',
          boxShadow: isRunning ? `0 0 0 3px ${hexAlpha(ag.tintKey ? tint : '#e6e9ef', 0.18)}` : 'none',
          animation: isRunning ? 'pf-pulse 1200ms ease-in-out infinite' : 'none',
        }} />
        <span style={{
          font: `600 13px ${PF.sans}`,
          color: ag.tintKey ? tint : PF.mapInk,
          letterSpacing: '0.02em',
        }}>{ag.label}</span>
        <span style={{ flex: 1 }} />
        <StatusPill status={data.status} tint={ag.tintKey ? tint : null} />
      </div>
      <div style={{ display: 'flex', gap: 18, alignItems: 'baseline' }}>
        {metrics.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <span className="pf-mono" style={{
              fontSize: 13, color: PF.mapInk, lineHeight: 1.1,
              fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
            }}>{m.value}</span>
            <span className="pf-mono" style={{
              fontSize: 8.5, color: PF.mapInkDim,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function metricsFor(id, d) {
  if (id === 'ingestor') {
    return [
      { label: 'last cycle', value: fmtAgo(d.lastCycleSec) },
      { label: 'records',    value: d.recordsThisCycle },
      { label: 'avg lat',    value: (d.latMs / 1000).toFixed(1) + 's' },
    ];
  }
  if (id === 'ranker') {
    return [
      { label: 'last run',   value: fmtAgo(d.lastCycleSec) },
      { label: 'ranked today', value: d.rankedToday },
      { label: 'avg lat',    value: (d.latMs / 1000).toFixed(1) + 's' },
    ];
  }
  // adjacent
  return [
    { label: 'next run', value: d.nextRunLabel },
    { label: 'targets / wk', value: d.targetsLastWeek },
  ];
}

function fmtAgo(sec) {
  if (sec < 0) return '—';
  if (sec < 60) return sec + 's';
  if (sec < 3600) return Math.floor(sec / 60) + 'm';
  return Math.floor(sec / 3600) + 'h';
}

function StatusPill({ status, tint }) {
  const map = {
    running:   { color: tint || PF.mapInk, label: 'RUNNING' },
    idle:      { color: PF.mapInkDim,      label: 'IDLE'    },
    scheduled: { color: PF.mapInkDim,      label: 'SCHEDULED' },
    failed:    { color: '#f87171',         label: 'FAILED'  },
  };
  const m = map[status] || map.idle;
  return (
    <span className="pf-mono" style={{
      fontSize: 9, color: m.color,
      letterSpacing: '0.10em', textTransform: 'uppercase',
    }}>{m.label}</span>
  );
}

function ModelRoutingStrip({ collapsed = false, onToggle }) {
  const { models, avgMs, ranked } = useModels();
  // Build rows from MODEL_META, skip zero calls, sort cheapest → most expensive
  const rows = Object.entries(MODEL_META)
    .map(([name, meta]) => {
      const calls = models[name] || 0;
      return { name, ...meta, calls, cost: calls * meta.costPerCall };
    })
    .filter(r => r.calls > 0)
    .sort((a, b) => a.costPerCall - b.costPerCall);
  const totalCalls = rows.reduce((s, r) => s + r.calls, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const cpl = ranked > 0 ? totalCost / ranked : 0;
  const fmtCost = (n) => n === 0 ? '$0.00' : `$${n.toFixed(n < 0.01 ? 4 : 2)}`;

  // Toggle button — visible labeled control in the top-right of the strip.
  const Chev = (
    <button onClick={onToggle} title={collapsed ? 'Expand routing detail' : 'Collapse routing detail'} style={{
      background: hexAlpha('#ffffff', 0.06),
      border: `1px solid ${hexAlpha('#ffffff', 0.10)}`,
      cursor: 'pointer',
      color: PF.mapInk, font: `500 9px ${PF.mono}`,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: 3,
      lineHeight: 1, flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {collapsed ? 'expand' : 'collapse'}
      <span style={{ fontSize: 10, lineHeight: 1 }}>{collapsed ? '▾' : '▴'}</span>
    </button>
  );

  if (collapsed) {
    // ─── Single line: PERPLEXITY AGENTS · model1 124 · model2 71 · ... · TOTAL · $0.0029/lead
    return (
      <div style={{
        height: 28, padding: '0 12px 0 16px',
        borderTop: `1px solid ${hexAlpha('#ffffff', 0.06)}`,
        background: hexAlpha('#000000', 0.18),
        display: 'flex', alignItems: 'center', gap: 14,
        overflow: 'hidden', whiteSpace: 'nowrap',
      }}>
        {rows.map(r => (
          <span key={r.name} className="pf-mono" style={{
            fontSize: 10, color: PF.mapInk, letterSpacing: '0.01em',
            lineHeight: 1, flexShrink: 0,
          }}>
            {r.name} <span style={{ color: PF.mapInkDim, marginLeft: 3 }}>{r.calls}</span>
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <span className="pf-mono" style={{
          fontSize: 9, color: PF.mapInkDim, letterSpacing: '0.06em',
          textTransform: 'uppercase', lineHeight: 1, flexShrink: 0,
        }}>
          total <span style={{ color: PF.mapInk, marginLeft: 4 }}>{fmtCost(totalCost)}</span>
          <span style={{ marginLeft: 8 }}>·</span>
          <span style={{ marginLeft: 8, color: PF.mapInk, fontVariantNumeric: 'tabular-nums' }}>{fmtCost(cpl)}</span>
          <span style={{ marginLeft: 4 }}>per lead</span>
        </span>
        {Chev}
      </div>
    );
  }

  // ─── Expanded breakdown ─────────────────────────────────────────
  return (
    <div style={{
      padding: '8px 12px 10px 16px',
      borderTop: `1px solid ${hexAlpha('#ffffff', 0.06)}`,
      background: hexAlpha('#000000', 0.18),
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="pf-mono" style={{
          fontSize: 8.5, color: PF.mapInkDim, letterSpacing: '0.10em',
          textTransform: 'uppercase', lineHeight: 1, flexShrink: 0,
        }}>perplexity agents · last hour</span>
        <span style={{ flex: 1 }} />
        <span className="pf-mono" style={{
          fontSize: 8.5, color: PF.mapInkDim, letterSpacing: '0.06em',
          textTransform: 'uppercase', lineHeight: 1, flexShrink: 0,
        }}>avg routing · <span style={{ color: PF.mapInk }}>{(avgMs / 1000).toFixed(1)}s</span></span>
        {Chev}
      </div>

      {/* Model rows: name | purpose | calls (right) | cost (right) */}
      {rows.map(r => (
        <div key={r.name} style={{
          display: 'grid',
          gridTemplateColumns: '128px 1fr 72px 64px',
          columnGap: 12, alignItems: 'baseline',
          font: `400 10px ${PF.mono}`, color: PF.mapInk,
          letterSpacing: '0.01em', lineHeight: 1.3,
        }}>
          <span style={{ color: PF.mapInk }}>{r.name}</span>
          <span style={{ color: PF.mapInkDim }}>· {r.purpose}</span>
          <span style={{ color: PF.mapInk, textAlign: 'right' }}>
            {r.calls} <span style={{ color: PF.mapInkDim }}>calls</span>
          </span>
          <span style={{ color: PF.mapInk, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {fmtCost(r.cost)}
          </span>
        </div>
      ))}

      {/* Footer total */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '128px 1fr 72px 64px',
        columnGap: 12, alignItems: 'baseline',
        font: `500 10px ${PF.mono}`,
        letterSpacing: '0.04em', textTransform: 'uppercase',
        lineHeight: 1.3, marginTop: 2,
        paddingTop: 4, borderTop: `1px dashed ${hexAlpha('#ffffff', 0.08)}`,
      }}>
        <span style={{ color: PF.mapInkDim }}>total</span>
        <span style={{ color: PF.mapInkDim }}>· {fmtCost(cpl)} per ranked lead</span>
        <span style={{ color: PF.mapInk, textAlign: 'right' }}>
          {totalCalls}
        </span>
        <span style={{ color: PF.mapInk, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {fmtCost(totalCost)}
        </span>
      </div>
    </div>
  );
}

// ─── Activity log rail (right of project list, bottom drawer) ──────
const _railSubs = new Set();
function _setRailHeight(h) {
  window.__pfActivityHeight = h;
  _railSubs.forEach(fn => fn(h));
}
function useRailHeight() {
  const [v, setV] = React.useState(window.__pfActivityHeight || 52);
  React.useEffect(() => { _railSubs.add(setV); return () => _railSubs.delete(setV); }, []);
  return v;
}

// ─── Header (agent row + model strip) total height publisher ───────
// Dock & project list read this so they sit just below the header.
const _headerSubs = new Set();
function _setHeaderHeight(h) {
  window.__pfHeaderHeight = h;
  _headerSubs.forEach(fn => fn(h));
}
function useHeaderHeight() {
  const [v, setV] = React.useState(window.__pfHeaderHeight || 184);
  React.useEffect(() => { _headerSubs.add(setV); return () => _headerSubs.delete(setV); }, []);
  return v;
}

function ActivityRail({ open, setOpen }) {
  const log = useLog();
  React.useEffect(() => {
    _setRailHeight(open ? 216 : 52); // panel height + 16 gap
  }, [open]);

  const lastLine = log[0]
    ? `computer/${log[0].agent} · ${log[0].text}`
    : '—';

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        position: 'absolute', right: 16, bottom: 16, width: 380, height: 36,
        padding: '0 14px',
        background: PF.bg, border: `1px solid ${PF.ruleSoft}`,
        borderRadius: PF.r.md, boxShadow: PF.shadow.sm,
        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', zIndex: 4,
        textAlign: 'left',
      }}>
        <PulsingDot color={PF.warm} />
        <span className="pf-label" style={{ color: PF.ink, flexShrink: 0 }}>Agent log</span>
        <span className="pf-mono" style={{
          fontSize: 10, color: PF.inkDim,
          flex: 1, minWidth: 0, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {lastLine}
        </span>
        <span className="pf-mono" style={{ fontSize: 11, color: PF.inkDim, flexShrink: 0 }}>↑</span>
      </button>
    );
  }

  return (
    <div style={{
      position: 'absolute', left: 16, right: 16, bottom: 16, height: 200,
      background: PF.bg, border: `1px solid ${PF.ruleSoft}`,
      borderRadius: PF.r.md, boxShadow: PF.shadow.md,
      display: 'flex', flexDirection: 'column', zIndex: 5,
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${PF.ruleSoft}`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <PulsingDot color={PF.warm} />
        <span className="pf-label" style={{ color: PF.ink }}>Agent log</span>
        <span className="pf-mono" style={{ fontSize: 10, color: PF.inkDim }}>
          tail -f /computer/agent_log · {log.length} events buffered
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <LastIngestCounter small />
          <button onClick={() => setOpen(false)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: PF.inkDim, font: `500 14px ${PF.mono}`, padding: '0 4px',
          }}>↓</button>
        </span>
      </div>
      <div className="pf-scrollbar" style={{
        flex: 1, overflowY: 'auto', padding: '8px 14px',
        font: `400 11px/1.55 ${PF.mono}`, color: PF.ink,
      }}>
        {log.map((e, i) => {
          const tint = agentTint(e.agent);
          const ag = AGENTS[e.agent];
          // Mono-ink agents (adjacent) get a subtle dim treatment so they
          // still read as a tagged agent, just without a hue claim.
          const prefixColor = ag && ag.tintKey ? tint : PF.inkSub;
          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '78px 158px 1fr',
              columnGap: 12, padding: '2px 0',
              opacity: i === 0 ? 1 : Math.max(0.45, 1 - i * 0.018),
            }}>
              <span style={{ color: PF.inkDim }}>{fmtClock(e.ts)}</span>
              <span style={{ color: prefixColor, fontWeight: 500, opacity: 0.85, letterSpacing: '0.01em' }}>
                computer/{e.agent} →
              </span>
              <span style={{ color: PF.ink }}>{e.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtClock(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// ─── Tick-and-flash stat (replacement for Stat) ────────────────────
function LiveStat({ label, valueKey, accent, muted }) {
  const { stats, bumped } = useStats();
  const value = stats[valueKey];
  const ts = bumped[valueKey];
  const flashing = ts && (Date.now() - ts < 900);
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    if (!flashing) return;
    const id = setTimeout(force, 950);
    return () => clearTimeout(id);
  }, [ts]);

  const fmt = (n) => n.toLocaleString();
  // Reserve a fixed slot per stat; widest expected value pads to ~5 chars (e.g. "9,999").
  const SLOT = { new: 56, total: 70, ranked: 56, err: 40 }[valueKey] || 56;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end',
      width: SLOT, flexShrink: 0,
    }}>
      <span className="pf-num" style={{
        display: 'inline-block', textAlign: 'right',
        color: muted ? PF.inkFaint : PF.ink,
        fontSize: 16, lineHeight: '20px',
        background: flashing ? PF.hiSoft : 'transparent',
        borderRadius: 2,
        boxShadow: flashing ? `0 0 0 4px ${PF.hiSoft}` : 'none',
        transition: 'background 300ms ease-out, box-shadow 300ms ease-out',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}>
        {fmt(value)}
        {accent === 'hi' && <span style={{ color: PF.hi, marginLeft: 4 }}>↑</span>}
      </span>
      <span className="pf-label" style={{ fontSize: 9 }}>{label}</span>
    </div>
  );
}

// ─── Sonar ping (SVG, for new pin) ─────────────────────────────────
function SonarPing({ x, y, color }) {
  return (
    <circle cx={x} cy={y} r="4" fill="none" stroke={color || PF.hi} strokeWidth="1">
      <animate attributeName="r" from="3" to="22" dur="700ms" fill="freeze" />
      <animate attributeName="opacity" from="0.75" to="0" dur="700ms" fill="freeze" />
    </circle>
  );
}

// ─── Count-up score chip ───────────────────────────────────────────
function CountUpScore({ target, hi, warm, durationMs = 600 }) {
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    const start = performance.now();
    const num = parseInt(target, 10) || 0;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(Math.round(num * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  const color = warm ? PF.warm : (hi ? PF.hi : PF.ink);
  const bg = warm ? PF.warmSoft : (hi ? PF.hiSoft : 'transparent');
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 7px', borderRadius: 3,
      background: bg,
    }}>
      <span style={{ font: `600 12px ${PF.mono}`, color: PF.ink, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </span>
  );
}

// ─── Typewriter (one-shot, character-by-character) ─────────────────
function Typewriter({ text, charsPerSec = 50, onDone }) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    setN(0);
    const stepMs = 1000 / charsPerSec;
    let id = setInterval(() => {
      setN(prev => {
        if (prev >= text.length) { clearInterval(id); onDone && onDone(); return prev; }
        return prev + 1;
      });
    }, stepMs);
    return () => clearInterval(id);
  }, [text]);
  const done = n >= text.length;
  return (
    <span>
      {text.slice(0, n)}
      {!done && (
        <span style={{
          display: 'inline-block', width: 7, height: '1em', verticalAlign: '-2px',
          background: PF.ink, marginLeft: 1, animation: 'pf-pulse 600ms ease-in-out infinite',
        }} />
      )}
    </span>
  );
}

// ─── public surface ────────────────────────────────────────────────
window.PFLive = {
  AGENTS, agentTint,
  startSim, pushLog, bumpStat, bumpIngest, markPinNew, markRanked, bumpModel,
  isFirstOpen, markSeen,
  useLog, useAgents, useModels, useNewPins, useJustRanked, useLastIngest, useStats, useRailHeight, useHeaderHeight,
  PulsingDot, LastIngestCounter, AgentStatusRow, ModelRoutingStrip, ActivityRail,
  LiveStat, SonarPing, CountUpScore, Typewriter,
};
