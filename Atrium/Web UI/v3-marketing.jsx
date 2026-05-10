/* v3-marketing.jsx — Marketing tab full content. Mounted from v3.jsx. */

const V3_CAMPAIGNS = [
  { name: "Manifesto launch",       status: "live",     channels: ["web","X","LinkedIn"], start: "Apr 22", goal: "10k page views",      progress: 6420, target: 10000, kpi: "page views" },
  { name: "Pathfinder waitlist",    status: "live",     channels: ["web","X"],            start: "Apr 30", goal: "500 waitlist signups", progress: 312,  target: 500,   kpi: "signups" },
  { name: "Metacron operator preview", status: "draft", channels: ["LinkedIn","email"],   start: "May 12", goal: "20 operator demos",    progress: 0,    target: 20,    kpi: "demos booked" },
];

const V3_CONTENT = [
  { title: "Atrium manifesto · part I",          channel: "Manifesto", date: "Apr 22", traction: "4,820 views" },
  { title: "Why we built Pathfinder",            channel: "Blog",      date: "Apr 28", traction: "2,140 views" },
  { title: "The taboo register, explained",      channel: "Blog",      date: "May 1",  traction: "1,580 views" },
  { title: "Pathfinder waitlist now open",       channel: "X",         date: "Apr 30", traction: "92k impressions" },
  { title: "On agent fleets and continuity",     channel: "LinkedIn",  date: "May 3",  traction: "18k impressions" },
  { title: "Metacron: an operator's playground", channel: "Blog",      date: "May 5",  traction: "920 views" },
  { title: "Continuity is the product",          channel: "X",         date: "May 6",  traction: "47k impressions" },
];

const V3_BRAND_ASSETS = [
  { name: "atrium-mark-gold.svg",     fmt: "SVG", folder: "Brand/Source",          color: "linear-gradient(135deg,#1D2D4F,#0B1530)", glyph: "A" },
  { name: "atrium-mark-light.svg",    fmt: "SVG", folder: "Brand/Source",          color: "linear-gradient(135deg,#F6F7F9,#E2E5EB)", glyph: "A", glyphColor: "#1D2D4F" },
  { name: "manifesto-cover.png",      fmt: "PNG", folder: "Brand/Manifesto Pages", color: "linear-gradient(135deg,#E8763A,#C75928)", glyph: "M" },
  { name: "manifesto-page-02.png",    fmt: "PNG", folder: "Brand/Manifesto Pages", color: "linear-gradient(135deg,#7355E5,#4D38B8)", glyph: "II" },
  { name: "manifesto-page-03.png",    fmt: "PNG", folder: "Brand/Manifesto Pages", color: "linear-gradient(135deg,#1F8A5B,#13653F)", glyph: "III" },
  { name: "hero-galaxy.png",          fmt: "PNG", folder: "Brand/Images",          color: "linear-gradient(135deg,#0B1530,#1D2D4F)", glyph: "✦" },
  { name: "hero-cockpit.png",         fmt: "PNG", folder: "Brand/Images",          color: "linear-gradient(135deg,#46506A,#1D2D4F)", glyph: "▢" },
  { name: "deck-cover.png",           fmt: "PNG", folder: "Brand/Presentation",    color: "linear-gradient(135deg,#E8763A,#1D2D4F)", glyph: "◐" },
  { name: "deck-thesis.png",          fmt: "PNG", folder: "Brand/Presentation",    color: "linear-gradient(135deg,#1D2D4F,#7355E5)", glyph: "◑" },
  { name: "social-square.png",        fmt: "PNG", folder: "Brand/Images",          color: "linear-gradient(135deg,#C9B27A,#8A7740)", glyph: "◇" },
  { name: "social-1200x630.png",      fmt: "PNG", folder: "Brand/Images",          color: "linear-gradient(135deg,#E8763A,#7355E5)", glyph: "◊" },
  { name: "wordmark.svg",             fmt: "SVG", folder: "Brand/Source",          color: "linear-gradient(135deg,#1D2D4F,#46506A)", glyph: "Aa" },
];

const V3MktDemoTag = () => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 600,
    letterSpacing: 0.5, textTransform: "uppercase", color: "var(--v3-ink-lo)",
    padding: "2px 7px", borderRadius: 4, background: "rgba(11,21,48,0.04)",
  }}>
    <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--v3-amber)" }}/>
    Demo data
  </span>
);

const V3CampaignCards = () => (
  <section>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Campaigns</h2>
      <V3MktDemoTag/>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
      {V3_CAMPAIGNS.map(c => {
        const pct = Math.round((c.progress / c.target) * 100);
        return (
          <div key={c.name} style={{
            background: "var(--v3-surface)", borderRadius: 12, padding: "20px 22px",
            boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--v3-ink)" }}>{c.name}</div>
              <span style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5,
                background: c.status === "live" ? "var(--v3-orange-soft)" : "var(--v3-bg-soft)",
                color:      c.status === "live" ? "var(--v3-orange)"      : "var(--v3-ink-md)",
              }}>{c.status}</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--v3-ink-lo)", marginBottom: 14 }}>{c.goal} · started {c.start}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span className="mono display" style={{ fontSize: 18, color: "var(--v3-ink)", fontWeight: 600 }}>{c.progress.toLocaleString()}</span>
              <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>of {c.target.toLocaleString()} {c.kpi}</span>
            </div>
            <div style={{ height: 6, background: "var(--v3-line-soft)", borderRadius: 999, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "var(--v3-orange)" }}/>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              {c.channels.map(ch => (
                <span key={ch} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: "var(--v3-bg-soft)", color: "var(--v3-ink-md)", textTransform: "capitalize" }}>{ch}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  </section>
);

const V3ContentTable = () => (
  <section style={{
    background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden",
    boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
  }}>
    <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", alignItems: "baseline", gap: 10 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Content</h3>
      <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>{V3_CONTENT.length} published · last 30d</span>
      <V3MktDemoTag/>
    </div>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr>
        {["Title","Channel","Publish date","Traction"].map((c, i) =>
          <th key={i} style={{ textAlign: i === 3 ? "right" : "left", padding: "11px 22px", fontSize: 12, fontWeight: 500, color: "var(--v3-ink-md)", borderBottom: "1px solid var(--v3-line)" }}>{c}</th>)}
      </tr></thead>
      <tbody>
        {V3_CONTENT.map((r, i) => (
          <tr key={i} style={{ borderBottom: "1px solid var(--v3-line-soft)" }}>
            <td style={{ padding: "13px 22px", fontSize: 13.5, color: "var(--v3-ink)" }}>{r.title}</td>
            <td style={{ padding: "13px 22px" }}>
              <span style={{ fontSize: 11.5, padding: "2px 8px", borderRadius: 4, background: "var(--v3-bg-soft)", color: "var(--v3-ink-md)", fontWeight: 500 }}>{r.channel}</span>
            </td>
            <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-lo)" }}>{r.date}</td>
            <td style={{ padding: "13px 22px", fontSize: 13, color: "var(--v3-ink)", textAlign: "right" }} className="mono">{r.traction}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);

const V3MktAnalytics = () => {
  // 1. Site traffic line over 30d
  const traffic = [120,140,135,160,180,170,210,240,260,250,280,310,330,320,360,400,440,420,460,500,540,520,560,610,640,620,680,720,760,820];
  const W1 = 360, H1 = 140, padL = 36, padR = 8, padT = 14, padB = 22;
  const max1 = Math.max(...traffic);
  const pts = traffic.map((v, i) => [padL + (i / (traffic.length-1)) * (W1-padL-padR), padT + (1 - v/max1) * (H1-padT-padB)]);
  const d1 = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  const fillD1 = `${d1} L ${pts[pts.length-1][0]} ${H1-padB} L ${pts[0][0]} ${H1-padB} Z`;

  // 2. Conversion funnel
  const funnel = [
    { stage: "Visitors", v: 6420, color: "#E8763A" },
    { stage: "Read >1m", v: 2840, color: "#E8763A" },
    { stage: "CTA clicks", v: 612, color: "#E8763A" },
    { stage: "Signups",  v: 312, color: "#E8763A" },
  ];

  // 3. Attribution pie
  const attribution = [
    { ch: "Direct",    v: 38, color: "#E8763A" },
    { ch: "X",         v: 27, color: "#F0945F" },
    { ch: "LinkedIn",  v: 18, color: "#FFB58A" },
    { ch: "Search",    v: 12, color: "#FFD2B3" },
    { ch: "Referral",  v:  5, color: "#FFE6D4" },
  ];
  let cum = 0;
  const total = attribution.reduce((s, a) => s + a.v, 0);
  const cx = 70, cy = 70, r = 58;
  const slices = attribution.map(a => {
    const start = (cum / total) * Math.PI * 2 - Math.PI/2;
    cum += a.v;
    const end = (cum / total) * Math.PI * 2 - Math.PI/2;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + Math.cos(start) * r, y1 = cy + Math.sin(start) * r;
    const x2 = cx + Math.cos(end)   * r, y2 = cy + Math.sin(end)   * r;
    return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`, color: a.color, label: a.ch, v: a.v };
  });

  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Analytics</h2>
        <V3MktDemoTag/>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        <div style={{ background: "var(--v3-surface)", borderRadius: 12, padding: "18px 22px", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
          <div style={{ fontSize: 13, color: "var(--v3-ink-md)" }}>Site traffic · 30d</div>
          <div className="display" style={{ fontSize: 24, fontWeight: 600, color: "var(--v3-ink)", marginTop: 4 }}>11.4k <span style={{ fontSize: 13, color: "var(--v3-green)", fontWeight: 600 }}>+38%</span></div>
          <svg viewBox={`0 0 ${W1} ${H1}`} style={{ width: "100%", height: H1, display: "block", marginTop: 8 }}>
            <path d={fillD1} fill="#E8763A" opacity="0.13"/>
            <path d={d1} stroke="#E8763A" strokeWidth="2" fill="none"/>
          </svg>
        </div>

        <div style={{ background: "var(--v3-surface)", borderRadius: 12, padding: "18px 22px", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
          <div style={{ fontSize: 13, color: "var(--v3-ink-md)", marginBottom: 12 }}>Conversion funnel</div>
          {funnel.map((s, i) => {
            const w = (s.v / funnel[0].v) * 100;
            return (
              <div key={s.stage} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "var(--v3-ink)" }}>{s.stage}</span>
                  <span className="mono" style={{ color: "var(--v3-ink-md)" }}>{s.v.toLocaleString()} · {Math.round((s.v/funnel[0].v)*100)}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "var(--v3-line-soft)", overflow: "hidden" }}>
                  <div style={{ width: `${w}%`, height: "100%", background: s.color, opacity: 1 - i*0.15 }}/>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ background: "var(--v3-surface)", borderRadius: 12, padding: "18px 22px", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
          <div style={{ fontSize: 13, color: "var(--v3-ink-md)", marginBottom: 12 }}>Attribution</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg viewBox="0 0 140 140" style={{ width: 130, height: 130, flexShrink: 0 }}>
              {slices.map((s, i) => <path key={i} d={s.d} fill={s.color}/>)}
              <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--v3-surface)"/>
            </svg>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              {attribution.map(a => (
                <div key={a.ch} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: a.color }}/>
                  <span style={{ color: "var(--v3-ink-md)", flex: 1 }}>{a.ch}</span>
                  <span className="mono" style={{ color: "var(--v3-ink)", fontWeight: 600 }}>{a.v}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const V3BrandAssets = () => (
  <section>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Brand assets</h2>
      <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>{V3_BRAND_ASSETS.length} files · /Brand/</span>
      <V3MktDemoTag/>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
      {V3_BRAND_ASSETS.map(a => (
        <div key={a.name} title={`${a.name} · ${a.folder}`} style={{
          background: "var(--v3-surface)", borderRadius: 10, overflow: "hidden",
          boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 12px rgba(11,21,48,0.05)",
          cursor: "pointer", transition: "transform 120ms",
        }}
        onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
        onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
        >
          <div style={{
            aspectRatio: "1.4", background: a.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 36, fontWeight: 700, color: a.glyphColor || "#FFF",
            fontFamily: "Geist, sans-serif", letterSpacing: -1,
          }}>{a.glyph}</div>
          <div style={{ padding: "10px 12px" }}>
            <div style={{ fontSize: 12, color: "var(--v3-ink)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
            <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", marginTop: 2, display: "flex", justifyContent: "space-between" }}>
              <span>{a.folder.split("/")[1]}</span>
              <span className="mono">{a.fmt}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  </section>
);

const V3MarketingScreen = () => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--v3-rail)" }}>
    <V3Topbar active="marketing"/>
    <V3PageBody>
      <V3PageTitle title="Marketing"/>
      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <V3StatCard label="Site visits 30d" value="11.4" suffix="k" delta="+38%" deltaTone="ok" sparkline={[120,180,210,260,320,400,500,640,820]} sparkColor="var(--v3-orange)" fill/>
          <V3StatCard label="Waitlist" value="312" delta="+58 this wk" deltaTone="ok" sparkline={[180,200,230,250,270,290,312]} sparkColor="var(--v3-orange)" fill/>
          <V3StatCard label="Manifesto reads" value="6,420" sub="part I · 4 days"/>
          <V3StatCard label="Reply rate" value="6.2" suffix="%" delta="+1.4pp" deltaTone="ok"/>
        </div>
        <V3CampaignCards/>
        <V3ContentTable/>
        <V3MktAnalytics/>
        <V3BrandAssets/>
      </div>
    </V3PageBody>
  </div>
);

window.V3MarketingScreen = V3MarketingScreen;
