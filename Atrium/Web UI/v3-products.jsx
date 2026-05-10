/* v3-products.jsx — Products tab full content. Mounted from v3.jsx. */

const V3_TENANTS = [
  { name: "Zedcor",      status: "active",     mrr: "$0 (pilot)", leads: 412, runs: 187, contact: "Mara K"  },
  { name: "Realberry",   status: "onboarding", mrr: "—",          leads: 38,  runs: 22,  contact: "Tom S"   },
  { name: "Northwind",   status: "trialing",   mrr: "—",          leads: 0,   runs: 4,   contact: "Avi L"   },
  { name: "Helix Health",status: "trialing",   mrr: "—",          leads: 0,   runs: 0,   contact: "Maya O"  },
  { name: "Orchard",     status: "evaluating", mrr: "—",          leads: 0,   runs: 0,   contact: "Ben D"   },
];

const V3_PF_AGENTS = [
  { name: "Ingestor",         last: "06:00",  success: 100, runs: 1240, cost: "$0.04" },
  { name: "Ranker",           last: "08:42",  success: 98,  runs: 412,  cost: "$0.21" },
  { name: "Verifier",         last: "08:44",  success: 99,  runs: 412,  cost: "$0.08" },
  { name: "Enricher",         last: "08:45",  success: 96,  runs: 408,  cost: "$0.18" },
  { name: "AdjacencyMapper",  last: "08:50",  success: 94,  runs: 312,  cost: "$0.31" },
  { name: "GeoMapper",        last: "08:52",  success: 99,  runs: 312,  cost: "$0.06" },
  { name: "Outreach Drafter", last: "09:10",  success: 92,  runs: 188,  cost: "$0.42" },
  { name: "Briefer",          last: "09:18",  success: 100, runs: 24,   cost: "$0.14" },
  { name: "Cross-Pollinator", last: "07:30",  success: 89,  runs: 96,   cost: "$0.28" },
];

const V3_PF_KPIS = [
  { label: "Leads ranked / week",   current: 412, goal: 500, unit: "" },
  { label: "Outreach reply rate",   current: 6.2, goal: 8.0, unit: "%" },
  { label: "Verifier accuracy",     current: 94,  goal: 96,  unit: "%" },
  { label: "Adjacency hit rate",    current: 38,  goal: 45,  unit: "%" },
  { label: "Time to first lead",    current: 2.4, goal: 1.5, unit: "h", invert: true },
  { label: "Tenant onboarding NPS", current: 62,  goal: 70,  unit: "" },
];

const V3_MC_TENANT_FLEET = [
  { tenant: "Zedcor",    agents: 12, color: "#E8763A" },
  { tenant: "Realberry", agents: 8,  color: "#7355E5" },
  { tenant: "Northwind", agents: 6,  color: "#2E6CD4" },
  { tenant: "Helix",     agents: 4,  color: "#1F8A5B" },
];

const V3_MC_PROPOSALS = [
  { ts: "May 7 · 09:14", tenant: "Zedcor",    title: "Add long-context model fallback for Ranker",          impact: "−18% latency p95", status: "approved" },
  { ts: "May 6 · 17:40", tenant: "Realberry", title: "Tighten taboo: customer-data-egress for outreach",     impact: "+ safety",         status: "approved" },
  { ts: "May 5 · 11:22", tenant: "Zedcor",    title: "Promote Cross-Pollinator from beta to default",        impact: "+12% adjacency",   status: "approved" },
  { ts: "May 3 · 14:15", tenant: "Northwind", title: "Lower Verifier threshold from 0.78 → 0.74",            impact: "+9% throughput",   status: "approved" },
];

const V3_MC_CONFIG_CHANGES = [
  { tenant: "Zedcor",    changes: 14, last: "May 7" },
  { tenant: "Realberry", changes:  6, last: "May 6" },
  { tenant: "Northwind", changes:  3, last: "May 3" },
  { tenant: "Helix",     changes:  1, last: "Apr 28" },
];

const V3_MC_KPIS = [
  { label: "Tenants live",         current: 4,  goal: 8,   unit: "" },
  { label: "Mean MTTR",            current: 18, goal: 30,  unit: "min", invert: true },
  { label: "Architect approval %", current: 84, goal: 75,  unit: "%" },
  { label: "Config drift events",  current: 2,  goal: 0,   unit: "/wk", invert: true },
  { label: "Cross-tenant uptime",  current: 99.6, goal: 99.5, unit: "%" },
  { label: "Per-tenant cost / d",  current: 4.20, goal: 5.0, unit: "$", invert: true },
];

const V3PdDemoTag = () => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 600,
    letterSpacing: 0.5, textTransform: "uppercase", color: "var(--v3-ink-lo)",
    padding: "2px 7px", borderRadius: 4, background: "rgba(11,21,48,0.04)",
  }}>
    <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--v3-amber)" }}/>
    Demo data
  </span>
);

const V3KPIPanel = ({ title, kpis }) => (
  <section style={{
    background: "var(--v3-surface)", borderRadius: 12, padding: "20px 24px",
    boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
  }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>{title}</h3>
      <V3PdDemoTag/>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
      {kpis.map(k => {
        const pct = k.invert
          ? Math.max(0, Math.min(100, (k.goal / k.current) * 100))
          : Math.max(0, Math.min(100, (k.current / k.goal) * 100));
        const onTrack = pct >= 80;
        return (
          <div key={k.label} style={{ padding: "12px 14px", background: "var(--v3-bg-soft)", borderRadius: 9 }}>
            <div style={{ fontSize: 12.5, color: "var(--v3-ink-md)" }}>{k.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <span className="display" style={{ fontSize: 22, fontWeight: 600, color: "var(--v3-ink)" }}>{k.current}{k.unit}</span>
              <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>goal {k.goal}{k.unit}</span>
            </div>
            <div style={{ height: 5, background: "var(--v3-line-soft)", borderRadius: 999, marginTop: 8, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: onTrack ? "var(--v3-green)" : "var(--v3-amber)" }}/>
            </div>
            <div style={{ fontSize: 11, color: onTrack ? "var(--v3-green)" : "var(--v3-amber)", marginTop: 4, fontWeight: 600 }}>
              {Math.round(pct)}% to goal
            </div>
          </div>
        );
      })}
    </div>
  </section>
);

// ---------- Pathfinder sub-tab ----------
const V3PfSubTab = () => (
  <>
    <section style={{ background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", alignItems: "baseline", gap: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Active tenants</h3>
        <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>{V3_TENANTS.length} tenants</span>
        <V3PdDemoTag/>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          {["Tenant","Status","MRR","Leads ranked 7d","Runs 24h","Primary contact"].map((c, i) =>
            <th key={i} style={{ textAlign: i === 2 || i === 3 || i === 4 ? "right" : "left", padding: "11px 22px", fontSize: 12, fontWeight: 500, color: "var(--v3-ink-md)", borderBottom: "1px solid var(--v3-line)" }}>{c}</th>)}
        </tr></thead>
        <tbody>
          {V3_TENANTS.map((t, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--v3-line-soft)" }}>
              <td style={{ padding: "13px 22px", fontSize: 13.5, color: "var(--v3-ink)", fontWeight: 500 }}>{t.name}</td>
              <td style={{ padding: "13px 22px" }}>
                <span style={{
                  fontSize: 11.5, padding: "2px 8px", borderRadius: 999, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4,
                  background: t.status === "active" ? "var(--v3-orange-soft)" : t.status === "onboarding" ? "var(--v3-blue-soft)" : "var(--v3-bg-soft)",
                  color:      t.status === "active" ? "var(--v3-orange)"      : t.status === "onboarding" ? "var(--v3-blue)"      : "var(--v3-ink-md)",
                }}>{t.status}</span>
              </td>
              <td style={{ padding: "13px 22px", fontSize: 13, color: "var(--v3-ink-md)", textAlign: "right" }} className="mono">{t.mrr}</td>
              <td style={{ padding: "13px 22px", fontSize: 13, color: "var(--v3-ink)", textAlign: "right" }} className="mono">{t.leads}</td>
              <td style={{ padding: "13px 22px", fontSize: 13, color: "var(--v3-ink-md)", textAlign: "right" }} className="mono">{t.runs}</td>
              <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-md)" }}>{t.contact}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>

    {/* Customer-zero deep-dive: Zedcor */}
    <section style={{ background: "var(--v3-surface)", borderRadius: 12, padding: "22px 26px", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--v3-orange)", fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>Customer zero</div>
          <h3 style={{ fontSize: 20, fontWeight: 600, color: "var(--v3-ink)", margin: "4px 0 0", letterSpacing: -0.3 }}>Zedcor</h3>
        </div>
        <V3PdDemoTag/>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>Usage frequency · 14d</div>
          <svg viewBox="0 0 200 60" style={{ width: "100%", height: 60, marginTop: 6 }}>
            {[8,12,10,14,18,16,22,20,24,22,28,26,30,32].map((v, i, a) => {
              const x = (i / (a.length-1)) * 190 + 5;
              const h = (v / Math.max(...a)) * 40;
              return <rect key={i} x={x-5} y={50-h} width="9" height={h} fill="#E8763A" rx="2" opacity={0.6 + (i/a.length)*0.4}/>;
            })}
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>Leads ranked total</div>
          <div className="display" style={{ fontSize: 28, fontWeight: 600, color: "var(--v3-ink)", marginTop: 4 }}>2,148</div>
          <div style={{ fontSize: 12, color: "var(--v3-green)", fontWeight: 600 }}>+412 this week</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>Cross-pollination signals</div>
          <div className="display" style={{ fontSize: 28, fontWeight: 600, color: "var(--v3-ink)", marginTop: 4 }}>38</div>
          <div style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>across 9 verticals</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>Last engagement</div>
          <div style={{ fontSize: 14, color: "var(--v3-ink)", marginTop: 4, fontWeight: 500 }}>Mara K · 2h ago</div>
          <div style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>weekly review call</div>
        </div>
      </div>
    </section>

    <V3KPIPanel title="Pathfinder KPIs" kpis={V3_PF_KPIS}/>

    <section style={{ background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", alignItems: "baseline", gap: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Agent run health</h3>
        <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>{V3_PF_AGENTS.length} specialists</span>
        <V3PdDemoTag/>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          {["Agent","Last run","Success","Runs 24h","Cost / run"].map((c, i) =>
            <th key={i} style={{ textAlign: i >= 2 ? "right" : "left", padding: "11px 22px", fontSize: 12, fontWeight: 500, color: "var(--v3-ink-md)", borderBottom: "1px solid var(--v3-line)" }}>{c}</th>)}
        </tr></thead>
        <tbody>
          {V3_PF_AGENTS.map((a, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--v3-line-soft)" }}>
              <td style={{ padding: "13px 22px", fontSize: 13.5, color: "var(--v3-ink)", fontWeight: 500 }}>{a.name}</td>
              <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-md)" }} className="mono">{a.last}</td>
              <td style={{ padding: "13px 22px", textAlign: "right" }}>
                <span style={{ fontSize: 12.5, color: a.success >= 95 ? "var(--v3-green)" : "var(--v3-amber)", fontWeight: 600 }}>{a.success}%</span>
              </td>
              <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-md)", textAlign: "right" }} className="mono">{a.runs}</td>
              <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-md)", textAlign: "right" }} className="mono">{a.cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </>
);

// ---------- Metacron sub-tab ----------
const V3McSubTab = () => (
  <>
    <section style={{ background: "var(--v3-surface)", borderRadius: 12, padding: "22px 26px", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Agent fleet across tenants</h3>
        <V3PdDemoTag/>
      </div>
      <svg viewBox="0 0 800 280" style={{ width: "100%", height: 280 }}>
        {V3_MC_TENANT_FLEET.map((t, ti) => {
          const cy = 50 + ti * 56;
          return (
            <g key={t.tenant}>
              <text x="20" y={cy + 4} fontSize="13" fontWeight="600" fill="var(--v3-ink)">{t.tenant}</text>
              <line x1="120" y1={cy} x2="780" y2={cy} stroke="var(--v3-line-soft)"/>
              {Array.from({length: t.agents}).map((_, i) => {
                const x = 140 + (i / Math.max(1, t.agents-1)) * 620;
                return <circle key={i} cx={x} cy={cy} r={9 + Math.random()*4} fill={t.color} opacity={0.7 + Math.random()*0.3}/>;
              })}
              <text x="785" y={cy + 4} fontSize="11" fill="var(--v3-ink-lo)">{t.agents}</text>
            </g>
          );
        })}
      </svg>
    </section>

    <section style={{ background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", alignItems: "baseline", gap: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Architect proposals approved</h3>
        <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>this week</span>
        <V3PdDemoTag/>
      </div>
      {V3_MC_PROPOSALS.map((p, i) => (
        <div key={i} style={{ padding: "13px 22px", borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)", display: "flex", alignItems: "center", gap: 12 }}>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--v3-ink-lo)", minWidth: 100 }}>{p.ts}</span>
          <span style={{ fontSize: 11.5, padding: "2px 8px", borderRadius: 4, background: "var(--v3-bg-soft)", color: "var(--v3-ink-md)", fontWeight: 500, minWidth: 80, textAlign: "center" }}>{p.tenant}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, color: "var(--v3-ink)" }}>{p.title}</div>
            <div style={{ fontSize: 12, color: "var(--v3-orange)", marginTop: 2, fontWeight: 600 }}>{p.impact}</div>
          </div>
          <span style={{ fontSize: 11, color: "var(--v3-green)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{p.status}</span>
        </div>
      ))}
    </section>

    <section style={{ background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", alignItems: "baseline", gap: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Configuration changes per tenant</h3>
        <V3PdDemoTag/>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          {["Tenant","Changes 30d","Last change",""].map((c, i) =>
            <th key={i} style={{ textAlign: i === 1 ? "right" : "left", padding: "11px 22px", fontSize: 12, fontWeight: 500, color: "var(--v3-ink-md)", borderBottom: "1px solid var(--v3-line)" }}>{c}</th>)}
        </tr></thead>
        <tbody>
          {V3_MC_CONFIG_CHANGES.map((c, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--v3-line-soft)" }}>
              <td style={{ padding: "13px 22px", fontSize: 13.5, color: "var(--v3-ink)", fontWeight: 500 }}>{c.tenant}</td>
              <td style={{ padding: "13px 22px", fontSize: 13, color: "var(--v3-ink-md)", textAlign: "right" }} className="mono">{c.changes}</td>
              <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-lo)" }}>{c.last}</td>
              <td style={{ padding: "13px 22px", textAlign: "right" }}>
                <button style={{ color: "var(--v3-blue)", fontSize: 12.5 }}>View diff →</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>

    <V3KPIPanel title="Metacron KPIs" kpis={V3_MC_KPIS}/>
  </>
);

const V3ProductsScreen = () => {
  const [tab, setTab] = React.useState("pathfinder");
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--v3-rail)" }}>
      <V3Topbar active="products"/>
      <V3PageBody>
        <V3PageTitle title="Products"/>
        <V3SubTabs tabs={[
          { id: "pathfinder", label: "Pathfinder", icon: "Compass" },
          { id: "metacron",   label: "Metacron",   icon: "Layers"  },
        ]} active={tab} setActive={setTab}/>
        <div style={{ flex: 1, overflow: "auto", padding: "22px 28px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {tab === "pathfinder" ? (<>
              <V3StatCard label="Active tenants" value="1" sub="Zedcor"/>
              <V3StatCard label="Leads ranked / wk" value="412" delta="+18%" deltaTone="ok" sparkline={[280,310,340,360,380,400,412]} sparkColor="var(--v3-orange)" fill/>
              <V3StatCard label="Reply rate" value="6.2" suffix="%" delta="+1.4pp" deltaTone="ok"/>
              <V3StatCard label="Verifier accuracy" value="94" suffix="%" sparkline={[91,92,92,93,94,94,94]} sparkColor="var(--v3-green)" fill/>
            </>) : (<>
              <V3StatCard label="Tenants live" value="4" sub="of 8 goal"/>
              <V3StatCard label="Approvals / wk" value="11" delta="+3" deltaTone="ok" sparkline={[5,6,8,9,10,11,11]} sparkColor="var(--v3-orange)" fill/>
              <V3StatCard label="MTTR" value="18" suffix="min" delta="−6m" deltaTone="ok"/>
              <V3StatCard label="Uptime" value="99.6" suffix="%"/>
            </>)}
          </div>
          {tab === "pathfinder" ? <V3PathfinderTab/> : <V3McSubTab/>}
        </div>
      </V3PageBody>
    </div>
  );
};

window.V3ProductsScreen = V3ProductsScreen;
