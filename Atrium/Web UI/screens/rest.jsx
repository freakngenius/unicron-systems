/* Atrium — Marketing, Products, System, Library screens */

// ---------- MARKETING ----------
const MarketingScreen = () => {
  const [tab, setTab] = React.useState("campaigns");
  const campaigns = [
    { name: "Pathfinder v3 launch", status: "live", reach: "12.4k", ctr: "3.2%", spend: "$1,200", trend: [2,3,4,6,8,10,12] },
    { name: "Founder letter — May", status: "draft", reach: "—", ctr: "—", spend: "$0", trend: null },
    { name: "Cold outbound — Q2 ICP", status: "live", reach: "640 sent", ctr: "8.1% reply", spend: "$240", trend: [1,2,2,3,3,4,4] },
    { name: "Webinar · Agent platforms", status: "scheduled", reach: "320 reg.", ctr: "—", spend: "$0", trend: null },
  ];
  const content = [
    { title: "Why we don't believe in autonomous CEOs", type: "Essay", views: "8.2k", react: "+418", date: "May 3" },
    { title: "Pathfinder pricing, finally", type: "Post", views: "3.1k", react: "+126", date: "Apr 28" },
    { title: "How we use refusal-gates", type: "Engineering", views: "12.4k", react: "+822", date: "Apr 12" },
  ];
  return (
    <div style={{ flex: 1, padding: "20px 28px 28px", overflow: "auto" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", fontWeight: 500, margin: 0, letterSpacing: -0.5 }}>Marketing</h1>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-md)", marginTop: 4 }}>Campaigns, content, analytics, brand</div>
      </div>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-subtle)", marginBottom: 20 }}>
        {["campaigns","content","analytics","brand"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 14px", marginBottom: -1, fontSize: "var(--text-sm)", fontWeight: 500, textTransform: "capitalize",
            color: tab === t ? "var(--text-hi)" : "var(--text-md)",
            borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
          }}>{t}</button>
        ))}
      </div>
      {tab === "campaigns" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {campaigns.map(c => (
            <div key={c.name} style={{ padding: 16, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--r-lg)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <Pill tone={c.status === "live" ? "ok" : c.status === "draft" ? "neutral" : "info"} size="xs">{c.status}</Pill>
                {c.trend && <Sparkline data={c.trend} w={60} h={20} color="var(--accent)" fill/>}
              </div>
              <div style={{ fontSize: "var(--text-md)", color: "var(--text-hi)", fontWeight: 500, marginBottom: 12 }}>{c.name}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[["Reach", c.reach], ["CTR/Reply", c.ctr], ["Spend", c.spend]].map(([k, v], i) => (
                  <div key={i}>
                    <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-lo)" }}>{k}</div>
                    <div className="mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-hi)", marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === "content" && (
        <Card>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                {["Title","Type","Views","Reactions","Published"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 0", fontSize: "var(--text-2xs)", color: "var(--text-lo)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {content.map((c, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                  <td style={{ padding: "12px 8px 12px 0", fontSize: "var(--text-sm)", color: "var(--text-hi)" }}>{c.title}</td>
                  <td style={{ padding: "12px 0" }}><Pill tone="neutral" size="xs">{c.type}</Pill></td>
                  <td style={{ padding: "12px 0", fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--text-md)" }}>{c.views}</td>
                  <td style={{ padding: "12px 0", fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--ok)" }}>{c.react}</td>
                  <td style={{ padding: "12px 0", fontSize: "var(--text-xs)", color: "var(--text-lo)" }}>{c.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {tab === "analytics" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card title="Site traffic · 30d">
            <LineChart h={200} series={[
              { color: "var(--accent)", data: [120,140,135,180,210,230,250,240,260,280,290,300,310,320,340] }
            ]}/>
          </Card>
          <Card title="Channel mix">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <DistBar label="Direct" percent={42} color="var(--accent)"/>
              <DistBar label="Search" percent={28} color="var(--info)"/>
              <DistBar label="Social" percent={18} color="var(--cat-memory)"/>
              <DistBar label="Referral" percent={12} color="var(--ok)"/>
            </div>
          </Card>
        </div>
      )}
      {tab === "brand" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
          {["Wordmark","Mark · solid","Mark · outline","Hero gradient","Type spec","Color tokens"].map((n, i) => (
            <div key={i} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--r-lg)", overflow: "hidden" }}>
              <div style={{
                aspectRatio: "16/10",
                background: i === 3 ? "linear-gradient(135deg, var(--accent), #B5532A 60%, #1a1410)"
                  : `repeating-linear-gradient(45deg, var(--bg-raised) 0 6px, var(--bg-elevated) 6px 12px)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--text-md)", fontSize: "var(--text-xs)",
              }}>
                {i === 0 && <span style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--text-hi)", fontWeight: 600 }}>unicron</span>}
                {i === 1 && <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--accent)" }}/>}
                {i === 2 && <div style={{ width: 40, height: 40, borderRadius: 10, border: "2px solid var(--accent)" }}/>}
                {i === 3 && <span style={{ fontFamily: "var(--font-display)", color: "#fff", fontWeight: 600 }}>UNI</span>}
              </div>
              <div style={{ padding: "10px 12px", fontSize: "var(--text-xs)", color: "var(--text-md)" }}>{n}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------- PRODUCTS ----------
const ProductsScreen = () => {
  const [tab, setTab] = React.useState("pathfinder");
  return (
    <div style={{ flex: 1, padding: "20px 28px 28px", overflow: "auto" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", fontWeight: 500, margin: 0, letterSpacing: -0.5 }}>Products</h1>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-md)", marginTop: 4 }}>Pathfinder · Metacron</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-subtle)", marginBottom: 20 }}>
        {[{id:"pathfinder",label:"Pathfinder"},{id:"metacron",label:"Metacron"}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 14px", marginBottom: -1, fontSize: "var(--text-sm)", fontWeight: 500,
            color: tab === t.id ? "var(--text-hi)" : "var(--text-md)",
            borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
          }}>{t.label}</button>
        ))}
      </div>
      {tab === "pathfinder" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <Metric label="Active accounts" value="8" delta="+2" deltaTone="ok" spark={[5,5,6,7,7,8,8]}/>
            <Metric label="Leads scored / day" value="412" delta="+18%" deltaTone="ok" spark={[280,310,340,360,380,400,412]}/>
            <Metric label="Conversion" value="14.2" unit="%" delta="+1.8" deltaTone="ok" spark={[10,11,12,12.5,13,13.8,14.2]}/>
            <Metric label="P95 latency" value="241" unit="ms" delta="-12ms" deltaTone="ok" spark={[260,255,250,248,245,243,241]} sparkColor="var(--info)"/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
            <Card title="Lead volume" subtitle="Last 14 days">
              <LineChart h={200} series={[
                { color: "var(--accent)", data: [280,300,310,320,310,330,350,360,370,380,390,400,410,412] },
                { color: "var(--info)", data: [40,50,55,60,58,62,68,70,72,76,78,80,82,84] }
              ]}/>
              <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: "var(--text-xs)", color: "var(--text-md)" }}>
                <span><span style={{ color: "var(--accent)" }}>●</span> Scored</span>
                <span><span style={{ color: "var(--info)" }}>●</span> Qualified</span>
              </div>
            </Card>
            <Card title="Top accounts by usage">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  ["northwind", "0x4612…d553", 280, "12.4%"],
                  ["helix", "0xbfac…1d85", 197, "8.7%"],
                  ["zenith", "0xe6c4…9b89", 100, "4.4%"],
                  ["beacon", "0xf07a…59a8", 92, "4.1%"],
                  ["atlas", "0xd044…3678", 89, "3.9%"],
                ].map(([n, addr, owned, p], i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="mono" style={{ fontSize: "var(--text-2xs)", color: "var(--text-lo)", width: 14 }}>{i+1}</span>
                    <Avatar name={n} size={22} color={`linear-gradient(135deg, hsl(${i*70} 50% 55%), hsl(${i*70+20} 40% 35%))`}/>
                    <span style={{ flex: 1, fontSize: "var(--text-sm)", color: "var(--text-hi)" }}>{n}</span>
                    <span className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)" }}>{addr}</span>
                    <span className="mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-hi)", minWidth: 40, textAlign: "right" }}>{owned}</span>
                    <span className="mono" style={{ fontSize: "var(--text-sm)", color: "var(--accent)", minWidth: 50, textAlign: "right" }}>{p}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
      {tab === "metacron" && (
        <Card title="Metacron · Agent fleet" subtitle="12 agents · 4 idle, 6 working, 2 cooldown">
          <div style={{ position: "relative", height: 360, background: "radial-gradient(ellipse at center, rgba(232,118,58,0.06), transparent 60%)", borderRadius: "var(--r-md)", border: "1px solid var(--border-faint)", overflow: "hidden" }}>
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i / 12) * Math.PI * 2;
              const r = 110 + (i % 3) * 30;
              const cx = 50 + (Math.cos(angle) * r) / 5;
              const cy = 50 + (Math.sin(angle) * r) / 5;
              const states = ["ok","ok","info","ok","warn","ok","ok","ok","info","ok","warn","ok"];
              const tone = states[i];
              const c = tone === "ok" ? "var(--ok)" : tone === "info" ? "var(--info)" : "var(--warn)";
              return (
                <div key={i} style={{
                  position: "absolute", left: `${cx}%`, top: `${cy}%`,
                  transform: "translate(-50%, -50%)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: c, boxShadow: `0 0 12px ${c}` }}/>
                  <span className="mono" style={{ fontSize: "var(--text-2xs)", color: "var(--text-md)" }}>agent-{i+1}</span>
                </div>
              );
            })}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ width: 70, height: 70, borderRadius: "50%", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", fontWeight: 600 }}>12</span>
                <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-lo)" }}>agents</span>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

// ---------- SYSTEM ----------
const SystemScreen = () => {
  const [tab, setTab] = React.useState("agents");
  const refusals = [
    { t: "08:42", action: "Send weekly metrics email to ops@vendor.io", taboo: "customer-data-egress", reason: "Recipient not whitelisted", status: "blocked" },
    { t: "07:19", action: "Update pricing in Pathfinder DB", taboo: "money-rules-edit", reason: "No human approval", status: "blocked" },
    { t: "Yesterday", action: "Auto-archive vault doc 'Old ICP'", taboo: "vault-erasure", reason: "Doc has continuity refs", status: "blocked" },
    { t: "Yesterday", action: "Reply on behalf of Curtis to Slack DM", taboo: "voice-impersonation", reason: "Direct message to non-team", status: "blocked" },
    { t: "2d", action: "Push agent build to Metacron prod", taboo: "—", reason: "—", status: "overridden", overrideBy: "Keenan O" },
  ];
  const services = [
    { name: "Pathfinder API", status: "ok", uptime: "99.98%", p95: "241ms" },
    { name: "Metacron Control", status: "ok", uptime: "99.91%", p95: "180ms" },
    { name: "Vault Embeddings", status: "ok", uptime: "100%", p95: "62ms" },
    { name: "Capture Pipeline", status: "warn", uptime: "98.4%", p95: "1.4s" },
    { name: "Supabase Postgres", status: "ok", uptime: "100%", p95: "8ms" },
  ];
  return (
    <div style={{ flex: 1, padding: "20px 28px 28px", overflow: "auto" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", fontWeight: 500, margin: 0, letterSpacing: -0.5 }}>System</h1>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-md)", marginTop: 4 }}>Agents, taboos, refusals, services, decay, jobs, audit</div>
      </div>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-subtle)", marginBottom: 20, overflowX: "auto" }} className="no-scrollbar">
        {["agents","taboos","refusals","services","decay","jobs","audit"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 14px", marginBottom: -1, fontSize: "var(--text-sm)", fontWeight: 500, textTransform: "capitalize", whiteSpace: "nowrap",
            color: tab === t ? "var(--text-hi)" : "var(--text-md)",
            borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
          }}>{t}</button>
        ))}
      </div>
      {tab === "agents" && (
        <Card title="Agent galaxy" subtitle="12 agents · click to drill in">
          <div style={{ position: "relative", height: 380 }}>
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i / 12) * Math.PI * 2;
              const r = 38 + (i % 2) * 8;
              const cx = 50 + Math.cos(angle) * r;
              const cy = 50 + Math.sin(angle) * r;
              const tone = ["ok","ok","info","ok","warn","ok","ok","ok","info","ok","ok","ok"][i];
              const c = { ok: "var(--ok)", info: "var(--info)", warn: "var(--warn)" }[tone];
              return (
                <div key={i} style={{ position: "absolute", left: `${cx}%`, top: `${cy}%`, transform: "translate(-50%,-50%)" }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", background: c, boxShadow: `0 0 14px ${c}40` }}/>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      {tab === "taboos" && (
        <Card title="Taboos" subtitle="Hard rules. Edits require unanimous human approval." action={<Btn size="sm">Propose change</Btn>}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              ["customer-data-egress", "Never send customer-tagged data to non-whitelisted destinations", 4],
              ["money-rules-edit", "Never modify pricing, billing, or invoices without human approval", 2],
              ["vault-erasure", "Never delete vault docs with continuity references", 1],
              ["voice-impersonation", "Never reply as a human team member without explicit consent", 3],
              ["self-modification", "Never edit Atrium source or alter taboos at runtime", 0],
            ].map(([slug, desc, hits], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderTop: i === 0 ? "none" : "1px solid var(--border-faint)" }}>
                <I.Shield size={16} style={{ color: "var(--accent)" }}/>
                <div style={{ flex: 1 }}>
                  <div className="mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-hi)" }}>{slug}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-md)", marginTop: 2 }}>{desc}</div>
                </div>
                <span className="mono" style={{ fontSize: "var(--text-xs)", color: hits > 0 ? "var(--warn)" : "var(--text-lo)" }}>{hits} hits / 30d</span>
                <Btn size="sm">Edit</Btn>
              </div>
            ))}
          </div>
        </Card>
      )}
      {tab === "refusals" && (
        <Card title="Refusal log" subtitle="Last 30 days · 14 total · 13 blocked, 1 overridden">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                {["Time","Action attempted","Matched taboo","Reason","Status"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 0", fontSize: "var(--text-2xs)", color: "var(--text-lo)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {refusals.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-faint)" }}>
                  <td style={{ padding: "12px 8px 12px 0", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-lo)" }}>{r.t}</td>
                  <td style={{ padding: "12px 0", fontSize: "var(--text-sm)", color: "var(--text-hi)" }}>{r.action}</td>
                  <td style={{ padding: "12px 0" }}>
                    {r.taboo === "—" ? <span style={{ color: "var(--text-lo)" }}>—</span>
                      : <span className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--accent)" }}>{r.taboo}</span>}
                  </td>
                  <td style={{ padding: "12px 0", fontSize: "var(--text-xs)", color: "var(--text-md)" }}>{r.reason}</td>
                  <td style={{ padding: "12px 0" }}>
                    <Pill tone={r.status === "blocked" ? "err" : "warn"} size="xs">
                      {r.status}{r.overrideBy ? ` · ${r.overrideBy}` : ""}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {tab === "services" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {services.map(s => (
            <div key={s.name} style={{ padding: 16, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--r-lg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <StatusDot tone={s.status}/>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--text-hi)", fontWeight: 500 }}>{s.name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)" }}>
                <div><div style={{ color: "var(--text-lo)" }}>Uptime</div><div className="mono" style={{ color: "var(--text-hi)", marginTop: 2 }}>{s.uptime}</div></div>
                <div><div style={{ color: "var(--text-lo)" }}>P95</div><div className="mono" style={{ color: "var(--text-hi)", marginTop: 2 }}>{s.p95}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === "decay" && (
        <Card title="Decay heatmap" subtitle="Vault docs by recency">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(28, 1fr)", gap: 3 }}>
            {Array.from({ length: 28 * 6 }).map((_, i) => {
              const v = Math.random();
              const c = v > 0.7 ? "var(--err)" : v > 0.4 ? "var(--warn)" : v > 0.2 ? "var(--ok)" : "rgba(79,178,134,0.4)";
              return <div key={i} style={{ aspectRatio: 1, background: c, borderRadius: 2, opacity: 0.55 + v * 0.45 }}/>;
            })}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: "var(--text-xs)", color: "var(--text-md)" }}>
            <span><span style={{ color: "var(--ok)" }}>●</span> Fresh</span>
            <span><span style={{ color: "var(--warn)" }}>●</span> Aging</span>
            <span><span style={{ color: "var(--err)" }}>●</span> Decaying</span>
          </div>
        </Card>
      )}
      {tab === "jobs" && (
        <Card title="Scheduled jobs" subtitle="14 jobs · all on time">
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              ["Daily digest", "0 7 * * *", "Productivity", "07:00"],
              ["Customer health sweep", "0 3 * * *", "Sales", "03:00"],
              ["Decay scan", "0 4 * * 1", "Operations", "Mon 04:00"],
              ["Embedding rebuild", "0 2 * * 0", "Operations", "Sun 02:00"],
              ["Vault audit", "0 5 1 * *", "Operations", "1st 05:00"],
            ].map(([n, cron, cat, next], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid var(--border-faint)" }}>
                <StatusDot tone="ok"/>
                <span style={{ flex: 1, fontSize: "var(--text-sm)", color: "var(--text-hi)" }}>{n}</span>
                <span className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)", minWidth: 90 }}>{cron}</span>
                <Pill tone="neutral" size="xs">{cat}</Pill>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-md)", minWidth: 80, textAlign: "right" }}>next {next}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {tab === "audit" && (
        <Card title="Audit log" subtitle="Every system-modifying action">
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              ["09:42:18", "Kyle B", "WK-241 → status=done", "ok"],
              ["09:38:02", "agent:digest", "ledger.append continuity-log#8842", "ok"],
              ["09:14:51", "Curtis L", "vault.update pathfinder-pricing-v3.md", "ok"],
              ["08:42:00", "agent:lead-scout-7", "BLOCKED: send-email out-of-policy", "err"],
              ["07:00:00", "agent:digest", "skill.run daily-digest", "ok"],
            ].map(([t, who, what, tone], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", fontSize: "var(--text-xs)", borderTop: i === 0 ? "none" : "1px solid var(--border-faint)" }}>
                <span className="mono" style={{ color: "var(--text-lo)", minWidth: 70 }}>{t}</span>
                <span className="mono" style={{ color: "var(--text-md)", minWidth: 130 }}>{who}</span>
                <span className="mono" style={{ flex: 1, color: tone === "err" ? "var(--err)" : "var(--text-hi)" }}>{what}</span>
                <StatusDot tone={tone === "err" ? "err" : "ok"}/>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

// ---------- LIBRARY ----------
const LibraryScreen = () => {
  const [tab, setTab] = React.useState("wiki");
  const [activeDoc, setActiveDoc] = React.useState("operating-system");
  const wikiTree = [
    { section: "Company", docs: [
      ["operating-system","Operating System"],
      ["values","Values & Taboos"],
      ["org-rituals","Org Rituals"],
    ]},
    { section: "Products", docs: [
      ["pathfinder-spec","Pathfinder · Spec"],
      ["metacron-spec","Metacron · Spec"],
      ["atrium-spec","Atrium · Spec"],
    ]},
    { section: "Playbooks", docs: [
      ["sales-playbook","Sales playbook"],
      ["renewal-script","Renewal script"],
      ["incident-runbook","Incident runbook"],
    ]},
  ];
  return (
    <div style={{ flex: 1, padding: "20px 28px 28px", overflow: "auto" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", fontWeight: 500, margin: 0, letterSpacing: -0.5 }}>Library</h1>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-md)", marginTop: 4 }}>Wiki · Repo · Templates · Brand</div>
      </div>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-subtle)", marginBottom: 20 }}>
        {["wiki","repo","templates","brand"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 14px", marginBottom: -1, fontSize: "var(--text-sm)", fontWeight: 500, textTransform: "capitalize",
            color: tab === t ? "var(--text-hi)" : "var(--text-md)",
            borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
          }}>{t}</button>
        ))}
      </div>
      {tab === "wiki" && (
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20 }}>
          <aside style={{ padding: 16, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--r-lg)" }}>
            {wikiTree.map(s => (
              <div key={s.section} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-lo)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 8 }}>{s.section}</div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {s.docs.map(([id, name]) => (
                    <button key={id} onClick={() => setActiveDoc(id)} style={{
                      padding: "5px 8px", textAlign: "left", borderRadius: 4,
                      fontSize: "var(--text-xs)",
                      color: activeDoc === id ? "var(--text-hi)" : "var(--text-md)",
                      background: activeDoc === id ? "var(--bg-raised)" : "transparent",
                    }}>{name}</button>
                  ))}
                </div>
              </div>
            ))}
          </aside>
          <Card>
            <div style={{ maxWidth: 640 }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)", marginBottom: 10 }}>Company / Operating System</div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", fontWeight: 500, margin: 0, letterSpacing: -0.5 }}>The Unicron Operating System</h2>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)", marginTop: 6, marginBottom: 18 }}>Last updated 2d ago by Kyle B · 8 continuity refs</div>
              <p style={{ color: "var(--text-md)", lineHeight: 1.6 }}>
                Three humans, ~12 agents, one company brain. Capture &gt; route &gt; act, with refusal-gates between every action and the world. The cockpit (Atrium) is where humans see, run, and direct the autonomous nervous system.
              </p>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", marginTop: 24, marginBottom: 8 }}>Principles</h3>
              <ul style={{ color: "var(--text-md)", lineHeight: 1.8, paddingLeft: 20 }}>
                <li>Calm at rest. Nothing flashes.</li>
                <li>Every system-modifying action passes a refusal-gate.</li>
                <li>Continuity over notification. The ledger is forever; the inbox is not.</li>
                <li>Skills, not features. The cockpit composes capabilities at runtime.</li>
              </ul>
            </div>
          </Card>
        </div>
      )}
      {tab === "repo" && (
        <Card title="Repository search" action={<Btn icon={<I.Search size={12}/>} size="sm">Search 1,247 docs</Btn>}>
          <div style={{ position: "relative" }}>
            <I.Search size={14} style={{ position: "absolute", left: 14, top: 14, color: "var(--text-lo)" }}/>
            <input placeholder="grep across vault, repo, calls…" style={{
              width: "100%", padding: "12px 12px 12px 38px", background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)", borderRadius: "var(--r-md)",
              fontSize: "var(--text-sm)", color: "var(--text-hi)",
            }}/>
          </div>
        </Card>
      )}
      {tab === "templates" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {["Discovery call brief","Renewal email","Investor update","Decision record","Incident report","ICP one-pager"].map((n, i) => (
            <div key={i} style={{ padding: 16, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--r-lg)", cursor: "pointer" }}>
              <I.Doc size={20} style={{ color: "var(--accent)" }}/>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-hi)", marginTop: 12, fontWeight: 500 }}>{n}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)", marginTop: 4 }}>Used 8× this quarter</div>
            </div>
          ))}
        </div>
      )}
      {tab === "brand" && (
        <Card title="Brand assets"><div style={{ color: "var(--text-md)", fontSize: "var(--text-sm)" }}>Mirrors the Marketing → Brand tab.</div></Card>
      )}
    </div>
  );
};

Object.assign(window, { MarketingScreen, ProductsScreen, SystemScreen, LibraryScreen });
