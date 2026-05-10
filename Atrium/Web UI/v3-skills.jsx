/* Atrium v3 — Run a Skill surface (Now tab default landing)
   Cockpit for invoking agent skills. Prompt-first, then category-grouped tiles,
   plus Recent runs + Forecast 5h burn-down on the right rail.
   Mobile-first reflow at <820px (single column, sticky RUN at bottom). */

const V3_SKILL_CATEGORIES = [
  {
    id: "memory", label: "Memory", icon: "Brain", color: "#7C5BD9",
    skills: [
      { id: "vault-cleanup", name: "Vault Cleanup", desc: "Sweep stale + duplicate notes" },
      { id: "daily-digest",  name: "Daily Digest",  desc: "Roll up yesterday's signals" },
      { id: "vault-search",  name: "Vault Search",  desc: "Semantic search across all sources" },
      { id: "promote-insight", name: "Promote Insight", desc: "Move signal → durable memory" },
    ],
  },
  {
    id: "productivity", label: "Productivity", icon: "Now", color: "#2E6CD4",
    skills: [
      { id: "morning-brief", name: "Morning Brief", desc: "What needs you today, in 2 min" },
      { id: "inbox-triage",  name: "Inbox Triage",  desc: "Cluster + draft replies for unread" },
      { id: "quick-capture", name: "Quick Capture", desc: "Voice or text → routed to vault" },
    ],
  },
  {
    id: "research", label: "Research", icon: "Search", color: "#1F8A5B",
    skills: [
      { id: "deep-research", name: "Deep Research", desc: "Multi-agent investigation, ~6m" },
      { id: "llm-council",   name: "LLM Council",   desc: "3 models debate, judge picks winner" },
      { id: "lightrag-query",name: "LightRAG Query", desc: "Graph-aware retrieval over corpus" },
      { id: "morning-trend", name: "Morning Trend Scan", desc: "Industry signals since 6am" },
    ],
  },
  {
    id: "discovery", label: "Discovery", icon: "Compass", color: "#D97757",
    skills: [
      { id: "schedule-call",   name: "Schedule Call",   desc: "Find slot + send invite" },
      { id: "extract-signals", name: "Extract Signals", desc: "Pull entities + intents from call" },
      { id: "draft-followup",  name: "Draft Follow-up", desc: "Personalized post-call email" },
    ],
  },
  {
    id: "voice", label: "Voice", icon: "Phone", color: "#E8763A", voice: true,
    skills: [
      { id: "place-discovery-call",   name: "Place a discovery call",   desc: "Rare manual outbound · Discovery is primarily inbound",
        rare: true, lastRun: "Apr 22 · 14:02", costRange: "$0.40 – $1.20", refusalGated: true },
      { id: "place-sdr-call",         name: "Place an SDR call",        desc: "Cold outbound to a target prospect",
        params: ["target_prospect"], lastRun: "May 7 · 13:18", costRange: "$0.80 – $2.10", refusalGated: true },
      { id: "place-procurement-pull", name: "Place a procurement pull", desc: "Bid pull call to a procurement office",
        params: ["target_office"],   lastRun: "May 7 · 14:30", costRange: "$1.20 – $2.10", refusalGated: true },
    ],
  },
  {
    id: "sales", label: "Sales", icon: "Bolt", color: "#E8763A",
    skills: [
      { id: "pipeline-stage",   name: "Pipeline Stage",   desc: "Advance deal + log reasoning" },
      { id: "generate-proposal",name: "Generate Proposal", desc: "From discovery notes → SOW" },
    ],
  },
  {
    id: "marketing", label: "Marketing", icon: "Pulse", color: "#C9A227",
    skills: [
      { id: "blog-post",       name: "Blog Post",       desc: "Long-form draft from outline" },
      { id: "social-post",     name: "Social Post",     desc: "LinkedIn + X variants" },
      { id: "positioning-deck",name: "Positioning Deck", desc: "10-slide investor deck" },
    ],
  },
  {
    id: "operations", label: "Operations", icon: "Wrench", color: "#7C87A0",
    skills: [
      { id: "onboard-member",     name: "Onboard Member",      desc: "New teammate runbook" },
      { id: "propose-taboo-edit", name: "Propose Taboo Edit",  desc: "Suggest refusal-layer change" },
      { id: "override-bounce",    name: "Override Bounce",     desc: "Justify + commit through gate" },
    ],
  },
];

const V3_RECENT_RUNS = [
  { skill: "Morning Brief",      ts: "8:12am", status: "ok",      cost: "$0.08", dur: "1m 04s" },
  { skill: "Vault Search",       ts: "9:47am", status: "ok",      cost: "$0.02", dur: "8s" },
  { skill: "Deep Research",      ts: "10:21am",status: "ok",      cost: "$1.42", dur: "5m 38s" },
  { skill: "Extract Signals",    ts: "11:03am",status: "blocked", cost: "$0.00", dur: "—" },
  { skill: "Daily Digest",       ts: "Yesterday",status: "ok",    cost: "$0.11", dur: "42s" },
];

const V3SkillTile = ({ skill, color, onPick, picked }) => (
  <button onClick={() => onPick(skill)} style={{
    textAlign: "left", padding: "12px 14px",
    background: picked ? "rgba(232,118,58,0.06)" : "var(--v3-surface)",
    borderRadius: 10,
    boxShadow: picked
      ? "inset 0 0 0 1.5px var(--v3-orange), 0 1px 2px rgba(11,21,48,0.04)"
      : "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.04)",
    transition: "all 140ms",
    display: "flex", flexDirection: "column", gap: 4,
    minHeight: 64,
  }}
    onMouseEnter={e => { if (!picked) e.currentTarget.style.boxShadow = "0 1px 2px rgba(11,21,48,0.06), 0 6px 22px rgba(11,21,48,0.10)"; }}
    onMouseLeave={e => { if (!picked) e.currentTarget.style.boxShadow = "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.04)"; }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, flexShrink: 0 }}/>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--v3-ink)" }}>{skill.name}</span>
    </div>
    <span style={{ fontSize: 12, color: "var(--v3-ink-lo)", lineHeight: 1.35 }}>{skill.desc}</span>
    {(skill.costRange || skill.refusalGated) && (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        {skill.costRange && <span className="mono" style={{ fontSize: 10.5, color: "var(--v3-ink-md)", background: "var(--v3-line-soft)", padding: "1px 6px", borderRadius: 3 }}>{skill.costRange}</span>}
        {skill.refusalGated && <span style={{ fontSize: 10, color: "#E14B4B", background: "rgba(225,75,75,0.10)", padding: "1px 6px", borderRadius: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>refusal-gated</span>}
        {skill.lastRun && <span style={{ fontSize: 10.5, color: "var(--v3-ink-lo)", marginLeft: "auto" }}>last {skill.lastRun}</span>}
      </div>
    )}
  </button>
);

// ---------- Recent runs panel ----------
const V3RecentRuns = () => (
  <div style={{
    background: "var(--v3-surface)", borderRadius: 12,
    boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    overflow: "hidden",
  }}>
    <div style={{
      padding: "14px 18px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      borderBottom: "1px solid var(--v3-line-soft)",
    }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--v3-ink)" }}>Recent runs</span>
      <button style={{ fontSize: 12, color: "var(--v3-blue)" }}>View all</button>
    </div>
    <div style={{ display: "flex", flexDirection: "column" }}>
      {V3_RECENT_RUNS.map((r, i) => (
        <div key={i} style={{
          padding: "11px 18px",
          borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: 999, flexShrink: 0,
            background: r.status === "ok" ? "var(--v3-green)" : r.status === "blocked" ? "var(--v3-red)" : "var(--v3-amber)",
          }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "var(--v3-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.skill}</div>
            <div style={{ fontSize: 11.5, color: "var(--v3-ink-lo)", marginTop: 1 }}>
              {r.ts} · {r.dur}
            </div>
          </div>
          <span className="mono" style={{ fontSize: 12, color: "var(--v3-ink-md)" }}>{r.cost}</span>
        </div>
      ))}
    </div>
  </div>
);

// ---------- Forecast 5h burn-down ----------
const V3BudgetForecast = () => {
  // Synthetic burn data (current vs forecast)
  const used = 0.34;     // 34% of week used
  const forecast5h = 0.41; // 41% if 5h continues at current rate
  const dangerZone = 0.80;

  return (
    <div style={{
      background: "var(--v3-surface)", borderRadius: 12,
      padding: "16px 18px",
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--v3-ink)" }}>Forecast · 5h burn</span>
        <span className="mono" style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>$214 / $640</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginBottom: 12 }}>
        Weekly budget · resets Sunday
      </div>

      {/* Stacked bar: used (solid) + forecast (translucent) */}
      <div style={{
        position: "relative", height: 10, borderRadius: 999,
        background: "var(--v3-bg-soft, #EEF1F6)", overflow: "hidden", marginBottom: 10,
      }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: (forecast5h * 100) + "%",
          background: "rgba(232,118,58,0.25)",
        }}/>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: (used * 100) + "%",
          background: "var(--v3-orange)",
        }}/>
        <div style={{
          position: "absolute", top: -2, bottom: -2,
          left: (dangerZone * 100) + "%",
          width: 1.5, background: "var(--v3-red)", opacity: 0.5,
        }}/>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--v3-ink-lo)" }}>
        <span><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 2, background: "var(--v3-orange)", marginRight: 5, verticalAlign: "1px" }}/>Used 34%</span>
        <span><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 2, background: "rgba(232,118,58,0.35)", marginRight: 5, verticalAlign: "1px" }}/>+5h forecast 41%</span>
      </div>
    </div>
  );
};

// ---------- Demo data tag ----------
const V3DemoTag = () => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5,
    fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
    color: "var(--v3-ink-lo)",
    padding: "2px 7px", borderRadius: 4,
    background: "rgba(11,21,48,0.04)",
  }}>
    <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--v3-amber)" }}/>
    Demo data — replace with /api/atrium/*
  </span>
);

// ---------- Main skills surface ----------
const V3SkillsSurface = () => {
  const [prompt, setPrompt] = React.useState("");
  const [picked, setPicked] = React.useState(null);
  const [running, setRunning] = React.useState(false);
  const [gateState, setGateState] = React.useState(null); // "validating" | "ok" | "blocked"

  const handlePick = (skill) => {
    setPicked(skill.id);
    if (!prompt.trim()) setPrompt(`Run: ${skill.name}`);
  };

  const handleRun = () => {
    if (!prompt.trim()) return;
    setRunning(true);
    setGateState("validating");
    setTimeout(() => {
      setGateState("ok");
      setTimeout(() => {
        setRunning(false);
        setGateState(null);
        setPrompt("");
        setPicked(null);
      }, 900);
    }, 850);
  };

  const handleClear = () => {
    setPrompt("");
    setPicked(null);
  };

  return (
    <div className="v3-skills-root" style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) 320px",
      gap: 20,
      alignItems: "start",
    }}>
      <style>{`
        @media (max-width: 960px) {
          .v3-skills-root {
            grid-template-columns: 1fr !important;
          }
          .v3-skills-rail {
            order: 2;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }
          .v3-skills-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 600px) {
          .v3-skills-rail {
            grid-template-columns: 1fr !important;
          }
          .v3-skills-grid {
            grid-template-columns: 1fr !important;
          }
          .v3-skills-prompt-actions {
            position: sticky !important;
            bottom: 0;
            background: var(--v3-bg);
            padding-top: 10px;
            margin-bottom: -10px;
            z-index: 5;
          }
        }
        @keyframes v3-gate-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes v3-gate-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* LEFT: prompt + skills grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>

        {/* Prompt card */}
        <div style={{
          background: "var(--v3-surface)", borderRadius: 14,
          padding: "18px 20px",
          boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 8px 28px rgba(11,21,48,0.08)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{
              width: 28, height: 28, borderRadius: 7,
              background: "linear-gradient(135deg, #E8763A, #C75928)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 6px rgba(232,118,58,0.35)",
            }}>
              <I.Bolt size={14} style={{ color: "#FFF" }}/>
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--v3-ink)", lineHeight: 1.2 }}>
                Run a skill
              </div>
              <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 2 }}>
                Describe what you want, or pick a skill below
              </div>
            </div>
            {picked && (
              <span style={{
                fontSize: 11.5, fontWeight: 600,
                color: "var(--v3-orange)",
                background: "rgba(232,118,58,0.10)",
                padding: "4px 8px", borderRadius: 5,
              }}>
                {V3_SKILL_CATEGORIES.flatMap(c => c.skills).find(s => s.id === picked)?.name}
              </span>
            )}
          </div>

          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Brief Pathfinder on the Northwind proposal — pull discovery notes, draft a 10-slide deck, summarize talking points..."
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box", resize: "vertical",
              background: "var(--v3-bg-soft, #F1F4F8)",
              border: "1px solid var(--v3-line-soft)", borderRadius: 9,
              padding: "12px 14px",
              fontSize: 14, fontFamily: "inherit", color: "var(--v3-ink)",
              outline: "none", lineHeight: 1.5,
              display: "block",
            }}
            onFocus={e => e.target.style.borderColor = "var(--v3-orange)"}
            onBlur={e => e.target.style.borderColor = "var(--v3-line-soft)"}
          />

          <div className="v3-skills-prompt-actions" style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 12,
          }}>
            {/* Gate state pill */}
            {gateState && (
              <div style={{
                display: "flex", alignItems: "center", gap: 7,
                fontSize: 12, color: gateState === "ok" ? "var(--v3-green)" : gateState === "blocked" ? "var(--v3-red)" : "var(--v3-ink-md)",
                background: gateState === "ok" ? "rgba(31,138,91,0.08)" : gateState === "blocked" ? "rgba(209,72,72,0.08)" : "rgba(11,21,48,0.04)",
                padding: "6px 10px", borderRadius: 6,
                fontWeight: 500,
              }}>
                {gateState === "validating" && (
                  <>
                    <span style={{
                      width: 11, height: 11, borderRadius: 999,
                      border: "1.5px solid currentColor", borderTopColor: "transparent",
                      animation: "v3-gate-spin 700ms linear infinite",
                    }}/>
                    Validating against refusal layer…
                  </>
                )}
                {gateState === "ok" && (
                  <>
                    <I.Check size={11}/> Cleared by Taboo Keeper
                  </>
                )}
                {gateState === "blocked" && (
                  <>
                    <I.X size={11}/> Blocked
                  </>
                )}
              </div>
            )}
            <div style={{ flex: 1 }}/>
            <button onClick={handleClear} disabled={running} style={{
              padding: "8px 14px", borderRadius: 7,
              background: "var(--v3-surface)",
              border: "1px solid var(--v3-line-strong)",
              color: "var(--v3-ink-md)", fontSize: 13, fontWeight: 500,
              opacity: running ? 0.5 : 1,
            }}>Clear</button>
            <button onClick={handleRun} disabled={running || !prompt.trim()} style={{
              padding: "8px 16px", borderRadius: 7,
              background: prompt.trim() && !running ? "var(--v3-orange)" : "var(--v3-line-strong)",
              color: "#FFF", fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
              cursor: prompt.trim() && !running ? "pointer" : "not-allowed",
              boxShadow: prompt.trim() && !running ? "0 2px 8px rgba(232,118,58,0.35)" : "none",
              transition: "all 140ms",
            }}>
              Run <I.ArrowR size={11}/>
            </button>
          </div>
        </div>

        {/* Skills grid */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 className="display" style={{ fontSize: 18, fontWeight: 600, color: "var(--v3-ink)", margin: 0, letterSpacing: -0.3 }}>
              Skills library
            </h2>
            <V3DemoTag/>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {V3_SKILL_CATEGORIES.map(cat => {
              const Icon = I[cat.icon] || I.Bolt;
              return (
                <section key={cat.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 6,
                      background: cat.color + "22", color: cat.color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={12}/>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--v3-ink)", letterSpacing: 0.2, textTransform: "uppercase" }}>
                      {cat.label}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>
                      · {cat.skills.length} skills
                    </span>
                  </div>
                  <div className="v3-skills-grid" style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: 10,
                  }}>
                    {cat.skills.map(s => (
                      <V3SkillTile
                        key={s.id} skill={s} color={cat.color}
                        onPick={handlePick} picked={picked === s.id}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT: rail */}
      <div className="v3-skills-rail" style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 0 }}>
        <V3BudgetForecast/>
        <V3RecentRuns/>
      </div>
    </div>
  );
};

// ---------- Activity feed (today, grouped by hour) ----------
const V3_ACTIVITY = [
  {
    hour: "10:00", events: [
      { time: "10:42", kind: "skill",    actor: "Inbox Triage",  who: "Curator agent", title: "Clustered 23 unread → 4 reply drafts ready", tone: "ok", cost: "$0.18" },
      { time: "10:31", kind: "capture",  actor: "Voice note",    who: "Kyle B",        title: "Pricing v3 needs Curtis sign-off before Friday investor call", tone: "info" },
      { time: "10:14", kind: "decision", actor: "Pathfinder",    who: "Keenan G",      title: "Approved: switch annual billing to net-15 for Northwind", tone: "ok" },
    ],
  },
  {
    hour: "09:00", events: [
      { time: "09:58", kind: "refusal",  actor: "Sales agent",   who: "Taboo Keeper",  title: "Blocked attempt to share full customer list externally", tone: "err",  badge: "customer-data-egress" },
      { time: "09:30", kind: "vault",    actor: "Vault Cleanup", who: "System",        title: "Archived 12 stale notes · promoted 3 to durable memory", tone: "ok",   cost: "$0.04" },
      { time: "09:12", kind: "skill",    actor: "Morning Brief", who: "Curator agent", title: "Generated brief — 7 action items, 3 renewals due", tone: "ok",   cost: "$0.07" },
    ],
  },
  {
    hour: "08:00", events: [
      { time: "08:47", kind: "agent",    actor: "Maya · CSM",    who: "Auto-dispatch", title: "Sent renewal nudge to Northwind (last touch 4d)", tone: "ok" },
      { time: "08:22", kind: "capture",  actor: "Slack import",  who: "System",        title: "12 messages from #unicron-ops indexed", tone: "neutral" },
      { time: "08:00", kind: "skill",    actor: "Trend Scan",    who: "Research agent", title: "AI-ops industry signals · 4 promoted to vault", tone: "ok",   cost: "$0.31" },
    ],
  },
  {
    hour: "07:00", events: [
      { time: "07:45", kind: "system",   actor: "Decay sweep",   who: "System",        title: "3 docs flagged stale · Pricing FAQ, ICP v1, Onboarding", tone: "warn" },
      { time: "07:02", kind: "system",   actor: "Daily backup",  who: "System",        title: "Vault snapshot complete · 1.2 GB", tone: "ok" },
    ],
  },
];

const V3KindGlyph = ({ kind }) => {
  const map = {
    skill:    { icon: I.Bolt,      color: "#7355E5" },
    capture:  { icon: I.Mic,       color: "#2E6CD4" },
    decision: { icon: I.Check,     color: "#1F8A5B" },
    refusal:  { icon: I.Lock,      color: "#E14B4B" },
    vault:    { icon: I.Book,      color: "#7355E5" },
    agent:    { icon: I.People,    color: "#E8763A" },
    system:   { icon: I.Pulse,     color: "#7E8AA3" },
  };
  const m = map[kind] || map.system;
  const Icon = m.icon;
  return (
    <span style={{
      width: 26, height: 26, borderRadius: 7,
      background: m.color + "18", color: m.color,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <Icon size={13}/>
    </span>
  );
};

const V3ActivityFeed = () => {
  const [filter, setFilter] = React.useState("all");
  const filters = [
    { id: "all",      label: "All" },
    { id: "skill",    label: "Skills" },
    { id: "decision", label: "Decisions" },
    { id: "refusal",  label: "Refusals" },
    { id: "capture",  label: "Captures" },
    { id: "vault",    label: "Vault" },
  ];

  const toneColor = (tone) => tone === "ok" ? "var(--v3-green)"
    : tone === "warn" ? "var(--v3-amber)"
    : tone === "err"  ? "var(--v3-red)"
    : tone === "info" ? "var(--v3-blue)"
    : "var(--v3-ink-lo)";

  return (
    <section style={{
      background: "var(--v3-surface)", borderRadius: 12,
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Activity</h3>
          <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>Today · Wed May 7</span>
          <V3DemoTag/>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {filters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "5px 11px", borderRadius: 6, fontSize: 12.5, fontWeight: 500,
              background: filter === f.id ? "var(--v3-bg-soft, #EEF1F6)" : "transparent",
              color: filter === f.id ? "var(--v3-ink)" : "var(--v3-ink-md)",
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "8px 0" }}>
        {V3_ACTIVITY.map(group => {
          const visible = filter === "all" ? group.events : group.events.filter(e => e.kind === filter);
          if (visible.length === 0) return null;
          return (
            <div key={group.hour} style={{ display: "grid", gridTemplateColumns: "82px 1fr", padding: "12px 22px 4px", borderTop: "1px solid var(--v3-line-soft)" }}>
              <div className="mono display" style={{
                fontSize: 14, color: "var(--v3-ink-lo)", fontWeight: 500,
                paddingTop: 11, letterSpacing: 0.5,
              }}>{group.hour}</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {visible.map((e, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0",
                    borderTop: i === 0 ? "none" : "1px dashed var(--v3-line-soft)",
                  }}>
                    <V3KindGlyph kind={e.kind}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <span className="mono" style={{ fontSize: 12, color: "var(--v3-ink-lo)", minWidth: 42 }}>{e.time}</span>
                        <span style={{ fontSize: 13.5, color: "var(--v3-ink)", fontWeight: 500 }}>{e.actor}</span>
                        <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>· {e.who}</span>
                        {e.badge && (
                          <span className="mono" style={{
                            fontSize: 11, padding: "1px 6px", borderRadius: 4,
                            background: "var(--v3-red-soft)", color: "var(--v3-red)", fontWeight: 600,
                          }}>{e.badge}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13.5, color: "var(--v3-ink-md)", marginTop: 3, lineHeight: 1.45 }}>{e.title}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, paddingTop: 2 }}>
                      {e.cost && <span className="mono" style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>{e.cost}</span>}
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: toneColor(e.tone) }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: "12px 22px", borderTop: "1px solid var(--v3-line-soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>Showing today · 11 events</span>
        <button style={{ fontSize: 13, color: "var(--v3-blue)", fontWeight: 500 }}>View full audit log →</button>
      </div>
    </section>
  );
};

window.V3SkillsSurface = V3SkillsSurface;
window.V3ActivityFeed = V3ActivityFeed;
