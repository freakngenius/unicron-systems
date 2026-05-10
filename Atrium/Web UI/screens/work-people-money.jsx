/* Atrium — Work, People, Money screens */

// ---------- WORK: action items table + filter sidebar + detail panel ----------
const WORK_ITEMS = [
  { id: "WK-241", title: "Reply to Zenith Labs proposal", dri: "Kyle B", priority: "high", due: "Tomorrow", source: "email", status: "todo", board: "Sales", age: "2d" },
  { id: "WK-240", title: "Send Q2 forecast to board", dri: "Curtis L", priority: "high", due: "Overdue", source: "calendar", status: "doing", board: "Money", age: "5d" },
  { id: "WK-239", title: "Review Maya's expansion proposal", dri: "Kyle B", priority: "med", due: "Fri", source: "slack", status: "todo", board: "Customers", age: "1d" },
  { id: "WK-238", title: "Rotate Metacron agent API keys", dri: "Keenan O", priority: "high", due: "Tonight", source: "agent", status: "doing", board: "System", age: "4h" },
  { id: "WK-237", title: "Draft launch post for Pathfinder v3", dri: "Curtis L", priority: "med", due: "Mon", source: "vault", status: "todo", board: "Marketing", age: "3d" },
  { id: "WK-236", title: "Update onboarding script with new ICP", dri: "Kyle B", priority: "low", due: "Next week", source: "decision", status: "todo", board: "Sales", age: "7d" },
  { id: "WK-235", title: "Audit decay sweep for Q1 docs", dri: "Keenan O", priority: "low", due: "—", source: "agent", status: "todo", board: "Library", age: "12d" },
  { id: "WK-234", title: "Confirm Helix renewal terms", dri: "Kyle B", priority: "high", due: "Wed", source: "calls", status: "blocked", board: "Customers", age: "2d" },
  { id: "WK-233", title: "Triage refusal queue (2 pending)", dri: "Keenan O", priority: "med", due: "Today", source: "system", status: "doing", board: "System", age: "3h" },
  { id: "WK-232", title: "Investor update — May edition", dri: "Curtis L", priority: "med", due: "May 20", source: "calendar", status: "todo", board: "Money", age: "1d" },
];

const FilterSidebar = ({ filters, setFilters }) => {
  const sections = [
    { id: "board", label: "Board", values: ["Sales","Customers","Money","System","Marketing","Library"] },
    { id: "dri", label: "DRI", values: ["Kyle B","Curtis L","Keenan O"] },
    { id: "priority", label: "Priority", values: ["high","med","low"] },
    { id: "status", label: "Status", values: ["todo","doing","blocked","done"] },
    { id: "source", label: "Source", values: ["email","slack","calls","agent","calendar","decision","vault","system"] },
  ];
  const [open, setOpen] = React.useState({ board: true, dri: true, priority: true, status: false, source: false });
  return (
    <aside style={{
      width: "var(--filter-w)", flexShrink: 0, padding: "20px 18px",
      borderRight: "1px solid var(--border-subtle)", background: "var(--bg-surface)",
      overflowY: "auto",
    }}>
      <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-lo)", textTransform: "uppercase",
        letterSpacing: 0.6, fontWeight: 600, marginBottom: 14 }}>Filters</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 18 }}>
        <div style={{ position: "relative" }}>
          <I.Search size={12} style={{ position: "absolute", left: 8, top: 8, color: "var(--text-lo)" }}/>
          <input placeholder="Search items…" style={{
            width: "100%", background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)", borderRadius: "var(--r-md)",
            padding: "6px 8px 6px 26px", fontSize: "var(--text-xs)", color: "var(--text-hi)",
          }}/>
        </div>
      </div>
      {sections.map(sec => (
        <div key={sec.id} style={{ borderTop: "1px solid var(--border-faint)", padding: "12px 0" }}>
          <button onClick={() => setOpen(o => ({ ...o, [sec.id]: !o[sec.id] }))} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            color: "var(--text-md)", fontSize: "var(--text-xs)", fontWeight: 500,
          }}>
            <span>{sec.label}</span>
            <I.ChevronD size={12} style={{ transform: open[sec.id] ? "none" : "rotate(-90deg)", transition: "transform var(--d-hover) var(--ease)" }}/>
          </button>
          {open[sec.id] && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              {sec.values.map(v => {
                const checked = (filters[sec.id] || []).includes(v);
                return (
                  <label key={v} style={{
                    display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-xs)",
                    color: checked ? "var(--text-hi)" : "var(--text-md)", cursor: "pointer",
                    padding: "3px 4px", borderRadius: 4,
                  }}>
                    <span style={{
                      width: 12, height: 12, borderRadius: 3,
                      border: "1px solid " + (checked ? "var(--accent)" : "var(--border-default)"),
                      background: checked ? "var(--accent)" : "transparent",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}>{checked && <I.Check size={9} style={{ color: "var(--text-on-accent)" }}/>}</span>
                    <input type="checkbox" checked={checked} onChange={() => {
                      setFilters(f => {
                        const cur = new Set(f[sec.id] || []);
                        cur.has(v) ? cur.delete(v) : cur.add(v);
                        return { ...f, [sec.id]: [...cur] };
                      });
                    }} style={{ display: "none" }}/>
                    <span style={{ flex: 1 }}>{v}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </aside>
  );
};

const WorkDetail = ({ item, onClose }) => {
  if (!item) return null;
  return (
    <aside style={{
      position: "absolute", top: 0, right: 0, bottom: 0, width: "var(--detail-w)",
      background: "var(--bg-elevated)", borderLeft: "1px solid var(--border-default)",
      boxShadow: "-12px 0 24px rgba(0,0,0,0.3)", overflowY: "auto",
      zIndex: 10,
      animation: "slideIn 400ms var(--ease)",
    }}>
      <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)" }}>{item.id}</span>
          <Pill tone={item.priority === "high" ? "err" : item.priority === "med" ? "warn" : "neutral"} size="xs">{item.priority}</Pill>
          <Pill tone={item.status === "blocked" ? "err" : item.status === "doing" ? "info" : "neutral"} size="xs">{item.status}</Pill>
        </div>
        <button onClick={onClose} style={{ color: "var(--text-md)" }}><I.X size={16}/></button>
      </div>
      <div style={{ padding: "20px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", fontWeight: 500, lineHeight: 1.2, color: "var(--text-hi)", marginBottom: 18 }}>
          {item.title}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "10px 16px", fontSize: "var(--text-sm)" }}>
          {[
            ["DRI", <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar name={item.dri} size={20}/><span style={{ color: "var(--text-hi)" }}>{item.dri}</span></div>],
            ["Due",      <span style={{ color: item.due === "Overdue" ? "var(--err)" : "var(--text-hi)" }}>{item.due}</span>],
            ["Board",    <Pill tone="neutral" size="xs">{item.board}</Pill>],
            ["Source",   <span className="mono" style={{ color: "var(--text-md)" }}>{item.source}</span>],
            ["Age",      <span className="mono" style={{ color: "var(--text-md)" }}>{item.age}</span>],
          ].map(([k, v], i) => (
            <React.Fragment key={i}>
              <span style={{ color: "var(--text-lo)", fontSize: "var(--text-xs)", paddingTop: 3 }}>{k}</span>
              <div>{v}</div>
            </React.Fragment>
          ))}
        </div>

        <div style={{ marginTop: 24, fontSize: "var(--text-xs)", color: "var(--text-lo)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>
          Continuity
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 0 }}>
          {[
            { type: "captured", t: item.age + " ago", made: "auto from "+item.source, sub: "Surfaced as candidate action item" },
            { type: "promoted", t: item.age + " ago", made: "Kyle B", sub: "Promoted to action item, assigned DRI" },
            { type: "edited",   t: "1d ago", made: "Curtis L", sub: "Updated due date to "+item.due },
          ].map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }}/>
                {i < 2 && <span style={{ width: 1, flex: 1, background: "var(--border-default)", marginTop: 3 }}/>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-md)" }}>
                  <span style={{ color: "var(--text-hi)", fontWeight: 500 }}>{e.type}</span> · <span className="mono">{e.t}</span> · {e.made}
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)", marginTop: 2 }}>{e.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, padding: 14, background: "var(--bg-surface)", border: "1px solid var(--border-faint)", borderRadius: "var(--r-md)" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 8 }}>
            Refusal-gate preview
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-md)", lineHeight: 1.5 }}>
            Marking this complete will: <span className="mono" style={{ color: "var(--text-hi)" }}>write WK-241.status = done</span>, <span className="mono" style={{ color: "var(--text-hi)" }}>append continuity log</span>, <span className="mono" style={{ color: "var(--text-hi)" }}>notify dri</span>. No taboo matches.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn variant="primary" size="sm" icon={<I.Check size={12}/>}>Mark complete</Btn>
            <Btn size="sm">Reassign</Btn>
            <Btn size="sm">Defer</Btn>
          </div>
        </div>
      </div>
    </aside>
  );
};

const WorkScreen = () => {
  const [filters, setFilters] = React.useState({ board: [], dri: [], priority: [], status: [], source: [] });
  const [active, setActive] = React.useState(null);
  const [tab, setTab] = React.useState("items");
  const filtered = WORK_ITEMS.filter(it => {
    for (const k of Object.keys(filters)) {
      if (filters[k].length && !filters[k].includes(it[k])) return false;
    }
    return true;
  });
  return (
    <div style={{ display: "flex", flex: 1, position: "relative", minHeight: 0 }}>
      <FilterSidebar filters={filters} setFilters={setFilters}/>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--bg-ground)" }}>
        <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", fontWeight: 500,
              letterSpacing: -0.5, color: "var(--text-hi)", margin: 0, lineHeight: 1.1 }}>Work</h1>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-md)", marginTop: 4 }}>
              Cross-board action items · {filtered.length} of {WORK_ITEMS.length} shown
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <Btn icon={<I.Plus size={12}/>} size="sm">New action item</Btn>
            <Btn size="sm">Bulk actions</Btn>
          </div>
        </div>
        <div style={{ padding: "16px 24px 0", display: "flex", gap: 4, borderBottom: "1px solid var(--border-subtle)" }}>
          {["items","kanban","calendar"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "8px 14px", marginBottom: -1, fontSize: "var(--text-sm)", fontWeight: 500,
              color: tab === t ? "var(--text-hi)" : "var(--text-md)",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              textTransform: "capitalize",
            }}>{t}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 24px 24px" }}>
          {tab === "items" && (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 0 }}>
              <thead style={{ position: "sticky", top: 0, background: "var(--bg-ground)", zIndex: 1 }}>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  {["", "ID", "Title", "DRI", "Board", "Priority", "Status", "Source", "Due", "Age"].map((h, i) => (
                    <th key={i} style={{
                      textAlign: "left", padding: "10px 8px", fontSize: "var(--text-2xs)",
                      color: "var(--text-lo)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, i) => (
                  <tr key={it.id} onClick={() => setActive(it)} style={{
                    cursor: "pointer", borderBottom: "1px solid var(--border-faint)",
                    background: active?.id === it.id ? "var(--bg-raised)" : "transparent",
                    transition: "background var(--d-hover) var(--ease)",
                  }}
                    onMouseEnter={e => { if (active?.id !== it.id) e.currentTarget.style.background = "var(--bg-elevated)"; }}
                    onMouseLeave={e => { if (active?.id !== it.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "10px 8px" }}>
                      <input type="checkbox" style={{ accentColor: "var(--accent)" }}/>
                    </td>
                    <td style={{ padding: "10px 8px", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-lo)" }}>{it.id}</td>
                    <td style={{ padding: "10px 8px", fontSize: "var(--text-sm)", color: "var(--text-hi)" }}>{it.title}</td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Avatar name={it.dri} size={18}/>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-md)" }}>{it.dri}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px" }}><Pill tone="neutral" size="xs">{it.board}</Pill></td>
                    <td style={{ padding: "10px 8px" }}>
                      <Pill tone={it.priority === "high" ? "err" : it.priority === "med" ? "warn" : "neutral"} size="xs">{it.priority}</Pill>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <Pill tone={it.status === "blocked" ? "err" : it.status === "doing" ? "info" : "neutral"} size="xs">{it.status}</Pill>
                    </td>
                    <td style={{ padding: "10px 8px", fontSize: "var(--text-xs)", color: "var(--text-md)" }}>{it.source}</td>
                    <td style={{ padding: "10px 8px", fontSize: "var(--text-xs)", color: it.due === "Overdue" ? "var(--err)" : "var(--text-md)" }}>{it.due}</td>
                    <td style={{ padding: "10px 8px", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-lo)" }}>{it.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "kanban" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 16 }}>
              {["todo","doing","blocked","done"].map(col => (
                <div key={col} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-faint)", borderRadius: "var(--r-md)", padding: 12, minHeight: 300 }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-md)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 10 }}>
                    {col} · {filtered.filter(i => i.status === col).length}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {filtered.filter(i => i.status === col).map(it => (
                      <div key={it.id} onClick={() => setActive(it)} style={{
                        padding: 10, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--r-md)", cursor: "pointer",
                      }}>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-hi)", lineHeight: 1.35 }}>{it.title}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                          <Avatar name={it.dri} size={14}/>
                          <Pill tone={it.priority === "high" ? "err" : it.priority === "med" ? "warn" : "neutral"} size="xs">{it.priority}</Pill>
                          <span style={{ marginLeft: "auto", fontSize: "var(--text-2xs)", color: "var(--text-lo)" }}>{it.due}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === "calendar" && (
            <div style={{ marginTop: 32, textAlign: "center", color: "var(--text-lo)", fontSize: "var(--text-sm)" }}>
              Calendar view — items scheduled by due date
            </div>
          )}
        </div>
      </div>
      <WorkDetail item={active} onClose={() => setActive(null)}/>
    </div>
  );
};

// ---------- WORK MOBILE ----------
const WorkScreenMobile = () => {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, paddingBottom: 76 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", fontWeight: 500, margin: 0, color: "var(--text-hi)" }}>Work</h1>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-md)", marginTop: 2 }}>10 action items</div>
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto" }} className="no-scrollbar">
        {["All","High","Today","Mine"].map((t, i) => (
          <Pill key={t} tone={i === 1 ? "accent" : "neutral"} size="xs">{t}</Pill>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {WORK_ITEMS.slice(0, 6).map(it => (
          <div key={it.id} style={{ padding: 12, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--r-md)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Pill tone={it.priority === "high" ? "err" : it.priority === "med" ? "warn" : "neutral"} size="xs">{it.priority}</Pill>
              <Pill tone="neutral" size="xs">{it.board}</Pill>
              <span style={{ marginLeft: "auto", fontSize: "var(--text-2xs)", color: it.due === "Overdue" ? "var(--err)" : "var(--text-lo)" }}>{it.due}</span>
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-hi)", lineHeight: 1.35 }}>{it.title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: "var(--text-xs)", color: "var(--text-lo)" }}>
              <Avatar name={it.dri} size={16}/> {it.dri}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------- PEOPLE ----------
const CUSTOMERS = [
  { name: "Northwind Co", stage: "Expansion", contact: "Maya Iyer", arr: "$48k", health: "ok", trend: [3,4,3,5,6,7,8], last: "4d", sentiment: "🌤" },
  { name: "Helix Studio", stage: "Active", contact: "Aaron Pell", arr: "$32k", health: "ok", trend: [4,5,4,5,5,6,5], last: "1d", sentiment: "☀" },
  { name: "Zenith Labs", stage: "Negotiation", contact: "Priya Desai", arr: "$60k", health: "warn", trend: [2,3,2,2,1,2,2], last: "6d", sentiment: "🌥" },
  { name: "Atlas Group", stage: "Discovery", contact: "Sam Wu", arr: "—", health: "info", trend: [0,1,1,2,3,3,4], last: "today", sentiment: "☀" },
  { name: "Beacon Inc", stage: "Active", contact: "Tess Karim", arr: "$22k", health: "ok", trend: [4,4,4,4,4,4,4], last: "9d", sentiment: "🌤" },
  { name: "Orchard Health", stage: "At-risk", contact: "Devin Cole", arr: "$18k", health: "err", trend: [5,4,3,2,1,1,1], last: "21d", sentiment: "🌧" },
];

const PEOPLE_TABS = [
  { id: "customers", label: "Customers" },
  { id: "team", label: "Team" },
  { id: "network", label: "Network" },
  { id: "hiring", label: "Hiring" },
];

const HEALTH_TONE = { ok: "ok", warn: "warn", err: "err", info: "info" };

const CustomersBoard = () => {
  const stages = ["Discovery","Negotiation","Active","Expansion","At-risk"];
  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
      {stages.map(stage => {
        const cs = CUSTOMERS.filter(c => c.stage === stage);
        return (
          <div key={stage} style={{ flex: "1 0 240px", minWidth: 240, background: "var(--bg-surface)", border: "1px solid var(--border-faint)", borderRadius: "var(--r-md)", padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-md)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>{stage}</div>
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-lo)" }} className="mono">{cs.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cs.map(c => (
                <div key={c.name} style={{ padding: 12, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--r-md)", cursor: "grab" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--text-hi)", fontWeight: 500 }}>{c.name}</div>
                    <Pill tone={HEALTH_TONE[c.health]} size="xs">{c.health}</Pill>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Avatar name={c.contact} size={16}/>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-md)" }}>{c.contact}</span>
                    <span style={{ marginLeft: "auto", fontSize: "var(--text-2xs)", color: "var(--text-lo)" }} className="mono">{c.arr}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Sparkline data={c.trend} w={70} h={18} color={c.health === "err" ? "var(--err)" : c.health === "warn" ? "var(--warn)" : "var(--ok)"} fill/>
                    <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-lo)" }} className="mono">{c.last}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const TeamMyDay = () => {
  const team = [
    { name: "Kyle B", role: "CEO", focus: "Renewals", load: 75, items: 4, calls: 2 },
    { name: "Curtis L", role: "Eng", focus: "Pathfinder v3", load: 88, items: 6, calls: 1 },
    { name: "Keenan O", role: "Ops", focus: "Agent fleet", load: 52, items: 3, calls: 0 },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
      {team.map(t => (
        <Card key={t.name} title={t.name} subtitle={`${t.role} · today's focus: ${t.focus}`} action={<Avatar name={t.name} size={28}/>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <DistBar label="Load" percent={t.load} color={t.load > 80 ? "var(--warn)" : "var(--ok)"}/>
            <div style={{ display: "flex", gap: 16, paddingTop: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-lo)" }}>Action items</div>
                <div className="mono" style={{ fontSize: "var(--text-xl)", color: "var(--text-hi)", fontWeight: 500 }}>{t.items}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-lo)" }}>Calls today</div>
                <div className="mono" style={{ fontSize: "var(--text-xl)", color: "var(--text-hi)", fontWeight: 500 }}>{t.calls}</div>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

const PeopleScreen = () => {
  const [tab, setTab] = React.useState("customers");
  return (
    <div style={{ flex: 1, padding: "20px 28px 28px", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", fontWeight: 500, margin: 0, letterSpacing: -0.5 }}>People</h1>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-md)", marginTop: 4 }}>Customers, team, network, hiring</div>
        </div>
        <Btn icon={<I.Plus size={12}/>} size="sm">Add contact</Btn>
      </div>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-subtle)", marginBottom: 20 }}>
        {PEOPLE_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 14px", marginBottom: -1, fontSize: "var(--text-sm)", fontWeight: 500,
            color: tab === t.id ? "var(--text-hi)" : "var(--text-md)",
            borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
          }}>{t.label}</button>
        ))}
      </div>
      {tab === "customers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <Metric label="Active customers" value="14" delta="+2" deltaTone="ok" sub="vs last 30d" spark={[8,9,10,11,12,12,14]} sparkColor="var(--ok)"/>
            <Metric label="ARR" value="$248" unit="k" delta="+18%" deltaTone="ok" spark={[180,190,210,220,230,240,248]} sparkColor="var(--accent)"/>
            <Metric label="At-risk" value="1" delta="—" deltaTone="muted" sub="Orchard Health"/>
            <Metric label="Avg sentiment" value="🌤" sub="warm trend" delta="+0.2" deltaTone="ok"/>
          </div>
          <CustomersBoard/>
        </div>
      )}
      {tab === "team" && <TeamMyDay/>}
      {tab === "network" && (
        <Card title="Network" subtitle="People in our orbit who aren't customers (yet)">
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-md)" }}>92 contacts · 8 due for re-engagement · 3 warm intros queued</div>
        </Card>
      )}
      {tab === "hiring" && (
        <Card title="Hiring" subtitle="No active roles">
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-md)" }}>Holding at 3-person team. Pipeline notes archived to Library.</div>
        </Card>
      )}
    </div>
  );
};

// ---------- MONEY ----------
const MoneyScreen = () => {
  const [tab, setTab] = React.useState("overview");
  const accounts = [
    { name: "Mercury · Operating", bal: "$184,210", change: "-$1,420", tone: "ok" },
    { name: "Mercury · Reserve", bal: "$320,000", change: "+$0", tone: "muted" },
    { name: "Stripe · Pending", bal: "$28,440", change: "+$4,200", tone: "ok" },
    { name: "AmEx · Card", bal: "-$8,612", change: "+$612", tone: "warn" },
  ];
  return (
    <div style={{ flex: 1, padding: "20px 28px 28px", overflow: "auto" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", fontWeight: 500, margin: 0, letterSpacing: -0.5 }}>Money</h1>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-md)", marginTop: 4 }}>Accounts · runway · revenue · expenses</div>
      </div>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-subtle)", marginBottom: 20 }}>
        {["overview","accounts","revenue","expenses"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 14px", marginBottom: -1, fontSize: "var(--text-sm)", fontWeight: 500, textTransform: "capitalize",
            color: tab === t ? "var(--text-hi)" : "var(--text-md)",
            borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
          }}>{t}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <Metric label="Cash on hand" value="$524" unit="k" delta="+2.1%" deltaTone="ok" spark={[480,490,495,510,515,520,524]}/>
        <Metric label="Runway" value="22" unit="mo" sub="@ current burn" spark={[20,21,21,22,22,22,22]} sparkColor="var(--ok)"/>
        <Metric label="Net MRR" value="$20.6" unit="k" delta="+12%" deltaTone="ok" spark={[14,15,16,17,18,19,20]} sparkColor="var(--accent)"/>
        <Metric label="Burn (30d)" value="$23" unit="k" delta="-6%" deltaTone="ok" spark={[28,27,26,25,24,24,23]} sparkColor="var(--info)"/>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <Card title="Runway burn-down" subtitle="Cash vs burn over 24 months · projection from May 2026">
          <LineChart h={220} series={[
            { color: "var(--accent)", data: [524,505,485,463,441,418,394,369,343,316,288,259,229,198,166,133,99,64,28] },
            { color: "var(--ok)",     data: [524,510,498,488,479,471,464,458,453,449,446,443,441,439,438,437,436,435,434] },
          ]}/>
          <div style={{ display: "flex", gap: 16, fontSize: "var(--text-xs)", color: "var(--text-md)", marginTop: 8 }}>
            <span><span style={{ color: "var(--accent)" }}>●</span> Current burn</span>
            <span><span style={{ color: "var(--ok)" }}>●</span> If revenue holds</span>
          </div>
        </Card>
        <Card title="Accounts" subtitle="Last sync 6m ago" action={<Btn size="sm">Sync now</Btn>}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {accounts.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--border-faint)" }}>
                <StatusDot tone={a.tone}/>
                <span style={{ flex: 1, marginLeft: 10, fontSize: "var(--text-sm)", color: "var(--text-hi)" }}>{a.name}</span>
                <span className="mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-hi)", fontVariantNumeric: "tabular-nums" }}>{a.bal}</span>
                <span className="mono" style={{ marginLeft: 12, fontSize: "var(--text-xs)", color: a.change.startsWith("-") ? "var(--err)" : a.change === "+$0" ? "var(--text-lo)" : "var(--ok)", minWidth: 64, textAlign: "right" }}>{a.change}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <Card title="Revenue · per customer" subtitle="MRR contribution this month">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { name: "Zenith Labs", v: 5000, p: 24 },
              { name: "Northwind Co", v: 4000, p: 19 },
              { name: "Helix Studio", v: 2666, p: 13 },
              { name: "Beacon Inc", v: 1833, p: 9 },
              { name: "Orchard Health", v: 1500, p: 7 },
              { name: "Others (9)", v: 5601, p: 28 },
            ].map((c, i) => (
              <DistBar key={i} label={c.name} percent={c.p} maxLabel={`$${c.v.toLocaleString()}`}/>
            ))}
          </div>
        </Card>
        <Card title="Expenses · this month" subtitle="By category">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { name: "Salary & contractors", v: 14000, p: 60, c: "var(--accent)" },
              { name: "Cloud (AWS, Supabase, OAI)", v: 4200, p: 18, c: "var(--info)" },
              { name: "SaaS tools", v: 2400, p: 10, c: "var(--cat-memory)" },
              { name: "Marketing", v: 1800, p: 8, c: "var(--cat-marketing)" },
              { name: "Other", v: 800, p: 4, c: "var(--text-faint)" },
            ].map((c, i) => (
              <DistBar key={i} label={c.name} percent={c.p} maxLabel={`$${c.v.toLocaleString()}`} color={c.c}/>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

Object.assign(window, { WorkScreen, WorkScreenMobile, PeopleScreen, MoneyScreen });
