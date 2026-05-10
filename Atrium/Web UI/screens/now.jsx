/* Atrium — Home/Now screen */

const SKILL_CATEGORIES = [
  { id: "memory", label: "Memory", color: "var(--cat-memory)", skills: [
    { name: "Recall context", last: "8m ago" },
    { name: "Decision history", last: "yesterday" },
    { name: "What did I promise", last: "3d ago" },
  ]},
  { id: "productivity", label: "Productivity", color: "var(--cat-productivity)", skills: [
    { name: "Daily digest", last: "7:00 today" },
    { name: "Inbox triage", last: "12m ago" },
    { name: "Calendar sweep", last: "1h ago" },
    { name: "Action item rollup", last: "yesterday" },
  ]},
  { id: "research", label: "Research", color: "var(--cat-research)", skills: [
    { name: "Deep dive on a topic", last: "yesterday" },
    { name: "Competitor scan", last: "Mon" },
    { name: "Source verify", last: "3d ago" },
  ]},
  { id: "discovery", label: "Discovery", color: "var(--cat-discovery)", skills: [
    { name: "Lead surface", last: "32m ago" },
    { name: "Trend monitor", last: "1h ago" },
  ]},
  { id: "sales", label: "Sales", color: "var(--cat-sales)", skills: [
    { name: "Customer health sweep", last: "nightly" },
    { name: "Draft follow-up", last: "5m ago" },
    { name: "Pipeline forecast", last: "yesterday" },
  ]},
  { id: "marketing", label: "Marketing", color: "var(--cat-marketing)", skills: [
    { name: "Content brief", last: "Mon" },
    { name: "Brand check", last: "yesterday" },
  ]},
  { id: "operations", label: "Operations", color: "var(--cat-operations)", skills: [
    { name: "Vault audit", last: "weekly" },
    { name: "Service health", last: "live" },
    { name: "Decay review", last: "today" },
  ]},
];

const TopOfMind = () => {
  const items = [
    { tag: "Decision pending", tone: "warn", title: "Approve Pathfinder pricing v3 before Friday's investor call", sub: "Curtis raised concern about tier 2 margins — see thread"},
    { tag: "Refusal", tone: "err", title: "Agent attempted to share customer list externally", sub: "Matched taboo: customer-data-egress · Awaiting review"},
    { tag: "Renewal", tone: "info", title: "Northwind contract renews in 14 days", sub: "Maya last contacted 4 days ago · usage trending up"},
    { tag: "Decay", tone: "muted", title: "3 vault docs haven't been touched in 90+ days", sub: "Pricing FAQ, ICP v1, Onboarding script"},
  ];
  return (
    <Card title="Top of mind" subtitle="What needs your attention today">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((it, i) => (
          <div key={i} style={{
            display: "flex", gap: 14, padding: "14px 0",
            borderTop: i === 0 ? "none" : "1px solid var(--border-faint)",
            cursor: "pointer", transition: "background var(--d-hover) var(--ease)",
            margin: "0 -8px", paddingLeft: 8, paddingRight: 8, borderRadius: 6,
          }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--bg-raised)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <div style={{ width: 3, alignSelf: "stretch", borderRadius: 999,
              background: it.tone === "warn" ? "var(--warn)" : it.tone === "err" ? "var(--err)" : it.tone === "info" ? "var(--info)" : "var(--text-faint)" }}/>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Pill tone={it.tone === "muted" ? "neutral" : it.tone} size="xs">{it.tag}</Pill>
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-hi)", lineHeight: 1.4 }}>{it.title}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)", marginTop: 4 }}>{it.sub}</div>
            </div>
            <I.ChevronR size={14} style={{ color: "var(--text-lo)", marginTop: 4 }}/>
          </div>
        ))}
      </div>
    </Card>
  );
};

const TodayCalendar = () => {
  const events = [
    { time: "10:30", dur: "30m", title: "Northwind expansion · Maya Iyer", attendees: 3, source: "gcal", tone: "accent" },
    { time: "13:00", dur: "60m", title: "Weekly sync · Kyle, Keenan, Curtis", attendees: 3, source: "gcal", tone: "info" },
    { time: "16:00", dur: "20m", title: "Helix design feedback (Curtis solo)", attendees: 1, source: "gcal", tone: "neutral" },
  ];
  return (
    <Card title="Today" subtitle="Next 3 events" action={
      <button style={{ fontSize: "var(--text-xs)", color: "var(--text-md)" }}>Open calendar →</button>
    }>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {events.map((e, i) => (
          <div key={i} style={{
            display: "flex", gap: 14, padding: "10px 12px",
            background: "var(--bg-surface)", border: "1px solid var(--border-faint)",
            borderRadius: "var(--r-md)", alignItems: "center",
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 60 }}>
              <span className="mono" style={{ fontSize: "var(--text-md)", color: "var(--text-hi)", fontWeight: 500 }}>{e.time}</span>
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-lo)" }}>{e.dur}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-hi)" }}>{e.title}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)", marginTop: 2 }}>
                {e.attendees} attendee{e.attendees > 1 ? "s" : ""} · pre-brief ready
              </div>
            </div>
            <Btn size="sm">Brief</Btn>
          </div>
        ))}
      </div>
    </Card>
  );
};

const Digest = () => {
  const [open, setOpen] = React.useState(false);
  return (
    <Card padding={0}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", padding: "14px 18px", display: "flex", alignItems: "center", gap: 12,
      }}>
        <I.Inbox size={16} style={{ color: "var(--text-md)" }}/>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--text-hi)" }}>Yesterday's digest</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)", marginTop: 2 }}>
            14 events · 3 decisions · 7 captured items · 1 refusal
          </div>
        </div>
        <I.ChevronD size={14} style={{ color: "var(--text-lo)", transform: open ? "rotate(180deg)" : "none", transition: "transform var(--d-hover) var(--ease)" }}/>
      </button>
      {open && (
        <div style={{ padding: "0 18px 16px", borderTop: "1px solid var(--border-faint)" }}>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-md)", lineHeight: 1.6, marginTop: 12 }}>
            Closed Helix discovery (45m, Curtis lead). Maya followed up on Northwind expansion — usage up 12% week-over-week. Curtis pushed Pathfinder build #482, all checks green. Decay sweep flagged 3 docs aging past 90d. Refusal: agent tried to send weekly metrics to a non-whitelisted address (matched <span className="mono" style={{ color: "var(--text-hi)" }}>customer-data-egress</span>).
          </div>
        </div>
      )}
    </Card>
  );
};

// Throttled live activity feed
const ActivityFeed = () => {
  const seed = [
    { t: "2m", icon: <I.Github size={12}/>, src: "github", text: "Curtis merged ", strong: "feat: pricing tier guard", suffix: " into pathfinder/main" },
    { t: "8m", icon: <I.Mail size={12}/>, src: "mail", text: "Maya Iyer replied to ", strong: "Re: Q2 expansion plan", suffix: "" },
    { t: "14m", icon: <I.Slack size={12}/>, src: "slack", text: "Keenan posted in ", strong: "#metacron-fleet", suffix: " · 'rotating agent keys tonight'" },
    { t: "22m", icon: <I.Sparkle size={12}/>, src: "agent", text: "Agent ", strong: "lead-scout-7", suffix: " added 12 leads to discovery queue" },
    { t: "37m", icon: <I.Phone size={12}/>, src: "calls", text: "Call ended · ", strong: "Helix design review", suffix: " · transcript ready" },
    { t: "1h", icon: <I.Flag size={12}/>, src: "decisions", text: "Decision logged · ", strong: "Use Supabase RLS for tenant isolation", suffix: "" },
    { t: "1h", icon: <I.Database size={12}/>, src: "vault", text: "Vault doc updated · ", strong: "Pathfinder pricing model v3", suffix: "" },
  ];
  const [items, setItems] = React.useState(seed);
  // throttled feed: never refresh under 60s
  React.useEffect(() => {
    const id = setInterval(() => {
      setItems(s => [{ ...s[s.length-1], t: "now" }, ...s.slice(0, -1)]);
    }, 90_000);
    return () => clearInterval(id);
  }, []);
  return (
    <Card title="Activity" subtitle="Throttled · auto-refreshes every 90s" action={
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-xs)", color: "var(--text-lo)" }}>
        <StatusDot tone="ok" size={5}/> live
      </div>
    }>
      <div style={{ display: "flex", flexDirection: "column", maxHeight: 320, overflowY: "auto" }}>
        {items.map((it, i) => (
          <div key={i} style={{
            display: "flex", gap: 12, padding: "9px 0", alignItems: "flex-start",
            borderTop: i === 0 ? "none" : "1px solid var(--border-faint)",
            fontSize: "var(--text-xs)",
          }}>
            <span className="mono" style={{ color: "var(--text-lo)", minWidth: 26, marginTop: 1 }}>{it.t}</span>
            <span style={{ color: "var(--text-lo)", marginTop: 1 }}>{it.icon}</span>
            <div style={{ flex: 1, color: "var(--text-md)", lineHeight: 1.45 }}>
              {it.text}<span style={{ color: "var(--text-hi)" }}>{it.strong}</span>{it.suffix}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

const SkillGrid = ({ filter, setFilter }) => {
  const filtered = filter === "all" ? SKILL_CATEGORIES : SKILL_CATEGORIES.filter(c => c.id === filter);
  return (
    <Card title="Run a skill" subtitle="Operator commands routed through agents" action={
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {[{ id: "all", label: "All" }, ...SKILL_CATEGORIES.map(c => ({ id: c.id, label: c.label, color: c.color }))].map(c => (
          <button key={c.id} onClick={() => setFilter(c.id)} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 9px", borderRadius: "var(--r-pill)",
            fontSize: "var(--text-xs)", fontWeight: 500,
            background: filter === c.id ? "var(--bg-raised)" : "transparent",
            color: filter === c.id ? "var(--text-hi)" : "var(--text-md)",
            border: filter === c.id ? "1px solid var(--border-default)" : "1px solid transparent",
            transition: "all var(--d-hover) var(--ease)",
          }}>
            {c.color && <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.color }}/>}
            {c.label}
          </button>
        ))}
      </div>
    }>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {filtered.map(cat => (
          <div key={cat.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: cat.color }}/>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-md)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>{cat.label}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
              {cat.skills.map((sk, i) => (
                <button key={i} style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
                  padding: 12, background: "var(--bg-surface)",
                  border: "1px solid var(--border-faint)", borderRadius: "var(--r-md)",
                  textAlign: "left", transition: "all var(--d-hover) var(--ease)",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.background = "var(--bg-raised)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-faint)"; e.currentTarget.style.background = "var(--bg-surface)"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <I.Bolt size={13} style={{ color: cat.color }}/>
                    <span className="mono" style={{ fontSize: "var(--text-2xs)", color: "var(--text-lo)" }}>{sk.last}</span>
                  </div>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--text-hi)", fontWeight: 500 }}>{sk.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

const ForecastPanel = () => (
  <Card title="Forecast" subtitle="Next 7 days">
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-md)" }}>Calls scheduled</span>
          <span className="mono" style={{ color: "var(--text-hi)" }}>11</span>
        </div>
        <BarChart data={[2,1,3,2,1,1,1]} h={32} color="var(--info)" labels={["Wed","Thu","Fri","Sat","Sun","Mon","Tue"]}/>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-md)" }}>Renewal exposure</span>
          <span className="mono" style={{ color: "var(--text-hi)" }}>$48k</span>
        </div>
        <BarChart data={[0,12,0,0,18,0,18]} h={32} color="var(--accent)"/>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-md)" }}>Action items due</span>
          <span className="mono" style={{ color: "var(--text-hi)" }}>9</span>
        </div>
        <BarChart data={[1,3,2,0,0,2,1]} h={32} color="var(--warn)"/>
      </div>
    </div>
  </Card>
);

const RecentRunsPanel = () => {
  const runs = [
    { name: "Customer health sweep", status: "ok", t: "03:00", dur: "1m 12s" },
    { name: "Daily digest", status: "ok", t: "07:00", dur: "8s" },
    { name: "Inbox triage", status: "ok", t: "07:14", dur: "22s" },
    { name: "Lead surface", status: "warn", t: "08:30", dur: "2m 04s" },
    { name: "Calendar sweep", status: "ok", t: "09:00", dur: "4s" },
  ];
  return (
    <Card title="Recent runs" subtitle="Last 5 skill executions">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {runs.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0",
            borderTop: i === 0 ? "none" : "1px solid var(--border-faint)" }}>
            <StatusDot tone={r.status} />
            <span style={{ flex: 1, fontSize: "var(--text-sm)", color: "var(--text-hi)" }}>{r.name}</span>
            <span className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)" }}>{r.t}</span>
            <span className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--text-md)", minWidth: 50, textAlign: "right" }}>{r.dur}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};

const VaultPulse = () => (
  <Card title="Vault pulse" subtitle="Knowledge health">
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-md)" }}>Total documents</span>
        <span className="mono" style={{ color: "var(--text-hi)", fontSize: "var(--text-md)" }}>1,247</span>
      </div>
      <DistBar label="Fresh (≤30d)"   percent={62} color="var(--ok)"/>
      <DistBar label="Aging (30–90d)" percent={26} color="var(--warn)"/>
      <DistBar label="Decaying (90+)" percent={12} color="var(--err)"/>
      <div style={{ paddingTop: 6, borderTop: "1px solid var(--border-faint)",
        display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)" }}>
        <span style={{ color: "var(--text-md)" }}>Embed coverage</span>
        <span className="mono" style={{ color: "var(--ok)" }}>98.3%</span>
      </div>
    </div>
  </Card>
);

const NowScreen = ({ mobile }) => {
  const [filter, setFilter] = React.useState("all");
  if (mobile) {
    return (
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, paddingBottom: 76 }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto" }} className="no-scrollbar">
          {[
            { label: "Vault", tone: "ok",   detail: "OK" },
            { label: "Agents", tone: "ok",  detail: "OK" },
            { label: "Refusals", tone: "warn", detail: "2" },
            { label: "Decay", tone: "info", detail: "3" },
          ].map((p, i) => (
            <div key={i} style={{ flex: "1 0 auto", minWidth: 0, display: "flex", alignItems: "center", gap: 6,
              padding: "6px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
              borderRadius: "var(--r-pill)" }}>
              <StatusDot tone={p.tone} size={6}/>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-md)" }}>{p.label}</span>
              <span className="mono" style={{ fontSize: "var(--text-2xs)", color: "var(--text-lo)" }}>{p.detail}</span>
            </div>
          ))}
        </div>
        <TopOfMind/>
        <TodayCalendar/>
        <Digest/>
        <SkillGrid filter={filter} setFilter={setFilter}/>
        <ActivityFeed/>
      </div>
    );
  }
  return (
    <div style={{ padding: 28, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 20, maxWidth: 1500, margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
        {/* Hero greeting strip */}
        <div style={{ padding: "8px 4px 12px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)",
            fontWeight: 500, color: "var(--text-hi)", letterSpacing: -0.7, lineHeight: 1.1 }}>
            The company is calm.
          </div>
          <div style={{ fontSize: "var(--text-md)", color: "var(--text-md)", marginTop: 6, maxWidth: 560 }}>
            12 agents running, 0 refusals overnight, $48k of renewal exposure in the next 7 days.
            Two threads need a human decision before Friday.
          </div>
        </div>

        <TopOfMind/>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <TodayCalendar/>
          <Digest/>
        </div>
        <SkillGrid filter={filter} setFilter={setFilter}/>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <ForecastPanel/>
        <RecentRunsPanel/>
        <VaultPulse/>
        <ActivityFeed/>
      </div>
    </div>
  );
};

Object.assign(window, { NowScreen });
