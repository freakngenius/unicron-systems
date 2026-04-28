// hifi-shell.jsx — The Pathfinder hi-fi dashboard.
// Map-forward (full-bleed) + anchored branch card + centered modal + cross-poll dim mode.

const { BRANCHES, CUSTOMERS, PROJECTS } = window.PFData;

// ─── Top bar (floating) ────────────────────────────────────────────
function TopBar({ source, setSource, crossPoll, setCrossPoll, stats }) {
  const sources = ['all', 'usa', 'sam', 'news', 'harris'];
  const labels = { all: 'All sources', usa: 'USAspending', sam: 'SAM.gov', news: 'Google News', harris: 'Harris Co.' };
  return (
    <div style={{
      position: 'absolute', top: 16, left: 16, right: 16, height: 52,
      background: PF.bg, border: `1px solid ${PF.ruleSoft}`,
      borderRadius: PF.r.md, boxShadow: PF.shadow.md,
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16, zIndex: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 22, height: 22, background: PF.ink, borderRadius: 3, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 4, border: `1.5px solid ${PF.bg}`, borderRadius: 1 }} />
          <div style={{ position: 'absolute', left: 9, top: 9, width: 4, height: 4, background: PF.hi, borderRadius: 1 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, whiteSpace: 'nowrap' }}>
          <div className="pf-h2" style={{ letterSpacing: '-0.01em', lineHeight: 1.1 }}>Pathfinder: Zedcore</div>
          <div className="pf-mono" style={{ fontSize: 9.5, color: PF.inkDim, letterSpacing: '0.04em', lineHeight: 1 }}>Powered by Unicron</div>
        </div>
      </div>
      <div style={{ width: 1, height: 24, background: PF.ruleSoft }} />
      <div className="pf-label">Sources</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {sources.map(s => (
          <button key={s} className={`pf-pill ${source === s ? 'pf-pill-active' : ''}`}
                  onClick={() => setSource(s)}>{labels[s]}</button>
        ))}
      </div>
      <div style={{ width: 1, height: 24, background: PF.ruleSoft }} />
      <button className={`pf-pill ${crossPoll ? 'pf-pill-warm' : ''}`}
              onClick={() => setCrossPoll(!crossPoll)}>
        <span style={{ width: 6, height: 6, borderRadius: 1, background: crossPoll ? PF.warm : PF.inkFaint,
                       transform: 'rotate(45deg)', display: 'inline-block' }} />
        {crossPoll ? 'Cross-pollination · ON' : 'Cross-pollination'}
      </button>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
        <window.PFLive.LiveStat label="New · 24h" valueKey="new" accent="hi" />
        <window.PFLive.LiveStat label="Tracked"   valueKey="total" />
        <window.PFLive.LiveStat label="Ranked"    valueKey="ranked" />
        <window.PFLive.LiveStat label="Errors"    valueKey="err" muted />
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, borderLeft: `1px solid ${PF.ruleSoft}` }}>
          <window.PFLive.PulsingDot color={PF.warm} />
          <span className="pf-label">Live</span>
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, muted }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
      <span className="pf-num" style={{
        color: muted ? PF.inkFaint : PF.ink,
        fontSize: 16,
      }}>
        {value}
        {accent === 'hi' && <span style={{ color: PF.hi, marginLeft: 4 }}>↑</span>}
      </span>
      <span className="pf-label" style={{ fontSize: 9 }}>{label}</span>
    </div>
  );
}

// ─── Branch dock (left, floating) ──────────────────────────────────
function BranchDock({ selected, setSelected, minimized, setMinimized }) {
  const headerH = window.PFLive.useHeaderHeight();
  if (minimized) {
    return (
      <button onClick={() => setMinimized(false)}
        title="Expand branches"
        style={{
          position: 'absolute', left: 16, top: headerH, width: 44,
          background: PF.bg, border: `1px solid ${PF.ruleSoft}`,
          borderRadius: PF.r.md, boxShadow: PF.shadow.sm,
          padding: '14px 0', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 12, cursor: 'pointer', zIndex: 4,
        }}>
        <span style={{
          font: `500 10px ${PF.mono}`, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: PF.ink,
          writingMode: 'vertical-rl', transform: 'rotate(180deg)',
        }}>Branches · 5</span>
        <span className="pf-mono" style={{ fontSize: 10, color: PF.inkDim }}>›</span>
      </button>
    );
  }
  return (
    <div style={{
      position: 'absolute', left: 16, top: headerH, bottom: 16, width: 240,
      background: PF.bg, border: `1px solid ${PF.ruleSoft}`,
      borderRadius: PF.r.md, boxShadow: PF.shadow.sm,
      display: 'flex', flexDirection: 'column', zIndex: 4,
    }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${PF.ruleSoft}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="pf-label">Branches</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pf-mono" style={{ fontSize: 11, color: PF.inkDim }}>n=5</span>
          <button onClick={() => setMinimized(true)} title="Minimize" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: PF.inkDim, font: `500 14px ${PF.mono}`, padding: '0 4px', lineHeight: 1,
          }}>‹</button>
        </span>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }} className="pf-scrollbar">
        {BRANCHES.map(b => {
          const active = selected === b.id;
          return (
            <button key={b.id}
              onClick={() => setSelected(b.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '12px 16px', border: 'none',
                background: active ? PF.ink : 'transparent',
                color: active ? 'white' : PF.ink,
                borderBottom: `1px solid ${PF.ruleHair}`,
                cursor: 'pointer',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ font: `600 13px ${PF.sans}` }}>{b.name}</span>
                <span className="pf-mono" style={{ fontSize: 13, fontWeight: 600,
                       color: active ? 'white' : PF.ink }}>{b.count}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span className="pf-mono" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
                       color: active ? 'rgba(255,255,255,0.55)' : PF.inkDim }}>
                  {b.id} · {b.region}
                </span>
                {b.hi > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                                 font: `600 9.5px ${PF.mono}`, letterSpacing: '0.06em', textTransform: 'uppercase',
                                 color: active ? PF.hi : PF.ink,
                                 padding: '2px 6px', borderRadius: 2,
                                 background: active ? 'rgba(34,211,238,0.18)' : PF.hiSoft }}>
                    {b.hi} hi-pri
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${PF.ruleSoft}` }}>
        <window.PFLive.LastIngestCounter small />
      </div>
    </div>
  );
}

// ─── Project list (right, floating) ────────────────────────────────
function ProjectList({ branchId, projects, onOpen, crossPoll, minimized, setMinimized }) {
  const headerH = window.PFLive.useHeaderHeight();
  const branch = BRANCHES.find(b => b.id === branchId);
  if (minimized) {
    const title = crossPoll ? 'Warm-intros' : `${branch.name} · Ranked`;
    return (
      <button onClick={() => setMinimized(false)}
        title="Expand project list"
        style={{
          position: 'absolute', right: 16, top: headerH, width: 44,
          background: PF.bg, border: `1px solid ${PF.ruleSoft}`,
          borderRadius: PF.r.md, boxShadow: PF.shadow.sm,
          padding: '14px 0', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 12, cursor: 'pointer', zIndex: 4,
        }}>
        <span className="pf-mono" style={{ fontSize: 10, color: PF.inkDim }}>‹</span>
        <span style={{
          font: `500 10px ${PF.mono}`, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: PF.ink,
          writingMode: 'vertical-rl',
        }}>{title} · {projects.length}</span>
      </button>
    );
  }
  return (
    <div style={{
      position: 'absolute', right: 16, top: headerH, bottom: 16, width: 380,
      background: PF.bg, border: `1px solid ${PF.ruleSoft}`,
      borderRadius: PF.r.md, boxShadow: PF.shadow.sm,
      display: 'flex', flexDirection: 'column', zIndex: 4,
    }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${PF.ruleSoft}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="pf-label">{crossPoll ? 'Warm-intros' : `${branch.name} · ranked`}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="pf-mono" style={{ fontSize: 11, color: PF.inkDim }}>
              {crossPoll ? `${projects.length} candidates` : `${projects.length} of 28`}
            </span>
            <button onClick={() => setMinimized(true)} title="Minimize" style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: PF.inkDim, font: `500 14px ${PF.mono}`, padding: '0 4px', lineHeight: 1,
            }}>›</button>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button className="pf-pill pf-pill-active">Score</button>
          <button className="pf-pill">Distance</button>
          <button className="pf-pill">Posted</button>
        </div>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }} className="pf-scrollbar">
        {projects.map((p, i) => (
          <ProjectRow key={p.id} p={p} onOpen={() => onOpen(p)} crossPoll={crossPoll} />
        ))}
      </div>
    </div>
  );
}

function ProjectRow({ p, onOpen, crossPoll }) {
  const showWarm = crossPoll && p.warmFor;
  const justRanked = window.PFLive.useJustRanked();
  const isRanked = justRanked.has(p.id);
  return (
    <button onClick={onOpen}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '14px 16px', border: 'none',
        borderBottom: `1px solid ${PF.ruleHair}`,
        background: 'transparent', cursor: 'pointer',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = PF.bgAlt}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span className="pf-mono" style={{ fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: PF.inkDim }}>
          {p.source} · {p.dist}
        </span>
        {isRanked
          ? <window.PFLive.CountUpScore target={p.score} hi={p.hi} warm={showWarm} />
          : <ScoreChip value={p.score} hi={p.hi} warm={showWarm} />}
      </div>
      <div style={{ font: `500 13px/1.35 ${PF.sans}`, color: PF.ink }}>{p.title}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        <span style={{ font: `500 10px ${PF.mono}`, color: PF.inkDim, padding: '2px 6px',
                       background: PF.bgAlt, borderRadius: 2 }}>{p.stage}</span>
        <span className="pf-mono" style={{ fontSize: 10, color: PF.inkDim }}>{p.value}</span>
        {showWarm && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
                         font: `600 9.5px ${PF.mono}`, letterSpacing: '0.06em', textTransform: 'uppercase',
                         color: PF.ink, padding: '2px 6px', borderRadius: 2,
                         background: PF.warmSoft }}>
            <span style={{ width: 5, height: 5, background: PF.warm, transform: 'rotate(45deg)' }} />
            warm
          </span>
        )}
      </div>
    </button>
  );
}

function ScoreChip({ value, hi, warm }) {
  const color = warm ? PF.warm : (hi ? PF.hi : PF.ink);
  const bg = warm ? PF.warmSoft : (hi ? PF.hiSoft : 'transparent');
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 7px', borderRadius: 3,
      background: bg,
    }}>
      <span style={{ font: `600 12px ${PF.mono}`, color: PF.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </span>
  );
}

// ─── Anchored branch card on the map ───────────────────────────────
function AnchoredBranchCard({ branch, anchorPx, mapDims }) {
  // Position card next to branch pin in DOM space (over the SVG)
  const offset = { x: 28, y: -72 };
  const left = anchorPx.x + offset.x;
  const top = anchorPx.y + offset.y;
  return (
    <div style={{
      position: 'absolute', left, top, width: 240,
      background: PF.bg, border: `1px solid ${PF.ink}`,
      borderRadius: PF.r.md, boxShadow: PF.shadow.lg,
      padding: 14, zIndex: 3,
    }}>
      {/* tail line back to pin */}
      <div style={{ position: 'absolute', left: -offset.x + 1, top: -offset.y - 2,
                    width: offset.x - 1, height: 1, background: PF.ink }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="pf-label">{branch.id} · {branch.region}</span>
        <span className="pf-mono" style={{ fontSize: 9, color: PF.inkDim }}>SELECTED</span>
      </div>
      <div className="pf-h1" style={{ fontSize: 20, marginTop: 4 }}>{branch.name}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12,
                    paddingTop: 12, borderTop: `1px solid ${PF.ruleSoft}` }}>
        <Metric value={branch.count} label="In range" />
        <Metric value={branch.hi}    label="Hi-pri" accent={branch.hi > 0 ? 'hi' : null} />
        <Metric value={CUSTOMERS.filter(c => c.branch === branch.id).length} label="Customers" />
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${PF.ruleSoft}`,
                    display: 'flex', justifyContent: 'space-between' }}>
        <span className="pf-label" style={{ fontSize: 9 }}>Coverage</span>
        <span className="pf-mono" style={{ fontSize: 10, color: PF.ink }}>300 mi · {branch.lat.toFixed(2)}°N {Math.abs(branch.lon).toFixed(2)}°W</span>
      </div>
    </div>
  );
}

function Metric({ value, label, accent }) {
  const color = accent === 'hi' ? PF.hi : (accent === 'warm' ? PF.warm : PF.ink);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span className="pf-num" style={{ fontSize: 18, color, lineHeight: 1 }}>{value}</span>
      <span className="pf-label" style={{ fontSize: 9 }}>{label}</span>
    </div>
  );
}

// ─── Map legend (bottom-left, floating) ────────────────────────────
function MapLegend({ crossPoll }) {
  return (
    <div style={{
      position: 'absolute', left: 272, bottom: 16,
      background: PF.bg, border: `1px solid ${PF.ruleSoft}`,
      borderRadius: PF.r.md, boxShadow: PF.shadow.sm,
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 18, zIndex: 4,
    }}>
      <LegendItem swatch={<span style={{ width: 10, height: 10, background: PF.ink, border: `1.5px solid ${PF.bg}`, outline: `1px solid ${PF.ink}` }} />} label="Branch" />
      <LegendItem swatch={<span style={{ width: 7, height: 7, background: PF.inkDim, borderRadius: '50%' }} />} label="Project" />
      <LegendItem swatch={<span style={{ width: 9, height: 9, background: PF.hi, borderRadius: '50%' }} />} label="High-priority" color={PF.hi} />
      {crossPoll && (
        <>
          <LegendItem swatch={<span style={{ width: 7, height: 7, border: `1px solid ${PF.warm}`, borderRadius: '50%' }} />} label="Customer" color={PF.warm} />
          <LegendItem swatch={<span style={{ width: 9, height: 9, background: PF.warm, transform: 'rotate(45deg)' }} />} label="Warm-intro" color={PF.warm} />
        </>
      )}
    </div>
  );
}

function LegendItem({ swatch, label, color }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {swatch}
      <span className="pf-label" style={{ fontSize: 9, color: color || PF.inkDim }}>{label}</span>
    </span>
  );
}

// ─── Coordinates HUD (bottom-right of map) ─────────────────────────
function CoordsHUD({ branch, crossPoll }) {
  return (
    <div style={{
      position: 'absolute', right: 412, bottom: 16,
      background: 'rgba(14,17,22,0.85)',
      backdropFilter: 'blur(6px)',
      border: `1px solid rgba(255,255,255,0.08)`,
      borderRadius: PF.r.md,
      padding: '8px 12px',
      font: `500 10px ${PF.mono}`, letterSpacing: '0.06em',
      color: PF.mapInkDim, zIndex: 4,
    }}>
      <span style={{ color: PF.mapInk }}>{branch.lat.toFixed(4)}°N {Math.abs(branch.lon).toFixed(4)}°W</span>
      <span style={{ margin: '0 10px', color: 'rgba(255,255,255,0.2)' }}>│</span>
      <span>ZOOM 5</span>
    </div>
  );
}

// ─── Project Detail Modal (centered, per brief) ────────────────────
function ProjectModal({ p, onClose }) {
  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const railH = window.PFLive.useRailHeight();

  if (!p) return null;
  const branch = BRANCHES.find(b => b.id === p.branch);
  const rationale = "High match. Project type (perimeter security, vehicle barriers, surveillance camera array) maps directly to Zedcor capability matrix items 3.1, 3.4, 4.2. Stage is active RFP — bids close 2026-05-30. Distance well within HOU-002 service radius (300mi). Adjacent to existing customer Memorial Hermann (12mi) — possible mobilization synergy.";
  const hook = "Reach out to TxDOT District 12 procurement (Karen Nguyen, named contact in source) within 48h. Lead with Zedcor's prior I-10 corridor work (2024) — analogous scope, completed 9 days ahead of schedule. Request pre-bid site walk before May 8.";

  return (
    <>
      <div onClick={onClose} style={{
        position: 'absolute', left: 0, right: 0, top: 0, bottom: railH,
        background: 'rgba(10,10,10,0.45)',
        backdropFilter: 'blur(4px)', zIndex: 50,
      }} />
      <div style={{
        position: 'absolute', left: '50%',
        top: '50%', transform: `translate(-50%, calc(-50% - ${railH/2}px))`,
        width: 720, maxHeight: `calc(100vh - 80px - ${railH}px)`,
        background: PF.bg, border: `1px solid ${PF.ink}`,
        borderRadius: PF.r.lg, boxShadow: PF.shadow.lg,
        display: 'flex', flexDirection: 'column', zIndex: 51, overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${PF.ruleSoft}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ScoreChip value={p.score} hi={p.hi} />
                <span className="pf-label" style={{ color: PF.hi }}>● High-priority</span>
                <span className="pf-label">·</span>
                <span className="pf-label">{branch.id} · {p.dist}</span>
              </div>
              <div className="pf-h1" style={{ fontSize: 22, marginTop: 8, lineHeight: 1.2 }}>{p.title}</div>
              <div className="pf-mono" style={{ fontSize: 10.5, color: PF.inkDim, marginTop: 6, letterSpacing: '0.04em' }}>
                SOL-2026-04-TxDOT-001 · {p.source} · posted {p.posted}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: PF.bgAlt, border: 'none',
              borderRadius: 4, width: 28, height: 28, cursor: 'pointer',
              color: PF.inkDim, font: `400 14px ${PF.sans}`,
            }}>✕</button>
          </div>
        </div>

        {/* Metrics row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                      borderBottom: `1px solid ${PF.ruleSoft}`, background: PF.bgAlt }}>
          {[
            ['Value',    p.value, null],
            ['Stage',    p.stage + ' — open', null],
            ['Distance', p.dist, null],
            ['Bids close', '2026-05-30', PF.hi],
          ].map(([label, value, accent], i) => (
            <div key={label} style={{
              padding: '14px 20px',
              borderRight: i < 3 ? `1px solid ${PF.ruleSoft}` : 'none',
            }}>
              <span className="pf-label" style={{ fontSize: 9 }}>{label}</span>
              <div className="pf-num" style={{ fontSize: 16, marginTop: 4, color: accent || PF.ink }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18,
                      overflowY: 'auto' }} className="pf-scrollbar">
          <Section title="Claude rationale" sub="model: claude-sonnet · 04:12 UTC" accent="hi">
            <p className="pf-body" style={{ margin: 0, color: PF.ink }}>
              {window.PFLive.isFirstOpen(p.id)
                ? <window.PFLive.Typewriter text={rationale} charsPerSec={55} onDone={() => window.PFLive.markSeen(p.id)} />
                : rationale}
            </p>
          </Section>

          <Section title="Recommended outreach" sub="generated · approve before sending">
            <p className="pf-body" style={{ margin: 0, color: PF.ink }}>{hook}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="pf-btn">Copy as draft</button>
              <button className="pf-btn-ghost">Mark not relevant</button>
            </div>
          </Section>

          <Section title="Source record" sub={p.source}>
            <a href="#" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              font: `500 12px ${PF.mono}`, color: PF.ink, textDecoration: 'none',
              padding: '6px 10px', background: PF.bgAlt, borderRadius: 3,
            }}>↗ sam.gov/opp/SOL-2026-04-TxDOT-001</a>
          </Section>

          <details style={{ paddingTop: 8, borderTop: `1px solid ${PF.ruleSoft}` }}>
            <summary style={{ cursor: 'pointer', font: `500 11px ${PF.mono}`,
                              letterSpacing: '0.06em', textTransform: 'uppercase', color: PF.inkDim,
                              listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 10 }}>▾</span>
              Raw payload (jsonb)
            </summary>
            <pre style={{
              margin: '10px 0 0', padding: 12, background: PF.bgAlt,
              borderRadius: 4,
              font: `400 10.5px/1.55 ${PF.mono}`, color: PF.inkSub,
              overflow: 'auto', maxHeight: 200,
            }} className="pf-scrollbar">{`{
  "source_id": "SOL-2026-04-TxDOT-001",
  "agency": "Texas Department of Transportation",
  "naics": ["561621", "238290"],
  "place_of_performance": { "state": "TX", "county": "Harris" },
  "amount": 4200000,
  "response_due": "2026-05-30T17:00:00Z",
  "set_aside": null
}`}</pre>
          </details>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${PF.ruleSoft}`,
                      background: PF.bgAlt, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="pf-label" style={{ fontSize: 9 }}>ESC to close · ←/→ to navigate</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pf-btn-ghost">Previous</button>
            <button className="pf-btn">Open in workspace</button>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ title, sub, accent, children }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {accent === 'hi' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: PF.hi }} />}
          <span className="pf-label" style={{ color: PF.ink, fontSize: 10 }}>{title}</span>
        </span>
        {sub && <span className="pf-label" style={{ fontSize: 9 }}>{sub}</span>}
      </div>
      <div style={{
        padding: 14, background: accent === 'hi' ? PF.hiSoft : PF.bgAlt,
        borderRadius: PF.r.md,
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Cross-poll banner (shown when mode is on) ─────────────────────
function CrossPollBanner({ count }) {
  return (
    <div style={{
      position: 'absolute', left: 272, right: 412, bottom: 64,
      background: 'rgba(14,17,22,0.92)',
      backdropFilter: 'blur(6px)',
      border: `1px solid ${PF.warm}`,
      borderRadius: PF.r.md, padding: '8px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 4,
      boxShadow: PF.shadow.sm,
    }}>
      <span style={{ width: 8, height: 8, background: PF.warm, transform: 'rotate(45deg)', flexShrink: 0 }} />
      <span className="pf-mono" style={{ fontSize: 11, color: '#f5efe0', letterSpacing: '0.02em', textAlign: 'center' }}>
        {count} warm-intro candidates · customers within 50mi of an opportunity served by another branch
      </span>
    </div>
  );
}

window.PFShell = {
  TopBar, BranchDock, ProjectList, AnchoredBranchCard,
  MapLegend, CoordsHUD, ProjectModal, CrossPollBanner,
};
