/* v3-now-feeds.jsx — Now > Activity & Now > Digest sub-tab content. */

// ============================================================
// ACTIVITY (full-screen feed)
// ============================================================

const V3_ACT_SOURCES = [
  { id: "call",         label: "Calls",         color: "#2E6CD4" },
  { id: "slack",        label: "Slack",         color: "#7355E5" },
  { id: "email",        label: "Email",         color: "#1F8A5B" },
  { id: "voice_memo",   label: "Voice memos",   color: "#E8763A" },
  { id: "agent_run",    label: "Agent runs",    color: "#0EA5E9" },
  { id: "kanban_move",  label: "Kanban moves",  color: "#94A3B8" },
  { id: "taboo_bounce", label: "Taboo bounces", color: "#D14848" },
  { id: "audit_log",    label: "Audit log",     color: "#5B6580" },
  { id: "ledger_write", label: "Ledger writes", color: "#0B9488" },
];

const V3_ACT_DRIS = ["Kyle B", "Curtis L", "Keenan O", "Maya I", "auto"];
const V3_ACT_SURFACES = ["pathfinder", "metacron", "internal", "sales"];

// Big chronological feed. Newest first.
const V3_ACT_FEED = [
  // 16:54
  { id: "e001", ts: "16:54:32", source: "agent_run",    surface: "metacron", actor: "Metacron",   summary: "Daily digest skill completed — 4 calls ingested, 2 PRs merged, 1 taboo bounce", chip: "Analyst · daily-digest" },
  { id: "e002", ts: "16:51:08", source: "ledger_write", surface: "internal",  actor: "auto",       summary: "Ledger write: continuity event for Northwind expansion approval", chip: "kind=customer_promise" },
  // 16:42-43 group
  { id: "e003", ts: "16:42:54", source: "voice_memo",   surface: "internal", actor: "Kyle B",     summary: "Voice memo · Northwind notes — 'they want 30 seats with SSO; tier 2 unblocks Friday'", chip: "2:14 audio" },
  { id: "e004", ts: "16:42:50", source: "voice_memo",   surface: "internal", actor: "Kyle B",     summary: "Voice memo · prep for board call — 'lead with runway, then Pathfinder pilot'", chip: "1:02 audio" },
  { id: "e005", ts: "16:42:31", source: "voice_memo",   surface: "internal", actor: "Kyle B",     summary: "Voice memo · 'Curtis raised tier 2 margin concern; need decision by Friday'", chip: "0:48 audio" },
  // 16:30 refusal
  { id: "e006", ts: "16:30:11", source: "taboo_bounce", surface: "pathfinder", actor: "Pathfinder", summary: "Outreach blocked — drafted email to Helix included internal customer list", chip: "Taboo: customer-data-egress" },
  // 16:18-22 slack burst
  { id: "e007", ts: "16:22:04", source: "slack",        surface: "internal", actor: "Curtis L",   summary: "#design — 'pushed v3 mocks, ready for review'", chip: "#design" },
  { id: "e008", ts: "16:21:38", source: "slack",        surface: "internal", actor: "Curtis L",   summary: "#design — 'pricing tile copy needs another pass'", chip: "#design" },
  { id: "e009", ts: "16:18:52", source: "slack",        surface: "internal", actor: "Keenan O",   summary: "#eng — 'agent api keys rotated, no downstream errors'", chip: "#eng" },
  { id: "e010", ts: "16:18:40", source: "slack",        surface: "internal", actor: "Keenan O",   summary: "#eng — 'Metacron deploy green, 412ms p95'", chip: "#eng" },
  // 15:58 ledger
  { id: "e011", ts: "15:58:22", source: "ledger_write", surface: "internal", actor: "Curtis L",   summary: "Decision logged: Helix terms — 12-month, $48k ACV, 90-day out", chip: "kind=customer_promise" },
  // 15:21 vault
  { id: "e012", ts: "15:21:00", source: "audit_log",    surface: "internal", actor: "auto",       summary: "Vault doc 'Pricing FAQ' marked stale (90+ days untouched)", chip: "decay-sweep" },
  // 14:48 agent
  { id: "e013", ts: "14:48:11", source: "agent_run",    surface: "metacron", actor: "Metacron",   summary: "Customer health sweep — 3 accounts shifted (1 expand, 2 stable)", chip: "Health-monitor" },
  // 14:30-32 call burst
  { id: "e014", ts: "14:30:14", source: "call",         surface: "sales",    actor: "Curtis L",   summary: "Helix design review — 28m, transcript ingested, 2 action items extracted", chip: "Helix · 28m" },
  // 13:00-13:55 sync
  { id: "e015", ts: "13:55:10", source: "ledger_write", surface: "internal", actor: "auto",       summary: "Decision logged from weekly sync: prioritize Pathfinder pricing v3 over Marketing relaunch", chip: "kind=architectural_decision" },
  { id: "e016", ts: "13:00:00", source: "call",         surface: "internal", actor: "Kyle B",     summary: "Weekly sync — Kyle, Keenan, Curtis · 60m, 4 decisions, 7 action items extracted", chip: "Weekly · 60m" },
  // 12:14 kanban
  { id: "e017", ts: "12:14:00", source: "kanban_move",  surface: "pathfinder", actor: "Curtis L",  summary: "WK-237 'Draft launch post for Pathfinder v3' moved Backlog → In progress", chip: "Pathfinder kanban" },
  { id: "e018", ts: "12:13:18", source: "kanban_move",  surface: "pathfinder", actor: "Curtis L",  summary: "WK-241 'Reply to Zenith Labs proposal' assigned to Kyle B", chip: "Pathfinder kanban" },
  // 11:30 email
  { id: "e019", ts: "11:30:14", source: "email",        surface: "sales",    actor: "Maya I",     summary: "Outbound — Northwind expansion proposal sent (3 attachments)", chip: "Northwind · expansion" },
  // 10:30 call
  { id: "e020", ts: "10:30:00", source: "call",         surface: "sales",    actor: "Maya I",     summary: "Northwind expansion — 30m, soft commitment to 30 seats, action: send tiered proposal", chip: "Northwind · 30m" },
  // 09:14-22 metacron
  { id: "e021", ts: "09:22:08", source: "agent_run",    surface: "metacron", actor: "Metacron",   summary: "Architect proposed: add long-context model fallback for Ranker (−18% latency p95)", chip: "Metacron · proposal" },
  { id: "e022", ts: "09:14:31", source: "agent_run",    surface: "metacron", actor: "Metacron",   summary: "Verifier batch run — 412 leads ranked, 94% accuracy", chip: "Pathfinder · Ranker" },
  // 08:00 digest
  { id: "e023", ts: "08:00:00", source: "agent_run",    surface: "metacron", actor: "Analyst",    summary: "Daily digest published for May 6", chip: "Analyst · daily-digest" },
  { id: "e024", ts: "06:00:00", source: "agent_run",    surface: "metacron", actor: "Analyst",    summary: "Nightly Memory rollup — analyst/2026-05-06.md created", chip: "Analyst · memory" },
];

const V3ActChipFilter = ({ items, selected, onToggle, render }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
    {items.map(it => {
      const id = it.id || it;
      const label = it.label || it;
      const isOn = selected.includes(id);
      return (
        <button key={id} onClick={() => onToggle(id)} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 10px", borderRadius: 999,
          fontSize: 12, fontWeight: 500,
          background: isOn ? "var(--v3-rail)" : "transparent",
          color:      isOn ? "#FFF"           : "var(--v3-ink-md)",
          border: `1px solid ${isOn ? "var(--v3-rail)" : "var(--v3-line-strong)"}`,
          transition: "all 120ms",
          cursor: "pointer",
        }}>
          {render && render(it, isOn)}
          {label}
        </button>
      );
    })}
  </div>
);

const V3SourceIcon = ({ source }) => {
  const cfg = V3_ACT_SOURCES.find(s => s.id === source);
  const color = cfg?.color || "#94A3B8";
  return (
    <span style={{
      width: 22, height: 22, borderRadius: 6,
      background: color + "1A",
      color, display: "inline-flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color }}/>
    </span>
  );
};

const V3ActivityRow = ({ ev, expanded, onToggle }) => {
  const sourceCfg = V3_ACT_SOURCES.find(s => s.id === ev.source);
  return (
    <div style={{ borderBottom: "1px solid var(--v3-line-soft)" }}>
      <button onClick={onToggle} style={{
        width: "100%", display: "grid",
        gridTemplateColumns: "78px 28px 1fr auto",
        alignItems: "center", gap: 14,
        padding: "12px 18px",
        background: expanded ? "rgba(46,108,212,0.04)" : "transparent",
        cursor: "pointer", textAlign: "left",
      }}>
        <span className="mono" style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>{ev.ts}</span>
        <V3SourceIcon source={ev.source}/>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: "var(--v3-ink)", lineHeight: 1.4 }}>{ev.summary}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: sourceCfg?.color || "var(--v3-ink-lo)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
              {sourceCfg?.label || ev.source}
            </span>
            <span style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>·</span>
            <span style={{ fontSize: 11, color: "var(--v3-ink-md)" }}>{ev.chip}</span>
            <span style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>·</span>
            <span style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", letterSpacing: 0.4 }}>{ev.surface}</span>
          </div>
        </div>
        <I.ChevronD size={14} style={{ color: "var(--v3-ink-lo)", transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 120ms" }}/>
      </button>
      {expanded && (
        <div style={{ padding: "8px 18px 18px 138px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{
            background: "var(--v3-bg)", borderRadius: 8, padding: "12px 14px",
            border: "1px solid var(--v3-line-soft)",
            fontSize: 12.5, color: "var(--v3-ink-md)", lineHeight: 1.5, fontFamily: "monospace",
          }}>
            <div style={{ color: "var(--v3-ink-lo)", marginBottom: 4 }}>// payload</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{`{
  "event_id":   "${ev.id}",
  "ts":         "2026-05-07T${ev.ts}-07:00",
  "source":     "${ev.source}",
  "surface":    "${ev.surface}",
  "actor":      "${ev.actor}",
  "summary":    "${ev.summary.replace(/"/g, '\\"')}",
  "evidence":   "vault/ledger/${ev.id}.md",
  "ledger_row": "ledger_${ev.id}"
}`}</pre>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{
              padding: "6px 12px", fontSize: 12, fontWeight: 500,
              background: "var(--v3-surface)", color: "var(--v3-ink-md)",
              border: "1px solid var(--v3-line-strong)", borderRadius: 6,
            }}>Open evidence</button>
            <button style={{
              padding: "6px 12px", fontSize: 12, fontWeight: 500,
              background: "var(--v3-surface)", color: "var(--v3-ink-md)",
              border: "1px solid var(--v3-line-strong)", borderRadius: 6,
            }}>Related ledger row</button>
            <button style={{
              padding: "6px 12px", fontSize: 12, fontWeight: 500,
              background: "var(--v3-surface)", color: "var(--v3-ink-md)",
              border: "1px solid var(--v3-line-strong)", borderRadius: 6,
            }}>Copy payload</button>
          </div>
        </div>
      )}
    </div>
  );
};

const V3NowActivity = () => {
  const [timeframe, setTimeframe] = React.useState("24h");
  const [sources, setSources]     = React.useState(V3_ACT_SOURCES.map(s => s.id));
  const [dris, setDris]           = React.useState(V3_ACT_DRIS);
  const [surfaces, setSurfaces]   = React.useState(V3_ACT_SURFACES);
  const [expanded, setExpanded]   = React.useState(new Set());
  const [visible, setVisible]     = React.useState(20);

  const toggle = (set, setter) => (id) => {
    if (set.includes(id)) setter(set.filter(x => x !== id));
    else setter([...set, id]);
  };

  const filtered = V3_ACT_FEED.filter(e =>
    sources.includes(e.source) && dris.includes(e.actor) && surfaces.includes(e.surface)
  );

  // Group consecutive same-source rows >2 in a row
  const grouped = [];
  let i = 0;
  while (i < filtered.length) {
    const run = [filtered[i]];
    while (i + run.length < filtered.length && filtered[i + run.length].source === filtered[i].source) run.push(filtered[i + run.length]);
    if (run.length >= 3) grouped.push({ kind: "group", events: run });
    else run.forEach(e => grouped.push({ kind: "single", event: e }));
    i += run.length;
  }

  const slice = grouped.slice(0, visible);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header row */}
      <div style={{
        background: "var(--v3-surface)", borderRadius: 12,
        boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
        padding: "18px 22px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--v3-ink)", margin: 0, letterSpacing: -0.3 }}>All activity</h2>
            <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>{filtered.length} events · 24h window</span>
            <V3DemoTag/>
          </div>
          <div style={{ display: "flex", gap: 4, background: "var(--v3-bg)", border: "1px solid var(--v3-line-soft)", borderRadius: 7, padding: 3 }}>
            {[
              { id: "1h",  label: "Last hour" },
              { id: "24h", label: "24h" },
              { id: "7d",  label: "7d" },
              { id: "custom", label: "Custom…" },
            ].map(t => (
              <button key={t.id} onClick={() => setTimeframe(t.id)} style={{
                padding: "6px 12px", fontSize: 12, fontWeight: 500, borderRadius: 5,
                background: timeframe === t.id ? "var(--v3-surface)" : "transparent",
                color: timeframe === t.id ? "var(--v3-ink)" : "var(--v3-ink-md)",
                boxShadow: timeframe === t.id ? "0 1px 2px rgba(11,21,48,0.08)" : "none",
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.6, minWidth: 64, paddingTop: 6 }}>Source</span>
            <V3ActChipFilter
              items={V3_ACT_SOURCES} selected={sources} onToggle={toggle(sources, setSources)}
              render={(it, on) => <span style={{ width: 7, height: 7, borderRadius: 999, background: it.color, opacity: on ? 1 : 0.6 }}/>}
            />
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.6, minWidth: 64, paddingTop: 6 }}>DRI</span>
            <V3ActChipFilter items={V3_ACT_DRIS} selected={dris} onToggle={toggle(dris, setDris)}/>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.6, minWidth: 64, paddingTop: 6 }}>Surface</span>
            <V3ActChipFilter items={V3_ACT_SURFACES} selected={surfaces} onToggle={toggle(surfaces, setSurfaces)}/>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div style={{
        background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden",
        boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
      }}>
        {slice.map((node, idx) => {
          if (node.kind === "single") {
            const ev = node.event;
            return (
              <V3ActivityRow key={ev.id} ev={ev}
                expanded={expanded.has(ev.id)}
                onToggle={() => {
                  const next = new Set(expanded);
                  if (next.has(ev.id)) next.delete(ev.id); else next.add(ev.id);
                  setExpanded(next);
                }}/>
            );
          }
          // group: show first + collapse rest
          const [first, ...rest] = node.events;
          const groupKey = `group-${first.id}`;
          const groupOpen = expanded.has(groupKey);
          return (
            <React.Fragment key={groupKey}>
              <V3ActivityRow ev={first}
                expanded={expanded.has(first.id)}
                onToggle={() => {
                  const next = new Set(expanded);
                  if (next.has(first.id)) next.delete(first.id); else next.add(first.id);
                  setExpanded(next);
                }}/>
              {!groupOpen ? (
                <button onClick={() => {
                  const next = new Set(expanded); next.add(groupKey); setExpanded(next);
                }} style={{
                  width: "100%", padding: "10px 18px 10px 138px",
                  fontSize: 12, color: "var(--v3-blue)", fontWeight: 500, textAlign: "left",
                  borderBottom: "1px solid var(--v3-line-soft)",
                  background: "var(--v3-bg)",
                  cursor: "pointer",
                }}>
                  {rest.length} more {V3_ACT_SOURCES.find(s => s.id === first.source)?.label.toLowerCase()} events ↓
                </button>
              ) : rest.map(ev => (
                <V3ActivityRow key={ev.id} ev={ev}
                  expanded={expanded.has(ev.id)}
                  onToggle={() => {
                    const next = new Set(expanded);
                    if (next.has(ev.id)) next.delete(ev.id); else next.add(ev.id);
                    setExpanded(next);
                  }}/>
              ))}
            </React.Fragment>
          );
        })}
        {visible < grouped.length && (
          <button onClick={() => setVisible(v => v + 20)} style={{
            width: "100%", padding: "14px",
            fontSize: 13, fontWeight: 500, color: "var(--v3-blue)",
            background: "var(--v3-bg)", borderTop: "1px solid var(--v3-line-soft)",
            cursor: "pointer",
          }}>
            Older ↓
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================
// DIGEST (canonical analyst daily digest)
// ============================================================

const V3_DIGEST_BY_DATE = {
  "2026-05-06": {
    date:    "Tuesday, May 6, 2026",
    summary: "Yesterday Unicron ingested 4 calls, shipped 2 PRs to Sprint 3, and Taboo Keeper bounced 1 outbound email about military contracts. Curtis L drove design decisions on Pathfinder pricing v3; Maya I closed soft commit with Northwind on 30 seats. 3 vault docs aged into stale.",
    sections: [
      { id: "calls",    title: "Calls ingested",     count: 4,
        items: [
          { ts: "10:30",  title: "Northwind expansion",  who: "Maya I",   dur: "30m" },
          { ts: "13:00",  title: "Weekly sync",          who: "Kyle, Keenan, Curtis", dur: "60m" },
          { ts: "14:30",  title: "Helix design review",  who: "Curtis L", dur: "28m" },
          { ts: "16:14",  title: "Zenith Labs intro",    who: "Kyle B",   dur: "22m" },
        ]},
      { id: "actions",  title: "Action items created", count: 12,
        breakdown: [
          { who: "Kyle B",   count: 5 },
          { who: "Curtis L", count: 3 },
          { who: "Keenan O", count: 2 },
          { who: "Maya I",   count: 2 },
        ]},
      { id: "prs",      title: "PRs merged", count: 2,
        items: [
          { sha: "a3f7c2", title: "ranker: long-context fallback for token-rich leads",  repo: "pathfinder" },
          { sha: "8b1e44", title: "metacron: rotate agent api keys, drop deprecated route", repo: "infra"  },
        ]},
      { id: "taboos",   title: "Taboo bounces", count: 1,
        items: [
          { taboo: "outreach-military", what: "Outbound to Northrop Grumman blocked", action: "Escalated to Kyle for review · escalation-9241" },
        ]},
      { id: "decay",    title: "Decay", count: 3,
        clusters: [
          { topic: "Pricing FAQ",     last: "Feb 4",  signals: 8 },
          { topic: "ICP v1",          last: "Jan 18", signals: 5 },
          { topic: "Onboarding",      last: "Feb 11", signals: 4 },
        ]},
      { id: "sprints",  title: "Sprints state",
        states: [
          { label: "In-flight",     v: 7,  color: "var(--v3-blue)" },
          { label: "Deployed today",v: 2,  color: "var(--v3-green)" },
          { label: "Blocked",       v: 1,  color: "var(--v3-red)"  },
        ]},
      { id: "signals",  title: "Customer signals",
        items: [
          { who: "Northwind",  signal: "Engagement spike",  detail: "Soft commit on 30 seats; expansion proposal sent" },
          { who: "Helix",      signal: "At-risk",           detail: "Renewal in 14 days · Maya last contacted 4 days ago" },
          { who: "Zenith Labs",signal: "New",               detail: "Intro call · proposal expected Friday" },
        ]},
    ]
  }
};

const V3DigestSection = ({ section }) => {
  const headerCommon = (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0, display: "flex", alignItems: "baseline", gap: 10 }}>
        {section.title}
        {section.count != null && (
          <span className="display" style={{ fontSize: 24, color: "var(--v3-ink)", fontWeight: 500 }}>{section.count}</span>
        )}
      </h3>
      <a style={{ fontSize: 12, color: "var(--v3-blue)", fontWeight: 500, cursor: "pointer" }}>
        Read full Analyst entry →
      </a>
    </div>
  );

  return (
    <section style={{
      background: "var(--v3-surface)", borderRadius: 12, padding: "20px 24px",
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    }}>
      {headerCommon}
      {section.items && section.id === "calls" && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {section.items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 14, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)", cursor: "pointer" }}>
              <span className="mono" style={{ fontSize: 13, color: "var(--v3-ink-md)", minWidth: 48 }}>{it.ts}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, color: "var(--v3-ink)" }}>{it.title}</div>
                <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 2 }}>{it.who} · {it.dur}</div>
              </div>
              <I.ArrowR size={14} style={{ color: "var(--v3-ink-lo)", marginTop: 4 }}/>
            </div>
          ))}
        </div>
      )}
      {section.breakdown && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {section.breakdown.map((b, i) => {
            const max = Math.max(...section.breakdown.map(x => x.count));
            const w = (b.count / max) * 100;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar name={b.who} size={20}/>
                <span style={{ fontSize: 13, color: "var(--v3-ink)", minWidth: 72 }}>{b.who}</span>
                <div style={{ flex: 1, height: 6, background: "var(--v3-line-soft)", borderRadius: 999 }}>
                  <div style={{ width: `${w}%`, height: "100%", background: "var(--v3-blue)", borderRadius: 999 }}/>
                </div>
                <span className="mono" style={{ fontSize: 13, color: "var(--v3-ink-md)", fontWeight: 600, minWidth: 24, textAlign: "right" }}>{b.count}</span>
              </div>
            );
          })}
        </div>
      )}
      {section.items && section.id === "prs" && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {section.items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 14, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)", alignItems: "center" }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--v3-ink-lo)", background: "var(--v3-bg)", padding: "3px 8px", borderRadius: 5, minWidth: 64, textAlign: "center" }}>{it.sha}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, color: "var(--v3-ink)" }}>{it.title}</div>
                <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.4 }}>{it.repo}</div>
              </div>
              <I.Github size={14} style={{ color: "var(--v3-ink-lo)" }}/>
            </div>
          ))}
        </div>
      )}
      {section.items && section.id === "taboos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {section.items.map((it, i) => (
            <div key={i} style={{ background: "rgba(209,72,72,0.04)", border: "1px solid rgba(209,72,72,0.18)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--v3-red)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{it.taboo}</div>
              <div style={{ fontSize: 13.5, color: "var(--v3-ink)" }}>{it.what}</div>
              <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 4 }}>{it.action}</div>
            </div>
          ))}
        </div>
      )}
      {section.clusters && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {section.clusters.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 14, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, color: "var(--v3-ink)" }}>{c.topic}</div>
                <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 2 }}>last touched {c.last}</div>
              </div>
              <span className="mono" style={{ fontSize: 12, color: "var(--v3-amber)", fontWeight: 600 }}>{c.signals} stale signals</span>
            </div>
          ))}
        </div>
      )}
      {section.states && (
        <div style={{ display: "flex", gap: 16 }}>
          {section.states.map((s, i) => (
            <div key={i} style={{ flex: 1, padding: "14px 16px", background: "var(--v3-bg)", borderRadius: 8, borderLeft: `3px solid ${s.color}` }}>
              <div className="display" style={{ fontSize: 28, fontWeight: 500, color: "var(--v3-ink)", lineHeight: 1, letterSpacing: -0.5 }}>{s.v}</div>
              <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}
      {section.items && section.id === "signals" && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {section.items.map((it, i) => {
            const tone = it.signal === "Engagement spike" ? "ok" : it.signal === "At-risk" ? "warn" : "info";
            return (
              <div key={i} style={{ display: "flex", gap: 14, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)" }}>
                <V3StatusPill tone={tone}>{it.signal}</V3StatusPill>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, color: "var(--v3-ink)" }}>{it.who}</div>
                  <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 2 }}>{it.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

const V3NowDigest = () => {
  const [date, setDate] = React.useState("2026-05-06");
  const digest = V3_DIGEST_BY_DATE[date] || V3_DIGEST_BY_DATE["2026-05-06"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header + date picker + narrative */}
      <div style={{
        background: "var(--v3-surface)", borderRadius: 12, padding: "22px 26px",
        boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--v3-orange)", fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>Analyst · Daily digest</div>
            <h2 className="display" style={{ fontSize: 28, fontWeight: 500, color: "var(--v3-ink)", margin: "4px 0 0", letterSpacing: -0.4 }}>{digest.date}</h2>
            <div style={{ fontSize: 12, color: "var(--v3-ink-lo)", marginTop: 4 }}>Regenerated nightly at 06:00 PT · vault/Memory/analyst/{date}.md</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <V3DemoTag/>
            <button onClick={() => {
              const d = new Date(date); d.setDate(d.getDate() - 1);
              setDate(d.toISOString().slice(0,10));
            }} style={{
              padding: "7px 9px", border: "1px solid var(--v3-line-strong)", borderRadius: 6,
              background: "var(--v3-surface)", color: "var(--v3-ink-md)",
            }}><I.ChevronL size={12}/></button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{
              padding: "6px 10px", fontSize: 12, fontFamily: "inherit",
              background: "var(--v3-surface)", color: "var(--v3-ink)",
              border: "1px solid var(--v3-line-strong)", borderRadius: 6,
            }}/>
            <button onClick={() => {
              const d = new Date(date); d.setDate(d.getDate() + 1);
              setDate(d.toISOString().slice(0,10));
            }} style={{
              padding: "7px 9px", border: "1px solid var(--v3-line-strong)", borderRadius: 6,
              background: "var(--v3-surface)", color: "var(--v3-ink-md)",
            }}><I.ChevronR size={12}/></button>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--v3-ink-md)", fontFamily: "Geist, Inter Tight, sans-serif" }}>
          {digest.summary}
        </p>
      </div>

      {/* Sections grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {digest.sections.map(s => <V3DigestSection key={s.id} section={s}/>)}
      </div>
    </div>
  );
};

window.V3NowActivity = V3NowActivity;
window.V3NowDigest = V3NowDigest;
