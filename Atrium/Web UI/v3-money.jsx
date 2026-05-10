/* v3-money.jsx — Money tab full content. Mounted from v3.jsx. */

const V3_ACCOUNTS = [
  { name: "Supabase",         status: "ok",   cat: "infra", cost: 599,   billed: "May 1",  owner: "Kyle B"   },
  { name: "Vercel",           status: "warn", cat: "infra", cost: 240,   billed: "May 3",  owner: "Kyle B"   },
  { name: "OpenAI",           status: "ok",   cat: "LLM",   cost: 1820,  billed: "May 1",  owner: "Kyle B"   },
  { name: "Anthropic",        status: "warn", cat: "LLM",   cost: 1240,  billed: "May 5",  owner: "Kyle B"   },
  { name: "Slack (paid)",     status: "ok",   cat: "comms", cost: 96,    billed: "Apr 28", owner: "Curtis L" },
  { name: "Notion",           status: "ok",   cat: "tools", cost: 48,    billed: "May 2",  owner: "Curtis L" },
  { name: "GitHub",           status: "ok",   cat: "infra", cost: 84,    billed: "May 1",  owner: "Keenan O" },
  { name: "Plaud",            status: "ok",   cat: "tools", cost: 24,    billed: "Apr 30", owner: "Kyle B"   },
  { name: "Fathom",           status: "ok",   cat: "tools", cost: 32,    billed: "May 4",  owner: "Curtis L" },
  { name: "Google Workspace", status: "ok",   cat: "comms", cost: 54,    billed: "May 1",  owner: "Kyle B"   },
  { name: "Inngest",          status: "ok",   cat: "infra", cost: 120,   billed: "May 2",  owner: "Keenan O" },
  { name: "Higgsfield",       status: "ok",   cat: "tools", cost: 65,    billed: "May 6",  owner: "Curtis L" },
];

const V3_CAT_COLORS = { infra: "#2E6CD4", LLM: "#7355E5", tools: "#1F8A5B", comms: "#E8763A" };

const V3_RUNWAY = (() => {
  const months = ["May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr"];
  let cash = 524000; const burn = 23800;
  return months.map(m => { cash -= burn; return { m, cash: Math.max(0, cash) }; });
})();

const V3_EXPENSES = [
  { m: "Dec", infra: 1100, llm: 2400, tools: 280, contractors: 4500, marketing: 600,  other: 200 },
  { m: "Jan", infra: 1200, llm: 2700, tools: 300, contractors: 5200, marketing: 800,  other: 220 },
  { m: "Feb", infra: 1180, llm: 2900, tools: 320, contractors: 4800, marketing: 1200, other: 240 },
  { m: "Mar", infra: 1240, llm: 3100, tools: 340, contractors: 6000, marketing: 1400, other: 260 },
  { m: "Apr", infra: 1320, llm: 3300, tools: 360, contractors: 6800, marketing: 1500, other: 280 },
  { m: "May", infra: 1043, llm: 3060, tools: 369, contractors: 7200, marketing: 1800, other: 320 },
];
const V3_EXP_KEYS = [
  { id: "infra",       label: "Infrastructure", color: "#2E6CD4" },
  { id: "llm",         label: "LLM tokens",     color: "#7355E5" },
  { id: "tools",       label: "Tools / SaaS",   color: "#1F8A5B" },
  { id: "contractors", label: "Contractors",    color: "#E8763A" },
  { id: "marketing",   label: "Marketing",      color: "#C28A1F" },
  { id: "other",       label: "Other",          color: "#7E8AA3" },
];

const V3_SPIKES = [
  { ts: "May 5 · 14:22", cat: "LLM",   svc: "Anthropic", baseline: "$28/d", spike: "$67/d", ratio: "2.4x", reason: "Trend Scout long-context runs" },
  { ts: "May 7 · 06:08", cat: "infra", svc: "Vercel",    baseline: "$8/d",  spike: "$22/d", ratio: "2.7x", reason: "Bandwidth — Pathfinder waitlist surge" },
  { ts: "May 4 · 19:45", cat: "LLM",   svc: "OpenAI",    baseline: "$60/d", spike: "$94/d", ratio: "1.6x", reason: "Inbox triage retry storm" },
];

const V3MoneyDemoTag = () => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5,
    fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
    color: "var(--v3-ink-lo)", padding: "2px 7px", borderRadius: 4,
    background: "rgba(11,21,48,0.04)",
  }}>
    <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--v3-amber)" }}/>
    Demo data
  </span>
);

const V3MoneyAccounts = () => (
  <section style={{
    background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden",
    boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
  }}>
    <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", alignItems: "baseline", gap: 10 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Connected accounts</h3>
      <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>{V3_ACCOUNTS.length} services · ${V3_ACCOUNTS.reduce((s,a)=>s+a.cost,0).toLocaleString()}/mo</span>
      <V3MoneyDemoTag/>
    </div>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr>
        {["Service","Status","Category","Monthly","Last billed","Owner",""].map((c, i) =>
          <th key={i} style={{ textAlign: i === 3 ? "right" : i === 6 ? "right" : "left", padding: "11px 22px", fontSize: 12, fontWeight: 500, color: "var(--v3-ink-md)", borderBottom: "1px solid var(--v3-line)" }}>{c}</th>)}
      </tr></thead>
      <tbody>
        {V3_ACCOUNTS.map((a, i) => (
          <tr key={i} style={{ borderBottom: "1px solid var(--v3-line-soft)" }}>
            <td style={{ padding: "13px 22px", fontSize: 13.5, color: "var(--v3-ink)", fontWeight: 500 }}>{a.name}</td>
            <td style={{ padding: "13px 22px" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: a.status === "ok" ? "var(--v3-green)" : a.status === "warn" ? "var(--v3-amber)" : "var(--v3-red)", display: "inline-block" }}/>
            </td>
            <td style={{ padding: "13px 22px" }}>
              <span style={{ fontSize: 11.5, padding: "2px 8px", borderRadius: 999, background: V3_CAT_COLORS[a.cat] + "1A", color: V3_CAT_COLORS[a.cat], fontWeight: 600, textTransform: "capitalize" }}>{a.cat}</span>
            </td>
            <td style={{ padding: "13px 22px", fontSize: 13, color: "var(--v3-ink)", textAlign: "right" }} className="mono">${a.cost.toLocaleString()}</td>
            <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-lo)" }}>{a.billed}</td>
            <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-md)" }}>{a.owner}</td>
            <td style={{ padding: "13px 22px", textAlign: "right" }}>
              <button style={{ color: "var(--v3-blue)", fontSize: 12.5 }}>Open ↗</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);

const V3RunwayChart = () => {
  const W = 800, H = 240, padL = 50, padR = 20, padT = 20, padB = 32;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = V3_RUNWAY[0].cash;
  const endIdx = V3_RUNWAY.findIndex(r => r.cash <= 0);
  const pts = V3_RUNWAY.map((r, i) => [
    padL + (i / (V3_RUNWAY.length - 1)) * innerW,
    padT + (1 - r.cash / max) * innerH,
  ]);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  const fillD = `${d} L ${pts[pts.length-1][0]} ${padT + innerH} L ${pts[0][0]} ${padT + innerH} Z`;
  const endX = endIdx >= 0 ? padL + (endIdx / (V3_RUNWAY.length - 1)) * innerW : null;
  return (
    <section style={{
      background: "var(--v3-surface)", borderRadius: 12, padding: "22px 26px",
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Runway · 12 month projection</h3>
          <V3MoneyDemoTag/>
        </div>
        <div style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>
          22 months · runway ends <span style={{ color: "var(--v3-red)", fontWeight: 600 }}>{V3_RUNWAY[endIdx]?.m || "—"}</span> at current burn
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
        {[0,0.25,0.5,0.75,1].map(t => (
          <g key={t}>
            <line x1={padL} x2={W-padR} y1={padT + t*innerH} y2={padT + t*innerH} stroke="var(--v3-line-soft)"/>
            <text x={padL-8} y={padT + t*innerH + 3} textAnchor="end" fontSize="10" fill="var(--v3-ink-lo)">${Math.round((1-t)*max/1000)}k</text>
          </g>
        ))}
        <path d={fillD} fill="var(--v3-blue)" opacity="0.10"/>
        <path d={d} stroke="var(--v3-blue)" strokeWidth="2" fill="none"/>
        {endX !== null && (
          <g>
            <line x1={endX} x2={endX} y1={padT} y2={padT+innerH} stroke="var(--v3-red)" strokeWidth="1.5" strokeDasharray="4 3"/>
            <text x={endX} y={padT-6} textAnchor="middle" fontSize="11" fill="var(--v3-red)" fontWeight="600">Runway end</text>
          </g>
        )}
        {V3_RUNWAY.map((r, i) => (
          <text key={i} x={padL + (i / (V3_RUNWAY.length - 1)) * innerW} y={H - 10} textAnchor="middle" fontSize="10" fill="var(--v3-ink-lo)">{r.m}</text>
        ))}
      </svg>
    </section>
  );
};

const V3RevenuePanel = () => (
  <section style={{
    background: "var(--v3-surface)", borderRadius: 12, padding: "30px 26px",
    boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap",
  }}>
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Revenue</h3>
      <div style={{ fontSize: 13.5, color: "var(--v3-ink-md)", marginTop: 6 }}>No revenue connector configured yet — pre-revenue, Zedcor pilot in flight.</div>
    </div>
    <button style={{ padding: "10px 18px", borderRadius: 8, background: "var(--v3-orange)", color: "#FFF", fontSize: 13.5, fontWeight: 600 }}>Connect Stripe</button>
  </section>
);

const V3ExpensesChart = () => {
  const W = 800, H = 280, padL = 50, padR = 20, padT = 20, padB = 36;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const totals = V3_EXPENSES.map(m => V3_EXP_KEYS.reduce((s, k) => s + m[k.id], 0));
  const max = Math.max(...totals);
  const bw = innerW / V3_EXPENSES.length;
  return (
    <section style={{
      background: "var(--v3-surface)", borderRadius: 12, padding: "22px 26px",
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Expenses · last 6 months</h3>
          <V3MoneyDemoTag/>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {V3_EXP_KEYS.map(k => (
            <span key={k.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--v3-ink-md)" }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: k.color }}/>{k.label}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
        {[0,0.25,0.5,0.75,1].map(t => (
          <g key={t}>
            <line x1={padL} x2={W-padR} y1={padT + t*innerH} y2={padT + t*innerH} stroke="var(--v3-line-soft)"/>
            <text x={padL-8} y={padT + t*innerH + 3} textAnchor="end" fontSize="10" fill="var(--v3-ink-lo)">${Math.round((1-t)*max/1000)}k</text>
          </g>
        ))}
        {V3_EXPENSES.map((m, i) => {
          let acc = 0;
          const x = padL + i * bw + bw * 0.2;
          const w = bw * 0.6;
          return (
            <g key={i}>
              {V3_EXP_KEYS.map(k => {
                const v = m[k.id];
                const h = (v / max) * innerH;
                const y = padT + innerH - acc - h;
                acc += h;
                return <rect key={k.id} x={x} y={y} width={w} height={h} fill={k.color}/>;
              })}
              <text x={x + w/2} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--v3-ink-md)">{m.m}</text>
              <text x={x + w/2} y={padT + innerH - acc - 6} textAnchor="middle" fontSize="10.5" fill="var(--v3-ink)" fontWeight="600">${Math.round(totals[i]/1000)}k</text>
            </g>
          );
        })}
      </svg>
    </section>
  );
};

const V3SpikeAlerts = () => {
  const [acked, setAcked] = React.useState({});
  return (
    <section style={{
      background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden",
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    }}>
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", alignItems: "baseline", gap: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Cost spike alerts</h3>
        <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>{V3_SPIKES.filter(s => !acked[s.svc]).length} active</span>
        <V3MoneyDemoTag/>
      </div>
      {V3_SPIKES.map((s, i) => (
        <div key={i} style={{
          padding: "16px 22px", borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)",
          display: "flex", alignItems: "center", gap: 14, opacity: acked[s.svc] ? 0.5 : 1,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--v3-amber)", flexShrink: 0 }}/>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 14, color: "var(--v3-ink)", fontWeight: 500 }}>{s.svc} · {s.ratio} baseline</span>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--v3-ink-lo)" }}>{s.ts}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--v3-ink-md)", marginTop: 3 }}>
              Baseline {s.baseline} · spiked to <span style={{ color: "var(--v3-amber)", fontWeight: 600 }}>{s.spike}</span> · {s.reason}
            </div>
          </div>
          {acked[s.svc] ? (
            <span style={{ fontSize: 12.5, color: "var(--v3-green)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}><I.Check size={12}/> Acknowledged</span>
          ) : (
            <button onClick={() => setAcked({ ...acked, [s.svc]: true })} style={{
              padding: "7px 14px", borderRadius: 7, border: "1px solid var(--v3-line-strong)",
              fontSize: 12.5, fontWeight: 500, color: "var(--v3-ink)",
            }}>Acknowledge</button>
          )}
        </div>
      ))}
    </section>
  );
};

const V3MoneyScreen = () => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--v3-rail)" }}>
    <V3Topbar active="money"/>
    <V3PageBody>
      <V3PageTitle title="Money"/>
      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <V3StatCard label="Cash on hand" value="$524" suffix="k" sparkline={[500,510,515,520,524,524]} sparkColor="var(--v3-blue)" fill/>
          <V3StatCard label="Runway" value="22" suffix="mo" delta="+2mo" deltaTone="ok" sparkline={[18,18,19,20,20,21,21,22]} sparkColor="var(--v3-green)" fill/>
          <V3StatCard label="Net MRR" value="$0" sub="pre-revenue · Zedcor pilot"/>
          <V3StatCard label="Burn 30d" value="$23.8" suffix="k" delta="+8%" deltaTone="err" sparkline={[20,21,22,22,23,24,23.8]} sparkColor="var(--v3-orange)" fill/>
        </div>
        <V3MoneyAccounts/>
        <V3RunwayChart/>
        <V3RevenuePanel/>
        <V3ExpensesChart/>
        <V3SpikeAlerts/>
      </div>
    </V3PageBody>
  </div>
);

window.V3MoneyScreen = V3MoneyScreen;
