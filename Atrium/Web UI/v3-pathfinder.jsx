/* v3-pathfinder.jsx — Products › Pathfinder tenants list + Zedcor deep view. */

// ============================================================
// Pathfinder tenants list (entry)
// ============================================================

const V3_PF_TENANTS = [
  { id: "zedcor",    name: "Zedcor",    status: "active",     primary: "Mara K", contractStart: "Aug 14, 2025", lastTouch: "today",   liveCities: 7, atvActivating: 4, onDeck: 13, mrr: 18400 },
  { id: "realberry", name: "Realberry", status: "onboarding", primary: "Tom S",  contractStart: "Apr 02, 2026", lastTouch: "2d ago",  liveCities: 0, atvActivating: 1, onDeck: 6,  mrr: 0     },
  { id: "northwind", name: "Northwind", status: "trialing",   primary: "Avi L",  contractStart: "—",            lastTouch: "today",   liveCities: 0, atvActivating: 0, onDeck: 4,  mrr: 0     },
  { id: "helix",     name: "Helix",     status: "trialing",   primary: "Sara H", contractStart: "—",            lastTouch: "1d ago",  liveCities: 0, atvActivating: 0, onDeck: 3,  mrr: 0     },
];

// ============================================================
// Zedcor data model
// ============================================================

const V3_ZED_ROLLUP = [
  { label: "Revenue · all-time",     value: "$842,150",  sub: "MRR + activation + reissues", delta: "+18%", deltaTone: "ok" },
  { label: "Current MRR",            value: "$18,400",   sub: "+ $2.4k vs Apr",              delta: "+15%", deltaTone: "ok" },
  { label: "Activation fees",        value: "$184,000",  sub: "23 cities × $8k avg" },
  { label: "Leads delivered",        value: "412,318",   sub: "all-time, all cities",        delta: "+12%", deltaTone: "ok" },
  { label: "Cities served",          value: "24",        sub: "7 live · 4 activating · 13 deck" },
  { label: "Hard costs · all-time",  value: "$214,720",  sub: "infra + APIs + per-city" },
];

const V3_ZED_LIVE_CITIES = [
  { id: "phx",  name: "Phoenix, AZ",    region: "Southwest", kickoff: "Aug 22, 2025", deployed: "Sep 14, 2025", agentsDeployed: 6, agentsActive: 6, leads30d: 4218,  leadsAll: 84320 },
  { id: "tus",  name: "Tucson, AZ",     region: "Southwest", kickoff: "Sep 09, 2025", deployed: "Sep 28, 2025", agentsDeployed: 4, agentsActive: 4, leads30d: 2840,  leadsAll: 56120 },
  { id: "lv",   name: "Las Vegas, NV",  region: "West",      kickoff: "Oct 01, 2025", deployed: "Oct 21, 2025", agentsDeployed: 5, agentsActive: 5, leads30d: 3104,  leadsAll: 51480 },
  { id: "abq",  name: "Albuquerque, NM",region: "Southwest", kickoff: "Nov 04, 2025", deployed: "Nov 24, 2025", agentsDeployed: 3, agentsActive: 3, leads30d: 1820,  leadsAll: 31050 },
  { id: "elp",  name: "El Paso, TX",    region: "Southwest", kickoff: "Dec 02, 2025", deployed: "Dec 21, 2025", agentsDeployed: 3, agentsActive: 2, leads30d: 1402,  leadsAll: 24180 },
  { id: "rno",  name: "Reno, NV",       region: "West",      kickoff: "Jan 14, 2026", deployed: "Feb 05, 2026", agentsDeployed: 3, agentsActive: 3, leads30d: 1640,  leadsAll: 19880 },
  { id: "sac",  name: "Sacramento, CA", region: "West",      kickoff: "Feb 24, 2026", deployed: "Mar 18, 2026", agentsDeployed: 3, agentsActive: 3, leads30d: 1212,  leadsAll: 12420 },
];

const V3_ZED_ACTIVATING = [
  { id: "pho", name: "Phoenix-North, AZ", stage: "Researching procurement",     stageStart: "Apr 18, 2026", region: "Southwest" },
  { id: "tuc", name: "Mesa, AZ",          stage: "Researching procurement",     stageStart: "Apr 22, 2026", region: "Southwest" },
  { id: "rnh", name: "Henderson, NV",     stage: "Connecting procurement",      stageStart: "Apr 28, 2026", region: "West" },
  { id: "frs", name: "Fresno, CA",        stage: "Fully deployed handover",     stageStart: "May 02, 2026", region: "West" },
];

const V3_ZED_ON_DECK = [
  { id: "tpa", name: "Tampa, FL",        kickoff: "Jul 01, 2026" },
  { id: "orl", name: "Orlando, FL",      kickoff: "Jul 14, 2026" },
  { id: "den", name: "Denver, CO",       kickoff: "Aug 04, 2026" },
  { id: "spo", name: "Colorado Spr., CO",kickoff: "Aug 18, 2026" },
  { id: "saa", name: "San Antonio, TX",  kickoff: "Sep 02, 2026" },
  { id: "aus", name: "Austin, TX",       kickoff: "Sep 16, 2026" },
  { id: "okl", name: "Oklahoma City, OK",kickoff: "Sep 30, 2026" },
  { id: "msa", name: "Mesa-East, AZ",    kickoff: "Oct 14, 2026" },
  { id: "kan", name: "Kansas City, KS",  kickoff: "Oct 28, 2026" },
  { id: "sl",  name: "Salt Lake City, UT", kickoff: "Nov 11, 2026" },
  { id: "atl", name: "Atlanta, GA",      kickoff: "Nov 25, 2026" },
  { id: "chr", name: "Charlotte, NC",    kickoff: "Dec 09, 2026" },
  { id: "rdu", name: "Raleigh, NC",      kickoff: "Dec 23, 2026" },
];

const V3_ZED_PROCUREMENT_SITES = [
  { name: "DesertOps Procurement",   city: "Phoenix, AZ",   hub: "Southwest", status: "active",  l7: 412, all: 9820, lastLead: "12m ago" },
  { name: "Sun Valley Logistics",    city: "Phoenix, AZ",   hub: "Southwest", status: "active",  l7: 388, all: 8120, lastLead: "31m ago" },
  { name: "Desert Roads Inc.",       city: "Phoenix, AZ",   hub: "Southwest", status: "active",  l7: 271, all: 6240, lastLead: "1h ago" },
  { name: "Cactus Materials",        city: "Phoenix, AZ",   hub: "Southwest", status: "active",  l7: 244, all: 5180, lastLead: "2h ago" },
  { name: "Saguaro Procurement",     city: "Phoenix, AZ",   hub: "Southwest", status: "pending", l7: 0,   all: 0,    lastLead: "—" },
  { name: "Pueblo Civic Sourcing",   city: "Tucson, AZ",    hub: "Southwest", status: "active",  l7: 318, all: 7240, lastLead: "44m ago" },
  { name: "Old Pueblo Materials",    city: "Tucson, AZ",    hub: "Southwest", status: "active",  l7: 198, all: 4180, lastLead: "1h ago" },
  { name: "Catalina Logistics",      city: "Tucson, AZ",    hub: "Southwest", status: "churned", l7: 0,   all: 1240, lastLead: "12d ago" },
  { name: "Strip Procurement",       city: "Las Vegas, NV", hub: "West",      status: "active",  l7: 402, all: 7120, lastLead: "18m ago" },
  { name: "Silver State Sourcing",   city: "Las Vegas, NV", hub: "West",      status: "active",  l7: 261, all: 5240, lastLead: "55m ago" },
  { name: "Mojave Materials",        city: "Las Vegas, NV", hub: "West",      status: "pending", l7: 0,   all: 0,    lastLead: "—" },
  { name: "Sandia Sourcing",         city: "Albuquerque, NM",hub: "Southwest",status: "active",  l7: 240, all: 3820, lastLead: "1h ago" },
];

const V3_ZED_AGENTS = [
  { name: "Mara K",     starred: 1840, hubspot: 1620, emails: 1420, replies: 184, meetings: 38, closed: 12, value: 482000 },
  { name: "Diego R",    starred: 1240, hubspot: 1080, emails: 980,  replies: 122, meetings: 24, closed: 8,  value: 312000 },
  { name: "Priya N",    starred: 920,  hubspot: 820,  emails: 740,  replies: 88,  meetings: 18, closed: 5,  value: 184000 },
];

// Hard cost categories (last 6 months stack, in $)
const V3_ZED_HARD_COSTS = [
  { month: "Dec 25", subs: 4200, anth: 2800, oai: 1100, supa: 320, vrcl: 180, plaud: 240, fath: 180, clay: 220 },
  { month: "Jan 26", subs: 4400, anth: 3120, oai: 1240, supa: 340, vrcl: 200, plaud: 260, fath: 200, clay: 240 },
  { month: "Feb 26", subs: 4400, anth: 3480, oai: 1380, supa: 380, vrcl: 220, plaud: 280, fath: 220, clay: 260 },
  { month: "Mar 26", subs: 4600, anth: 3920, oai: 1420, supa: 420, vrcl: 240, plaud: 300, fath: 240, clay: 280 },
  { month: "Apr 26", subs: 4800, anth: 4480, oai: 1620, supa: 460, vrcl: 260, plaud: 320, fath: 260, clay: 300 },
  { month: "May 26", subs: 4800, anth: 4980, oai: 1780, supa: 520, vrcl: 280, plaud: 340, fath: 280, clay: 320 },
];

const V3_ZED_COST_LEGEND = [
  { key: "subs",  label: "Subscriptions", color: "#5B6580" },
  { key: "anth",  label: "Anthropic",     color: "#E8763A" },
  { key: "oai",   label: "OpenAI",        color: "#0EA5E9" },
  { key: "supa",  label: "Supabase",      color: "#1F8A5B" },
  { key: "vrcl",  label: "Vercel",        color: "#0B1530" },
  { key: "plaud", label: "Plaud",         color: "#7355E5" },
  { key: "fath",  label: "Fathom",        color: "#D14848" },
  { key: "clay",  label: "Clay",          color: "#E89E3A" },
];

// ============================================================
// Helpers
// ============================================================

const fmtMoney = n => "$" + n.toLocaleString();

const V3PfStatusPill = ({ tone, children }) => {
  const palette = {
    active:  { bg: "rgba(31,138,91,0.10)", fg: "#1F8A5B" },
    pending: { bg: "rgba(232,158,58,0.12)", fg: "#B97A0E" },
    churned: { bg: "rgba(11,21,48,0.06)", fg: "#5B6580" },
  }[tone] || { bg: "var(--v3-line-soft)", fg: "var(--v3-ink-md)" };
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
      textTransform: "uppercase", letterSpacing: 0.4,
      background: palette.bg, color: palette.fg,
    }}>{children}</span>
  );
};

// ============================================================
// City detail panel (drill-in)
// ============================================================

const V3CityDetail = ({ city, onClose }) => {
  if (!city) return null;
  const sites = V3_ZED_PROCUREMENT_SITES.filter(s => s.city === city.name);
  // Funnel for this city
  const funnel = [
    { label: "Leads",          v: city.leads30d || 1200, color: "#94A3B8" },
    { label: "Starred",        v: Math.round((city.leads30d || 1200) * 0.42), color: "#E89E3A" },
    { label: "Sent to HubSpot",v: Math.round((city.leads30d || 1200) * 0.28), color: "#E8763A" },
    { label: "Email sent",     v: Math.round((city.leads30d || 1200) * 0.21), color: "#E8763A" },
    { label: "Initiation",     v: Math.round((city.leads30d || 1200) * 0.12), color: "#E8763A" },
    { label: "Qualification",  v: Math.round((city.leads30d || 1200) * 0.06), color: "#E8763A" },
    { label: "Proposal",       v: Math.round((city.leads30d || 1200) * 0.03), color: "#E8763A" },
    { label: "Negotiation",    v: Math.round((city.leads30d || 1200) * 0.018), color: "#E8763A" },
    { label: "Closed",         v: Math.round((city.leads30d || 1200) * 0.008), color: "#1F8A5B" },
  ];
  const max = funnel[0].v;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(11,21,48,0.32)",
      display: "flex", justifyContent: "flex-end", zIndex: 60,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 720, background: "var(--v3-rail)", height: "100%", overflow: "auto",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "20px 24px", background: "var(--v3-surface)", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--v3-orange)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{city.region || "—"} hub</div>
            <h3 className="display" style={{ fontSize: 24, fontWeight: 500, color: "var(--v3-ink)", margin: "4px 0 0", letterSpacing: -0.4 }}>{city.name}</h3>
            <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 6 }}>
              {city.kickoff ? `Kickoff ${city.kickoff}` : ""}{city.deployed ? ` · Fully deployed ${city.deployed}` : ""}{city.stage ? ` · ${city.stage}` : ""}
            </div>
          </div>
          <button onClick={onClose} style={{ padding: 6, color: "var(--v3-ink-lo)" }}><I.X size={14}/></button>
        </div>

        <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Hub stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {[
              { label: "Agents deployed", v: city.agentsDeployed ?? "—" },
              { label: "Agents active",   v: city.agentsActive ?? "—" },
              { label: "Leads (30d)",     v: city.leads30d ? city.leads30d.toLocaleString() : "—" },
              { label: "Leads (all)",     v: city.leadsAll ? city.leadsAll.toLocaleString() : "—" },
            ].map((s, i) => (
              <div key={i} style={{ background: "var(--v3-surface)", padding: "12px 14px", borderRadius: 8 }}>
                <div className="display" style={{ fontSize: 22, fontWeight: 500, color: "var(--v3-ink)", lineHeight: 1, letterSpacing: -0.3 }}>{s.v}</div>
                <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Procurement sites table */}
          <section style={{ background: "var(--v3-surface)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Procurement sites · {sites.length}</h4>
              <span style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>{sites.filter(s => s.status === "active").length} active · {sites.filter(s => s.status === "pending").length} pending · {sites.filter(s => s.status === "churned").length} churned</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                {["Site", "Status", "Leads (7d)", "Leads (all)", "Last lead"].map((h, i) => (
                  <th key={i} style={{ textAlign: i > 1 ? "right" : "left", padding: "8px 16px", fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, borderBottom: "1px solid var(--v3-line-soft)" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {sites.map((s, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--v3-line-soft)" }}>
                    <td style={{ padding: "10px 16px", fontSize: 13, color: "var(--v3-ink)" }}>{s.name}</td>
                    <td style={{ padding: "10px 16px" }}><V3PfStatusPill tone={s.status}>{s.status}</V3PfStatusPill></td>
                    <td className="mono" style={{ padding: "10px 16px", fontSize: 12, color: "var(--v3-ink-md)", textAlign: "right" }}>{s.l7.toLocaleString()}</td>
                    <td className="mono" style={{ padding: "10px 16px", fontSize: 12, color: "var(--v3-ink-md)", textAlign: "right" }}>{s.all.toLocaleString()}</td>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "var(--v3-ink-lo)", textAlign: "right" }}>{s.lastLead}</td>
                  </tr>
                ))}
                {sites.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "16px", fontSize: 12, color: "var(--v3-ink-lo)", textAlign: "center", fontStyle: "italic" }}>No procurement sites yet for this city.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          {/* Funnel */}
          <section style={{ background: "var(--v3-surface)", borderRadius: 10, padding: "14px 18px" }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--v3-ink)", margin: "0 0 10px" }}>Lead funnel · last 30d</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {funnel.map((f, i) => {
                const w = (f.v / max) * 100;
                const conv = i > 0 ? ((f.v / funnel[i-1].v) * 100).toFixed(0) + "%" : "—";
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px 60px", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--v3-ink-md)" }}>{f.label}</span>
                    <div style={{ height: 16, background: "var(--v3-line-soft)", borderRadius: 4, position: "relative" }}>
                      <div style={{ width: `${w}%`, height: "100%", background: f.color, borderRadius: 4 }}/>
                    </div>
                    <span className="mono" style={{ fontSize: 12, color: "var(--v3-ink)", textAlign: "right", fontWeight: 600 }}>{f.v.toLocaleString()}</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--v3-ink-lo)", textAlign: "right" }}>{conv}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Per-agent table */}
          <section style={{ background: "var(--v3-surface)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--v3-line-soft)" }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Sales agents in {city.name}</h4>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                {["Agent", "Starred", "HubSpot", "Emails", "Replies", "Meetings", "Closed"].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 0 ? "left" : "right", padding: "8px 16px", fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, borderBottom: "1px solid var(--v3-line-soft)" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {V3_ZED_AGENTS.map((a, i) => {
                  const ratio = (city.leads30d || 0) / 8000;
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid var(--v3-line-soft)" }}>
                      <td style={{ padding: "10px 16px", fontSize: 13, color: "var(--v3-ink)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar name={a.name} size={20}/>{a.name}</div>
                      </td>
                      <td className="mono" style={{ padding: "10px 16px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-md)" }}>{Math.round(a.starred * ratio).toLocaleString()}</td>
                      <td className="mono" style={{ padding: "10px 16px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-md)" }}>{Math.round(a.hubspot * ratio).toLocaleString()}</td>
                      <td className="mono" style={{ padding: "10px 16px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-md)" }}>{Math.round(a.emails * ratio).toLocaleString()}</td>
                      <td className="mono" style={{ padding: "10px 16px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-md)" }}>{Math.round(a.replies * ratio).toLocaleString()}</td>
                      <td className="mono" style={{ padding: "10px 16px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-md)" }}>{Math.round(a.meetings * ratio).toLocaleString()}</td>
                      <td className="mono" style={{ padding: "10px 16px", fontSize: 12, textAlign: "right", color: "var(--v3-green)", fontWeight: 600 }}>{Math.round(a.closed * ratio).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Editable date input (gated)
// ============================================================

const V3GatedDate = ({ value, onChange }) => {
  const [v, setV] = React.useState(value);
  const [pulse, setPulse] = React.useState(false);
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <input
        type="text"
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={() => {
          if (v !== value) {
            setPulse(true);
            setTimeout(() => setPulse(false), 1200);
            onChange && onChange(v);
          }
        }}
        style={{
          width: 110, padding: "4px 8px", fontSize: 11,
          background: "var(--v3-bg)", color: "var(--v3-ink)",
          border: "1px solid var(--v3-line-soft)", borderRadius: 5,
          fontFamily: "monospace", outline: "none",
        }}
      />
      {pulse && (
        <span title="Cleared by Taboo Keeper · Audit-logged" style={{
          fontSize: 10, color: "var(--v3-green)", fontWeight: 600,
          display: "inline-flex", alignItems: "center", gap: 3,
        }}>
          <I.Check size={10}/> ok
        </span>
      )}
    </div>
  );
};

// ============================================================
// Cities — three-column section
// ============================================================

const V3CitiesSection = ({ onSelectCity }) => {
  const [activatingDates, setActivatingDates] = React.useState(
    Object.fromEntries(V3_ZED_ACTIVATING.map(c => [c.id, c.stageStart]))
  );
  const [onDeckDates, setOnDeckDates] = React.useState(
    Object.fromEntries(V3_ZED_ON_DECK.map(c => [c.id, c.kickoff]))
  );
  const [onDeck, setOnDeck] = React.useState(V3_ZED_ON_DECK);

  const ColHead = ({ title, count, color }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>{title}</span>
      <span style={{
        fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999,
        background: color + "1A", color,
      }}>{count}</span>
    </div>
  );

  return (
    <section style={{ background: "var(--v3-surface)", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Cities</h3>
        <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>24 total · pipeline view</span>
        <V3PdDemoTag/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
        {/* LIVE */}
        <div>
          <ColHead title="Live" count={V3_ZED_LIVE_CITIES.length} color="#1F8A5B"/>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {V3_ZED_LIVE_CITIES.map(c => (
              <button key={c.id} onClick={() => onSelectCity(c)} style={{
                textAlign: "left", padding: "10px 12px", borderRadius: 7,
                background: "var(--v3-bg)", border: "1px solid var(--v3-line-soft)",
                cursor: "pointer", display: "flex", flexDirection: "column", gap: 4,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--v3-ink)" }}>{c.name}</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--v3-green)", fontWeight: 600 }}>{c.leads30d.toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>
                  {c.region} · kickoff {c.kickoff} · live {c.deployed}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ACTIVATING */}
        <div>
          <ColHead title="Activating" count={V3_ZED_ACTIVATING.length} color="#E89E3A"/>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {V3_ZED_ACTIVATING.map(c => (
              <div key={c.id} style={{
                padding: "10px 12px", borderRadius: 7,
                background: "var(--v3-bg)", border: "1px solid var(--v3-line-soft)",
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                <button onClick={() => onSelectCity(c)} style={{
                  textAlign: "left", padding: 0, background: "transparent",
                  fontSize: 13, fontWeight: 600, color: "var(--v3-ink)", cursor: "pointer",
                }}>{c.name}</button>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.4,
                    background: c.stage.startsWith("Researching") ? "rgba(232,158,58,0.14)" : c.stage.startsWith("Connecting") ? "rgba(46,108,212,0.10)" : "rgba(31,138,91,0.10)",
                    color:      c.stage.startsWith("Researching") ? "#B97A0E" : c.stage.startsWith("Connecting") ? "#2E6CD4" : "#1F8A5B",
                  }}>{c.stage.split(" ")[0]}</span>
                  <V3GatedDate value={activatingDates[c.id]} onChange={v => setActivatingDates({ ...activatingDates, [c.id]: v })}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ON DECK */}
        <div>
          <ColHead title="On deck" count={onDeck.length} color="#94A3B8"/>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {onDeck.map(c => (
              <div key={c.id} style={{
                padding: "8px 12px", borderRadius: 7,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                borderBottom: "1px solid var(--v3-line-soft)",
              }}>
                <span style={{ fontSize: 12.5, color: "var(--v3-ink)" }}>{c.name}</span>
                <V3GatedDate value={onDeckDates[c.id]} onChange={v => setOnDeckDates({ ...onDeckDates, [c.id]: v })}/>
              </div>
            ))}
            <button onClick={() => {
              const id = "new-" + Date.now();
              setOnDeck([...onDeck, { id, name: "New city" }]);
              setOnDeckDates({ ...onDeckDates, [id]: "TBD" });
            }} style={{
              marginTop: 8, padding: "8px 12px", fontSize: 12, fontWeight: 500,
              color: "var(--v3-blue)", background: "transparent",
              border: "1px dashed var(--v3-line-strong)", borderRadius: 7,
              display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center",
            }}>
              <I.Plus size={11}/> Add candidate
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

// ============================================================
// Hard costs chart + per-city pie + P&L
// ============================================================

const V3HardCostsCard = () => {
  const [view, setView] = React.useState("month");
  const data = V3_ZED_HARD_COSTS;
  const totals = data.map(d => V3_ZED_COST_LEGEND.reduce((acc, c) => acc + (d[c.key] || 0), 0));
  const max = Math.max(...totals);

  return (
    <section style={{ background: "var(--v3-surface)", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Hard costs</h3>
          <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>by category, last 6 months</span>
          <V3PdDemoTag/>
        </div>
        <div style={{ display: "flex", gap: 4, background: "var(--v3-bg)", border: "1px solid var(--v3-line-soft)", borderRadius: 7, padding: 3 }}>
          {[
            { id: "month", label: "Month" },
            { id: "year",  label: "Year" },
            { id: "all",   label: "All-time" },
          ].map(t => (
            <button key={t.id} onClick={() => setView(t.id)} style={{
              padding: "5px 11px", fontSize: 11, fontWeight: 500, borderRadius: 5,
              background: view === t.id ? "var(--v3-surface)" : "transparent",
              color: view === t.id ? "var(--v3-ink)" : "var(--v3-ink-md)",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 22 }}>
        {/* Stacked bars */}
        <div>
          <svg viewBox="0 0 600 240" style={{ width: "100%", height: 240 }}>
            {data.map((d, i) => {
              const x = 30 + i * 95;
              let yCursor = 220;
              return (
                <g key={i}>
                  {V3_ZED_COST_LEGEND.map(cat => {
                    const v = d[cat.key] || 0;
                    const h = (v / max) * 180;
                    yCursor -= h;
                    return <rect key={cat.key} x={x} y={yCursor} width={62} height={h} fill={cat.color}/>;
                  })}
                  <text x={x + 31} y={234} fontSize={10} fill="var(--v3-ink-lo)" textAnchor="middle">{d.month}</text>
                  <text x={x + 31} y={yCursor - 4} fontSize={10} fill="var(--v3-ink)" fontWeight="600" textAnchor="middle">{fmtMoney(totals[i])}</text>
                </g>
              );
            })}
          </svg>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {V3_ZED_COST_LEGEND.map(cat => (
              <div key={cat.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--v3-ink-md)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: cat.color }}/>
                {cat.label}
              </div>
            ))}
          </div>
        </div>

        {/* Per-city pie */}
        <div>
          <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, marginBottom: 8 }}>By city · pro-rated</div>
          <svg viewBox="0 0 200 200" style={{ width: 180, height: 180 }}>
            {(() => {
              const total = V3_ZED_LIVE_CITIES.reduce((a, c) => a + c.leads30d, 0);
              let acc = 0;
              const colors = ["#E8763A", "#7355E5", "#2E6CD4", "#1F8A5B", "#E89E3A", "#D14848", "#0EA5E9"];
              return V3_ZED_LIVE_CITIES.map((c, i) => {
                const frac = c.leads30d / total;
                const start = acc;
                acc += frac;
                const a0 = start * 2 * Math.PI - Math.PI / 2;
                const a1 = acc * 2 * Math.PI - Math.PI / 2;
                const x0 = 100 + 80 * Math.cos(a0), y0 = 100 + 80 * Math.sin(a0);
                const x1 = 100 + 80 * Math.cos(a1), y1 = 100 + 80 * Math.sin(a1);
                const large = frac > 0.5 ? 1 : 0;
                return <path key={c.id} d={`M100 100 L${x0} ${y0} A80 80 0 ${large} 1 ${x1} ${y1} Z`} fill={colors[i % colors.length]}/>;
              });
            })()}
            <circle cx={100} cy={100} r={42} fill="var(--v3-surface)"/>
            <text x={100} y={97} fontSize={10} fill="var(--v3-ink-lo)" textAnchor="middle" textTransform="uppercase" letterSpacing="0.4">Total</text>
            <text x={100} y={112} fontSize={14} fontWeight={600} fill="var(--v3-ink)" textAnchor="middle">$13.3k</text>
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            {V3_ZED_LIVE_CITIES.slice(0, 4).map((c, i) => {
              const colors = ["#E8763A", "#7355E5", "#2E6CD4", "#1F8A5B", "#E89E3A", "#D14848", "#0EA5E9"];
              const total = V3_ZED_LIVE_CITIES.reduce((a, c) => a + c.leads30d, 0);
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[i] }}/>
                  <span style={{ flex: 1, color: "var(--v3-ink-md)" }}>{c.name.split(",")[0]}</span>
                  <span className="mono" style={{ color: "var(--v3-ink-lo)" }}>{((c.leads30d / total) * 100).toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Per-category subtotals */}
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--v3-line-soft)" }}>
        <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, marginBottom: 10 }}>Category subtotals (May 26)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {V3_ZED_COST_LEGEND.map(cat => {
            const v = data[data.length - 1][cat.key] || 0;
            return (
              <div key={cat.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--v3-bg)", borderRadius: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: cat.color }}/>
                <span style={{ fontSize: 11.5, color: "var(--v3-ink-md)", flex: 1 }}>{cat.label}</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--v3-ink)", fontWeight: 600 }}>{fmtMoney(v)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const V3PnLCard = () => {
  const [view, setView] = React.useState("month");
  const monthly = { revenue: 18400 + 0, hardCosts: 13300, overhead: 1200, net: 18400 - 13300 - 1200 };
  const yearly  = { revenue: 184000, hardCosts: 132000, overhead: 14400, net: 184000 - 132000 - 14400 };
  const all     = { revenue: 842150, hardCosts: 214720, overhead: 28000, net: 842150 - 214720 - 28000 };
  const cur = view === "month" ? monthly : view === "year" ? yearly : all;

  const Row = ({ label, v, delta, sign, big }) => (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: big ? "16px 0 4px" : "10px 0",
      borderTop: "1px solid var(--v3-line-soft)",
    }}>
      <span style={{ fontSize: big ? 14 : 12.5, color: "var(--v3-ink-md)", fontWeight: big ? 600 : 400 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className={"display"} style={{
          fontSize: big ? 28 : 18, fontWeight: 500, color: "var(--v3-ink)", letterSpacing: -0.3,
        }}>{sign === "-" ? "−" : ""}{fmtMoney(Math.abs(v))}</span>
        {delta && <span style={{ fontSize: 11, color: delta.startsWith("+") ? "var(--v3-green)" : "var(--v3-red)", fontWeight: 600 }}>{delta}</span>}
      </div>
    </div>
  );

  return (
    <section style={{ background: "var(--v3-surface)", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Rollup P&amp;L</h3>
          <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>Zedcor only</span>
          <V3PdDemoTag/>
        </div>
        <div style={{ display: "flex", gap: 4, background: "var(--v3-bg)", border: "1px solid var(--v3-line-soft)", borderRadius: 7, padding: 3 }}>
          {[
            { id: "month", label: "Month" },
            { id: "year",  label: "Year" },
            { id: "all",   label: "All-time" },
          ].map(t => (
            <button key={t.id} onClick={() => setView(t.id)} style={{
              padding: "5px 11px", fontSize: 11, fontWeight: 500, borderRadius: 5,
              background: view === t.id ? "var(--v3-surface)" : "transparent",
              color: view === t.id ? "var(--v3-ink)" : "var(--v3-ink-md)",
            }}>{t.label}</button>
          ))}
        </div>
      </div>
      <Row label="Revenue (MRR + activation + reissues)" v={cur.revenue} delta="+15%"/>
      <Row label="Hard costs" v={cur.hardCosts} sign="-" delta="+8%"/>
      <Row label="Per-city overhead" v={cur.overhead} sign="-" delta="+4%"/>
      <Row label="Net margin" v={cur.net} delta="+22%" big/>
    </section>
  );
};

// ============================================================
// Zedcor deep view (the canonical tenant view)
// ============================================================

const V3ZedcorView = ({ onBack }) => {
  const [openCity, setOpenCity] = React.useState(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <section style={{ background: "var(--v3-surface)", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
          <button onClick={onBack} style={{
            padding: "6px 10px", fontSize: 12, color: "var(--v3-ink-md)",
            border: "1px solid var(--v3-line-strong)", borderRadius: 6, background: "var(--v3-surface)",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}><I.ChevronL size={11}/> Tenants</button>
          <div style={{ flex: 1 }}/>
          <V3PdDemoTag/>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 6 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12,
            background: "linear-gradient(135deg, #E8763A, #C75928)",
            color: "#FFF", fontWeight: 700, fontSize: 22,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>Z</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 className="display" style={{ fontSize: 32, fontWeight: 500, color: "var(--v3-ink)", margin: 0, letterSpacing: -0.5 }}>Zedcor</h2>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                background: "rgba(31,138,91,0.10)", color: "#1F8A5B",
                textTransform: "uppercase", letterSpacing: 0.5,
              }}>Active</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--v3-ink-lo)", marginTop: 5, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Avatar name="Mara K" size={18}/> Mara K · primary
              </span>
              <span>·</span>
              <span>Contract Aug 14, 2025</span>
              <span>·</span>
              <span>Last touch: today</span>
            </div>
          </div>
        </div>
      </section>

      {/* Rollup stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {V3_ZED_ROLLUP.map((s, i) => (
          <div key={i} style={{ background: "var(--v3-surface)", borderRadius: 10, padding: "16px 18px", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
            <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div className="display" style={{ fontSize: 26, fontWeight: 500, color: "var(--v3-ink)", lineHeight: 1, letterSpacing: -0.4 }}>{s.value}</div>
              {s.delta && <span style={{ fontSize: 11, color: s.deltaTone === "ok" ? "var(--v3-green)" : "var(--v3-red)", fontWeight: 600 }}>{s.delta}</span>}
            </div>
            <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 5 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Cities */}
      <V3CitiesSection onSelectCity={setOpenCity}/>

      {/* Procurement sites — full table */}
      <section style={{ background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Procurement sites · all cities</h3>
          <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>{V3_ZED_PROCUREMENT_SITES.length} sites</span>
          <V3PdDemoTag/>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "var(--v3-bg)" }}>
            {["Site", "City", "Hub", "Status", "Leads (7d)", "Leads (all)", "Last lead"].map((h, i) => (
              <th key={i} style={{ textAlign: i > 3 ? "right" : "left", padding: "10px 22px", fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {V3_ZED_PROCUREMENT_SITES.map((s, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--v3-line-soft)" }}>
                <td style={{ padding: "10px 22px", fontSize: 13, color: "var(--v3-ink)" }}>{s.name}</td>
                <td style={{ padding: "10px 22px", fontSize: 12.5, color: "var(--v3-ink-md)" }}>{s.city}</td>
                <td style={{ padding: "10px 22px", fontSize: 12, color: "var(--v3-ink-lo)" }}>{s.hub}</td>
                <td style={{ padding: "10px 22px" }}><V3PfStatusPill tone={s.status}>{s.status}</V3PfStatusPill></td>
                <td className="mono" style={{ padding: "10px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-md)" }}>{s.l7.toLocaleString()}</td>
                <td className="mono" style={{ padding: "10px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-md)" }}>{s.all.toLocaleString()}</td>
                <td style={{ padding: "10px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-lo)" }}>{s.lastLead}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Sales agents rollup */}
      <section style={{ background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Sales agents · all cities</h3>
          <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>{V3_ZED_AGENTS.length} agents</span>
          <V3PdDemoTag/>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "var(--v3-bg)" }}>
            {["Agent", "Starred", "HubSpot", "Emails", "Replies", "Meetings", "Closed", "Value", "Conv."].map((h, i) => (
              <th key={i} style={{ textAlign: i === 0 ? "left" : "right", padding: "10px 22px", fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {V3_ZED_AGENTS.map((a, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--v3-line-soft)" }}>
                <td style={{ padding: "10px 22px", fontSize: 13, color: "var(--v3-ink)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar name={a.name} size={20}/>{a.name}</div>
                </td>
                <td className="mono" style={{ padding: "10px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-md)" }}>{a.starred.toLocaleString()}</td>
                <td className="mono" style={{ padding: "10px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-md)" }}>{a.hubspot.toLocaleString()}</td>
                <td className="mono" style={{ padding: "10px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-md)" }}>{a.emails.toLocaleString()}</td>
                <td className="mono" style={{ padding: "10px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-md)" }}>{a.replies.toLocaleString()}</td>
                <td className="mono" style={{ padding: "10px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-md)" }}>{a.meetings.toLocaleString()}</td>
                <td className="mono" style={{ padding: "10px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-green)", fontWeight: 600 }}>{a.closed}</td>
                <td className="mono" style={{ padding: "10px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-ink)", fontWeight: 600 }}>{fmtMoney(a.value)}</td>
                <td className="mono" style={{ padding: "10px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-md)" }}>{((a.closed / a.starred) * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Hard costs */}
      <V3HardCostsCard/>

      {/* P&L */}
      <V3PnLCard/>

      <V3CityDetail city={openCity} onClose={() => setOpenCity(null)}/>
    </div>
  );
};

// ============================================================
// Pathfinder tenants list (entry view)
// ============================================================

const V3PfTenantsList = ({ onSelect }) => (
  <section style={{ background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
    <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", alignItems: "baseline", gap: 10 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Active tenants</h3>
      <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>{V3_PF_TENANTS.length} tenants · click to drill in</span>
      <V3PdDemoTag/>
    </div>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr style={{ background: "var(--v3-bg)" }}>
        {["Tenant", "Status", "Primary", "Contract start", "Last touch", "Live", "Activating", "On deck", "MRR"].map((h, i) => (
          <th key={i} style={{ textAlign: i > 4 ? "right" : "left", padding: "10px 22px", fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>{h}</th>
        ))}
      </tr></thead>
      <tbody>
        {V3_PF_TENANTS.map((t, i) => (
          <tr key={t.id} onClick={() => onSelect(t.id)} style={{ borderTop: "1px solid var(--v3-line-soft)", cursor: "pointer" }}>
            <td style={{ padding: "12px 22px", fontSize: 14, fontWeight: 600, color: "var(--v3-ink)" }}>{t.name}</td>
            <td style={{ padding: "12px 22px" }}>
              <span style={{
                fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.4,
                background: t.status === "active" ? "rgba(31,138,91,0.10)" : t.status === "onboarding" ? "rgba(46,108,212,0.10)" : "rgba(232,158,58,0.12)",
                color:      t.status === "active" ? "#1F8A5B" : t.status === "onboarding" ? "#2E6CD4" : "#B97A0E",
              }}>{t.status}</span>
            </td>
            <td style={{ padding: "12px 22px", fontSize: 13, color: "var(--v3-ink-md)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Avatar name={t.primary} size={18}/>{t.primary}</div>
            </td>
            <td style={{ padding: "12px 22px", fontSize: 12.5, color: "var(--v3-ink-md)" }}>{t.contractStart}</td>
            <td style={{ padding: "12px 22px", fontSize: 12.5, color: "var(--v3-ink-md)" }}>{t.lastTouch}</td>
            <td className="mono" style={{ padding: "12px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-green)", fontWeight: 600 }}>{t.liveCities}</td>
            <td className="mono" style={{ padding: "12px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-amber)", fontWeight: 600 }}>{t.atvActivating}</td>
            <td className="mono" style={{ padding: "12px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-ink-md)" }}>{t.onDeck}</td>
            <td className="mono" style={{ padding: "12px 22px", fontSize: 12, textAlign: "right", color: "var(--v3-ink)", fontWeight: 600 }}>{t.mrr ? fmtMoney(t.mrr) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);

// ============================================================
// Top-level Pathfinder sub-tab
// ============================================================

const V3PathfinderTab = () => {
  const [tenantId, setTenantId] = React.useState(null);
  if (tenantId === "zedcor") return <V3ZedcorView onBack={() => setTenantId(null)}/>;
  if (tenantId) {
    // Other tenants — placeholder reusing the same component shell.
    return (
      <div style={{ background: "var(--v3-surface)", borderRadius: 12, padding: "32px", textAlign: "center" }}>
        <button onClick={() => setTenantId(null)} style={{
          padding: "6px 10px", fontSize: 12, color: "var(--v3-ink-md)",
          border: "1px solid var(--v3-line-strong)", borderRadius: 6,
          display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16,
        }}><I.ChevronL size={11}/> Tenants</button>
        <h3 style={{ fontSize: 18, color: "var(--v3-ink)", marginTop: 6 }}>{V3_PF_TENANTS.find(t => t.id === tenantId)?.name}</h3>
        <p style={{ color: "var(--v3-ink-lo)", marginTop: 8 }}>Same view template as Zedcor — populates once tenant has live cities.</p>
      </div>
    );
  }
  return <V3PfTenantsList onSelect={setTenantId}/>;
};

window.V3PathfinderTab = V3PathfinderTab;
