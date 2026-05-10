/* Atrium v2 — light/cream surface with navy rail, editorial typography */

const v2Tokens = `
.atrium-v2 {
  /* Surfaces — light cream */
  --v2-bg:        #F5F2EC;        /* cream page background */
  --v2-surface:   #FFFFFF;        /* card surface */
  --v2-rail:      #0F1626;        /* deep navy rail */
  --v2-rail-text: #8A93A6;
  --v2-rail-text-active: #FFFFFF;
  --v2-rail-bg-hover: rgba(255,255,255,0.06);

  /* Text on light */
  --v2-ink:       #0F1626;
  --v2-ink-md:    #4D5567;
  --v2-ink-lo:    #8A93A6;
  --v2-ink-faint: #C2C8D2;

  /* Borders */
  --v2-line:      #E5E0D6;        /* warm cream border */
  --v2-line-soft: #EFEAE0;

  /* Accents */
  --v2-blue:      #2D5BFF;        /* active/links */
  --v2-blue-soft: #E7ECFF;
  --v2-orange:    #E8763A;        /* unicron mark */
  --v2-red:       #E04B4B;
  --v2-amber:     #C99523;
  --v2-green:     #2E8E66;

  font-family: "Inter Tight", "Geist", -apple-system, sans-serif;
  background: var(--v2-bg);
  color: var(--v2-ink);
  height: 100vh;
  display: flex;
  font-feature-settings: "ss01";
  -webkit-font-smoothing: antialiased;
}
.atrium-v2 *::-webkit-scrollbar { width: 8px; height: 8px; }
.atrium-v2 *::-webkit-scrollbar-thumb { background: rgba(15,22,38,0.12); border-radius: 999px; }
.atrium-v2 .mono { font-family: "Geist Mono", ui-monospace, monospace; }
`;

const V2_NAV = [
  { id: "now", label: "Now", icon: I.Now },
  { id: "people", label: "People", icon: I.People },
  { id: "work", label: "Work", icon: I.Work },
  { id: "money", label: "Money", icon: I.Money },
  { id: "marketing", label: "Marketing", icon: I.Megaphone },
  { id: "products", label: "Products", icon: I.Layers },
  { id: "system", label: "System", icon: I.System },
  { id: "library", label: "Library", icon: I.Book },
];

const V2Rail = ({ active, setActive }) => (
  <nav style={{
    width: 72, background: "var(--v2-rail)", color: "var(--v2-rail-text)",
    display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0", flexShrink: 0,
  }}>
    <div style={{
      width: 36, height: 36, borderRadius: 10, marginBottom: 24,
      background: "var(--v2-orange)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 700, fontFamily: "Inter Tight", fontSize: 16,
    }}>U</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%", padding: "0 8px" }}>
      {V2_NAV.map(n => {
        const isActive = active === n.id;
        return (
          <button key={n.id} onClick={() => setActive(n.id)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            padding: "10px 0", borderRadius: 10,
            background: isActive ? "var(--v2-rail-bg-hover)" : "transparent",
            color: isActive ? "var(--v2-rail-text-active)" : "var(--v2-rail-text)",
            border: "none", cursor: "pointer", transition: "all 200ms",
          }}>
            <n.icon size={18}/>
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.2 }}>{n.label}</span>
          </button>
        );
      })}
    </div>
    <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <Avatar name="Kyle B" size={28} color="linear-gradient(135deg,#525d7a,#1a2030)"/>
    </div>
  </nav>
);

const V2Crumbs = ({ active }) => (
  <div style={{
    height: 56, padding: "0 24px",
    display: "flex", alignItems: "center", gap: 16,
    borderBottom: "1px solid var(--v2-line)", background: "var(--v2-bg)",
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <span style={{ color: "var(--v2-ink-lo)" }}>unicron</span>
      <span style={{ color: "var(--v2-ink-faint)" }}>/</span>
      <span style={{ color: "var(--v2-ink)", fontWeight: 500, textTransform: "capitalize" }}>{active}</span>
    </div>
    <a style={{ marginLeft: 16, fontSize: 13, color: "var(--v2-ink-lo)", display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
      atrium.unicron.systems <I.ArrowR size={11}/>
    </a>
    <button style={{ fontSize: 13, color: "var(--v2-ink-lo)", display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer" }}>
      <I.Bolt size={11}/> Run skill
    </button>
    <div style={{ flex: 1 }}/>
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "var(--v2-ink-md)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--v2-green)" }}/> Vault</span>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--v2-green)" }}/> Agents</span>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--v2-amber)" }}/> Refusals · 2</span>
    </div>
    <button style={{
      display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--v2-ink-md)",
      padding: "6px 10px", border: "1px solid var(--v2-line)", borderRadius: 8, background: "var(--v2-surface)", cursor: "pointer",
    }}>
      <I.Search size={13}/> Search
      <span className="mono" style={{ fontSize: 10, color: "var(--v2-ink-lo)", padding: "1px 5px", background: "var(--v2-bg)", borderRadius: 4 }}>⌘K</span>
    </button>
  </div>
);

const V2Tabs = ({ tabs, active, setActive }) => (
  <div style={{ display: "flex", gap: 4, padding: "0 24px", borderBottom: "1px solid var(--v2-line)", background: "var(--v2-bg)" }}>
    {tabs.map(t => (
      <button key={t.id} onClick={() => setActive(t.id)} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "12px 14px", marginBottom: -1,
        fontSize: 14, fontWeight: 500,
        color: active === t.id ? "var(--v2-ink)" : "var(--v2-ink-lo)",
        borderBottom: active === t.id ? "2px solid var(--v2-blue)" : "2px solid transparent",
        background: "none", border: "none", cursor: "pointer",
        borderBottomWidth: 2, borderBottomStyle: "solid",
        borderBottomColor: active === t.id ? "var(--v2-blue)" : "transparent",
      }}>
        {t.icon && <t.icon size={14}/>}
        {t.label}
      </button>
    ))}
  </div>
);

// Big number block — like the reference's "Operations 5"
const V2BigStat = ({ label, value, sub, suffix, sparkline, accent }) => (
  <div style={{ padding: "24px 28px", background: "var(--v2-surface)", border: "1px solid var(--v2-line)", borderRadius: 14 }}>
    <div style={{ fontSize: 13, color: "var(--v2-ink-md)", marginBottom: 14 }}>{label}</div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontFamily: "Inter Tight", fontSize: 56, fontWeight: 500, letterSpacing: -1.5, lineHeight: 1, color: "var(--v2-ink)" }}>{value}</span>
      {suffix && <span style={{ fontSize: 16, color: "var(--v2-ink-md)" }}>{suffix}</span>}
    </div>
    {sparkline && (
      <div style={{ marginTop: 14, opacity: 0.7 }}>
        <svg width="100%" height="32" viewBox="0 0 200 32" preserveAspectRatio="none">
          <path d={sparkline} stroke={accent || "var(--v2-blue)"} strokeWidth="1.5" fill="none"/>
        </svg>
      </div>
    )}
    {sub && <div style={{ marginTop: 12, fontSize: 12, color: "var(--v2-ink-lo)" }}>{sub}</div>}
  </div>
);

const V2Filters = () => {
  const sections = [
    { label: "Timeframe", value: "Last 1 Day", date: "May 6, 17:00 — May 7, 16:56", primary: true },
    { label: "DRI" },
    { label: "Board" },
    { label: "Priority" },
    { label: "Status" },
    { label: "Source" },
    { label: "Age" },
  ];
  return (
    <aside style={{ width: 240, padding: "20px 18px", borderRight: "1px solid var(--v2-line)", background: "var(--v2-bg)", overflowY: "auto" }}>
      <div style={{ fontSize: 11, color: "var(--v2-ink-lo)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 16 }}>Filters</div>
      {sections.map((s, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <button style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8, color: "var(--v2-ink)",
            background: "none", border: "none", cursor: "pointer", padding: 0,
            fontSize: 14, fontWeight: 500,
          }}>
            <I.ChevronD size={12} style={{ color: "var(--v2-ink-lo)" }}/>
            <span>{s.label}</span>
          </button>
          {s.primary && (
            <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--v2-surface)", border: "1px solid var(--v2-line)", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--v2-ink)" }}>
                <I.Now size={13} style={{ color: "var(--v2-ink-lo)" }}/> {s.value}
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--v2-line-soft)", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--v2-ink-md)" }}>
                <I.Calendar size={12} style={{ color: "var(--v2-ink-lo)" }}/> {s.date}
              </div>
            </div>
          )}
        </div>
      ))}
    </aside>
  );
};

// Editorial action item table — quiet, lots of whitespace
const V2WorkTable = ({ items, onOpen, openId }) => (
  <div style={{ background: "var(--v2-surface)", border: "1px solid var(--v2-line)", borderRadius: 14, overflow: "hidden" }}>
    <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--v2-line-soft)" }}>
      <div style={{ fontSize: 11, color: "var(--v2-ink-lo)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Most active</div>
      <div style={{ marginTop: 6, fontFamily: "Inter Tight", fontSize: 22, fontWeight: 500, color: "var(--v2-ink)" }}>Action items</div>
    </div>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["Title","DRI","Board","Priority","Due","Age"].map(h => (
            <th key={h} style={{ textAlign: "left", padding: "10px 24px", fontSize: 11, color: "var(--v2-ink-lo)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, borderBottom: "1px solid var(--v2-line-soft)" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map(it => (
          <tr key={it.id} onClick={() => onOpen(it)} style={{
            cursor: "pointer", background: openId === it.id ? "var(--v2-blue-soft)" : "transparent",
          }}
            onMouseEnter={e => { if (openId !== it.id) e.currentTarget.style.background = "var(--v2-bg)"; }}
            onMouseLeave={e => { if (openId !== it.id) e.currentTarget.style.background = "transparent"; }}
          >
            <td style={{ padding: "16px 24px", fontSize: 14, color: "var(--v2-ink)", borderBottom: "1px solid var(--v2-line-soft)" }}>{it.title}</td>
            <td style={{ padding: "16px 24px", fontSize: 13, color: "var(--v2-ink-md)", borderBottom: "1px solid var(--v2-line-soft)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar name={it.dri} size={20}/> {it.dri}</div>
            </td>
            <td style={{ padding: "16px 24px", fontSize: 13, color: "var(--v2-ink-md)", borderBottom: "1px solid var(--v2-line-soft)" }}>{it.board}</td>
            <td style={{ padding: "16px 24px", borderBottom: "1px solid var(--v2-line-soft)" }}>
              <span style={{ fontSize: 12, color: it.priority === "high" ? "var(--v2-red)" : it.priority === "med" ? "var(--v2-amber)" : "var(--v2-ink-lo)" }}>{it.priority}</span>
            </td>
            <td style={{ padding: "16px 24px", fontSize: 13, color: it.due === "Overdue" ? "var(--v2-red)" : "var(--v2-ink-md)", borderBottom: "1px solid var(--v2-line-soft)" }}>{it.due}</td>
            <td style={{ padding: "16px 24px", fontFamily: "Geist Mono", fontSize: 12, color: "var(--v2-ink-lo)", borderBottom: "1px solid var(--v2-line-soft)" }}>{it.age}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Big editorial detail panel — light surface over dark scrim
const V2DetailPanel = ({ item, onClose }) => {
  if (!item) return null;
  return (
    <div onClick={onClose} style={{
      position: "absolute", inset: 0, background: "rgba(15,22,38,0.4)", zIndex: 20,
      display: "flex", justifyContent: "flex-end",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(820px, 80%)", background: "var(--v2-surface)", height: "100%",
        boxShadow: "-30px 0 80px rgba(15,22,38,0.2)", overflowY: "auto",
        animation: "v2slide 400ms cubic-bezier(0.4,0,0.2,1)",
      }}>
        <style>{`@keyframes v2slide { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 32px", borderBottom: "1px solid var(--v2-line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "Geist Mono", fontSize: 14, color: "var(--v2-ink-lo)" }}>action</span>
            <span style={{ fontFamily: "Inter Tight", fontSize: 22, fontWeight: 500, color: "var(--v2-ink)" }}>{item.id}</span>
          </div>
          <button onClick={onClose} style={{ color: "var(--v2-ink-md)", background: "none", border: "none", cursor: "pointer" }}><I.X size={18}/></button>
        </div>
        {/* Big stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", borderBottom: "1px solid var(--v2-line)" }}>
          {[
            { k: "DRI", v: item.dri, sub: "owner" },
            { k: item.due === "Overdue" ? "Overdue" : "Due", v: item.due, tone: item.due === "Overdue" ? "var(--v2-red)" : "var(--v2-ink)" },
            { k: "Priority", v: item.priority, tone: item.priority === "high" ? "var(--v2-red)" : item.priority === "med" ? "var(--v2-amber)" : "var(--v2-ink)" },
            { k: "Status", v: item.status },
            { k: "Source", v: item.source },
          ].map((c, i) => (
            <div key={i} style={{ padding: "20px 24px", borderRight: i < 4 ? "1px solid var(--v2-line)" : "none" }}>
              <div style={{ fontSize: 12, color: "var(--v2-ink-md)", marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
                <I.ChevronD size={10} style={{ color: "var(--v2-ink-lo)" }}/> {c.k}
              </div>
              <div style={{ fontFamily: "Inter Tight", fontSize: 28, fontWeight: 500, color: c.tone || "var(--v2-ink)", letterSpacing: -0.5, lineHeight: 1 }}>
                {c.v}
              </div>
              {c.sub && <div style={{ marginTop: 6, fontSize: 11, color: "var(--v2-ink-lo)" }}>{c.sub}</div>}
            </div>
          ))}
        </div>
        {/* Title */}
        <div style={{ padding: "32px 32px 24px" }}>
          <h1 style={{ fontFamily: "Inter Tight", fontSize: 36, fontWeight: 500, letterSpacing: -1, lineHeight: 1.15, margin: 0, color: "var(--v2-ink)" }}>
            {item.title}
          </h1>
        </div>
        {/* Continuity log */}
        <div style={{ padding: "0 32px 24px" }}>
          <h3 style={{ fontFamily: "Inter Tight", fontSize: 22, fontWeight: 500, color: "var(--v2-ink)", margin: "0 0 16px" }}>Continuity</h3>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              { type: "captured", t: item.age + " ago", who: "auto · " + item.source, sub: "Surfaced as candidate action item" },
              { type: "promoted", t: item.age + " ago", who: "Kyle B", sub: "Promoted to action, assigned DRI" },
              { type: "edited",   t: "1d ago", who: "Curtis L", sub: "Updated due date to " + item.due },
            ].map((e, i, arr) => (
              <div key={i} style={{ display: "flex", gap: 16, paddingBottom: 18, position: "relative" }}>
                <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--v2-blue)", marginTop: 6 }}/>
                  {i < arr.length - 1 && <span style={{ width: 1, flex: 1, background: "var(--v2-line)", marginTop: 4 }}/>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--v2-ink)" }}>
                    <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{e.type}</span>
                    <span style={{ color: "var(--v2-ink-lo)" }}>·</span>
                    <span className="mono" style={{ color: "var(--v2-ink-lo)", fontSize: 12 }}>{e.t}</span>
                    <span style={{ color: "var(--v2-ink-lo)" }}>·</span>
                    <span style={{ color: "var(--v2-ink-md)", fontSize: 13 }}>{e.who}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--v2-ink-md)", marginTop: 4 }}>{e.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Refusal-gate */}
        <div style={{ padding: "0 32px 32px" }}>
          <div style={{ background: "var(--v2-bg)", border: "1px solid var(--v2-line)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, color: "var(--v2-ink-lo)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>
              Refusal-gate preview
            </div>
            <div style={{ fontSize: 13, color: "var(--v2-ink-md)", lineHeight: 1.6 }}>
              Marking this complete will <span className="mono" style={{ color: "var(--v2-ink)" }}>write {item.id}.status = done</span>, <span className="mono" style={{ color: "var(--v2-ink)" }}>append continuity</span>, <span className="mono" style={{ color: "var(--v2-ink)" }}>notify dri</span>. <span style={{ color: "var(--v2-green)" }}>No taboo matches.</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button style={{ padding: "8px 14px", background: "var(--v2-blue)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Mark complete</button>
              <button style={{ padding: "8px 14px", background: "var(--v2-surface)", color: "var(--v2-ink)", border: "1px solid var(--v2-line)", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Reassign</button>
              <button style={{ padding: "8px 14px", background: "var(--v2-surface)", color: "var(--v2-ink)", border: "1px solid var(--v2-line)", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Defer</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const V2_WORK_ITEMS = [
  { id: "WK-241", title: "Reply to Zenith Labs proposal", dri: "Kyle B", priority: "high", due: "Tomorrow", source: "email", status: "todo", board: "Sales", age: "2d" },
  { id: "WK-240", title: "Send Q2 forecast to board", dri: "Curtis L", priority: "high", due: "Overdue", source: "calendar", status: "doing", board: "Money", age: "5d" },
  { id: "WK-239", title: "Review Maya's expansion proposal", dri: "Kyle B", priority: "med", due: "Fri", source: "slack", status: "todo", board: "Customers", age: "1d" },
  { id: "WK-238", title: "Rotate Metacron agent API keys", dri: "Keenan O", priority: "high", due: "Tonight", source: "agent", status: "doing", board: "System", age: "4h" },
  { id: "WK-237", title: "Draft launch post for Pathfinder v3", dri: "Curtis L", priority: "med", due: "Mon", source: "vault", status: "todo", board: "Marketing", age: "3d" },
  { id: "WK-234", title: "Confirm Helix renewal terms", dri: "Kyle B", priority: "high", due: "Wed", source: "calls", status: "blocked", board: "Customers", age: "2d" },
  { id: "WK-233", title: "Triage refusal queue", dri: "Keenan O", priority: "med", due: "Today", source: "system", status: "doing", board: "System", age: "3h" },
];

const V2WorkScreen = () => {
  const [tab, setTab] = React.useState("items");
  const [open, setOpen] = React.useState(null);
  const tabs = [
    { id: "items", label: "Items", icon: I.Inbox },
    { id: "kanban", label: "Kanban", icon: I.Layers },
    { id: "calls", label: "Calls", icon: I.Phone },
    { id: "decisions", label: "Decisions", icon: I.Flag },
    { id: "refusals", label: "Refusals", icon: I.Shield },
  ];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", background: "var(--v2-bg)" }}>
      <V2Crumbs active="work"/>
      <div style={{ padding: "32px 24px 24px" }}>
        <h1 style={{ fontFamily: "Inter Tight", fontSize: 48, fontWeight: 500, letterSpacing: -1.5, color: "var(--v2-ink)", margin: 0, lineHeight: 1 }}>Work</h1>
      </div>
      <V2Tabs tabs={tabs} active={tab} setActive={setTab}/>
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <V2Filters/>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto", padding: 24, gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <V2BigStat label="Open items" value="7" sparkline="M0,18 L25,16 L50,20 L75,12 L100,18 L125,8 L150,14 L175,4 L200,10" accent="var(--v2-blue)"/>
            <V2BigStat label="Overdue" value="1" sub="WK-240 · 5d" accent="var(--v2-red)"/>
            <V2BigStat label="Due today" value="2" sub="Keenan, Kyle" accent="var(--v2-amber)"/>
            <V2BigStat label="Avg age" value="2.4" suffix="d" sparkline="M0,16 L25,18 L50,14 L75,16 L100,12 L125,14 L150,10 L175,12 L200,8" accent="var(--v2-blue)"/>
          </div>
          <V2WorkTable items={V2_WORK_ITEMS} onOpen={setOpen} openId={open?.id}/>
        </div>
      </div>
      <V2DetailPanel item={open} onClose={() => setOpen(null)}/>
    </div>
  );
};

const V2NowScreen = () => {
  const tabs = [
    { id: "today", label: "Today", icon: I.Now },
    { id: "skills", label: "Run a skill", icon: I.Bolt },
    { id: "activity", label: "Activity", icon: I.Pulse },
    { id: "digest", label: "Digest", icon: I.Inbox },
  ];
  const [tab, setTab] = React.useState("today");
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--v2-bg)" }}>
      <V2Crumbs active="now"/>
      <div style={{ padding: "32px 24px 16px" }}>
        <div style={{ fontSize: 13, color: "var(--v2-ink-lo)", marginBottom: 8 }}>Wed · May 7</div>
        <h1 style={{ fontFamily: "Inter Tight", fontSize: 56, fontWeight: 500, letterSpacing: -2, color: "var(--v2-ink)", margin: 0, lineHeight: 1 }}>
          Good morning, Kyle.
        </h1>
        <p style={{ fontSize: 18, color: "var(--v2-ink-md)", marginTop: 16, marginBottom: 0, maxWidth: 640, lineHeight: 1.5 }}>
          The company is calm. Twelve agents running, zero refusals overnight, $48k of renewal exposure in the next seven days. Two threads need a human decision before Friday.
        </p>
      </div>
      <V2Tabs tabs={tabs} active={tab} setActive={setTab}/>
      <div style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <V2BigStat label="Action items" value="7" sub="2 due today" sparkline="M0,18 L25,16 L50,20 L75,12 L100,18 L125,8 L150,14 L175,4 L200,10"/>
          <V2BigStat label="Calls" value="3" suffix="today" sub="next 10:30 · Northwind" accent="var(--v2-blue)"/>
          <V2BigStat label="Renewal exposure" value="48" suffix="k · 7d" sparkline="M0,20 L40,18 L80,12 L120,16 L160,8 L200,14" accent="var(--v2-orange)"/>
          <V2BigStat label="Vault freshness" value="62" suffix="%" sub="38% aging" accent="var(--v2-green)"/>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24 }}>
          <div style={{ background: "var(--v2-surface)", border: "1px solid var(--v2-line)", borderRadius: 14, padding: "24px 28px" }}>
            <div style={{ fontSize: 11, color: "var(--v2-ink-lo)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Top of mind</div>
            <h2 style={{ fontFamily: "Inter Tight", fontSize: 22, fontWeight: 500, color: "var(--v2-ink)", margin: "6px 0 18px" }}>What needs you today</h2>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[
                { tag: "Decision", color: "var(--v2-amber)", title: "Approve Pathfinder pricing v3 before Friday's investor call", sub: "Curtis raised concern on tier 2 margins" },
                { tag: "Refusal", color: "var(--v2-red)", title: "Agent attempted to share customer list externally", sub: "Matched taboo: customer-data-egress" },
                { tag: "Renewal", color: "var(--v2-blue)", title: "Northwind contract renews in 14 days", sub: "Maya last contacted 4 days ago" },
                { tag: "Decay", color: "var(--v2-ink-lo)", title: "3 vault docs untouched in 90+ days", sub: "Pricing FAQ · ICP v1 · Onboarding" },
              ].map((it, i, arr) => (
                <div key={i} style={{
                  display: "flex", gap: 16, padding: "16px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--v2-line-soft)", cursor: "pointer",
                }}>
                  <div style={{ minWidth: 72, fontSize: 11, color: it.color, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, paddingTop: 3 }}>{it.tag}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, color: "var(--v2-ink)", lineHeight: 1.4 }}>{it.title}</div>
                    <div style={{ fontSize: 13, color: "var(--v2-ink-lo)", marginTop: 4 }}>{it.sub}</div>
                  </div>
                  <I.ArrowR size={14} style={{ color: "var(--v2-ink-lo)", marginTop: 5 }}/>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "var(--v2-surface)", border: "1px solid var(--v2-line)", borderRadius: 14, padding: "24px 28px" }}>
            <div style={{ fontSize: 11, color: "var(--v2-ink-lo)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Today</div>
            <h2 style={{ fontFamily: "Inter Tight", fontSize: 22, fontWeight: 500, color: "var(--v2-ink)", margin: "6px 0 18px" }}>Next three events</h2>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[
                { time: "10:30", title: "Northwind expansion", who: "Maya Iyer · 30m" },
                { time: "13:00", title: "Weekly sync", who: "Kyle, Keenan, Curtis · 60m" },
                { time: "16:00", title: "Helix design feedback", who: "Curtis solo · 20m" },
              ].map((e, i, arr) => (
                <div key={i} style={{ display: "flex", gap: 18, padding: "14px 0", borderTop: i === 0 ? "none" : "1px solid var(--v2-line-soft)" }}>
                  <span className="mono" style={{ fontSize: 16, color: "var(--v2-ink)", minWidth: 56 }}>{e.time}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: "var(--v2-ink)" }}>{e.title}</div>
                    <div style={{ fontSize: 12, color: "var(--v2-ink-lo)", marginTop: 2 }}>{e.who}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Generic editorial screen for the rest
const V2GenericScreen = ({ title, subtitle, stats, sections }) => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--v2-bg)" }}>
    <V2Crumbs active={title.toLowerCase()}/>
    <div style={{ padding: "32px 24px 24px" }}>
      <h1 style={{ fontFamily: "Inter Tight", fontSize: 48, fontWeight: 500, letterSpacing: -1.5, margin: 0, lineHeight: 1, color: "var(--v2-ink)" }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 16, color: "var(--v2-ink-md)", marginTop: 12, marginBottom: 0 }}>{subtitle}</p>}
    </div>
    <div style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 16 }}>
        {stats.map((s, i) => <V2BigStat key={i} {...s}/>)}
      </div>
      {sections}
    </div>
  </div>
);

const V2App = () => {
  const [active, setActive] = React.useState("now");
  // Inject scoped tokens
  React.useEffect(() => {
    const s = document.createElement("style");
    s.textContent = v2Tokens;
    document.head.appendChild(s);
    return () => s.remove();
  }, []);

  const Screen = () => {
    if (active === "now") return <V2NowScreen/>;
    if (active === "work") return <V2WorkScreen/>;
    if (active === "people") return <V2GenericScreen title="People" subtitle="Customers, team, network, hiring." stats={[
      { label: "Active customers", value: "14", sub: "+2 this month", sparkline: "M0,18 L40,16 L80,12 L120,14 L160,8 L200,10" },
      { label: "ARR", value: "$248", suffix: "k", sub: "+18% qtd", sparkline: "M0,22 L40,18 L80,16 L120,14 L160,10 L200,6", accent: "var(--v2-orange)" },
      { label: "At-risk", value: "1", sub: "Orchard Health" },
      { label: "Sentiment", value: "0.72", sub: "warm trend" },
    ]} sections={null}/>;
    if (active === "money") return <V2GenericScreen title="Money" subtitle="Cash, runway, revenue, expenses." stats={[
      { label: "Cash on hand", value: "$524", suffix: "k" },
      { label: "Runway", value: "22", suffix: "mo", sparkline: "M0,16 L40,16 L80,14 L120,14 L160,12 L200,12" },
      { label: "Net MRR", value: "$20.6", suffix: "k", sub: "+12%", accent: "var(--v2-orange)" },
      { label: "Burn (30d)", value: "$23", suffix: "k", sub: "−6%" },
    ]} sections={null}/>;
    if (active === "marketing") return <V2GenericScreen title="Marketing" subtitle="Campaigns, content, analytics, brand." stats={[
      { label: "Live campaigns", value: "2" }, { label: "Reach 30d", value: "12.4", suffix: "k" },
      { label: "Avg CTR", value: "3.2", suffix: "%" }, { label: "Spend", value: "$1.4", suffix: "k" },
    ]} sections={null}/>;
    if (active === "products") return <V2GenericScreen title="Products" subtitle="Pathfinder · Metacron." stats={[
      { label: "Active accounts", value: "8" }, { label: "Leads / day", value: "412" },
      { label: "Conversion", value: "14.2", suffix: "%" }, { label: "P95", value: "241", suffix: "ms" },
    ]} sections={null}/>;
    if (active === "system") return <V2GenericScreen title="System" subtitle="Agents, taboos, refusals, services." stats={[
      { label: "Agents", value: "12", sub: "all healthy" }, { label: "Refusals 30d", value: "14", sub: "13 blocked" },
      { label: "Services", value: "5/5", sub: "1 warning" }, { label: "Decay", value: "12", suffix: "%" },
    ]} sections={null}/>;
    if (active === "library") return <V2GenericScreen title="Library" subtitle="Wiki, repo, templates, brand." stats={[
      { label: "Documents", value: "1,247" }, { label: "Fresh", value: "62", suffix: "%" },
      { label: "Templates", value: "18" }, { label: "Embed coverage", value: "98.3", suffix: "%" },
    ]} sections={null}/>;
    return null;
  };

  return (
    <div className="atrium-v2">
      <V2Rail active={active} setActive={setActive}/>
      <Screen/>
    </div>
  );
};

Object.assign(window, { V2App });
