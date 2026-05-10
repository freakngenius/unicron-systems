/* v3-voice.jsx
   Voice System integration — assets, helpers, and System → Voice sub-tab.
   Voice is not a sidecar: voice agents sit in the same registry as Orchestrator,
   Analyst, Elder; voice calls sit in the same Calls view as Plaud and Fathom. */

// ---------- Phone glyph (brand orange, used everywhere voice appears) ----------
const VoicePhone = ({ size = 14, color = "#E8763A", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);

// ---------- GatedAction wrapper (validation indicator before commit) ----------
// Wrap interactive elements that touch a refusal-gated path. Shows a small
// running indicator for ~800ms, then commits. If `taboo` evaluates truthy,
// renders the bounce inline.
const V3GatedAction = ({ children, onCommit, taboo, label = "Validating", delay = 800 }) => {
  const [state, setState] = React.useState("idle"); // idle | validating | bounced | done
  const fire = (e) => {
    e?.preventDefault?.(); e?.stopPropagation?.();
    if (state === "validating") return;
    setState("validating");
    setTimeout(() => {
      if (taboo) { setState("bounced"); setTimeout(() => setState("idle"), 2400); return; }
      setState("done");
      onCommit?.();
      setTimeout(() => setState("idle"), 900);
    }, delay);
  };
  // Clone the trigger element and intercept its click
  const trigger = React.cloneElement(children, { onClick: fire });
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      {trigger}
      {state === "validating" && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 11, color: "var(--v3-amber)",
          background: "rgba(232,158,58,0.10)", padding: "2px 7px", borderRadius: 4,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: 999, background: "var(--v3-amber)",
            animation: "v3pulse 0.8s ease-in-out infinite",
          }}/>
          {label}…
        </span>
      )}
      {state === "done" && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 11, color: "var(--v3-green)",
          background: "rgba(31,138,91,0.10)", padding: "2px 7px", borderRadius: 4,
        }}>
          <I.Check size={9}/> Committed
        </span>
      )}
      {state === "bounced" && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 11, color: "var(--v3-red)",
          background: "rgba(209,72,72,0.10)", padding: "2px 7px", borderRadius: 4,
        }}>
          <I.X size={9}/> Bounced — {typeof taboo === "string" ? taboo : "taboo violation"}
        </span>
      )}
    </span>
  );
};

// ---------- Demo data ----------
const V3_VOICE_OFFICES = [
  { id: "off-1", name: "Harris County Flood Control District", phone: "+1 (713) 684-4000", city: "Houston, TX", customer: "zedcor", cron: "0 10 1 * *",       cron_summary: "1st of month · 10:00 CT", window: 30, last_pull: "Apr 1 · 10:01", projects_sourced: 14, attempts: 27, why: "Largest infra spend in Harris county", disclosure: "Hi, this is Marie from Zedcor — I'm calling about your published procurement bids." },
  { id: "off-2", name: "City of Houston Public Works",          phone: "+1 (832) 393-9100", city: "Houston, TX", customer: "zedcor", cron: "0 10 1,15 * *",    cron_summary: "1st & 15th · 10:00 CT", window: 14, last_pull: "May 1 · 10:01", projects_sourced: 8,  attempts: 22, why: "Frequent bid cycles", disclosure: "Hi, this is Marie from Zedcor — I'm calling about your published procurement bids." },
  { id: "off-3", name: "Phoenix Procurement",                   phone: "+1 (602) 262-7181", city: "Phoenix, AZ", customer: "zedcor", cron: "0 10 1 * *",       cron_summary: "1st of month · 10:00 PT", window: 30, last_pull: "May 1 · 10:01", projects_sourced: 6,  attempts: 11, why: "New AZ market entry", disclosure: "Hi, this is Marie from Zedcor — I'm calling about your published procurement bids." },
  { id: "off-4", name: "Tucson Streets Dept",                   phone: "+1 (520) 791-3154", city: "Tucson, AZ",  customer: "zedcor", cron: "0 10 5 * *",       cron_summary: "5th of month · 10:00 PT", window: 30, last_pull: "May 5 · 10:02", projects_sourced: 3,  attempts: 7,  why: "Companion to Phoenix",     disclosure: "Hi, this is Marie from Zedcor — I'm calling about your published procurement bids." },
  { id: "off-5", name: "Reno Capital Projects",                 phone: "+1 (775) 334-2350", city: "Reno, NV",    customer: "zedcor", cron: "0 11 1 * *",       cron_summary: "1st of month · 11:00 PT", window: 30, last_pull: "—",            projects_sourced: 0,  attempts: 1,  why: "Pilot — activating",       disclosure: "Hi, this is Marie from Zedcor — I'm calling about your published procurement bids." },
  { id: "off-6", name: "Albuquerque Public Works",              phone: "+1 (505) 768-3500", city: "Albuquerque, NM", customer: "realberry", cron: "0 9 1 * *",  cron_summary: "1st of month · 09:00 MT", window: 30, last_pull: "May 1 · 09:00", projects_sourced: 2, attempts: 4,  why: "Initial Realberry outreach", disclosure: "Hi, I'm with Realberry — calling about your current procurement schedule." },
];

const V3_VOICE_CONFIGS = [
  { id: "cfg-1", customer: "zedcor",    caller_brand: "Marie (Zedcor SDR)", offices: ["off-1","off-2"], cron_summary: "1st of month · 10:00 CT", last_success: "May 1 · 10:01", monthly_burn: 142.30, active: true  },
  { id: "cfg-2", customer: "zedcor",    caller_brand: "Marie (Zedcor SDR)", offices: ["off-3","off-4"], cron_summary: "1st & 5th · 10:00 PT",   last_success: "May 5 · 10:02", monthly_burn: 88.10,  active: true  },
  { id: "cfg-3", customer: "zedcor",    caller_brand: "Marie (Zedcor SDR)", offices: ["off-5"],         cron_summary: "1st of month · 11:00 PT", last_success: "—",             monthly_burn: 0.0,    active: false },
  { id: "cfg-4", customer: "realberry", caller_brand: "Tom (Realberry rep)", offices: ["off-6"],        cron_summary: "1st of month · 09:00 MT", last_success: "May 1 · 09:00", monthly_burn: 34.20,  active: true  },
];

const V3_VOICE_LIVE = [
  { id: "lv-1", caller_brand: "Marie (Zedcor SDR)", office: "Harris County Flood Control District", agent: "Procurement Pull", status: "in-conversation", duration: 184 },
  { id: "lv-2", caller_brand: "Tom (Realberry rep)", office: "Albuquerque Public Works",            agent: "Procurement Pull", status: "ringing",         duration: 12 },
  { id: "lv-3", caller_brand: "Pathfinder SDR",     office: "—",                                   agent: "SDR Outbound",     status: "queued",          duration: 0 },
];

const V3_VAPI_ASSISTANTS = [
  { id: "asst_marie_zedcor",      name: "Marie · Zedcor SDR",     model: "Claude Sonnet 4.5", voice: "EL_voice_marie_warm",   variables: ["target_office","disclosure_text","why_priority","caller_first_name"], persistent_id: "asst_01HG7QXB2K..." },
  { id: "asst_tom_realberry",     name: "Tom · Realberry SDR",    model: "Claude Sonnet 4.5", voice: "EL_voice_tom_neutral",  variables: ["target_office","disclosure_text","caller_first_name"],                persistent_id: "asst_01HG7R8N9M..." },
  { id: "asst_discovery_inbound", name: "Discovery (inbound)",    model: "Claude Sonnet 4.5", voice: "EL_voice_neutral_pro",  variables: ["caller_phone","customer_brand"],                                       persistent_id: "asst_01HG7T2P4Q..." },
  { id: "asst_pf_sdr",            name: "Pathfinder SDR",         model: "Claude Sonnet 4.5", voice: "EL_voice_alex_calm",    variables: ["target_prospect","value_prop","first_name"],                            persistent_id: "asst_01HG7V0R6S..." },
];

const V3_VOICE_SOURCES = [
  { id: "src-1", name: "procurement_offices",  type: "procurement_office", status: "active",   configs: 3 },
  { id: "src-2", name: "sdr_prospects_q2",     type: "sdr_database",       status: "active",   configs: 1 },
  { id: "src-3", name: "discovery_inbound",    type: "discovery_inbound",  status: "active",   configs: 0 },
  { id: "src-4", name: "sdr_prospects_q1",     type: "sdr_database",       status: "archived", configs: 0 },
];

const V3_VOICE_ATTEMPTS = [
  { id: "att-1041", ts: "May 7 · 14:30", office: "Harris County FCD",         config: "cfg-1", status: "completed",  duration: "4m 32s", cost: 1.84, structured: true,  bounce: null },
  { id: "att-1040", ts: "May 7 · 14:24", office: "Albuquerque Public Works",  config: "cfg-4", status: "completed",  duration: "2m 11s", cost: 0.92, structured: true,  bounce: null },
  { id: "att-1039", ts: "May 7 · 13:18", office: "City of Houston PW",        config: "cfg-1", status: "failed",     duration: "0m 08s", cost: 0.05, structured: false, bounce: null,                                error: "no_answer" },
  { id: "att-1038", ts: "May 7 · 11:02", office: "Tucson Streets Dept",       config: "cfg-2", status: "completed",  duration: "3m 47s", cost: 1.61, structured: true,  bounce: null },
  { id: "att-1037", ts: "May 7 · 10:58", office: "Reno Capital Projects",     config: "cfg-3", status: "dispatched", duration: "—",      cost: 0.00, structured: false, bounce: "no_consent_recorded" },
  { id: "att-1036", ts: "May 7 · 10:01", office: "Phoenix Procurement",       config: "cfg-2", status: "completed",  duration: "5m 02s", cost: 2.08, structured: true,  bounce: null },
  { id: "att-1035", ts: "May 6 · 14:30", office: "Harris County FCD",         config: "cfg-1", status: "completed",  duration: "3m 19s", cost: 1.42, structured: true,  bounce: null },
  { id: "att-1034", ts: "May 6 · 13:30", office: "City of Houston PW",        config: "cfg-1", status: "completed",  duration: "4m 05s", cost: 1.71, structured: true,  bounce: null },
  { id: "att-1033", ts: "May 5 · 10:02", office: "Tucson Streets Dept",       config: "cfg-2", status: "completed",  duration: "3m 12s", cost: 1.34, structured: true,  bounce: null },
  { id: "att-1032", ts: "May 5 · 09:58", office: "Phoenix Procurement",       config: "cfg-2", status: "pending",    duration: "—",      cost: 0.00, structured: false, bounce: null },
];

// ============================================================
// HEADER
// ============================================================
const V3VoiceHeader = ({ customer, setCustomer }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
    <h2 style={{ fontSize: 24, fontWeight: 600, color: "var(--v3-ink)", margin: 0, letterSpacing: -0.4, display: "flex", alignItems: "center", gap: 10 }}>
      <VoicePhone size={20}/> Voice
    </h2>
    <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>Configs · live calls · assistants · attempts</span>
    <V3DemoTag/>
    <div style={{ flex: 1 }}/>
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12, color: "var(--v3-ink-md)", fontWeight: 500 }}>Customer</span>
      <select value={customer} onChange={e => setCustomer(e.target.value)} style={{
        padding: "7px 10px", fontSize: 13, fontFamily: "inherit", color: "var(--v3-ink)",
        background: "var(--v3-surface)", border: "1px solid var(--v3-line-strong)", borderRadius: 6,
      }}>
        <option value="all">All</option>
        <option value="zedcor">Zedcor</option>
        <option value="realberry">Realberry</option>
        <option value="northwind">Northwind</option>
      </select>
    </label>
    <V3GatedAction onCommit={() => alert("New config flow")} label="Validating">
      <button style={{
        display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 12px",
        background: "var(--v3-ink)", color: "#FFF", borderRadius: 6, fontSize: 12, fontWeight: 500,
      }}>
        <I.Plus size={11}/> New config
      </button>
    </V3GatedAction>
  </div>
);

// ============================================================
// LIVE CALLS strip
// ============================================================
const V3VoiceLive = ({ calls }) => {
  const tone = (s) => s === "in-conversation" ? "ok" : s === "ringing" ? "info" : s === "queued" ? "neutral" : s === "ended" ? "neutral" : "warn";
  const [open, setOpen] = React.useState(null);
  return (
    <div style={{
      background: "var(--v3-surface)", borderRadius: 12, padding: 16,
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
      position: "sticky", top: 0, zIndex: 5,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--v3-ink)", margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--v3-green)", animation: "v3pulse 1.4s ease-in-out infinite" }}/>
          Live calls
        </h3>
        <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>{calls.length} in flight</span>
      </div>
      {calls.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--v3-ink-lo)", padding: "8px 0", fontStyle: "italic" }}>No calls in flight.</div>
      ) : (
        <div style={{ display: "flex", gap: 12, overflowX: "auto" }}>
          {calls.map(c => (
            <button key={c.id} onClick={() => setOpen(c.id)} style={{
              flex: "0 0 280px", textAlign: "left",
              padding: "12px 14px", borderRadius: 8,
              background: "var(--v3-bg)", border: "1px solid var(--v3-line-soft)",
              cursor: "pointer", display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--v3-ink)", display: "flex", alignItems: "center", gap: 6 }}>
                  <VoicePhone size={11}/> {c.caller_brand}
                </span>
                <V3StatusPill tone={tone(c.status)}>{c.status}</V3StatusPill>
              </div>
              <div style={{ fontSize: 12, color: "var(--v3-ink-md)", lineHeight: 1.4 }}>→ {c.office}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ color: "var(--v3-ink-lo)" }}>{c.agent}</span>
                <span className="mono" style={{ color: "var(--v3-ink-md)" }}>
                  {Math.floor(c.duration/60)}:{String(c.duration%60).padStart(2,"0")}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && (
        <div onClick={() => setOpen(null)} style={{
          position: "fixed", inset: 0, background: "rgba(11,21,48,0.32)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 520, background: "var(--v3-surface)", borderRadius: 12, padding: 24,
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--v3-ink)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <VoicePhone size={16}/> Mid-call observer
              </h3>
              <button onClick={() => setOpen(null)} style={{ padding: 6, color: "var(--v3-ink-lo)" }}><I.X size={14}/></button>
            </div>
            <div style={{
              padding: 14, borderRadius: 8, background: "var(--v3-bg)",
              fontSize: 12.5, color: "var(--v3-ink-md)", lineHeight: 1.6, fontStyle: "italic",
            }}>
              Streaming transcript view wires up post-Sprint 7. <br/>
              Will show live caption from Deepgram + agent response in alternating bubbles.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// CONFIGS table — row expands to per-office editor
// ============================================================
const V3VoiceConfigs = ({ configs, offices, customer }) => {
  const [expanded, setExpanded] = React.useState(null);
  const filtered = customer === "all" ? configs : configs.filter(c => c.customer === customer);

  return (
    <div style={{
      background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden",
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    }}>
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", alignItems: "baseline", gap: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Procurement pull configs</h3>
        <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>{filtered.length} configs · procurement_pull_configs table</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead style={{ background: "var(--v3-bg)" }}>
          <tr>
            {["Customer","Caller brand","Offices","Cron","Last success","Monthly","Active",""].map((h,i) => (
              <th key={i} style={{
                padding: "10px 18px", textAlign: i === 5 || i === 6 ? "right" : "left",
                fontSize: 11, fontWeight: 600, color: "var(--v3-ink-lo)",
                textTransform: "uppercase", letterSpacing: 0.5,
                borderBottom: "1px solid var(--v3-line-soft)",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(cfg => {
            const cfgOffices = offices.filter(o => cfg.offices.includes(o.id));
            const isOpen = expanded === cfg.id;
            return (
              <React.Fragment key={cfg.id}>
                <tr onClick={() => setExpanded(isOpen ? null : cfg.id)} style={{ cursor: "pointer", borderBottom: isOpen ? "none" : "1px solid var(--v3-line-soft)" }}>
                  <td style={{ padding: "12px 18px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--v3-ink)" }}>
                      <Avatar name={cfg.customer} size={20}/>
                      {cfg.customer.charAt(0).toUpperCase() + cfg.customer.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: "12px 18px", fontSize: 13, color: "var(--v3-ink-md)" }}>{cfg.caller_brand}</td>
                  <td style={{ padding: "12px 18px", fontSize: 13, color: "var(--v3-ink-md)" }}>{cfg.offices.length}</td>
                  <td style={{ padding: "12px 18px" }}>
                    <span className="mono" style={{ fontSize: 12, color: "var(--v3-ink-md)" }}>{cfg.cron_summary}</span>
                  </td>
                  <td style={{ padding: "12px 18px", fontSize: 12.5, color: "var(--v3-ink-md)" }}>{cfg.last_success}</td>
                  <td style={{ padding: "12px 18px", textAlign: "right" }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 500, color: "var(--v3-ink)" }}>${cfg.monthly_burn.toFixed(2)}</span>
                  </td>
                  <td style={{ padding: "12px 18px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                    <V3GatedAction onCommit={() => null} label="Updating">
                      <button style={{
                        position: "relative", width: 36, height: 20, borderRadius: 999,
                        background: cfg.active ? "var(--v3-green)" : "var(--v3-line-strong)",
                        cursor: "pointer", padding: 0,
                      }}>
                        <span style={{
                          position: "absolute", top: 2, left: cfg.active ? 18 : 2,
                          width: 16, height: 16, borderRadius: "50%", background: "#FFF",
                          transition: "left 200ms",
                        }}/>
                      </button>
                    </V3GatedAction>
                  </td>
                  <td style={{ padding: "12px 18px", textAlign: "right" }}>
                    <I.ChevronD size={12} style={{ color: "var(--v3-ink-lo)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 200ms" }}/>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan="8" style={{ padding: "0 18px 18px", background: "var(--v3-bg)", borderBottom: "1px solid var(--v3-line-soft)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
                        <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5 }}>
                          Offices in this config ({cfgOffices.length})
                        </div>
                        {cfgOffices.map(o => <V3OfficeEditor key={o.id} office={o}/>)}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// Per-office inline editor (used in config table AND Zedcor deep view)
const V3OfficeEditor = ({ office }) => {
  const [phone,        setPhone]        = React.useState(office.phone);
  const [cron,         setCron]         = React.useState(office.cron);
  const [windowDays,   setWindowDays]   = React.useState(office.window);
  const [why,          setWhy]          = React.useState(office.why);
  const [disclosure,   setDisclosure]   = React.useState(office.disclosure);
  return (
    <div style={{ background: "var(--v3-surface)", borderRadius: 8, padding: 14, border: "1px solid var(--v3-line-soft)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <VoicePhone size={12}/>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--v3-ink)" }}>{office.name}</span>
        <span style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>· {office.city}</span>
        <div style={{ flex: 1 }}/>
        <span style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>Last pull: {office.last_pull}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
        <V3FieldRow label="Phone">
          <input value={phone} onChange={e => setPhone(e.target.value)} className="mono" style={V3InputStyle}/>
        </V3FieldRow>
        <V3FieldRow label="Cron expression">
          <input value={cron} onChange={e => setCron(e.target.value)} className="mono" style={V3InputStyle}/>
        </V3FieldRow>
        <V3FieldRow label="Pull window (days)">
          <input value={windowDays} onChange={e => setWindowDays(e.target.value)} type="number" className="mono" style={V3InputStyle}/>
        </V3FieldRow>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <V3FieldRow label="Why priority">
          <input value={why} onChange={e => setWhy(e.target.value)} style={V3InputStyle}/>
        </V3FieldRow>
        <V3FieldRow label="Disclosure text">
          <input value={disclosure} onChange={e => setDisclosure(e.target.value)} style={V3InputStyle}/>
        </V3FieldRow>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
        <button style={{ fontSize: 12, color: "var(--v3-ink-lo)", padding: "6px 10px" }}>Cancel</button>
        <V3GatedAction onCommit={() => null} label="Validating cron">
          <button style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 12px", fontSize: 12, fontWeight: 500,
            background: "var(--v3-ink)", color: "#FFF", borderRadius: 5,
          }}>Save changes</button>
        </V3GatedAction>
      </div>
    </div>
  );
};

const V3InputStyle = {
  width: "100%", padding: "6px 9px", fontSize: 12,
  background: "var(--v3-bg)", border: "1px solid var(--v3-line-strong)",
  borderRadius: 5, fontFamily: "inherit", color: "var(--v3-ink)", outline: "none",
  boxSizing: "border-box",
};

const V3FieldRow = ({ label, children }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <span style={{ fontSize: 10.5, color: "var(--v3-ink-lo)", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.4 }}>{label}</span>
    {children}
  </label>
);

// ============================================================
// COLLAPSIBLE SECTION wrapper
// ============================================================
const V3VoiceCollapse = ({ title, count, defaultOpen = false, children }) => {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div style={{
      background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden",
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", padding: "16px 22px", textAlign: "left",
        display: "flex", alignItems: "center", gap: 10,
        background: "transparent", cursor: "pointer",
      }}>
        <I.ChevronD size={13} style={{ color: "var(--v3-ink-lo)", transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 200ms" }}/>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>{title}</h3>
        {count != null && <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>· {count}</span>}
      </button>
      {open && <div style={{ borderTop: "1px solid var(--v3-line-soft)" }}>{children}</div>}
    </div>
  );
};

// ============================================================
// ASSISTANTS panel
// ============================================================
const V3VoiceAssistants = () => {
  const [editing, setEditing] = React.useState(null);
  return (
    <V3VoiceCollapse title="Vapi assistants" count={V3_VAPI_ASSISTANTS.length} defaultOpen>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead style={{ background: "var(--v3-bg)" }}>
          <tr>
            {["Assistant","Model","Voice","Variables","Persistent ID",""].map((h,i) => (
              <th key={i} style={{
                padding: "10px 18px", textAlign: "left",
                fontSize: 11, fontWeight: 600, color: "var(--v3-ink-lo)",
                textTransform: "uppercase", letterSpacing: 0.5,
                borderBottom: "1px solid var(--v3-line-soft)",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {V3_VAPI_ASSISTANTS.map(a => (
            <tr key={a.id} style={{ borderBottom: "1px solid var(--v3-line-soft)" }}>
              <td style={{ padding: "12px 18px", fontSize: 13, fontWeight: 500, color: "var(--v3-ink)" }}>{a.name}</td>
              <td style={{ padding: "12px 18px", fontSize: 12, color: "var(--v3-ink-md)" }}>{a.model}</td>
              <td style={{ padding: "12px 18px" }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--v3-ink-md)" }}>{a.voice}</span>
              </td>
              <td style={{ padding: "12px 18px", fontSize: 11, color: "var(--v3-ink-lo)" }}>
                {a.variables.map((v,i) => (
                  <span key={i} className="mono" style={{
                    display: "inline-block", margin: "0 4px 2px 0",
                    padding: "1px 5px", borderRadius: 3,
                    background: "var(--v3-line-soft)", color: "var(--v3-ink-md)",
                  }}>{v}</span>
                ))}
              </td>
              <td style={{ padding: "12px 18px" }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>{a.persistent_id}</span>
              </td>
              <td style={{ padding: "12px 18px", textAlign: "right" }}>
                <button onClick={() => setEditing(a)} style={{
                  fontSize: 12, padding: "5px 10px", borderRadius: 5,
                  background: "var(--v3-bg)", border: "1px solid var(--v3-line-strong)", color: "var(--v3-ink-md)",
                }}>Edit JSON</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <V3JSONEditor assistant={editing} onClose={() => setEditing(null)}/>}
    </V3VoiceCollapse>
  );
};

const V3JSONEditor = ({ assistant, onClose }) => {
  const sampleJSON = JSON.stringify({
    name: assistant.name,
    model: { provider: "anthropic", model: "claude-sonnet-4-5", temperature: 0.4 },
    voice: { provider: "11labs", voiceId: assistant.voice, stability: 0.6, similarityBoost: 0.75 },
    transcriber: { provider: "deepgram", model: "nova-3", language: "en" },
    firstMessage: "Hi, this is {{caller_first_name}} from {{customer_brand}} — calling about your published procurement bids.",
    serverUrl: "https://atrium.unicron.systems/voice/webhook",
    variableValues: { target_office: "{{target_office}}", disclosure_text: "{{disclosure_text}}" },
    apiKey: "***NEVER_EXPOSED_TO_CLIENT***",
  }, null, 2);
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(11,21,48,0.35)",
      display: "flex", alignItems: "stretch", justifyContent: "flex-end", zIndex: 60,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 580, background: "var(--v3-surface)", height: "100%", overflow: "auto",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--v3-ink-lo)", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5 }}>Vapi assistant</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--v3-ink)", margin: "4px 0 0", letterSpacing: -0.2 }}>{assistant.name}</h3>
          </div>
          <button onClick={onClose} style={{ padding: 6, color: "var(--v3-ink-lo)" }}><I.X size={14}/></button>
        </div>
        <div style={{ padding: "18px 22px", flex: 1 }}>
          <div style={{
            background: "#0F1A33", color: "#E2E8F4", borderRadius: 8,
            padding: "16px 18px", fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap",
          }}>{sampleJSON}</div>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={onClose} style={{ fontSize: 12, padding: "8px 14px", color: "var(--v3-ink-md)" }}>Cancel</button>
            <V3GatedAction onCommit={onClose} label="Validating">
              <button style={{
                fontSize: 12, fontWeight: 500, padding: "8px 14px", borderRadius: 6,
                background: "var(--v3-ink)", color: "#FFF",
              }}>Save</button>
            </V3GatedAction>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SOURCES panel
// ============================================================
const V3VoiceSources = () => (
  <V3VoiceCollapse title="Sources" count={V3_VOICE_SOURCES.length}>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead style={{ background: "var(--v3-bg)" }}>
        <tr>
          {["Name","Type","Status","Configs"].map((h,i) => (
            <th key={i} style={{
              padding: "10px 18px", textAlign: "left",
              fontSize: 11, fontWeight: 600, color: "var(--v3-ink-lo)",
              textTransform: "uppercase", letterSpacing: 0.5,
              borderBottom: "1px solid var(--v3-line-soft)",
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {V3_VOICE_SOURCES.map(s => (
          <tr key={s.id} style={{ borderBottom: "1px solid var(--v3-line-soft)" }}>
            <td style={{ padding: "12px 18px", fontSize: 13, color: "var(--v3-ink)" }}>
              <span className="mono">{s.name}</span>
            </td>
            <td style={{ padding: "12px 18px", fontSize: 12 }}>
              <span style={{
                display: "inline-block", padding: "2px 7px", borderRadius: 999, fontSize: 10.5, fontWeight: 600,
                background: "var(--v3-line-soft)", color: "var(--v3-ink-md)", textTransform: "uppercase", letterSpacing: 0.4,
              }}>{s.type}</span>
            </td>
            <td style={{ padding: "12px 18px" }}>
              <V3StatusPill tone={s.status === "active" ? "ok" : "neutral"}>{s.status}</V3StatusPill>
            </td>
            <td style={{ padding: "12px 18px", fontSize: 13, color: "var(--v3-ink-md)" }}>{s.configs}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </V3VoiceCollapse>
);

// ============================================================
// CALL ATTEMPTS log
// ============================================================
const V3VoiceAttempts = () => {
  const [statusF, setStatusF] = React.useState("all");
  const filtered = V3_VOICE_ATTEMPTS.filter(a => statusF === "all" || a.status === statusF);
  const tone = (s) => s === "completed" ? "ok" : s === "failed" ? "err" : s === "dispatched" ? "info" : "warn";
  return (
    <V3VoiceCollapse title="Call attempts" count={V3_VOICE_ATTEMPTS.length}>
      <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", gap: 6 }}>
        {["all","pending","dispatched","completed","failed"].map(s => (
          <button key={s} onClick={() => setStatusF(s)} style={{
            padding: "5px 11px", fontSize: 11.5, fontWeight: 500, borderRadius: 999,
            background: statusF === s ? "var(--v3-ink)" : "transparent",
            color:      statusF === s ? "#FFF"          : "var(--v3-ink-md)",
            border: `1px solid ${statusF === s ? "var(--v3-ink)" : "var(--v3-line-strong)"}`,
            cursor: "pointer", textTransform: "capitalize",
          }}>{s}</button>
        ))}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead style={{ background: "var(--v3-bg)" }}>
          <tr>
            {["Timestamp","Office","Config","Status","Duration","Cost","Result"].map((h,i) => (
              <th key={i} style={{
                padding: "10px 18px", textAlign: i >= 4 ? "right" : "left",
                fontSize: 11, fontWeight: 600, color: "var(--v3-ink-lo)",
                textTransform: "uppercase", letterSpacing: 0.5,
                borderBottom: "1px solid var(--v3-line-soft)",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(a => (
            <tr key={a.id} style={{ borderBottom: "1px solid var(--v3-line-soft)" }}>
              <td style={{ padding: "10px 18px", fontSize: 12, color: "var(--v3-ink-md)" }}>{a.ts}</td>
              <td style={{ padding: "10px 18px", fontSize: 12.5, color: "var(--v3-ink)" }}>{a.office}</td>
              <td style={{ padding: "10px 18px" }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--v3-blue)", background: "rgba(46,108,212,0.10)", padding: "1px 6px", borderRadius: 3 }}>{a.config}</span>
              </td>
              <td style={{ padding: "10px 18px" }}>
                <V3StatusPill tone={tone(a.status)}>{a.status}</V3StatusPill>
              </td>
              <td style={{ padding: "10px 18px", textAlign: "right" }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--v3-ink-md)" }}>{a.duration}</span>
              </td>
              <td style={{ padding: "10px 18px", textAlign: "right" }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--v3-ink-md)" }}>${a.cost.toFixed(2)}</span>
              </td>
              <td style={{ padding: "10px 18px", textAlign: "right" }}>
                {a.bounce ? <V3StatusPill tone="err">{a.bounce}</V3StatusPill> :
                  a.structured ? <span style={{ fontSize: 11, color: "var(--v3-green)" }}>✓ structured_data</span> :
                  a.error ? <span style={{ fontSize: 11, color: "var(--v3-red)" }}>{a.error}</span> :
                  <span style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </V3VoiceCollapse>
  );
};

// ============================================================
// MAIN — V3VoiceSystemTab
// ============================================================
const V3VoiceSystemTab = () => {
  const [customer, setCustomer] = React.useState("all");
  const liveFiltered = customer === "all" ? V3_VOICE_LIVE : V3_VOICE_LIVE.filter(c => c.caller_brand.toLowerCase().includes(customer));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <V3VoiceHeader customer={customer} setCustomer={setCustomer}/>
      <V3VoiceLive calls={liveFiltered}/>
      <V3VoiceConfigs configs={V3_VOICE_CONFIGS} offices={V3_VOICE_OFFICES} customer={customer}/>
      <V3VoiceAssistants/>
      <V3VoiceSources/>
      <V3VoiceAttempts/>
    </div>
  );
};

// Expose to window for cross-file usage
Object.assign(window, {
  VoicePhone, V3GatedAction, V3VoiceSystemTab, V3OfficeEditor, V3VoiceCollapse,
  V3_VOICE_OFFICES, V3_VOICE_CONFIGS, V3_VOICE_LIVE, V3_VAPI_ASSISTANTS,
  V3_VOICE_SOURCES, V3_VOICE_ATTEMPTS,
});
