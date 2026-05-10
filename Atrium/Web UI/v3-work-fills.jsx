/* v3-work-fills.jsx — Work tab: Kanban, Calls, Decisions, Refusals sub-tabs. */

// ============================================================
// KANBAN — three side-by-side embeds
// ============================================================

const V3_KANBAN_BOARDS = [
  { id: "pathfinder", name: "Pathfinder", color: "#E8763A", icon: "Compass",
    columns: [
      { id: "backlog",  label: "Backlog",     items: [
        { id: "PF-118", title: "Reply to Zenith Labs proposal",       dri: "Kyle B",   pri: "med",  age: "2d", customer: "Zenith Labs" },
        { id: "PF-117", title: "Tier 2 margin model — sensitivity",   dri: "Curtis L", pri: "high", age: "4d" },
        { id: "PF-115", title: "Q3 ICP refresh from won-deals data",  dri: "Maya I",   pri: "low",  age: "9d" },
      ]},
      { id: "ready",    label: "Ready",       items: [
        { id: "PF-122", title: "Pricing v3 launch post draft",        dri: "Curtis L", pri: "high", age: "1d", customer: "—" },
        { id: "PF-121", title: "Northwind: send tiered proposal",     dri: "Maya I",   pri: "high", age: "1d", customer: "Northwind" },
      ]},
      { id: "doing",    label: "In progress", items: [
        { id: "PF-237", title: "Draft launch post for Pathfinder v3", dri: "Curtis L", pri: "high", age: "0d" },
        { id: "PF-236", title: "Ranker long-context fallback",        dri: "Keenan O", pri: "med",  age: "2d" },
      ]},
      { id: "review",   label: "Review",      items: [
        { id: "PF-234", title: "Verifier threshold A/B writeup",      dri: "Keenan O", pri: "med",  age: "2d" },
      ]},
      { id: "done",     label: "Done · 7d",   items: [
        { id: "PF-228", title: "Helix design review — design accepted", dri: "Curtis L", pri: "med", age: "—" },
        { id: "PF-225", title: "Realberry kickoff deck",              dri: "Maya I",   pri: "low",  age: "—" },
      ]},
    ]},
  { id: "metacron",   name: "Metacron",   color: "#7355E5", icon: "Layers",
    columns: [
      { id: "backlog",  label: "Backlog",     items: [
        { id: "MC-92", title: "Architect: propose Verifier multi-model",  dri: "Architect", pri: "med",  age: "3d" },
        { id: "MC-91", title: "Slack ingest: backfill last 30d",          dri: "Keenan O",  pri: "low",  age: "5d" },
      ]},
      { id: "ready",    label: "Ready",       items: [
        { id: "MC-99", title: "Rotate agent api keys (quarterly)",        dri: "Keenan O",  pri: "high", age: "0d" },
      ]},
      { id: "doing",    label: "In progress", items: [
        { id: "MC-241", title: "Customer health sweep — weekly cadence",  dri: "Architect", pri: "med",  age: "1d" },
      ]},
      { id: "review",   label: "Review",      items: [
      ]},
      { id: "done",     label: "Done · 7d",   items: [
        { id: "MC-238", title: "Ledger schema v2 migration",              dri: "Keenan O",  pri: "high", age: "—" },
        { id: "MC-235", title: "Audit log retention bumped to 365d",      dri: "Keenan O",  pri: "med",  age: "—" },
      ]},
    ]},
  { id: "internal",   name: "Internal Org", color: "#2E6CD4", icon: "Inbox",
    columns: [
      { id: "backlog",  label: "Backlog",     items: [
        { id: "IO-44", title: "Q3 OKR draft (Kyle to seed)",              dri: "Kyle B",   pri: "high", age: "6d" },
        { id: "IO-43", title: "Hire — backend eng (level 4)",             dri: "Kyle B",   pri: "med",  age: "11d" },
        { id: "IO-42", title: "Refresh handbook — runtime principles",    dri: "Curtis L", pri: "low",  age: "21d" },
      ]},
      { id: "ready",    label: "Ready",       items: [
        { id: "IO-50", title: "Investor update — May",                    dri: "Kyle B",   pri: "high", age: "1d" },
      ]},
      { id: "doing",    label: "In progress", items: [
        { id: "IO-240", title: "Pricing v3 — investor brief",             dri: "Kyle B",   pri: "high", age: "5d" },
      ]},
      { id: "review",   label: "Review",      items: [
        { id: "IO-237", title: "Vendor consolidation memo",               dri: "Curtis L", pri: "low",  age: "3d" },
      ]},
      { id: "done",     label: "Done · 7d",   items: [
        { id: "IO-232", title: "Cap table review with counsel",           dri: "Kyle B",   pri: "high", age: "—" },
      ]},
    ]},
];

const V3WorkKanban = () => {
  const [myOnly, setMyOnly] = React.useState(false);
  const [openCard, setOpenCard] = React.useState(null);
  const ME = "Kyle B";

  const filterItems = (items) => myOnly ? items.filter(i => i.dri === ME) : items;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--v3-ink)", margin: 0, letterSpacing: -0.3 }}>Boards</h2>
        <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>3 Notion boards · read-only</span>
        <V3DemoTag/>
        <div style={{ flex: 1 }}/>
        <button onClick={() => setMyOnly(!myOnly)} style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "7px 12px", fontSize: 12, fontWeight: 500,
          background: myOnly ? "var(--v3-ink)" : "var(--v3-surface)",
          color:      myOnly ? "#FFF"          : "var(--v3-ink-md)",
          border: "1px solid var(--v3-line-strong)", borderRadius: 6,
        }}>
          <I.Check size={11}/> My cards
        </button>
      </div>

      {/* 3 boards side-by-side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {V3_KANBAN_BOARDS.map(board => {
          const Icon = I[board.icon];
          const totalItems = board.columns.reduce((acc, c) => acc + filterItems(c.items).length, 0);
          return (
            <div key={board.id} style={{
              background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden",
              boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
              borderTop: `3px solid ${board.color}`,
              display: "flex", flexDirection: "column",
            }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 26, height: 26, borderRadius: 6,
                  background: board.color + "1A", color: board.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{Icon ? <Icon size={14}/> : null}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--v3-ink)" }}>{board.name}</div>
                  <div style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>{totalItems} cards · synced 2m ago</div>
                </div>
                <button title="Open in Notion" style={{ padding: 4, color: "var(--v3-ink-lo)" }}>
                  <I.ArrowR size={12}/>
                </button>
              </div>
              <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 14 }}>
                {board.columns.map(col => {
                  const items = filterItems(col.items);
                  return (
                    <div key={col.id}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6, padding: "0 4px" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--v3-ink-md)", textTransform: "uppercase", letterSpacing: 0.5 }}>{col.label}</span>
                        <span className="mono" style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>{items.length}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {items.map(it => (
                          <button key={it.id} onClick={() => setOpenCard({ ...it, board: board.name, color: board.color })} style={{
                            textAlign: "left", padding: "9px 10px", borderRadius: 7,
                            background: "var(--v3-bg)", border: "1px solid var(--v3-line-soft)",
                            cursor: "pointer", display: "flex", flexDirection: "column", gap: 5,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span className="mono" style={{ fontSize: 10, color: "var(--v3-ink-lo)" }}>{it.id}</span>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, textTransform: "uppercase", letterSpacing: 0.3,
                                background: it.pri === "high" ? "rgba(209,72,72,0.10)" : it.pri === "med" ? "rgba(232,158,58,0.12)" : "var(--v3-line-soft)",
                                color: it.pri === "high" ? "var(--v3-red)" : it.pri === "med" ? "var(--v3-amber)" : "var(--v3-ink-lo)",
                              }}>{it.pri}</span>
                            </div>
                            <div style={{ fontSize: 12.5, color: "var(--v3-ink)", lineHeight: 1.35 }}>{it.title}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                              <Avatar name={it.dri} size={16}/>
                              <span style={{ fontSize: 11, color: "var(--v3-ink-md)" }}>{it.dri}</span>
                              {it.age && it.age !== "—" && (
                                <span style={{ fontSize: 11, color: "var(--v3-ink-lo)", marginLeft: "auto" }}>{it.age}</span>
                              )}
                            </div>
                          </button>
                        ))}
                        {items.length === 0 && (
                          <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", padding: "10px 8px", textAlign: "center", fontStyle: "italic" }}>—</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Card detail panel */}
      {openCard && (
        <div onClick={() => setOpenCard(null)} style={{
          position: "fixed", inset: 0, background: "rgba(11,21,48,0.32)",
          display: "flex", alignItems: "stretch", justifyContent: "flex-end", zIndex: 50,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 460, background: "var(--v3-surface)", height: "100%", overflow: "auto",
            display: "flex", flexDirection: "column", borderTop: `3px solid ${openCard.color}`,
          }}>
            <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 11, color: openCard.color, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{openCard.board} · {openCard.id}</div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--v3-ink)", margin: "6px 0 0", letterSpacing: -0.2 }}>{openCard.title}</h3>
              </div>
              <button onClick={() => setOpenCard(null)} style={{ padding: 6, color: "var(--v3-ink-lo)" }}><I.X size={14}/></button>
            </div>
            <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { k: "DRI",       v: <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Avatar name={openCard.dri} size={20}/>{openCard.dri}</div> },
                { k: "Priority",  v: <V3StatusPill tone={openCard.pri === "high" ? "err" : openCard.pri === "med" ? "warn" : "neutral"}>{openCard.pri}</V3StatusPill> },
                { k: "Age",       v: openCard.age },
                { k: "Customer",  v: openCard.customer || "—" },
                { k: "Source",    v: <span className="mono" style={{ fontSize: 12 }}>notion://board/{openCard.board.toLowerCase()}/{openCard.id}</span> },
              ].map((row, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13 }}>
                  <span style={{ minWidth: 84, color: "var(--v3-ink-lo)", textTransform: "uppercase", fontSize: 11, fontWeight: 600, letterSpacing: 0.4 }}>{row.k}</span>
                  <div style={{ color: "var(--v3-ink)" }}>{row.v}</div>
                </div>
              ))}
              <div style={{ marginTop: 6 }}>
                <button style={{
                  display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px",
                  background: "var(--v3-ink)", color: "#FFF", borderRadius: 6, fontSize: 12, fontWeight: 500,
                }}>
                  Open in Notion <I.ArrowR size={11}/>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// CALLS
// ============================================================

const V3_CALLS = [
  { id: "c-101", date: "May 7 · 14:30", title: "Helix design review", customer: "Helix", dur: "28m", source: "fathom",
    summary: "Curtis walked design team through pricing v3 mocks; team agreed on tier-2 layout, raised concern about labels in tier-3.",
    parts: ["Curtis L", "Sara H", "Dan T"],
    decisions: [
      { text: "Adopt tier-2 mock as design baseline", conf: 0.94 },
      { text: "Re-spell tier-3 features before Friday", conf: 0.81 },
    ],
    actions: [
      { text: "Curtis to push v3 mocks Slack channel", card: "PF-237" },
      { text: "Dan to revise tier-3 copy",            card: "PF-122" },
    ],
    quotes: [
      { ts: "12:14", who: "Sara H", text: "I think the tier-2 layout reads cleanly — let's lock it." },
      { ts: "21:48", who: "Curtis L", text: "Tier-3 needs another pass on the labels." },
    ]},
  { id: "c-102", date: "May 7 · 13:00", title: "Weekly sync", customer: "Internal", dur: "60m", source: "fathom",
    summary: "Kyle, Keenan, Curtis aligned on prioritizing Pathfinder pricing v3 over Marketing relaunch; Northwind expansion soft-committed.",
    parts: ["Kyle B", "Keenan O", "Curtis L"],
    decisions: [
      { text: "Prioritize Pathfinder pricing v3 over Marketing relaunch", conf: 0.97 },
      { text: "Stand up dedicated channel for Northwind expansion",       conf: 0.88 },
    ],
    actions: [
      { text: "Kyle to send Northwind tiered proposal",  card: "PF-121" },
      { text: "Keenan to rotate agent api keys",         card: "MC-99"  },
    ],
    quotes: [
      { ts: "08:22", who: "Kyle B",   text: "Pricing v3 is the gating dependency for the investor brief." },
    ]},
  { id: "c-103", date: "May 7 · 10:30", title: "Northwind expansion", customer: "Northwind", dur: "30m", source: "plaud",
    summary: "Maya led; soft commitment from Northwind on 30 seats with SSO, contingent on Friday tier-2 unblock.",
    parts: ["Maya I", "Avi L (Northwind)"],
    decisions: [
      { text: "Northwind soft-commit: 30 seats with SSO", conf: 0.91 },
    ],
    actions: [
      { text: "Send tiered proposal post Friday",        card: "PF-121" },
    ],
    quotes: [
      { ts: "18:11", who: "Avi L (Northwind)", text: "If you can land tier-2 by Friday, we'll commit on 30." },
    ]},
  { id: "c-104", date: "May 6 · 16:14", title: "Zenith Labs intro", customer: "Zenith Labs", dur: "22m", source: "plaud",
    summary: "Cold-warmed intro through investor; Zenith open to a focused pilot on Pathfinder ranker.",
    parts: ["Kyle B", "Eli W (Zenith)"],
    decisions: [],
    actions: [
      { text: "Reply with proposal scope by Fri",         card: "PF-118" },
    ],
    quotes: [
      { ts: "04:50", who: "Eli W (Zenith)", text: "Send a 1-pager and let's get the pilot moving." },
    ]},
  { id: "c-105", date: "May 5 · 14:00", title: "Realberry weekly check-in", customer: "Realberry", dur: "25m", source: "manual",
    summary: "Onboarding tracking; ranker integration on schedule, expected pilot kickoff May 14.",
    parts: ["Maya I", "Tom S (Realberry)"],
    decisions: [],
    actions: [],
    quotes: [],
  },
  { id: "c-106", date: "May 7 · 14:30", title: "Harris County FCD · procurement pull", customer: "Zedcor", dur: "4m 32s", source: "voice_agent",
    voice: { caller_brand: "Marie (Zedcor SDR)", office: "Harris County Flood Control District", agent: "Procurement Pull", attempt_id: "att-1041", structured: true },
    summary: "Voice agent reached procurement clerk; pulled June bid calendar and confirmed two upcoming RFPs in flood-control category.",
    parts: ["Marie (voice agent)", "Procurement clerk"],
    decisions: [
      { text: "Two RFPs land week of June 10", conf: 0.92 },
    ],
    actions: [
      { text: "Route RFP intel into Zedcor pipeline", card: "ZD-441" },
    ],
    quotes: [
      { ts: "01:48", who: "Procurement clerk", text: "We've got two flood-control RFPs going out the week of the 10th." },
    ]},
  { id: "c-107", date: "May 7 · 14:24", title: "Albuquerque Public Works · procurement pull", customer: "Realberry", dur: "2m 11s", source: "voice_agent",
    voice: { caller_brand: "Tom (Realberry rep)", office: "Albuquerque Public Works", agent: "Procurement Pull", attempt_id: "att-1040", structured: true },
    summary: "Short call; clerk redirected to online portal — agent captured portal URL and submission window.",
    parts: ["Tom (voice agent)", "Front desk"],
    decisions: [],
    actions: [
      { text: "Scrape ABQ procurement portal nightly", card: "RB-208" },
    ],
    quotes: [
      { ts: "00:58", who: "Front desk", text: "Everything goes through the portal now — abqprocurement-dot-gov." },
    ]},
];

const V3WorkCalls = () => {
  const [q, setQ] = React.useState("");
  const [src, setSrc] = React.useState("all");
  const [openId, setOpenId] = React.useState(null);
  const filtered = V3_CALLS.filter(c =>
    (src === "all" || c.source === src) &&
    (!q ||
      c.title.toLowerCase().includes(q.toLowerCase()) ||
      c.customer.toLowerCase().includes(q.toLowerCase()) ||
      c.summary.toLowerCase().includes(q.toLowerCase()))
  );
  const open = filtered.find(c => c.id === openId);
  const SOURCES = [
    { id: "all",        label: "All" },
    { id: "plaud",      label: "Plaud" },
    { id: "fathom",     label: "Fathom" },
    { id: "voice_agent",label: "Voice agent" },
    { id: "manual",     label: "Manual" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--v3-ink)", margin: 0, letterSpacing: -0.3 }}>Calls</h2>
        <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>{filtered.length} calls · ledger source_type=call</span>
        <V3DemoTag/>
        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          {SOURCES.map(s => (
            <button key={s.id} onClick={() => setSrc(s.id)} style={{
              padding: "5px 10px", fontSize: 11.5, fontWeight: 500, borderRadius: 999,
              background: src === s.id ? "var(--v3-ink)" : "transparent",
              color: src === s.id ? "#FFF" : "var(--v3-ink-md)",
              border: `1px solid ${src === s.id ? "var(--v3-ink)" : "var(--v3-line-strong)"}`,
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
            }}>
              {s.id === "voice_agent" && <VoicePhone size={10} color={src === s.id ? "#FFF" : "#E8763A"}/>}
              {s.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }}/>
        <div style={{ position: "relative" }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search transcripts (semantic + literal)…" style={{
            width: 340, padding: "8px 12px 8px 32px",
            background: "var(--v3-surface)", border: "1px solid var(--v3-line-strong)", borderRadius: 7,
            fontSize: 13, fontFamily: "inherit", color: "var(--v3-ink)", outline: "none",
          }}/>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--v3-ink-lo)" }}>
            <I.Sparkle size={13}/>
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: open ? "1.2fr 1.5fr" : "1fr", gap: 16 }}>
        <div style={{
          background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden",
          boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
        }}>
          {filtered.map((c, i) => (
            <button key={c.id} onClick={() => setOpenId(c.id)} style={{
              width: "100%", textAlign: "left",
              padding: "14px 18px",
              borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)",
              background: openId === c.id ? "rgba(46,108,212,0.05)" : "transparent",
              borderLeft: openId === c.id ? "3px solid var(--v3-blue)" : "3px solid transparent",
              display: "flex", gap: 14, alignItems: "flex-start",
              cursor: "pointer",
            }}>
              <div style={{ display: "flex", marginRight: 4 }}>
                {c.parts.slice(0,3).map((p, j) => (
                  <div key={j} style={{ marginLeft: j === 0 ? 0 : -8, border: "2px solid var(--v3-surface)", borderRadius: "50%" }}>
                    <Avatar name={p} size={26}/>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--v3-ink)" }}>{c.title}</span>
                  <span style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>{c.dur}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--v3-ink-md)", lineHeight: 1.45, marginBottom: 6 }}>{c.summary}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>{c.date}</span>
                  <span style={{
                    fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.4,
                    background: "var(--v3-line-soft)", color: "var(--v3-ink-md)",
                  }}>{c.customer}</span>
                  <span style={{
                    fontSize: 10.5, fontWeight: 500, padding: "2px 7px", borderRadius: 999,
                    background: c.source === "voice_agent" ? "rgba(232,118,58,0.10)" : "transparent",
                    color: c.source === "voice_agent" ? "#E8763A" : "var(--v3-ink-lo)",
                    border: c.source === "voice_agent" ? "1px solid rgba(232,118,58,0.25)" : "1px solid var(--v3-line-soft)",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}>
                    {c.source === "voice_agent" && <VoicePhone size={9} color="#E8763A"/>}
                    {SOURCES.find(s => s.id === c.source)?.label || c.source}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {open && (
          <div style={{
            background: "var(--v3-surface)", borderRadius: 12, padding: "20px 24px",
            boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
            display: "flex", flexDirection: "column", gap: 18,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--v3-ink)", margin: 0, letterSpacing: -0.2 }}>{open.title}</h3>
                <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 4 }}>{open.date} · {open.dur} · {open.parts.join(", ")}</div>
              </div>
              <button onClick={() => setOpenId(null)} style={{ padding: 6, color: "var(--v3-ink-lo)" }}><I.X size={14}/></button>
            </div>

            {open.source === "voice_agent" && open.voice && (
              <div style={{
                background: "rgba(232,118,58,0.06)", border: "1px solid rgba(232,118,58,0.20)",
                borderRadius: 8, padding: "10px 12px",
                display: "grid", gridTemplateColumns: "auto 1fr auto 1fr", gap: "6px 14px", alignItems: "center",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#E8763A", textTransform: "uppercase", letterSpacing: 0.4, gridColumn: "1 / -1" }}>
                  <VoicePhone size={11} color="#E8763A"/> Voice agent call
                </div>
                <span style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>Caller</span>
                <span style={{ fontSize: 12, color: "var(--v3-ink)" }}>{open.voice.caller_brand}</span>
                <span style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>Office</span>
                <span style={{ fontSize: 12, color: "var(--v3-ink)" }}>{open.voice.office}</span>
                <span style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>Agent</span>
                <span style={{ fontSize: 12, color: "var(--v3-ink)" }}>{open.voice.agent}</span>
                <span style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>Attempt</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--v3-ink)" }}>{open.voice.attempt_id}{open.voice.structured ? " · structured" : ""}</span>
              </div>
            )}

            <div>
              <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>Decisions</div>
              {open.decisions.length ? open.decisions.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)" }}>
                  <I.Check size={12} style={{ color: "var(--v3-green)" }}/>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--v3-ink)" }}>{d.text}</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>conf {d.conf.toFixed(2)}</span>
                </div>
              )) : <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", fontStyle: "italic" }}>None extracted.</div>}
            </div>

            <div>
              <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>Action items</div>
              {open.actions.length ? open.actions.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)" }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--v3-blue)", background: "rgba(46,108,212,0.10)", padding: "2px 6px", borderRadius: 4, minWidth: 56, textAlign: "center" }}>{a.card}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--v3-ink)" }}>{a.text}</span>
                </div>
              )) : <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", fontStyle: "italic" }}>None.</div>}
            </div>

            <div>
              <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>Evidence quotes</div>
              {open.quotes.length ? open.quotes.map((q, i) => (
                <div key={i} style={{
                  marginTop: i === 0 ? 0 : 6,
                  padding: "10px 12px", borderLeft: "3px solid var(--v3-line-strong)",
                  background: "var(--v3-bg)", borderRadius: "0 6px 6px 0",
                }}>
                  <div style={{ fontSize: 13, color: "var(--v3-ink)", lineHeight: 1.5, fontStyle: "italic" }}>"{q.text}"</div>
                  <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", marginTop: 4 }}><span className="mono">{q.ts}</span> · {q.who}</div>
                </div>
              )) : <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", fontStyle: "italic" }}>None.</div>}
            </div>

            <button style={{
              alignSelf: "flex-start", padding: "8px 14px", fontSize: 12, fontWeight: 500,
              background: "var(--v3-bg)", color: "var(--v3-ink-md)",
              border: "1px solid var(--v3-line-strong)", borderRadius: 6,
            }}>Expand full transcript ({Math.floor(parseInt(open.dur) / 2) * 280} words)</button>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// DECISIONS — Continuity timeline filtered to outcomes
// ============================================================

const V3WorkDecisions = () => {
  const [filters, setFilters] = React.useState({
    customer_promise: true,
    architectural_decision: true,
    public_statement: true,
    partnership: true,
    regulatory: true,
  });
  const filterDefs = [
    { id: "customer_promise",      label: "Customer promise",     color: "#E8763A" },
    { id: "architectural_decision",label: "Architecture",         color: "#7355E5" },
    { id: "public_statement",      label: "Public statement",     color: "#2E6CD4" },
    { id: "partnership",           label: "Partnership",          color: "#1F8A5B" },
    { id: "regulatory",            label: "Regulatory",           color: "#D14848" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--v3-ink)", margin: 0, letterSpacing: -0.3 }}>Decisions</h2>
        <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>Continuity timeline · supersedes & active-until</span>
        <V3DemoTag/>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {filterDefs.map(f => {
          const on = filters[f.id];
          return (
            <button key={f.id} onClick={() => setFilters({ ...filters, [f.id]: !on })} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 500,
              background: on ? f.color + "12" : "transparent",
              color:      on ? f.color        : "var(--v3-ink-lo)",
              border: `1px solid ${on ? f.color + "55" : "var(--v3-line-strong)"}`,
              cursor: "pointer",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: f.color, opacity: on ? 1 : 0.4 }}/>
              {f.label}
            </button>
          );
        })}
      </div>
      <V3ContinuityTimeline/>
    </div>
  );
};

// ============================================================
// REFUSALS — scoped log
// ============================================================

const V3WorkRefusals = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--v3-ink)", margin: 0, letterSpacing: -0.3 }}>Refusals</h2>
      <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>Scoped to action items + sprint cards + outbound artifacts</span>
      <V3DemoTag/>
    </div>
    <V3RefusalLog scope="work"/>
  </div>
);

// ============================================================
// ACTION ITEMS — W-2
// Production addition: not in original v3-work-fills design.
// Source: nervous_system.action_items (Sprint 4 Stream D).
// This stub documents the production sub-tab for design parity.
// ============================================================

const V3_ACTION_ITEMS = [
  { id: "ai-001", title: "Reply to Zenith Labs proposal scope", priority: "high",        status: "open",        dri: "Kyle B",   due: "May 10", workspace: "pathfinder",   source: "call" },
  { id: "ai-002", title: "Rotate agent API keys (quarterly)",   priority: "high",        status: "in_progress", dri: "Keenan O", due: "May 9",  workspace: "metacron",     source: "sprint_plan" },
  { id: "ai-003", title: "Tier-3 feature copy revisions",       priority: "medium",      status: "in_progress", dri: "Curtis L", due: "May 9",  workspace: "pathfinder",   source: "call" },
  { id: "ai-004", title: "Northwind tiered proposal",           priority: "high",        status: "open",        dri: "Maya I",   due: "May 9",  workspace: "pathfinder",   source: "call" },
  { id: "ai-005", title: "Q3 OKR seed — Kyle to initiate",      priority: "high",        status: "open",        dri: "Kyle B",   due: "May 16", workspace: "internal_org", source: "cowork" },
  { id: "ai-006", title: "Audit log retention bump to 365d",    priority: "medium",      status: "done",        dri: "Keenan O", due: null,     workspace: "metacron",     source: "sprint_plan" },
  { id: "ai-007", title: "Refresh handbook — runtime principles", priority: "low",       status: "open",        dri: "Curtis L", due: null,     workspace: "internal_org", source: "cowork" },
  { id: "ai-008", title: "ABQ procurement portal nightly scrape", priority: "medium",    status: "blocked",     dri: "Keenan O", due: null,     workspace: "pathfinder",   source: "voice_agent" },
  { id: "ai-009", title: "Verifier threshold A/B writeup",      priority: "medium",      status: "in_progress", dri: "Keenan O", due: "May 11", workspace: "metacron",     source: "sprint_plan" },
  { id: "ai-010", title: "Investor update — May",               priority: "irreversible",status: "open",        dri: "Kyle B",   due: "May 12", workspace: "internal_org", source: "cowork" },
];

const AI_PRIORITY_COLORS = {
  low:         { bg: "rgba(107,114,128,0.10)", fg: "var(--v3-ink-lo)" },
  medium:      { bg: "rgba(232,158,58,0.12)",  fg: "var(--v3-amber)" },
  high:        { bg: "rgba(209,72,72,0.10)",   fg: "var(--v3-red)" },
  irreversible:{ bg: "rgba(115,85,229,0.12)",  fg: "#7355E5" },
};

const AI_STATUS_LABELS = {
  open:        "Open",
  in_progress: "In progress",
  done:        "Done",
  blocked:     "Blocked",
  broken_off:  "Broken off",
};

const V3WorkActionItems = () => {
  const [filterPriority, setFilterPriority] = React.useState([]);
  const [filterStatus,   setFilterStatus]   = React.useState([]);
  const [filterDri,      setFilterDri]       = React.useState("");
  const [sortField,      setSortField]       = React.useState("priority");
  const [openItem,       setOpenItem]        = React.useState(null);

  const PRIORITY_ORDER = { irreversible: 0, high: 1, medium: 2, low: 3 };

  const filtered = V3_ACTION_ITEMS
    .filter(it =>
      (!filterPriority.length || filterPriority.includes(it.priority)) &&
      (!filterStatus.length   || filterStatus.includes(it.status))     &&
      (!filterDri             || it.dri.toLowerCase().includes(filterDri.toLowerCase()))
    )
    .sort((a, b) => {
      if (sortField === "priority") return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      if (sortField === "status")   return a.status.localeCompare(b.status);
      if (sortField === "dri")      return a.dri.localeCompare(b.dri);
      if (sortField === "due")      return (a.due || "zzz").localeCompare(b.due || "zzz");
      return 0;
    });

  const toggleChip = (arr, set, val) =>
    arr.includes(val) ? set(arr.filter(x => x !== val)) : set([...arr, val]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--v3-ink)", margin: 0, letterSpacing: -0.3 }}>Action Items</h2>
        <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>nervous_system.action_items · {filtered.length} shown</span>
        <V3DemoTag/>
        <div style={{ flex: 1 }}/>
        {/* Sort selector */}
        <select value={sortField} onChange={e => setSortField(e.target.value)} style={{
          padding: "6px 10px", fontSize: 12, background: "var(--v3-surface)",
          border: "1px solid var(--v3-line-strong)", borderRadius: 6, color: "var(--v3-ink-md)", fontFamily: "inherit",
        }}>
          <option value="priority">Sort: Priority</option>
          <option value="status">Sort: Status</option>
          <option value="dri">Sort: DRI</option>
          <option value="due">Sort: Due</option>
        </select>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--v3-ink-lo)", marginRight: 4 }}>Priority</span>
        {["low","medium","high","irreversible"].map(p => {
          const on = filterPriority.includes(p);
          const c  = AI_PRIORITY_COLORS[p];
          return (
            <button key={p} onClick={() => toggleChip(filterPriority, setFilterPriority, p)} style={{
              padding: "4px 10px", fontSize: 11.5, fontWeight: 500, borderRadius: 999, cursor: "pointer",
              background: on ? c.bg : "transparent", color: on ? c.fg : "var(--v3-ink-lo)",
              border: `1px solid ${on ? c.fg + "55" : "var(--v3-line-strong)"}`,
            }}>{p}</button>
          );
        })}
        <span style={{ fontSize: 11, color: "var(--v3-ink-lo)", marginLeft: 8, marginRight: 4 }}>Status</span>
        {Object.entries(AI_STATUS_LABELS).map(([k, v]) => {
          const on = filterStatus.includes(k);
          return (
            <button key={k} onClick={() => toggleChip(filterStatus, setFilterStatus, k)} style={{
              padding: "4px 10px", fontSize: 11.5, fontWeight: 500, borderRadius: 999, cursor: "pointer",
              background: on ? "var(--v3-ink)" : "transparent", color: on ? "#FFF" : "var(--v3-ink-lo)",
              border: `1px solid ${on ? "var(--v3-ink)" : "var(--v3-line-strong)"}`,
            }}>{v}</button>
          );
        })}
        <input value={filterDri} onChange={e => setFilterDri(e.target.value)} placeholder="Filter DRI…" style={{
          marginLeft: 8, padding: "5px 10px", fontSize: 12,
          background: "var(--v3-surface)", border: "1px solid var(--v3-line-strong)",
          borderRadius: 6, color: "var(--v3-ink)", fontFamily: "inherit", width: 140,
        }}/>
        {(filterPriority.length || filterStatus.length || filterDri) ? (
          <button onClick={() => { setFilterPriority([]); setFilterStatus([]); setFilterDri(""); }} style={{
            fontSize: 11, color: "var(--v3-ink-lo)", padding: "4px 8px",
            border: "1px solid var(--v3-line-strong)", borderRadius: 6, cursor: "pointer",
          }}>Clear</button>
        ) : null}
      </div>

      {/* Table + detail split */}
      <div style={{ display: "grid", gridTemplateColumns: openItem ? "1fr 380px" : "1fr", gap: 16 }}>
        {/* Item list */}
        <div style={{
          background: "var(--v3-surface)", borderRadius: 12,
          boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
          overflow: "hidden",
        }}>
          {/* Column headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 90px 90px 80px 80px",
            padding: "9px 16px", borderBottom: "1px solid var(--v3-line-soft)",
            fontSize: 10.5, fontWeight: 600, color: "var(--v3-ink-lo)",
            textTransform: "uppercase", letterSpacing: 0.5,
          }}>
            <span>Title</span><span>Priority</span><span>Status</span><span>DRI</span><span>Due</span>
          </div>
          {filtered.map((it, i) => {
            const c = AI_PRIORITY_COLORS[it.priority];
            return (
              <button key={it.id} onClick={() => setOpenItem(it)} style={{
                display: "grid", gridTemplateColumns: "1fr 90px 90px 80px 80px",
                width: "100%", textAlign: "left",
                padding: "11px 16px",
                borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)",
                background: openItem?.id === it.id ? "rgba(46,108,212,0.05)" : "transparent",
                borderLeft: openItem?.id === it.id ? "3px solid var(--v3-blue)" : "3px solid transparent",
                cursor: "pointer", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 13, color: it.status === "done" ? "var(--v3-ink-lo)" : "var(--v3-ink)", textDecoration: it.status === "done" ? "line-through" : "none" }}>{it.title}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", background: c.bg, color: c.fg }}>{it.priority}</span>
                <span style={{ fontSize: 11.5, color: it.status === "blocked" ? "var(--v3-red)" : it.status === "done" ? "var(--v3-green)" : "var(--v3-ink-md)" }}>{AI_STATUS_LABELS[it.status]}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Avatar name={it.dri} size={18}/><span style={{ fontSize: 11, color: "var(--v3-ink-md)" }}>{it.dri.split(" ")[0]}</span></div>
                <span style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>{it.due || "—"}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 13, color: "var(--v3-ink-lo)", fontStyle: "italic" }}>No action items match current filters.</div>
          )}
        </div>

        {/* Detail panel */}
        {openItem && (
          <div style={{
            background: "var(--v3-surface)", borderRadius: 12, padding: "20px 22px",
            boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0, letterSpacing: -0.2, lineHeight: 1.4 }}>{openItem.title}</h3>
              <button onClick={() => setOpenItem(null)} style={{ padding: 6, color: "var(--v3-ink-lo)" }}><I.X size={14}/></button>
            </div>
            {[
              { k: "Priority",  v: <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", background: AI_PRIORITY_COLORS[openItem.priority].bg, color: AI_PRIORITY_COLORS[openItem.priority].fg }}>{openItem.priority}</span> },
              { k: "Status",    v: AI_STATUS_LABELS[openItem.status] },
              { k: "DRI",       v: <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar name={openItem.dri} size={18}/>{openItem.dri}</div> },
              { k: "Due",       v: openItem.due || "—" },
              { k: "Workspace", v: <span className="mono" style={{ fontSize: 12 }}>{openItem.workspace}</span> },
              { k: "Source",    v: openItem.source },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)", paddingTop: i === 0 ? 0 : 10 }}>
                <span style={{ minWidth: 76, color: "var(--v3-ink-lo)", textTransform: "uppercase", fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4 }}>{row.k}</span>
                <div style={{ color: "var(--v3-ink)" }}>{row.v}</div>
              </div>
            ))}
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 10.5, color: "var(--v3-ink-lo)", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>Verify Criteria</div>
              <div style={{ fontSize: 12.5, color: "var(--v3-ink-md)", lineHeight: 1.5, padding: "10px 12px", background: "var(--v3-bg)", borderRadius: 6, fontStyle: "italic" }}>
                Not set. Add before moving to In Process.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// SPRINTS — W-3
// Production addition: not in original v3-work-fills design.
// Source: nervous_system.audit_log WHERE action LIKE 'sprint_%' (Sprint 4 Stream D).
// Groups by sprint number descending; most recent non-complete = active.
// This stub documents the production sub-tab for design parity.
// ============================================================

const V3_SPRINT_GROUPS = [
  {
    num: "7",
    name: "Sprint 7 — Polish + PWA + Notifications + Audit",
    status: "dispatched",
    rows: [
      { action: "sprint_7_dispatch", ts: "2026-05-09T00:00:00Z", note: "Master Conductor dispatched Sprint 7." },
    ],
  },
  {
    num: "6",
    name: "Sprint 6 — DTU + Cowork Infra",
    status: "complete",
    rows: [
      { action: "sprint_6_complete", ts: "2026-05-07T18:00:00Z", note: "Sprint 6 verified by Kyle." },
      { action: "sprint_6_dispatch", ts: "2026-05-05T09:00:00Z", note: "Master Conductor dispatched Sprint 6." },
    ],
  },
  {
    num: "5",
    name: "Sprint 5 — Scenarios + Satisfaction + Voice",
    status: "complete",
    rows: [
      { action: "sprint_5_complete", ts: "2026-05-04T16:00:00Z", note: "Sprint 5 verified by Kyle." },
      { action: "sprint_5_dispatch", ts: "2026-05-02T09:00:00Z", note: "Master Conductor dispatched Sprint 5." },
    ],
  },
];

const SPRINT_STATUS_STYLE = {
  dispatched: { bg: "rgba(232,158,58,0.12)", fg: "var(--v3-amber)", label: "Active" },
  complete:   { bg: "rgba(31,138,91,0.12)",  fg: "var(--v3-green)", label: "Complete" },
  failed:     { bg: "rgba(209,72,72,0.10)",  fg: "var(--v3-red)",   label: "Failed" },
};

const V3WorkSprints = () => {
  const [expanded, setExpanded] = React.useState(new Set(["7"]));

  const toggle = (num) => {
    const next = new Set(expanded);
    next.has(num) ? next.delete(num) : next.add(num);
    setExpanded(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--v3-ink)", margin: 0, letterSpacing: -0.3 }}>Sprints</h2>
        <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>audit_log · action LIKE sprint_%</span>
        <V3DemoTag/>
      </div>

      {/* Sprint cards */}
      {V3_SPRINT_GROUPS.map(group => {
        const st = SPRINT_STATUS_STYLE[group.status] ?? SPRINT_STATUS_STYLE.dispatched;
        const isOpen = expanded.has(group.num);
        const isActive = group.status !== "complete";

        return (
          <div key={group.num} style={{
            background: "var(--v3-surface)", borderRadius: 12,
            boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
            borderLeft: isActive ? "3px solid var(--v3-amber)" : "3px solid var(--v3-line-strong)",
            overflow: "hidden",
          }}>
            <button onClick={() => toggle(group.num)} style={{
              display: "flex", width: "100%", textAlign: "left", alignItems: "center", gap: 14,
              padding: "14px 18px", cursor: "pointer", background: "transparent",
            }}>
              <span className="mono" style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                background: "var(--v3-bg)", color: "var(--v3-ink-lo)",
              }}>S{group.num}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--v3-ink)" }}>{group.name}</span>
              <span style={{
                fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                textTransform: "uppercase", letterSpacing: 0.5,
                background: st.bg, color: st.fg,
              }}>{st.label}</span>
              <I.ChevRight size={13} style={{ color: "var(--v3-ink-lo)", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}/>
            </button>

            {isOpen && (
              <div style={{ borderTop: "1px solid var(--v3-line-soft)", padding: "12px 18px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                {group.rows.map((row, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 12.5 }}>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--v3-ink-lo)", whiteSpace: "nowrap", paddingTop: 1 }}>
                      {new Date(row.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--v3-blue)", whiteSpace: "nowrap", paddingTop: 1 }}>{row.action}</span>
                    <span style={{ color: "var(--v3-ink-md)", lineHeight: 1.5 }}>{row.note}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Empty state (shown when no sprint data in DB) */}
      <div style={{ display: "none" }}>
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--v3-ink)", marginBottom: 6 }}>No sprint data yet</div>
          <div style={{ fontSize: 13, color: "var(--v3-ink-lo)", lineHeight: 1.6, maxWidth: 380, margin: "0 auto" }}>
            Sprint tracking begins once Conductor sprints land. The Orchestrator writes
            audit_log entries with action matching <code style={{ fontSize: 11.5, color: "var(--v3-ink-md)" }}>sprint_*</code> as
            it dispatches each sprint.
          </div>
        </div>
      </div>
    </div>
  );
};

window.V3WorkKanban = V3WorkKanban;
window.V3WorkCalls = V3WorkCalls;
window.V3WorkDecisions = V3WorkDecisions;
window.V3WorkRefusals = V3WorkRefusals;
window.V3WorkActionItems = V3WorkActionItems;
window.V3WorkSprints = V3WorkSprints;
