/* Atrium v3 — Stellate-inspired editorial language
   Dark navy rail, white cards on cool-gray surface, big confident numerics,
   blue underline tabs, restrained delta colors, pale-pill statuses. */

const v3Tokens = `
.atrium-v3 {
  /* Surfaces */
  --v3-bg:        #F6F7F9;        /* cool gray page */
  --v3-bg-soft:   #ECEEF2;        /* filter rail bg */
  --v3-surface:   #FFFFFF;        /* cards */
  --v3-rail:      #1D2D4F;        /* deep navy rail */
  --v3-rail-2:    #243861;
  --v3-topbar:    #1D2D4F;        /* dark crumb bar */
  --v3-topbar-text: #C2CADB;
  --v3-topbar-text-lo: #6E7A95;

  /* Text on light */
  --v3-ink:       #0B1530;        /* near-black navy */
  --v3-ink-md:    #46506A;
  --v3-ink-lo:    #7E8AA3;
  --v3-ink-faint: #BAC2D2;

  /* Borders — cool, very faint */
  --v3-line:      #E5E8EE;
  --v3-line-soft: #EEF0F4;
  --v3-line-strong: #D8DCE5;

  /* Accents */
  --v3-blue:      #6081BE;        /* primary action / tab underline */
  --v3-blue-soft: #E8EEF8;
  --v3-blue-ink:  #6081BE;
  --v3-purple:    #7355E5;        /* secondary chart / floor price */
  --v3-orange:    #E8763A;        /* unicron brand orange — distribution accent + live state */
  --v3-orange-soft: #FFEFE3;
  --v3-red:       #E14B4B;
  --v3-red-soft:  #FCE8E8;
  --v3-amber:     #C28A1F;
  --v3-amber-soft:#FFEFD0;
  --v3-green:     #2E8E66;
  --v3-green-soft:#E1F2EA;

  font-family: "Geist", "Inter Tight", -apple-system, sans-serif;
  background: var(--v3-bg);
  color: var(--v3-ink);
  height: 100vh;
  display: flex;
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "ss01", "cv11";
}
.atrium-v3 *::-webkit-scrollbar { width: 8px; height: 8px; }
.atrium-v3 *::-webkit-scrollbar-thumb { background: rgba(11,21,48,0.10); border-radius: 999px; }
.atrium-v3 .mono { font-family: "Geist Mono", ui-monospace, monospace; }
.atrium-v3 button { background: none; border: none; padding: 0; color: inherit; cursor: pointer; font-family: inherit; }
.atrium-v3 .display { font-family: "Geist", "Inter Tight"; letter-spacing: -0.02em; }

/* Status pulse — collapse to dot-only at narrower widths */
@media (max-width: 1180px) {
  .atrium-v3 .v3-pulse-text { display: none !important; }
  .atrium-v3 .v3-pulse-pill { padding: 7px !important; }
}
`;

const V3_NAV = [
  { id: "now",       label: "Now",       icon: I.Now },
  { id: "people",    label: "People",    icon: I.People },
  { id: "work",      label: "Work",      icon: I.Work },
  { id: "money",     label: "Money",     icon: I.Money },
  { id: "marketing", label: "Marketing", icon: I.Megaphone },
  { id: "products",  label: "Products",  icon: I.Layers },
  { id: "system",    label: "System",    icon: I.System },
  { id: "library",   label: "Library",   icon: I.Book },
];

// ---------- Rail (dark navy) ----------
const V3Rail = ({ active, setActive }) => (
  <nav style={{
    width: 68, background: "var(--v3-rail)",
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "14px 0", flexShrink: 0,
  }}>
    <div style={{
      width: 44, height: 44, marginBottom: 18,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <img src="atrium-logo.png" alt="Atrium" style={{ width: 40, height: "auto", display: "block" }}/>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", padding: "0 6px" }}>
      {V3_NAV.map(n => {
        const isActive = active === n.id;
        return (
          <button key={n.id} onClick={() => setActive(n.id)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            padding: "6px 0", borderRadius: 8,
            background: "transparent",
            color: isActive ? "#FFFFFF" : "#7C87A0",
            transition: "all 180ms",
          }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "#C2CADB"; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "#7C87A0"; }}
          >
            <span style={{
              width: 36, height: 36, borderRadius: 9,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: isActive ? "#FFFFFF" : "transparent",
              color: isActive ? "var(--v3-rail)" : "inherit",
              boxShadow: isActive ? "0 1px 2px rgba(0,0,0,0.18)" : "none",
              transition: "all 180ms",
            }}>
              <n.icon size={18}/>
            </span>
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.1 }}>{n.label}</span>
          </button>
        );
      })}
    </div>
    <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <button title="Help" style={{ color: "#7C87A0", padding: 8 }}><I.Compass size={16}/></button>
      <Avatar name="Kyle B" size={28} color="linear-gradient(135deg,#5b6580,#1B2542)"/>
    </div>
  </nav>
);

// ---------- Status pulse strip (right of search) ----------
const V3StatusPulse = () => {
  const items = [
    { id: "agents",      label: "Agents",      value: "12 healthy", tone: "ok",   tip: "Agents · 12 healthy — 12 of 12 specialist agents responding within SLA" },
    { id: "escalations", label: "Escalations", value: "0 open",     tone: "ok",   tip: "Escalations · 0 open — no human-required escalations in queue" },
    { id: "budget",      label: "Budget",      value: "34%",        tone: "warn", tip: "Budget · 34% — $214 of $640 weekly · forecast 41% EOD" },
    { id: "decay",       label: "Decay",       value: "3 stale",    tone: "warn", tip: "Decay · 3 stale — Pricing FAQ, ICP v1, Onboarding untouched 90+ days" },
    { id: "voice",       label: "Voice",       value: "3 in flight",tone: "ok",   icon: "phone",
      tip: "Voice · 3 in flight — 1 in-conversation, 1 ringing, 1 queued · 0.4% error rate (24h) · Procurement Pull 2 / SDR 1" },
  ];
  const dot = (tone) => tone === "ok" ? "var(--v3-green)" : tone === "warn" ? "var(--v3-amber)" : "var(--v3-red)";

  return (
    <div className="v3-pulse-strip" style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
      {items.map(it => (
        <div key={it.id} title={it.tip} className="v3-pulse-pill" style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 9px", borderRadius: 7,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
          cursor: "default", whiteSpace: "nowrap",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: dot(it.tone), flexShrink: 0 }}/>
          {it.icon === "phone" && <VoicePhone size={10} color="#E8763A" style={{ flexShrink: 0 }}/>}
          <span className="v3-pulse-text" style={{ fontSize: 11, color: "var(--v3-topbar-text-lo)", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
            <span className="v3-pulse-label">{it.label}</span>
            <span style={{ color: "#FFF", fontWeight: 600 }}>{it.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
};

// ---------- Quick capture (mic + plus) ----------
const V3QuickCapture = () => {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState("voice");
  return (
    <>
      <button onClick={() => setOpen(true)} title="Quick capture" style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 10px", borderRadius: 8,
        background: "rgba(232,118,58,0.15)",
        border: "1px solid rgba(232,118,58,0.35)",
        color: "#FFE4D2", flexShrink: 0,
      }}>
        <I.Mic size={13}/>
        <I.Plus size={11}/>
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: "fixed", inset: 0, background: "rgba(11,21,48,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "min(560px, 100%)", background: "var(--v3-surface)",
            borderRadius: 14, overflow: "hidden",
            boxShadow: "0 30px 80px rgba(11,21,48,0.30)",
          }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)" }}>Quick capture</div>
                <div style={{ fontSize: 12.5, color: "var(--v3-ink-lo)", marginTop: 2 }}>Routes to vault · auto-tagged + indexed</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ color: "var(--v3-ink-lo)" }}><I.X size={16}/></button>
            </div>
            <div style={{ display: "flex", gap: 4, padding: "10px 22px 0", borderBottom: "1px solid var(--v3-line-soft)" }}>
              {[
                { id: "voice", label: "Voice", icon: I.Mic },
                { id: "text",  label: "Text",  icon: I.Doc },
                { id: "photo", label: "Photo", icon: I.Tag },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "10px 14px",
                  fontSize: 13, fontWeight: 500,
                  color: tab === t.id ? "var(--v3-blue)" : "var(--v3-ink-md)",
                  borderBottom: tab === t.id ? "2px solid var(--v3-blue)" : "2px solid transparent",
                  marginBottom: -1,
                }}>
                  <t.icon size={12}/> {t.label}
                </button>
              ))}
            </div>
            <div style={{ padding: 22, minHeight: 200 }}>
              {tab === "voice" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "30px 0" }}>
                  <button style={{
                    width: 72, height: 72, borderRadius: 999,
                    background: "linear-gradient(135deg, #E8763A, #C75928)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 6px 22px rgba(232,118,58,0.45)",
                  }}>
                    <I.Mic size={26} style={{ color: "#FFF" }}/>
                  </button>
                  <div style={{ fontSize: 13.5, color: "var(--v3-ink)", fontWeight: 500 }}>Hold to record · tap to start</div>
                  <div style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>Whisper transcription · &lt; 2s</div>
                </div>
              )}
              {tab === "text" && (
                <textarea placeholder="Capture a thought, decision, or signal…" rows={6} style={{
                  width: "100%", resize: "vertical",
                  background: "var(--v3-bg-soft)", border: "1px solid var(--v3-line-soft)",
                  borderRadius: 9, padding: "12px 14px",
                  fontSize: 14, fontFamily: "inherit", color: "var(--v3-ink)", outline: "none",
                }}/>
              )}
              {tab === "photo" && (
                <div style={{
                  border: "2px dashed var(--v3-line-strong)", borderRadius: 10,
                  padding: "40px 20px", textAlign: "center",
                  color: "var(--v3-ink-lo)", fontSize: 13.5,
                }}>
                  Drop a photo, screenshot, or whiteboard pic
                  <div style={{ fontSize: 12, marginTop: 6, color: "var(--v3-ink-lo)" }}>OCR + entity extraction runs automatically</div>
                </div>
              )}
            </div>
            <div style={{ padding: "14px 22px", borderTop: "1px solid var(--v3-line-soft)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setOpen(false)} style={{
                padding: "8px 14px", borderRadius: 7, border: "1px solid var(--v3-line-strong)",
                background: "var(--v3-surface)", color: "var(--v3-ink)", fontSize: 13, fontWeight: 500,
              }}>Cancel</button>
              <button style={{
                padding: "8px 14px", borderRadius: 7, background: "var(--v3-orange)",
                color: "#FFF", fontSize: 13, fontWeight: 600,
              }}>Capture</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ---------- Top crumb bar (dark navy) ----------
const V3Topbar = ({ active }) => {
  const [q, setQ] = React.useState("");
  return (
    <div style={{
      height: 68, padding: "0 22px", flexShrink: 0,
      display: "grid", gridTemplateColumns: "minmax(140px, max-content) minmax(220px, 420px) minmax(0, 1fr)", alignItems: "center", gap: 14,
      background: "var(--v3-topbar)", color: "var(--v3-topbar-text)",
    }}>
      {/* Left — wordmark */}
      <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span className="display" style={{
            fontSize: 15, fontWeight: 700, color: "#FFFFFF",
            letterSpacing: 2, textTransform: "uppercase",
          }}>Atrium</span>
          <span style={{ fontSize: 11.5, color: "var(--v3-topbar-text-lo)", marginTop: 3 }}>
            Unicron Systems
          </span>
        </div>
      </div>

      {/* Center — intelligent search */}
      <form onSubmit={e => e.preventDefault()} style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "rgba(0,0,0,0.22)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 10, padding: "10px 14px",
      }}>
        <I.Bolt size={14} style={{ color: "#C9B27A", flexShrink: 0 }}/>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Ask anything"
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: "#FFFFFF", fontSize: 13.5, fontFamily: "inherit",
          }}
        />
        <span className="mono" style={{ fontSize: 11, color: "var(--v3-topbar-text-lo)", opacity: 0.7 }}>⌘ K</span>
      </form>

      {/* Right — pulse strip + quick capture */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end", minWidth: 0 }}>
        <V3StatusPulse/>
        <V3QuickCapture/>
      </div>
    </div>
  );
};

// ---------- Page title row (light background) ----------
// Wrapper for the rounded light surface that sits on top of the navy topbar.
// Every screen's body lives inside this so the top-left corner stays consistent.
const V3PageBody = ({ children }) => (
  <div style={{
    flex: 1, display: "flex", flexDirection: "column", minHeight: 0,
    background: "var(--v3-bg)", borderTopLeftRadius: 15, overflow: "hidden",
  }}>{children}</div>
);

const V3PageTitle = ({ title, eyebrow }) => (
  <div style={{ padding: "26px 28px 18px", background: "var(--v3-bg)" }}>
    {eyebrow && <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginBottom: 6 }}>{eyebrow}</div>}
    <h1 className="display" style={{
      fontSize: 36, fontWeight: 600, color: "var(--v3-ink)", margin: 0,
      lineHeight: 1, letterSpacing: -0.7,
    }}>{title}</h1>
  </div>
);

// ---------- Tab strip (icon + label, blue underline) ----------
const V3Tabs = ({ tabs, active, setActive }) => (
  <div style={{
    display: "flex", gap: 6, padding: "0 28px",
    borderBottom: "1px solid var(--v3-line)", background: "var(--v3-bg)",
  }}>
    {tabs.map(t => {
      const isActive = active === t.id;
      return (
        <button key={t.id} onClick={() => setActive(t.id)} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "13px 14px", marginBottom: -1,
          fontSize: 14, fontWeight: 500,
          color: isActive ? "var(--v3-blue)" : "var(--v3-ink-md)",
          borderBottom: `2px solid ${isActive ? "var(--v3-blue)" : "transparent"}`,
        }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "var(--v3-ink)"; }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "var(--v3-ink-md)"; }}
        >
          {t.icon && <t.icon size={14}/>}
          {t.label}
        </button>
      );
    })}
  </div>
);

// ---------- Filter sidebar ----------
// Reusable check-row used inside collapsed groups
const V3FilterCheck = ({ label, count, dot, defaultChecked }) => {
  const [on, setOn] = React.useState(!!defaultChecked);
  return (
    <button onClick={() => setOn(!on)} style={{
      display: "flex", alignItems: "center", gap: 8, width: "100%",
      padding: "6px 4px", fontSize: 13, color: "var(--v3-ink)",
    }}>
      <span style={{
        width: 14, height: 14, borderRadius: 4,
        border: "1px solid " + (on ? "var(--v3-blue)" : "var(--v3-line-strong)"),
        background: on ? "var(--v3-blue)" : "var(--v3-surface)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {on && <I.Check size={9} style={{ color: "#FFF" }}/>}
      </span>
      {dot && <span style={{ width: 7, height: 7, borderRadius: 999, background: dot, flexShrink: 0 }}/>}
      <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {count !== undefined && (
        <span className="mono" style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>{count}</span>
      )}
    </button>
  );
};

const V3FilterGroup = ({ label, children, defaultOpen = false, count }) => {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <div style={{ borderTop: "1px solid var(--v3-line-soft)", padding: "10px 0" }}>
      <button onClick={() => setOpen(!open)} style={{
        display: "flex", alignItems: "center", gap: 6, width: "100%",
        fontSize: 13.5, fontWeight: 600, color: "var(--v3-ink)",
      }}>
        {open
          ? <I.ChevronD size={12} style={{ color: "var(--v3-ink-lo)" }}/>
          : <I.ChevronR size={12} style={{ color: "var(--v3-ink-lo)" }}/>}
        <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
        {count !== undefined && count > 0 && (
          <span style={{
            fontSize: 10.5, fontWeight: 600, color: "var(--v3-blue)",
            background: "rgba(46,108,212,0.10)", padding: "2px 6px", borderRadius: 999,
          }}>{count}</span>
        )}
      </button>
      {open && <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>{children}</div>}
    </div>
  );
};

// Preset filter groups per screen
const V3_FILTER_PRESETS = {
  now: [
    { label: "DRI", defaultOpen: false, badge: 1, items: [
      { label: "Kyle B.", count: 12, checked: true },
      { label: "Maya R.", count: 8 },
      { label: "Sam O.", count: 6 },
      { label: "Devon P.", count: 4 },
      { label: "Unassigned", count: 3 },
    ]},
    { label: "Board", items: [
      { label: "Customer", count: 14 },
      { label: "Team", count: 9 },
      { label: "Network", count: 5 },
      { label: "Hiring", count: 3 },
    ]},
    // Canonical taxonomy per nervous_system.action_items.priority enum:
    // irreversible / high / medium / low. Production is source of truth;
    // design follows production (was P0–P3, corrected 2026-05-11).
    { label: "Priority", defaultOpen: true, badge: 2, items: [
      { label: "Irreversible", dot: "#D14848", count: 2, checked: true },
      { label: "High",         dot: "#D97757", count: 7, checked: true },
      { label: "Medium",       dot: "#C9A227", count: 11 },
      { label: "Low",          dot: "#7C87A0", count: 6 },
    ]},
    { label: "Status", items: [
      { label: "Open", count: 18 },
      { label: "In progress", count: 9 },
      { label: "Waiting", count: 4 },
      { label: "Done", count: 32 },
      { label: "Snoozed", count: 2 },
    ]},
    { label: "Source", items: [
      { label: "Email", count: 22 }, { label: "Slack", count: 11 },
      { label: "Linear", count: 7 }, { label: "Manual", count: 3 },
    ]},
    { label: "Age", items: [
      { label: "Today" }, { label: "This week" },
      { label: "Older than 7d" }, { label: "Older than 30d" },
    ]},
  ],
  work: [
    { label: "Owner", defaultOpen: true, items: [
      { label: "Kyle B.", count: 14, checked: true }, { label: "Maya R.", count: 9 },
      { label: "Sam O.", count: 6 }, { label: "Unassigned", count: 4 },
    ]},
    { label: "Board", items: [
      { label: "Customer", count: 18 }, { label: "Team", count: 12 },
      { label: "Network", count: 7 }, { label: "Hiring", count: 4 },
    ]},
    // Canonical taxonomy per nervous_system.action_items.priority enum.
    { label: "Priority", items: [
      { label: "Irreversible", dot: "#D14848", count: 3 },
      { label: "High",         dot: "#D97757", count: 9 },
      { label: "Medium",       dot: "#C9A227", count: 14 },
      { label: "Low",          dot: "#7C87A0", count: 8 },
    ]},
    { label: "Stage", items: [
      { label: "Backlog", count: 21 }, { label: "Active", count: 14 },
      { label: "In review", count: 6 }, { label: "Blocked", count: 3 }, { label: "Done", count: 47 },
    ]},
    { label: "Tags", items: [
      { label: "growth" }, { label: "infra" }, { label: "billing" }, { label: "design" },
    ]},
  ],
  people: [
    { label: "Board", defaultOpen: true, items: [
      { label: "Customers", count: 142, checked: true },
      { label: "Team", count: 38 }, { label: "Network", count: 624 }, { label: "Hiring", count: 27 },
    ]},
    { label: "Stage", items: [
      { label: "Active", count: 88 }, { label: "Onboarding", count: 14 },
      { label: "Trial", count: 22 }, { label: "Churned", count: 18 },
    ]},
    { label: "Owner", items: [
      { label: "Kyle B.", count: 46 }, { label: "Maya R.", count: 32 },
      { label: "Sam O.", count: 24 }, { label: "Unassigned", count: 40 },
    ]},
    { label: "Last contact", items: [
      { label: "This week" }, { label: "Last 30 days" }, { label: "60+ days" }, { label: "Never" },
    ]},
    { label: "Tags", items: [
      { label: "champion" }, { label: "decision-maker" }, { label: "advisor" }, { label: "investor" },
    ]},
    { label: "Location", items: [
      { label: "United States", count: 412 }, { label: "Europe", count: 188 },
      { label: "APAC", count: 64 }, { label: "Other", count: 23 },
    ]},
  ],
  pipeline: [
    { label: "Stage", defaultOpen: true, items: [
      { label: "Lead", count: 22 }, { label: "Qualified", count: 14, checked: true },
      { label: "Proposal", count: 8 }, { label: "Negotiation", count: 4 }, { label: "Closed-won", count: 12 },
    ]},
    { label: "Owner", items: [
      { label: "Kyle B.", count: 18 }, { label: "Maya R.", count: 11 },
    ]},
    { label: "Amount", items: [
      { label: "< $10k" }, { label: "$10k–$50k" }, { label: "$50k–$250k" }, { label: "$250k+" },
    ]},
    { label: "Close date", items: [
      { label: "This month" }, { label: "This quarter" }, { label: "Next quarter" },
    ]},
    { label: "Source", items: [
      { label: "Inbound" }, { label: "Outbound" }, { label: "Referral" }, { label: "Event" },
    ]},
  ],
};

const V3Filters = ({ groups, showTimeframe = true, extra }) => {
  const [open, setOpen] = React.useState(true);

  if (!groups) return null;

  if (!open) {
    return (
      <aside style={{
        width: 36, flexShrink: 0,
        borderRight: "1px solid var(--v3-line)", background: "var(--v3-bg)",
        display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0",
      }}>
        <button onClick={() => setOpen(true)} title="Show filters" style={{
          width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--v3-ink-md)", borderRadius: 6,
        }}>
          <I.Filter size={14}/>
        </button>
      </aside>
    );
  }

  return (
    <aside style={{
      width: 244, padding: "20px 18px", flexShrink: 0,
      borderRight: "1px solid var(--v3-line)", background: "var(--v3-bg)",
      overflowY: "auto",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600 }}>
          Filters
        </span>
        <button onClick={() => setOpen(false)} title="Collapse filters" style={{
          width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--v3-ink-lo)", borderRadius: 5,
        }}>
          <I.ChevronL size={12}/>
        </button>
      </div>

      {showTimeframe && (
        <div style={{ marginBottom: 8 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 13.5, fontWeight: 600, color: "var(--v3-ink)", marginBottom: 10,
          }}>
            <I.ChevronD size={12} style={{ color: "var(--v3-ink-lo)" }}/>
            Timeframe
          </div>
          <div style={{
            background: "var(--v3-surface)", border: "1px solid var(--v3-line)",
            borderRadius: 8, overflow: "hidden",
          }}>
            <div style={{
              padding: "10px 12px", display: "flex", alignItems: "center", gap: 8,
              fontSize: 13, color: "var(--v3-ink)",
            }}>
              <I.Now size={13} style={{ color: "var(--v3-ink-lo)" }}/>
              Last 1 Day
              <I.ChevronD size={11} style={{ marginLeft: "auto", color: "var(--v3-ink-lo)" }}/>
            </div>
            <div style={{
              padding: "10px 12px", borderTop: "1px solid var(--v3-line-soft)",
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 12, color: "var(--v3-ink-md)",
            }}>
              <I.Calendar size={12} style={{ color: "var(--v3-ink-lo)" }}/>
              May 6, 17:00 — May 7, 16:56
            </div>
          </div>
        </div>
      )}

      {groups.map((g, i) => (
        <V3FilterGroup key={i} label={g.label} defaultOpen={g.defaultOpen} count={g.badge}>
          {g.items.map((it, j) => (
            <V3FilterCheck key={j} label={it.label} count={it.count} dot={it.dot} defaultChecked={it.checked}/>
          ))}
        </V3FilterGroup>
      ))}

      {extra && <div style={{ marginTop: 14 }}>{extra}</div>}

      <button style={{
        marginTop: 16, fontSize: 12, color: "var(--v3-ink-md)",
        padding: "6px 0",
      }}>Reset filters</button>
    </aside>
  );
};

// ---------- Stat card (Stellate hero number) ----------
const V3StatCard = ({ label, value, suffix, delta, deltaTone, sparkline, sparkColor, fill, sub, large = true, accent }) => (
  <div style={{
    padding: "20px 22px", background: "var(--v3-surface)",
    borderRadius: 12,
    boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
  }}>
    <div style={{ fontSize: 13, color: "var(--v3-ink-md)", marginBottom: 12 }}>{label}</div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span className="display" style={{
        fontSize: large ? 44 : 30, fontWeight: 600, lineHeight: 1,
        color: "var(--v3-ink)", letterSpacing: -1,
      }}>{value}</span>
      {suffix && <span style={{ fontSize: 16, color: "var(--v3-ink-md)" }}>{suffix}</span>}
    </div>
    {delta !== undefined && (
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{
          color: deltaTone === "ok" ? "var(--v3-green)" : deltaTone === "err" ? "var(--v3-red)" : "var(--v3-ink-lo)",
          fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 2,
        }}>
          {deltaTone === "ok" ? "↑" : deltaTone === "err" ? "↓" : "→"} {delta}
        </span>
        {sub && <span style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginLeft: 4 }}>{sub}</span>}
      </div>
    )}
    {!delta && sub && <div style={{ marginTop: 10, fontSize: 12, color: "var(--v3-ink-lo)" }}>{sub}</div>}
    {sparkline && (
      <div style={{ marginTop: 14, opacity: 0.85 }}>
        <V3Spark data={sparkline} color={sparkColor || "var(--v3-blue)"} fill={fill}/>
      </div>
    )}
  </div>
);

// ---------- Sparkline ----------
const V3Spark = ({ data, w = 200, h = 36, color = "var(--v3-blue)", fill = false }) => {
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 4) - 2]);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const fillD = `${d} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      {fill && <path d={fillD} fill={color} opacity="0.10"/>}
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </svg>
  );
};

// ---------- Status pill (Stellate-style pale boxes) ----------
const V3StatusPill = ({ tone = "neutral", children }) => {
  const map = {
    ok:    { bg: "var(--v3-green-soft)",  fg: "var(--v3-green)" },
    warn:  { bg: "var(--v3-amber-soft)",  fg: "var(--v3-amber)" },
    err:   { bg: "var(--v3-red-soft)",    fg: "var(--v3-red)" },
    info:  { bg: "var(--v3-blue-soft)",   fg: "var(--v3-blue)" },
    pass:  { bg: "var(--v3-orange-soft)", fg: "var(--v3-orange)" },
    neutral: { bg: "var(--v3-bg-soft)",   fg: "var(--v3-ink-md)" },
  };
  const t = map[tone] || map.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "3px 9px",
      background: t.bg, color: t.fg, borderRadius: 5,
      fontSize: 12, fontWeight: 600, letterSpacing: 0.2,
    }}>{children}</span>
  );
};

// ---------- Distribution rows (Owner Distribution style) ----------
const V3DistRow = ({ percent, label, color = "var(--v3-blue)" }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
      <span style={{ color: "var(--v3-ink)", fontWeight: 600 }}>{percent}%</span>
      <span style={{ color: "var(--v3-ink-md)" }}>{label}</span>
    </div>
    <div style={{ height: 8, background: "var(--v3-line-soft)", borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: `${percent}%`, height: "100%", background: color, borderRadius: 999 }}/>
    </div>
  </div>
);

// ---------- Activity table row ----------
const V3Table = ({ columns, rows, onRowClick, selectedId }) => (
  <div style={{ background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden" }}>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ background: "var(--v3-bg)" }}>
          {columns.map(c => (
            <th key={c.key} style={{
              textAlign: c.align || "left", padding: "12px 18px",
              fontSize: 13, color: "var(--v3-ink-md)", fontWeight: 500,
              borderBottom: "1px solid var(--v3-line)",
              display: c.flex ? "table-cell" : undefined,
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {c.label}
                {c.sortable && <I.ChevronD size={11} style={{ color: "var(--v3-ink-faint)" }}/>}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id || i} onClick={() => onRowClick?.(row)} style={{
            cursor: onRowClick ? "pointer" : "default",
            background: selectedId === row.id ? "var(--v3-blue-soft)" : "transparent",
          }}
            onMouseEnter={e => { if (selectedId !== row.id) e.currentTarget.style.background = "var(--v3-bg)"; }}
            onMouseLeave={e => { if (selectedId !== row.id) e.currentTarget.style.background = "transparent"; }}
          >
            {columns.map((c, ci) => (
              <td key={c.key} style={{
                padding: "16px 18px", fontSize: 14,
                color: "var(--v3-ink)",
                textAlign: c.align || "left",
                borderBottom: i < rows.length - 1 ? "1px solid var(--v3-line-soft)" : "none",
              }}>
                {c.render ? c.render(row) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ---------- NOW SCREEN ----------
const V3NowScreen = () => {
  const [tab, setTab] = React.useState("skills");
  const tabs = [
    { id: "skills",   label: "Run a skill", icon: I.Bolt },
    { id: "today",    label: "Today",       icon: I.Now },
    { id: "activity", label: "Activity",    icon: I.Pulse },
    { id: "digest",   label: "Digest",      icon: I.Inbox },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--v3-rail)" }}>
      <V3Topbar active="now"/>
      <V3PageBody>
      <V3PageTitle eyebrow="Wed · May 7" title="Good morning, Kyle."/>
      <V3Tabs tabs={tabs} active={tab} setActive={setTab}/>
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {tab === "today" && <V3Filters groups={V3_FILTER_PRESETS.now}/>}
        <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 24 }}>
          {tab === "skills" && (<>
            <V3SkillsSurface/>
            <V3ActivityFeed/>
          </>)}
          {tab === "activity" && <V3NowActivity/>}
          {tab === "digest"   && <V3NowDigest/>}
          {tab === "today" && (<>
          {/* Hero stats (3 across, large) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <V3StatCard
              label="Action items" value="7"
              delta="+2 today" deltaTone="ok" sub="vs yesterday"
              sparkline={[14,16,12,18,14,20,16,18,22,24,20,28,26,32,30]}
              sparkColor="var(--v3-blue)"
              fill
            />
            <V3StatCard
              label="Renewal exposure" value="48" suffix="k · 7d"
              delta="+18%" deltaTone="ok" sub="3 contracts"
              sparkline={[20,22,18,24,28,26,32,38,42,40,48]}
              sparkColor="var(--v3-purple)"
              fill
            />
            <V3StatCard
              label="Refusals (24h)" value="2"
              delta="+1" deltaTone="err" sub="1 needs review"
              sparkline={[0,1,0,2,1,0,3,1,2,0,1,2]}
              sparkColor="var(--v3-red)"
              fill
            />
          </div>

          {/* Volume + Floor-style two-up */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <V3LineCard
              title="Volume and Price"
              series={[
                { color: "var(--v3-blue)",   data: [0.4,0.3,0.5,0.7,1.6,1.6,1.4,0.4], label: "Avg price" },
                { color: "var(--v3-bg-soft)",fill: true, bars: [18,20,18,40,100,108,82,40], label: "Volume" },
              ]}
              yLabels={["120","80","40","0"]}
              xLabels={["Apr 30","May 2","May 4","May 6"]}
              rightYLabels={["1.2","0.9","0.6","0.3"]}
            />
            <V3LineCard
              title="Capture rate"
              series={[
                { color: "var(--v3-purple)", data: [0.35,0.42,0.40,0.48,0.62,0.58,0.71,0.66,0.72], label: "Capture" },
              ]}
              yLabels={["100%","75%","50%","25%"]}
              xLabels={["Apr 29","May 1","May 3","May 5","May 7"]}
            />
          </div>

          {/* Top of mind & Today */}
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
            <V3PanelCard title="Top of mind" subtitle="What needs you today">
              <div style={{ display: "flex", flexDirection: "column" }}>
                {[
                  { tag: "Decision", tone: "warn", title: "Approve Pathfinder pricing v3 before Friday's investor call", sub: "Curtis raised concern on tier 2 margins" },
                  { tag: "Refusal",  tone: "err",  title: "Agent attempted to share customer list externally", sub: "Matched taboo: customer-data-egress" },
                  { tag: "Renewal",  tone: "info", title: "Northwind contract renews in 14 days", sub: "Maya last contacted 4 days ago" },
                  { tag: "Decay",    tone: "neutral", title: "3 vault docs untouched in 90+ days", sub: "Pricing FAQ · ICP v1 · Onboarding" },
                ].map((it, i, arr) => (
                  <div key={i} style={{
                    display: "flex", gap: 18, padding: "14px 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)",
                  }}>
                    <div style={{ minWidth: 76 }}>
                      <V3StatusPill tone={it.tone}>{it.tag}</V3StatusPill>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: "var(--v3-ink)", lineHeight: 1.45 }}>{it.title}</div>
                      <div style={{ fontSize: 13, color: "var(--v3-ink-lo)", marginTop: 3 }}>{it.sub}</div>
                    </div>
                    <I.ArrowR size={14} style={{ color: "var(--v3-ink-lo)", marginTop: 4 }}/>
                  </div>
                ))}
              </div>
            </V3PanelCard>

            <V3PanelCard title="Today" subtitle="Next three events">
              <div style={{ display: "flex", flexDirection: "column" }}>
                {[
                  { time: "10:30", title: "Northwind expansion",   who: "Maya Iyer",                 dur: "30m" },
                  { time: "13:00", title: "Weekly sync",           who: "Kyle, Keenan, Curtis",      dur: "60m" },
                  { time: "16:00", title: "Helix design feedback", who: "Curtis solo",               dur: "20m" },
                ].map((e, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 16, padding: "14px 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)",
                  }}>
                    <span className="mono display" style={{ fontSize: 18, color: "var(--v3-ink)", minWidth: 56, fontWeight: 500 }}>{e.time}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: "var(--v3-ink)" }}>{e.title}</div>
                      <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 2 }}>{e.who} · {e.dur}</div>
                    </div>
                  </div>
                ))}
              </div>
            </V3PanelCard>
          </div>

          {/* Activity feed table */}
          <V3PanelCard title="Recent activity" subtitle="Last 50 events" padding={0}>
            <V3Table
              columns={[
                { key: "ts",    label: "Timestamp", sortable: true, render: r => <span style={{ color: "var(--v3-ink-md)" }}>{r.ts}</span> },
                { key: "kind",  label: "Kind",      render: r => <span style={{ color: "var(--v3-ink-md)" }}>{r.kind}</span> },
                { key: "title", label: "Event",     render: r => <span style={{ color: "var(--v3-ink)" }}>{r.title}</span> },
                { key: "actor", label: "Actor",     render: r => (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={r.actor} size={20}/>
                      <span style={{ color: "var(--v3-ink-md)", fontSize: 13 }}>{r.actor}</span>
                    </div>
                  )},
                { key: "status", label: "Status", render: r => <V3StatusPill tone={r.tone}>{r.status}</V3StatusPill> },
                { key: "lat",   label: "Latency",  align: "right", render: r => <span style={{ color: "var(--v3-ink-md)", fontSize: 13 }}>{r.lat}</span> },
              ]}
              rows={[
                { id: "a1", ts: "May 7 16:54", kind: "agent",   title: "Daily digest skill completed", actor: "Metacron",  status: "PASS", tone: "ok",   lat: "412ms" },
                { id: "a2", ts: "May 7 16:42", kind: "capture", title: "Voice memo · Northwind notes", actor: "Kyle B",    status: "200",  tone: "ok",   lat: "1.2s" },
                { id: "a3", ts: "May 7 16:30", kind: "refusal", title: "Block: customer-data-egress", actor: "Pathfinder",status: "403",  tone: "err",  lat: "35ms" },
                { id: "a4", ts: "May 7 15:58", kind: "ledger",  title: "Decision logged: Helix terms", actor: "Curtis L",  status: "200",  tone: "ok",   lat: "—" },
                { id: "a5", ts: "May 7 15:21", kind: "vault",   title: "Pricing FAQ marked stale",      actor: "auto",      status: "WARN", tone: "warn", lat: "—" },
                { id: "a6", ts: "May 7 14:48", kind: "agent",   title: "Customer health sweep",         actor: "Metacron",  status: "PASS", tone: "ok",   lat: "8.4s" },
                { id: "a7", ts: "May 7 14:30", kind: "calls",   title: "Helix design review · 28m",    actor: "Curtis L",  status: "PASS", tone: "ok",   lat: "—" },
              ]}
            />
          </V3PanelCard>
          </>)}
        </div>
      </div>
      </V3PageBody>
    </div>
  );
};

// Card with a thin header — Stellate's Operations card style
const V3PanelCard = ({ title, subtitle, action, children, padding = 22 }) => (
  <section style={{
    background: "var(--v3-surface)",
    borderRadius: 12, overflow: "hidden",
    boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
  }}>
    {(title || action) && (
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 22px",
        borderBottom: "1px solid var(--v3-line-soft)",
      }}>
        <div>
          {title && <div style={{ fontSize: 15, fontWeight: 600, color: "var(--v3-ink)" }}>{title}</div>}
          {subtitle && <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </header>
    )}
    <div style={{ padding }}>{children}</div>
  </section>
);

// Volume + price chart (combo bars + line)
const V3LineCard = ({ title, series, yLabels, xLabels, rightYLabels }) => {
  const W = 560, H = 200, padL = 36, padR = rightYLabels ? 36 : 16, padT = 16, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const barSeries = series.find(s => s.bars);
  const lineSeries = series.filter(s => s.data);
  return (
    <V3PanelCard title={title} padding={20}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* Y-axis grid + labels (left) */}
        {yLabels.map((l, i) => {
          const y = padT + (i / (yLabels.length - 1)) * innerH;
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--v3-line-soft)" strokeWidth="1"/>
              <text x={padL - 8} y={y + 3} fill="var(--v3-ink-lo)" fontSize="10" textAnchor="end">{l}</text>
            </g>
          );
        })}
        {/* Right y-axis labels */}
        {rightYLabels && rightYLabels.map((l, i) => {
          const y = padT + (i / (rightYLabels.length - 1)) * innerH;
          return <text key={i} x={W - padR + 6} y={y + 3} fill="var(--v3-ink-lo)" fontSize="10">{l}</text>;
        })}
        {/* Bars */}
        {barSeries && barSeries.bars.map((v, i) => {
          const max = Math.max(...barSeries.bars);
          const bw = innerW / barSeries.bars.length;
          const bh = (v / max) * innerH * 0.75;
          const x = padL + i * bw + bw * 0.2;
          const w = bw * 0.6;
          return <rect key={i} x={x} y={padT + innerH - bh} width={w} height={bh} fill="#E2E5EB" rx="2"/>;
        })}
        {/* Lines */}
        {lineSeries.map((s, si) => {
          const max = Math.max(...s.data), min = Math.min(...s.data);
          const range = max - min || 1;
          const step = innerW / (s.data.length - 1);
          const pts = s.data.map((v, i) => [
            padL + i * step,
            padT + innerH - ((v - min) / range) * innerH * 0.85 - 10,
          ]);
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
          return (
            <g key={si}>
              <path d={d} stroke={s.color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              {pts.map((p, i) => i === pts.length - 1 ? <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={s.color}/> : null)}
            </g>
          );
        })}
        {/* X labels */}
        {xLabels.map((l, i) => {
          const x = padL + (i / (xLabels.length - 1)) * innerW;
          return <text key={i} x={x} y={H - 8} fill="var(--v3-ink-lo)" fontSize="10" textAnchor="middle">{l}</text>;
        })}
      </svg>
    </V3PanelCard>
  );
};

// ---------- WORK SCREEN ----------
const V3_WORK_ITEMS = [
  { id: "WK-241", title: "Reply to Zenith Labs proposal",       dri: "Kyle B",   priority: "high", due: "Tomorrow", source: "email",    status: "todo",    board: "Sales",     age: "2d" },
  { id: "WK-240", title: "Send Q2 forecast to board",           dri: "Curtis L", priority: "high", due: "Overdue",  source: "calendar", status: "doing",   board: "Money",     age: "5d" },
  { id: "WK-239", title: "Review Maya's expansion proposal",    dri: "Kyle B",   priority: "med",  due: "Fri",      source: "slack",    status: "todo",    board: "Customers", age: "1d" },
  { id: "WK-238", title: "Rotate Metacron agent API keys",      dri: "Keenan O", priority: "high", due: "Tonight",  source: "agent",    status: "doing",   board: "System",    age: "4h" },
  { id: "WK-237", title: "Draft launch post for Pathfinder v3", dri: "Curtis L", priority: "med",  due: "Mon",      source: "vault",    status: "todo",    board: "Marketing", age: "3d" },
  { id: "WK-234", title: "Confirm Helix renewal terms",         dri: "Kyle B",   priority: "high", due: "Wed",      source: "calls",    status: "blocked", board: "Customers", age: "2d" },
  { id: "WK-233", title: "Triage refusal queue",                dri: "Keenan O", priority: "med",  due: "Today",    source: "system",   status: "doing",   board: "System",    age: "3h" },
];

const V3WorkScreen = () => {
  const [tab, setTab] = React.useState("items");
  const [open, setOpen] = React.useState(null);
  const tabs = [
    { id: "items",     label: "Items",     icon: I.Inbox },
    { id: "kanban",    label: "Kanban",    icon: I.Layers },
    { id: "calls",     label: "Calls",     icon: I.Phone },
    { id: "decisions", label: "Decisions", icon: I.Flag },
    { id: "refusals",  label: "Refusals",  icon: I.Shield },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--v3-rail)", position: "relative" }}>
      <V3Topbar active="work"/>
      <V3PageBody>
      <V3PageTitle title="Work"/>
      <V3Tabs tabs={tabs} active={tab} setActive={setTab}/>
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {tab === "items" && <V3Filters groups={V3_FILTER_PRESETS.work}/>}
        <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 24 }}>
          {tab === "kanban"    && <V3WorkKanban/>}
          {tab === "calls"     && <V3WorkCalls/>}
          {tab === "decisions" && <V3WorkDecisions/>}
          {tab === "refusals"  && <V3WorkRefusals/>}
          {tab === "items" && (<>
          {/* 4-up stat row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <V3StatCard label="Open items" value="7"
              sparkline={[2,3,4,4,5,5,6,7,7]} sparkColor="var(--v3-blue)" fill/>
            <V3StatCard label="Overdue" value="1" delta="+1" deltaTone="err" sub="WK-240 · 5d"/>
            <V3StatCard label="Due today" value="2" sub="Keenan, Kyle"/>
            <V3StatCard label="Avg age" value="2.4" suffix="d"
              sparkline={[3.2,3.0,3.1,2.8,2.9,2.6,2.5,2.4]} sparkColor="var(--v3-green)" fill/>
          </div>

          {/* Operations summary like Stellate (3-up) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <V3PanelCard title="Most used" subtitle="By DRI" padding={20}>
              {[
                { name: "Kyle B",   v: 3, w: 100 },
                { name: "Curtis L", v: 2, w: 66 },
                { name: "Keenan O", v: 2, w: 66 },
              ].map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
                  <Avatar name={d.name} size={22}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: "var(--v3-ink)" }}>{d.name}</span>
                      <span className="mono" style={{ fontSize: 13, color: "var(--v3-blue)", fontWeight: 600 }}>{d.v}</span>
                    </div>
                    <div style={{ height: 5, background: "var(--v3-line-soft)", borderRadius: 999 }}>
                      <div style={{ width: `${d.w}%`, height: "100%", background: "var(--v3-blue-soft)", borderRadius: 999, position: "relative" }}>
                        <div style={{ position: "absolute", inset: 0, width: `${d.w * 0.6}%`, background: "var(--v3-blue)", borderRadius: 999 }}/>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </V3PanelCard>

            <V3PanelCard title="Highest priority" subtitle="By age" padding={20}>
              {[
                { id: "WK-240", v: "5d",  w: 100, tone: "err" },
                { id: "WK-241", v: "2d",  w: 40,  tone: "warn" },
                { id: "WK-234", v: "2d",  w: 40,  tone: "warn" },
                { id: "WK-237", v: "3d",  w: 60,  tone: "warn" },
              ].map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
                  <span className="mono" style={{ fontSize: 13, color: "var(--v3-ink-md)", minWidth: 64 }}>{d.id}</span>
                  <div style={{ flex: 1, height: 5, background: "var(--v3-line-soft)", borderRadius: 999 }}>
                    <div style={{ width: `${d.w}%`, height: "100%",
                      background: d.tone === "err" ? "var(--v3-red-soft)" : "var(--v3-amber-soft)",
                      borderRadius: 999, position: "relative",
                    }}>
                      <div style={{ position: "absolute", inset: 0, width: `${d.w * 0.6}%`,
                        background: d.tone === "err" ? "var(--v3-red)" : "var(--v3-amber)",
                        borderRadius: 999,
                      }}/>
                    </div>
                  </div>
                  <span className="mono" style={{ fontSize: 13, color: d.tone === "err" ? "var(--v3-red)" : "var(--v3-amber)", fontWeight: 600, minWidth: 24, textAlign: "right" }}>{d.v}</span>
                </div>
              ))}
            </V3PanelCard>

            <V3PanelCard title="By board" subtitle="Distribution" padding={20}>
              <V3DistRow percent={29} label="Sales · 2 items"     color="var(--v3-blue)"/>
              <V3DistRow percent={29} label="System · 2 items"    color="var(--v3-purple)"/>
              <V3DistRow percent={14} label="Money · 1 item"      color="var(--v3-orange)"/>
              <V3DistRow percent={14} label="Customers · 1 item"  color="var(--v3-green)"/>
              <V3DistRow percent={14} label="Marketing · 1 item"  color="var(--v3-amber)"/>
            </V3PanelCard>
          </div>

          {/* Items table */}
          <V3PanelCard title="Action items" subtitle="7 items" padding={0}>
            <V3Table
              selectedId={open?.id}
              onRowClick={setOpen}
              columns={[
                { key: "id",    label: "ID",       render: r => <span className="mono" style={{ color: "var(--v3-ink-md)", fontSize: 13 }}>{r.id}</span> },
                { key: "title", label: "Title",    render: r => <span style={{ color: "var(--v3-ink)" }}>{r.title}</span> },
                { key: "dri",   label: "DRI",      render: r => (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={r.dri} size={20}/>
                      <span style={{ color: "var(--v3-ink-md)", fontSize: 13 }}>{r.dri}</span>
                    </div>
                  )},
                { key: "board", label: "Board",    render: r => <span style={{ color: "var(--v3-ink-md)", fontSize: 13 }}>{r.board}</span> },
                { key: "priority", label: "Priority", render: r => (
                    <V3StatusPill tone={r.priority === "high" ? "err" : r.priority === "med" ? "warn" : "neutral"}>{r.priority}</V3StatusPill>
                  )},
                { key: "due",   label: "Due",      sortable: true, render: r => (
                    <span style={{ color: r.due === "Overdue" ? "var(--v3-red)" : "var(--v3-ink)", fontSize: 13, fontWeight: r.due === "Overdue" ? 600 : 400 }}>{r.due}</span>
                  )},
                { key: "age",   label: "Age",      align: "right", render: r => <span className="mono" style={{ color: "var(--v3-ink-lo)", fontSize: 13 }}>{r.age}</span> },
              ]}
              rows={V3_WORK_ITEMS}
            />
          </V3PanelCard>
          </>)}
        </div>
      </div>
      </V3PageBody>
      <V3DetailPanel item={open} onClose={() => setOpen(null)}/>
    </div>
  );
};

// ---------- Detail panel (Stellate request-detail style) ----------
const V3DetailPanel = ({ item, onClose }) => {
  if (!item) return null;
  return (
    <div onClick={onClose} style={{
      position: "absolute", inset: 0, background: "rgba(11,21,48,0.32)", zIndex: 30,
      display: "flex", justifyContent: "flex-end",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(720px, 78%)", height: "100%", background: "var(--v3-surface)",
        boxShadow: "-30px 0 80px rgba(11,21,48,0.18)", overflowY: "auto",
        animation: "v3slide 350ms cubic-bezier(0.4,0,0.2,1)",
      }}>
        <style>{`@keyframes v3slide { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
        {/* Header */}
        <div style={{ padding: "20px 28px", borderBottom: "1px solid var(--v3-line)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginBottom: 6 }}>action</div>
            <h2 className="display" style={{ fontSize: 22, fontWeight: 600, color: "var(--v3-ink)", margin: 0, letterSpacing: -0.4 }}>{item.title}</h2>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--v3-ink-lo)", display: "flex", gap: 12 }}>
              <span className="mono">{item.id}</span>
              <span>·</span>
              <span>{item.age} ago</span>
            </div>
          </div>
          <button onClick={onClose} style={{ color: "var(--v3-ink-md)", padding: 4 }}><I.X size={18}/></button>
        </div>

        {/* Stat row (5-up like Stellate request detail) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", borderBottom: "1px solid var(--v3-line)" }}>
          {[
            { k: "DRI",      v: item.dri,      sub: "owner" },
            { k: "Due",      v: item.due,      tone: item.due === "Overdue" ? "var(--v3-red)" : "var(--v3-ink)" },
            { k: "Priority", v: item.priority, tone: item.priority === "high" ? "var(--v3-red)" : item.priority === "med" ? "var(--v3-amber)" : "var(--v3-ink)" },
            { k: "Status",   v: item.status },
            { k: "Source",   v: item.source },
          ].map((c, i) => (
            <div key={i} style={{ padding: "16px 18px", borderRight: i < 4 ? "1px solid var(--v3-line)" : "none" }}>
              <div style={{ fontSize: 12, color: "var(--v3-ink-md)", marginBottom: 8 }}>{c.k}</div>
              <div className="display" style={{ fontSize: 22, fontWeight: 600, color: c.tone || "var(--v3-ink)", letterSpacing: -0.5, lineHeight: 1 }}>
                {c.v}
              </div>
              {c.sub && <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", marginTop: 4 }}>{c.sub}</div>}
            </div>
          ))}
        </div>

        {/* Details section */}
        <div style={{ padding: "24px 28px" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--v3-ink)", margin: "0 0 14px" }}>Details</h3>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", rowGap: 12, fontSize: 13 }}>
            {[
              ["Title",        item.title],
              ["Board",        item.board],
              ["Source",       item.source],
              ["Created",      `${item.age} ago · auto from ${item.source}`],
              ["Last edited",  "1d ago · Curtis L"],
              ["Refusal-gate", "no taboo matches"],
            ].map(([k, v], i) => (
              <React.Fragment key={i}>
                <div style={{ color: "var(--v3-ink-md)" }}>{k}</div>
                <div style={{ color: "var(--v3-ink)" }}>{v}</div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Continuity log */}
        <div style={{ padding: "0 28px 24px" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--v3-ink)", margin: "0 0 14px" }}>Continuity</h3>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              { type: "captured", t: item.age + " ago", who: "auto · " + item.source, sub: "Surfaced as candidate action item" },
              { type: "promoted", t: item.age + " ago", who: "Kyle B",                sub: "Promoted to action, assigned DRI" },
              { type: "edited",   t: "1d ago",          who: "Curtis L",              sub: "Updated due date to " + item.due },
            ].map((e, i, arr) => (
              <div key={i} style={{ display: "flex", gap: 14, paddingBottom: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--v3-blue)", marginTop: 5 }}/>
                  {i < arr.length - 1 && <span style={{ width: 1, flex: 1, background: "var(--v3-line)", marginTop: 4 }}/>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--v3-ink)" }}>
                    <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{e.type}</span>
                    <span style={{ color: "var(--v3-ink-lo)" }}>·</span>
                    <span className="mono" style={{ color: "var(--v3-ink-lo)", fontSize: 12 }}>{e.t}</span>
                    <span style={{ color: "var(--v3-ink-lo)" }}>·</span>
                    <span style={{ color: "var(--v3-ink-md)" }}>{e.who}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--v3-ink-md)", marginTop: 3 }}>{e.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: "20px 28px", borderTop: "1px solid var(--v3-line)", display: "flex", gap: 8, position: "sticky", bottom: 0, background: "var(--v3-surface)" }}>
          <button style={{
            padding: "8px 14px", background: "var(--v3-blue)", color: "#FFF",
            borderRadius: 7, fontSize: 13, fontWeight: 500,
          }}>Mark complete</button>
          <button style={{
            padding: "8px 14px", background: "var(--v3-surface)", color: "var(--v3-ink)",
            border: "1px solid var(--v3-line-strong)", borderRadius: 7, fontSize: 13, fontWeight: 500,
          }}>Reassign</button>
          <button style={{
            padding: "8px 14px", background: "var(--v3-surface)", color: "var(--v3-ink)",
            border: "1px solid var(--v3-line-strong)", borderRadius: 7, fontSize: 13, fontWeight: 500,
          }}>Defer</button>
          <div style={{ flex: 1 }}/>
          <button style={{ padding: "8px 14px", color: "var(--v3-ink-md)", fontSize: 13 }}>View config ↗</button>
        </div>
      </div>
    </div>
  );
};

// ---------- PEOPLE SCREEN ----------
const V3_CUSTOMERS = [
  { id: "Northwind",    contact: "Maya Iyer",      role: "VP Ops",     arr: "$48k",  health: "warm",   lastTouch: "4d ago",  renewal: "May 21", tone: "warn" },
  { id: "Helix Bio",    contact: "Jordan Park",    role: "CTO",        arr: "$36k",  health: "strong", lastTouch: "1d ago",  renewal: "Aug 12", tone: "ok" },
  { id: "Orchard Health", contact: "Lina Roth",    role: "Director",   arr: "$24k",  health: "at-risk",lastTouch: "11d ago", renewal: "Jun 03", tone: "err" },
  { id: "Zenith Labs",  contact: "Dev Patel",      role: "Founder",    arr: "$18k",  health: "warm",   lastTouch: "2d ago",  renewal: "Jul 30", tone: "warn" },
  { id: "Pathfinder Co",contact: "Sam Okafor",     role: "Head of Eng",arr: "$42k",  health: "strong", lastTouch: "3d ago",  renewal: "Oct 18", tone: "ok" },
];
const V3_TEAM = [
  { name: "Kyle B",   role: "CEO",        focus: "Sales · Money",       capacity: 90, items: 3, calls: 5 },
  { name: "Curtis L", role: "Design",     focus: "Marketing · Products",capacity: 70, items: 2, calls: 2 },
  { name: "Keenan O", role: "Eng / Ops",  focus: "System · Products",   capacity: 80, items: 2, calls: 1 },
];
const V3_NETWORK = [
  { name: "Priya Shah",   org: "Threshold VC",   tier: "investor",   warmth: "warm",   lastTouch: "8d ago" },
  { name: "Theo Nakamura",org: "Northstar Group",tier: "advisor",    warmth: "strong", lastTouch: "2d ago" },
  { name: "Iris Tan",     org: "Forge Studio",   tier: "partner",    warmth: "warm",   lastTouch: "14d ago" },
  { name: "Rafael Cruz",  org: "Bell Ventures",  tier: "investor",   warmth: "cool",   lastTouch: "32d ago" },
  { name: "Hana Wu",      org: "indie",          tier: "ally",       warmth: "warm",   lastTouch: "6d ago" },
];
const V3_HIRING = [
  { role: "Senior PM",         pipe: 14, stage: "Onsite",   top: "Asha Devan",   age: "12d" },
  { role: "Founding Engineer", pipe: 28, stage: "Phone",    top: "Mark Liu",     age: "4d" },
  { role: "Designer",          pipe:  9, stage: "Sourcing", top: "Yui Tanaka",   age: "2d" },
];

const V3AddContactModal = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(11,21,48,0.32)", zIndex: 60,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(520px, 92vw)", background: "var(--v3-surface)",
        border: "1px solid var(--v3-line)", borderRadius: 12, overflow: "hidden",
        boxShadow: "0 30px 80px rgba(11,21,48,0.25)",
      }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--v3-line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)" }}>Add contact</div>
            <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 2 }}>Routes through capture-gate before persisting</div>
          </div>
          <button onClick={onClose} style={{ color: "var(--v3-ink-md)" }}><I.X size={18}/></button>
        </div>
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { l: "Full name",   p: "Maya Iyer" },
            { l: "Organization",p: "Northwind" },
            { l: "Role",        p: "VP Ops" },
            { l: "Email",       p: "maya@northwind.io" },
          ].map((f, i) => (
            <label key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--v3-ink-md)" }}>{f.l}</span>
              <input placeholder={f.p} style={{
                padding: "9px 12px", background: "var(--v3-surface)",
                border: "1px solid var(--v3-line-strong)", borderRadius: 7,
                fontSize: 14, color: "var(--v3-ink)",
              }}/>
            </label>
          ))}
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--v3-ink-md)" }}>Bucket</span>
            <div style={{ display: "flex", gap: 6 }}>
              {["Customer","Team","Network","Candidate"].map(b => (
                <button key={b} style={{
                  padding: "7px 12px", border: "1px solid var(--v3-line-strong)",
                  borderRadius: 7, fontSize: 13, color: "var(--v3-ink-md)", background: "var(--v3-surface)",
                }}>{b}</button>
              ))}
            </div>
          </label>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--v3-line)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{
            padding: "8px 14px", border: "1px solid var(--v3-line-strong)", borderRadius: 7,
            background: "var(--v3-surface)", color: "var(--v3-ink)", fontSize: 13, fontWeight: 500,
          }}>Cancel</button>
          <button onClick={onClose} style={{
            padding: "8px 14px", borderRadius: 7,
            background: "var(--v3-blue)", color: "#FFF", fontSize: 13, fontWeight: 500,
          }}>Add contact</button>
        </div>
      </div>
    </div>
  );
};

const V3PeopleScreen = () => {
  const [tab, setTab] = React.useState("customers");
  const [addOpen, setAddOpen] = React.useState(false);
  const tabs = [
    { id: "customers", label: "Customers", icon: I.Heart },
    { id: "team",      label: "Team",      icon: I.People },
    { id: "network",   label: "Network",   icon: I.Globe },
    { id: "hiring",    label: "Hiring",    icon: I.Tag },
  ];

  const stats = {
    customers: [
      { label: "Active customers", value: "14", delta: "+2", deltaTone: "ok", sub: "this month",
        sparkline: [10,11,11,12,12,13,13,14,14], sparkColor: "var(--v3-blue)", fill: true },
      { label: "ARR",     value: "$248", suffix: "k", delta: "+18%", deltaTone: "ok", sub: "qtd",
        sparkline: [180,190,200,215,225,235,240,248], sparkColor: "var(--v3-purple)", fill: true },
      { label: "At-risk", value: "1",    sub: "Orchard Health" },
      { label: "Renewal exposure (30d)", value: "$96", suffix: "k", sub: "5 contracts" },
    ],
    team: [
      { label: "Headcount",      value: "3" },
      { label: "Avg capacity",   value: "80", suffix: "%", delta: "−4%", deltaTone: "err", sub: "vs last week" },
      { label: "Open items / person", value: "2.3" },
      { label: "Calls this week",value: "8"  },
    ],
    network: [
      { label: "Total contacts", value: "127", delta: "+6", deltaTone: "ok", sub: "added 30d" },
      { label: "Warm",           value: "44", sub: "touched ≤14d" },
      { label: "Going cold",     value: "12", sub: "30+d silent" },
      { label: "Top tier",       value: "9",  sub: "investors + advisors" },
    ],
    hiring: [
      { label: "Open roles",     value: "3" },
      { label: "In pipeline",    value: "51", delta: "+8", deltaTone: "ok", sub: "this week",
        sparkline: [40,42,44,46,48,50,51], sparkColor: "var(--v3-blue)", fill: true },
      { label: "Onsite stage",   value: "4" },
      { label: "Time to offer",  value: "23", suffix: "d" },
    ],
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--v3-rail)", position: "relative" }}>
      <V3Topbar active="people"/>
      <V3PageBody>
      <div style={{ padding: "26px 28px 18px", background: "var(--v3-bg)", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <h1 className="display" style={{
          fontSize: 36, fontWeight: 600, color: "var(--v3-ink)", margin: 0,
          lineHeight: 1, letterSpacing: -0.7,
        }}>People</h1>
        <button onClick={() => setAddOpen(true)} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "9px 14px", background: "var(--v3-blue)", color: "#FFF",
          borderRadius: 8, fontSize: 13, fontWeight: 500,
          boxShadow: "0 1px 0 rgba(11,21,48,0.05)",
        }}>
          <I.Plus size={14}/> Add contact
        </button>
      </div>
      <V3Tabs tabs={tabs} active={tab} setActive={setTab}/>
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <V3Filters groups={V3_FILTER_PRESETS.people} showTimeframe={false}/>
        <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {stats[tab].map((s, i) => <V3StatCard key={i} {...s}/>)}
          </div>

          {tab === "customers" && (
            <V3PanelCard title="Customers" subtitle={`${V3_CUSTOMERS.length} accounts · sorted by ARR`} padding={0}>
              <V3Table
                columns={[
                  { key: "id", label: "Account", render: r => <span style={{ color: "var(--v3-ink)", fontWeight: 500 }}>{r.id}</span> },
                  { key: "contact", label: "Primary contact", render: r => (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar name={r.contact} size={20}/>
                        <span style={{ color: "var(--v3-ink)" }}>{r.contact}</span>
                        <span style={{ color: "var(--v3-ink-lo)", fontSize: 12 }}>· {r.role}</span>
                      </div>
                    )},
                  { key: "arr", label: "ARR", render: r => <span className="mono" style={{ color: "var(--v3-ink)" }}>{r.arr}</span> },
                  { key: "health", label: "Health", render: r => (
                      <V3StatusPill tone={r.tone}>{r.health}</V3StatusPill>
                    )},
                  { key: "lastTouch", label: "Last touch", render: r => <span style={{ color: "var(--v3-ink-md)", fontSize: 13 }}>{r.lastTouch}</span> },
                  { key: "renewal", label: "Renewal", align: "right", render: r => <span className="mono" style={{ color: "var(--v3-ink-md)", fontSize: 13 }}>{r.renewal}</span> },
                ]}
                rows={V3_CUSTOMERS}
              />
            </V3PanelCard>
          )}

          {tab === "team" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {V3_TEAM.map((m, i) => (
                <V3PanelCard key={i} padding={22}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <Avatar name={m.name} size={36}/>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--v3-ink)" }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>{m.role}</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", letterSpacing: 0.6 }}>Open items</div>
                      <div className="display" style={{ fontSize: 22, fontWeight: 600, color: "var(--v3-ink)", letterSpacing: -0.3 }}>{m.items}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", letterSpacing: 0.6 }}>Calls (7d)</div>
                      <div className="display" style={{ fontSize: 22, fontWeight: 600, color: "var(--v3-ink)", letterSpacing: -0.3 }}>{m.calls}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--v3-ink-md)", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                    <span>Capacity</span>
                    <span className="mono" style={{ color: "var(--v3-ink)", fontWeight: 600 }}>{m.capacity}%</span>
                  </div>
                  <div style={{ height: 6, background: "var(--v3-line-soft)", borderRadius: 999 }}>
                    <div style={{ width: `${m.capacity}%`, height: "100%", background: m.capacity > 85 ? "var(--v3-amber)" : "var(--v3-blue)", borderRadius: 999 }}/>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, color: "var(--v3-ink-lo)" }}>Focus: {m.focus}</div>
                </V3PanelCard>
              ))}
            </div>
          )}

          {tab === "network" && (
            <V3PanelCard title="Network" subtitle={`${V3_NETWORK.length} of 127 contacts · most recently touched`} padding={0}>
              <V3Table
                columns={[
                  { key: "name", label: "Name", render: r => (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar name={r.name} size={20}/>
                        <span style={{ color: "var(--v3-ink)" }}>{r.name}</span>
                      </div>
                    )},
                  { key: "org", label: "Org", render: r => <span style={{ color: "var(--v3-ink-md)" }}>{r.org}</span> },
                  { key: "tier", label: "Tier", render: r => (
                      <V3StatusPill tone={r.tier === "investor" ? "info" : r.tier === "advisor" ? "pass" : "neutral"}>{r.tier}</V3StatusPill>
                    )},
                  { key: "warmth", label: "Warmth", render: r => (
                      <V3StatusPill tone={r.warmth === "strong" ? "ok" : r.warmth === "warm" ? "warn" : "neutral"}>{r.warmth}</V3StatusPill>
                    )},
                  { key: "lastTouch", label: "Last touch", align: "right", render: r => <span className="mono" style={{ color: "var(--v3-ink-md)", fontSize: 13 }}>{r.lastTouch}</span> },
                ]}
                rows={V3_NETWORK}
              />
            </V3PanelCard>
          )}

          {tab === "hiring" && (
            <V3PanelCard title="Open roles" subtitle="3 open · 51 in pipeline" padding={0}>
              <V3Table
                columns={[
                  { key: "role", label: "Role", render: r => <span style={{ color: "var(--v3-ink)", fontWeight: 500 }}>{r.role}</span> },
                  { key: "pipe", label: "Pipeline", render: r => <span className="mono" style={{ color: "var(--v3-ink)" }}>{r.pipe}</span> },
                  { key: "stage", label: "Furthest stage", render: r => (
                      <V3StatusPill tone={r.stage === "Onsite" ? "ok" : r.stage === "Phone" ? "info" : "neutral"}>{r.stage}</V3StatusPill>
                    )},
                  { key: "top", label: "Top candidate", render: r => (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar name={r.top} size={20}/>
                        <span style={{ color: "var(--v3-ink-md)" }}>{r.top}</span>
                      </div>
                    )},
                  { key: "age", label: "Open for", align: "right", render: r => <span className="mono" style={{ color: "var(--v3-ink-lo)", fontSize: 13 }}>{r.age}</span> },
                ]}
                rows={V3_HIRING}
              />
            </V3PanelCard>
          )}
        </div>
      </div>
      </V3PageBody>
      <V3AddContactModal open={addOpen} onClose={() => setAddOpen(false)}/>
    </div>
  );
};

// ---------- Generic screen ----------
const V3GenericScreen = ({ active, title, eyebrow, stats, sections }) => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--v3-rail)" }}>
    <V3Topbar active={active}/>
    <V3PageBody>
    <V3PageTitle title={title} eyebrow={eyebrow}/>
    <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
      <V3Filters groups={active === "pipeline" ? V3_FILTER_PRESETS.pipeline : null}/>
      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 16 }}>
          {stats.map((s, i) => <V3StatCard key={i} {...s}/>)}
        </div>
        {sections}
      </div>
    </div>
    </V3PageBody>
  </div>
);

// ---------- App root ----------
const V3App = () => {
  const [active, setActive] = React.useState("now");
  React.useEffect(() => {
    const s = document.createElement("style");
    s.textContent = v3Tokens;
    document.head.appendChild(s);
    return () => s.remove();
  }, []);

  const Screen = () => {
    if (active === "now") return <V3NowScreen/>;
    if (active === "work") return <V3WorkScreen/>;
    if (active === "people") return <V3PeopleScreen/>;
    if (active === "money")     return <V3MoneyScreen/>;
    if (active === "marketing") return <V3MarketingScreen/>;
    if (active === "products")  return <V3ProductsScreen/>;
    if (active === "system")    return <V3SystemScreen/>;
    if (active === "library")   return <V3LibraryScreen/>;
    return null;
  };

  return (
    <div className="atrium-v3">
      <V3Rail active={active} setActive={setActive}/>
      <Screen/>
    </div>
  );
};

Object.assign(window, { V3App });
