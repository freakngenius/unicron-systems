/* Atrium — Shell: left rail, top header, command palette, quick capture */

const { useState: useStateShell, useEffect: useEffectShell } = React;

const NAV = [
  { id: "now", label: "Now", icon: I.Now },
  { id: "people", label: "People", icon: I.People },
  { id: "work", label: "Work", icon: I.Work },
  { id: "money", label: "Money", icon: I.Money },
  { id: "marketing", label: "Marketing", icon: I.Megaphone },
  { id: "products", label: "Products", icon: I.Layers },
  { id: "system", label: "System", icon: I.System },
  { id: "library", label: "Library", icon: I.Book },
];

const Rail = ({ active, setActive, mobile }) => {
  if (mobile) {
    // Bottom-bar navigation on mobile (4 primary tabs)
    const mobileNav = NAV.slice(0, 4);
    return (
      <nav style={{
        position: "fixed", left: 0, right: 0, bottom: 0, height: 60,
        background: "var(--bg-elevated)", borderTop: "1px solid var(--border-subtle)",
        display: "flex", zIndex: 50,
      }}>
        {mobileNav.map(n => (
          <button key={n.id} onClick={() => setActive(n.id)} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
            color: active === n.id ? "var(--accent)" : "var(--text-md)",
          }}>
            <n.icon size={20}/>
            <span style={{ fontSize: "var(--text-2xs)", fontWeight: 500 }}>{n.label}</span>
          </button>
        ))}
      </nav>
    );
  }
  return (
    <nav style={{
      width: "var(--rail-w)", background: "var(--bg-surface)",
      borderRight: "1px solid var(--border-subtle)",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "14px 0", flexShrink: 0,
    }}>
      <div style={{
        width: 36, height: 36, marginBottom: 18, borderRadius: 10,
        background: "linear-gradient(135deg, var(--accent), #B5532A)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text-on-accent)",
        boxShadow: "0 2px 8px rgba(232,118,58,0.3)",
      }}>A</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%", padding: "0 8px" }}>
        {NAV.map(n => {
          const isActive = active === n.id;
          return (
            <button key={n.id} onClick={() => setActive(n.id)} title={n.label} style={{
              position: "relative",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "10px 0 8px", borderRadius: "var(--r-md)",
              color: isActive ? "var(--text-hi)" : "var(--text-md)",
              background: isActive ? "var(--bg-raised)" : "transparent",
              transition: "all var(--d-hover) var(--ease)",
            }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--bg-elevated)"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              {isActive && <span style={{
                position: "absolute", left: -8, top: 12, bottom: 12, width: 2,
                background: "var(--accent)", borderRadius: "0 2px 2px 0",
              }}/>}
              <n.icon size={18}/>
              <span style={{ fontSize: "var(--text-2xs)", fontWeight: 500, letterSpacing: 0.2 }}>{n.label}</span>
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <Avatar name="Kyle B" size={28} color="linear-gradient(135deg,#5b6580,#2a2f3b)"/>
      </div>
    </nav>
  );
};

const Header = ({ onCmdK, onCapture, mobile }) => {
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5) return "Late night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();
  return (
    <header style={{
      height: "var(--header-h)", padding: mobile ? "0 16px" : "0 20px",
      borderBottom: "1px solid var(--border-subtle)",
      background: "var(--bg-surface)",
      display: "flex", alignItems: "center", gap: mobile ? 8 : 16, flexShrink: 0,
    }}>
      {mobile && (
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: "linear-gradient(135deg, var(--accent), #B5532A)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text-on-accent)",
        }}>A</div>
      )}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--text-hi)" }}>{greeting}, Kyle</span>
        {!mobile && (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)", fontFamily: "var(--font-mono)" }}>
            Wed · May 7
          </span>
        )}
      </div>
      {!mobile && (
        <StatusPulse items={[
          { label: "Vault", tone: "ok",   detail: "All services nominal" },
          { label: "Agents", tone: "ok",  detail: "12 active, 0 errors" },
          { label: "Refusals", tone: "warn", detail: "2 pending review" },
          { label: "Decay", tone: "info", detail: "3 items aging" },
        ]}/>
      )}
      <div style={{ flex: 1 }}/>
      <button onClick={onCmdK} style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-md)", padding: mobile ? "6px 8px" : "6px 10px 6px 10px",
        color: "var(--text-md)", fontSize: "var(--text-sm)",
        minWidth: mobile ? 0 : 280, transition: "all var(--d-hover) var(--ease)",
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border-default)"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-subtle)"}
      >
        <I.Search size={14}/>
        {!mobile && <>
          <span style={{ flex: 1, textAlign: "left" }}>Search ledger, vault, calls…</span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 2,
            fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)",
            background: "var(--bg-raised)", padding: "2px 5px", borderRadius: 4,
            color: "var(--text-lo)",
          }}>⌘K</span>
        </>}
      </button>
      <button onClick={onCapture} style={{
        display: "flex", alignItems: "center", gap: 4,
        background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-md)", padding: "6px 8px",
        color: "var(--text-md)", transition: "all var(--d-hover) var(--ease)",
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-subtle)"; e.currentTarget.style.color = "var(--text-md)"; }}
      >
        <I.Mic size={14}/>
        <I.Plus size={14}/>
      </button>
    </header>
  );
};

// ---------- Command Palette ----------
const CMD_RESULTS = [
  { group: "Action items", icon: <I.Work size={14}/>, items: [
    { title: "Reply to Zenith Labs proposal", sub: "Due tomorrow · Kyle" },
    { title: "Send Q2 forecast to board", sub: "Overdue · Curtis" },
  ]},
  { group: "Calls", icon: <I.Phone size={14}/>, items: [
    { title: "Northwind discovery call", sub: "May 6 · 42min · transcribed" },
    { title: "Helix design review", sub: "May 5 · 28min · transcribed" },
  ]},
  { group: "Decisions", icon: <I.Flag size={14}/>, items: [
    { title: "Adopt Supabase RLS for tenant isolation", sub: "Apr 30 · Architecture" },
  ]},
  { group: "Vault", icon: <I.Lock size={14}/>, items: [
    { title: "Pathfinder pricing model v3", sub: "Doc · updated 2d ago" },
  ]},
  { group: "Contacts", icon: <I.People size={14}/>, items: [
    { title: "Maya Iyer — Northwind Ops", sub: "Last contact 4 days ago" },
  ]},
  { group: "Skills", icon: <I.Sparkle size={14}/>, items: [
    { title: "Run · Daily digest", sub: "Productivity · runs at 7am" },
    { title: "Run · Customer health sweep", sub: "Sales · runs nightly" },
  ]},
];

const CmdK = ({ open, onClose }) => {
  const [q, setQ] = useStateShell("");
  useEffectShell(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  const filtered = CMD_RESULTS.map(g => ({
    ...g,
    items: g.items.filter(it => !q || it.title.toLowerCase().includes(q.toLowerCase())),
  })).filter(g => g.items.length);
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "var(--bg-overlay)",
      backdropFilter: "blur(2px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: "10vh", zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(640px, 92vw)", background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--r-lg)", boxShadow: "var(--sh-3)",
        overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
          borderBottom: "1px solid var(--border-subtle)" }}>
          <I.Search size={16} style={{ color: "var(--text-md)" }}/>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search across the company brain…"
            style={{ flex: 1, fontSize: "var(--text-base)", color: "var(--text-hi)" }}/>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", color: "var(--text-lo)",
            background: "var(--bg-raised)", padding: "3px 6px", borderRadius: 4 }}>esc</span>
        </div>
        <div style={{ maxHeight: 460, overflowY: "auto", padding: "8px 0" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "32px 18px", textAlign: "center", color: "var(--text-lo)", fontSize: "var(--text-sm)" }}>
              No matches. Try fewer words.
            </div>
          )}
          {filtered.map((g, gi) => (
            <div key={gi} style={{ padding: "6px 0" }}>
              <div style={{ padding: "6px 18px", fontSize: "var(--text-2xs)", color: "var(--text-lo)",
                textTransform: "uppercase", letterSpacing: 0.6, display: "flex", alignItems: "center", gap: 6 }}>
                {g.icon} {g.group}
              </div>
              {g.items.map((it, ii) => (
                <button key={ii} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "8px 18px", textAlign: "left",
                  transition: "background var(--d-hover) var(--ease)",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--bg-raised)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--text-hi)" }}>{it.title}</div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)", marginTop: 1 }}>{it.sub}</div>
                  </div>
                  <I.ArrowR size={12} style={{ color: "var(--text-lo)" }}/>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding: "10px 18px", borderTop: "1px solid var(--border-subtle)",
          display: "flex", alignItems: "center", gap: 16, fontSize: "var(--text-2xs)", color: "var(--text-lo)" }}>
          <span><span className="mono" style={{ color: "var(--text-md)" }}>↵</span> open</span>
          <span><span className="mono" style={{ color: "var(--text-md)" }}>↑↓</span> navigate</span>
          <span><span className="mono" style={{ color: "var(--text-md)" }}>⌘↵</span> open in new panel</span>
          <span style={{ marginLeft: "auto" }}>Searches across vault, ledger, calls, decisions, contacts, agents, audit log</span>
        </div>
      </div>
    </div>
  );
};

// ---------- Quick Capture Modal ----------
const QuickCapture = ({ open, onClose }) => {
  const [tab, setTab] = useStateShell("text");
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "var(--bg-overlay)", backdropFilter: "blur(2px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(540px, 92vw)", background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)", borderRadius: "var(--r-lg)",
        boxShadow: "var(--sh-3)", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>Quick capture</div>
          <button onClick={onClose} style={{ color: "var(--text-md)" }}><I.X size={16}/></button>
        </div>
        <div style={{ display: "flex", padding: "12px 18px 0", gap: 4, borderBottom: "1px solid var(--border-subtle)" }}>
          {[
            { id: "text", label: "Text", icon: <I.Doc size={13}/> },
            { id: "voice", label: "Voice", icon: <I.Mic size={13}/> },
            { id: "photo", label: "Photo", icon: <I.Camera size={13}/> },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 12px", marginBottom: -1,
              fontSize: "var(--text-sm)", fontWeight: 500,
              color: tab === t.id ? "var(--text-hi)" : "var(--text-md)",
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "all var(--d-hover) var(--ease)",
            }}>{t.icon}{t.label}</button>
          ))}
        </div>
        <div style={{ padding: 18 }}>
          {tab === "text" && (
            <textarea autoFocus placeholder="Drop a thought, paste a link, or type to capture…&#10;&#10;The agent will route to ledger, action items, or vault based on content."
              style={{ width: "100%", minHeight: 160, background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)", borderRadius: "var(--r-md)",
                padding: 12, color: "var(--text-hi)", fontSize: "var(--text-sm)", resize: "vertical" }}/>
          )}
          {tab === "voice" && (
            <div style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-default)",
              borderRadius: "var(--r-md)", padding: "40px 20px", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--accent-soft)",
                border: "1px solid var(--border-accent)",
                display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                <I.Mic size={22}/>
              </div>
              <div style={{ marginTop: 14, fontSize: "var(--text-sm)", color: "var(--text-hi)" }}>Hold space to record</div>
              <div style={{ marginTop: 4, fontSize: "var(--text-xs)", color: "var(--text-lo)" }}>
                Transcript routes through capture-gate before persisting
              </div>
            </div>
          )}
          {tab === "photo" && (
            <div style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-default)",
              borderRadius: "var(--r-md)", padding: "40px 20px", textAlign: "center", color: "var(--text-md)", fontSize: "var(--text-sm)" }}>
              <I.Camera size={32} style={{ color: "var(--text-lo)" }}/>
              <div style={{ marginTop: 12 }}>Drop, paste, or browse</div>
              <div style={{ marginTop: 4, fontSize: "var(--text-xs)", color: "var(--text-lo)" }}>OCR + scene tagging on capture</div>
            </div>
          )}
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border-subtle)",
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-lo)" }}>
            Routes through <span style={{ color: "var(--text-md)" }}>refusal-gate</span> before persisting
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="primary">Capture</Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { Rail, Header, CmdK, QuickCapture, NAV });
