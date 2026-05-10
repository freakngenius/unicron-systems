/* v3-system.jsx — System tab: Agents, Taboos, Refusal log, Services, Decay,
   Memory, Scheduled jobs, Audit log, Continuity. Mounted from v3.jsx. */

// ---------- Demo data ----------
const V3_AGENTS = [
  // archetype: curator | sales | research | builder | guardian | operator
  { id: "curator-1", name: "Curator",        archetype: "curator",  status: "ok",   load: 64, runs: 412, role: "Vault hygiene + daily digest" },
  { id: "research-1",name: "Researcher",     archetype: "research", status: "ok",   load: 31, runs: 188, role: "Multi-source investigation" },
  { id: "research-2",name: "Trend Scout",    archetype: "research", status: "ok",   load: 22, runs: 96,  role: "Industry signal scan" },
  { id: "sales-1",   name: "Maya · CSM",     archetype: "sales",    status: "ok",   load: 48, runs: 234, role: "Customer success outreach" },
  { id: "sales-2",   name: "Pipe Hunter",    archetype: "sales",    status: "warn", load: 81, runs: 312, role: "Inbound lead qual" },
  { id: "builder-1", name: "Pathfinder",     archetype: "builder",  status: "ok",   load: 55, runs: 178, role: "Tenant orchestrator" },
  { id: "builder-2", name: "Architect",      archetype: "builder",  status: "ok",   load: 12, runs: 44,  role: "Metacron config proposals" },
  { id: "guardian-1",name: "Taboo Keeper",   archetype: "guardian", status: "ok",   load: 18, runs: 1402,role: "Refusal gate + policy" },
  { id: "guardian-2",name: "Boundary",       archetype: "guardian", status: "ok",   load: 9,  runs: 88,  role: "Egress validation" },
  { id: "op-1",      name: "Scheduler",      archetype: "operator", status: "ok",   load: 38, runs: 720, role: "Cron + retries" },
  { id: "op-2",      name: "Janitor",        archetype: "operator", status: "ok",   load: 14, runs: 156, role: "Decay + GC" },
  { id: "op-3",      name: "Telemetry",      archetype: "operator", status: "ok",   load: 27, runs: 980, role: "Metrics + alerts" },
  // Voice agents — same registry, phone badge in card
  { id: "voice-1",   name: "Discovery (inbound)", archetype: "voice", status: "ok", load: 12, runs: 88,  role: "Inbound discovery calls",   voice: true, voiceLast: "May 7 · 11:42", voiceCost: 0.84, voiceSuccess: 0.96 },
  { id: "voice-2",   name: "SDR Outbound",        archetype: "voice", status: "ok", load: 38, runs: 142, role: "Cold outbound prospecting", voice: true, voiceLast: "May 7 · 13:18", voiceCost: 1.12, voiceSuccess: 0.71 },
  { id: "voice-3",   name: "Procurement Pull",    archetype: "voice", status: "ok", load: 56, runs: 261, role: "Cron-driven bid pulls",     voice: true, voiceLast: "May 7 · 14:30", voiceCost: 1.62, voiceSuccess: 0.83 },
];

const V3_ARCHETYPE_COLOR = {
  curator:  "#7355E5",
  research: "#1F8A5B",
  sales:    "#E8763A",
  builder:  "#2E6CD4",
  guardian: "#E14B4B",
  operator: "#7E8AA3",
  voice:    "#E8763A",
};

const V3_TABOOS_MD = `# Taboos register

The taboos register is the bright-line list of things agents will not do —
even if a human asks them to. Each taboo is enforced by **Taboo Keeper**
before any tool call leaves the system.

## Customer & data

- **customer-data-egress** — never send a customer's full record outside
  Atrium. Aggregates and counts are fine; rows are not.
- **pii-in-prompts** — never include SSN, full DOB, or government ID in
  any prompt sent to a third-party model.
- **silent-export** — never write to a customer's CRM, billing, or comms
  system without an explicit human approval in the audit log.

## Money

- **wire-without-co-sign** — no outbound wire above $5,000 without a
  second human signature.
- **vendor-create** — agents may not stand up new paid vendor accounts.

## Identity & comms

- **impersonation** — never sign as a human team member. Agents sign as
  themselves with the agent badge.
- **public-post** — agents may not post to public social channels
  without a human-in-the-loop draft step.

## Memory

- **forget-on-request** — when a customer requests deletion, the request
  itself is logged but the data is purged within 24h.
- **promote-without-review** — agents may not promote a signal to
  durable memory without a Curator pass.

> Edits to this register are PR-only. The last 30 days of overrides are
> visible in the Recent overrides panel on the right.
`;

const V3_TABOO_OVERRIDES = [
  { ts: "May 5 · 14:22", who: "Kyle B",    rule: "wire-without-co-sign", action: "Single-approval allowed for AWS auto-pay", expires: "Jun 5" },
  { ts: "May 1 · 09:08", who: "Curtis L",  rule: "public-post",          action: "Pathfinder v3 launch tweet pre-approved", expires: "May 8" },
  { ts: "Apr 28 · 17:40",who: "Kyle B",    rule: "promote-without-review",action: "Auto-promote during cleanup sweep",     expires: "Permanent" },
];

const V3_REFUSALS = [
  { ts: "May 7 · 09:58", agent: "Pipe Hunter",  rule: "customer-data-egress",  attempt: "Send full customer list to external prospecting tool", outcome: "blocked", severity: "high" },
  { ts: "May 6 · 16:41", agent: "Maya · CSM",   rule: "impersonation",          attempt: "Sign-off as Kyle on renewal email",                    outcome: "blocked", severity: "med" },
  { ts: "May 6 · 11:12", agent: "Trend Scout",  rule: "promote-without-review", attempt: "Promote unverified signal to durable memory",          outcome: "blocked", severity: "low" },
  { ts: "May 5 · 22:08", agent: "Architect",    rule: "vendor-create",          attempt: "Spin up new Stripe sub-account for tenant",            outcome: "blocked", severity: "high" },
  { ts: "May 5 · 08:33", agent: "Maya · CSM",   rule: "silent-export",          attempt: "Push call notes to HubSpot without approval",          outcome: "allowed (override)", severity: "med" },
  { ts: "May 3 · 14:55", agent: "Curator",      rule: "pii-in-prompts",         attempt: "Include DOB in vault embedding prompt",                outcome: "blocked", severity: "high" },
  { ts: "May 2 · 19:20", agent: "Pipe Hunter",  rule: "public-post",            attempt: "Post pricing teaser to LinkedIn",                      outcome: "blocked", severity: "med" },
];

const V3_SERVICES = [
  { id: "openai",   name: "OpenAI",       status: "ok",   latency: "412ms", quota: "62%", reauthIn: "—",       owner: "Kyle B"   },
  { id: "claude",   name: "Anthropic",    status: "ok",   latency: "388ms", quota: "44%", reauthIn: "—",       owner: "Kyle B"   },
  { id: "stripe",   name: "Stripe",       status: "warn", latency: "—",     quota: "—",   reauthIn: "12d",     owner: "Curtis L" },
  { id: "slack",    name: "Slack",        status: "ok",   latency: "104ms", quota: "—",   reauthIn: "84d",     owner: "Kyle B"   },
  { id: "gh",       name: "GitHub",       status: "ok",   latency: "212ms", quota: "—",   reauthIn: "60d",     owner: "Keenan O" },
  { id: "hubspot",  name: "HubSpot",      status: "ok",   latency: "298ms", quota: "—",   reauthIn: "44d",     owner: "Curtis L" },
  { id: "vault",    name: "Vault (S3)",   status: "ok",   latency: "55ms",  quota: "32%", reauthIn: "—",       owner: "System"   },
  // Voice services — Vapi (orchestration), ElevenLabs (TTS), Deepgram (STT)
  { id: "vapi",     name: "Vapi",         status: "ok",   latency: "284ms", quota: "38%", reauthIn: "—",       owner: "Kyle B",  voice: true, lastCall: "May 7 · 14:30", errRate: "0.4%" },
  { id: "11labs",   name: "ElevenLabs",   status: "warn", latency: "612ms", quota: "71%", reauthIn: "21d",     owner: "Kyle B",  voice: true, lastCall: "May 7 · 14:30", errRate: "1.2%", note: "p95 latency above SLA" },
  { id: "deepgram", name: "Deepgram",     status: "ok",   latency: "118ms", quota: "22%", reauthIn: "—",       owner: "Kyle B",  voice: true, lastCall: "May 7 · 14:30", errRate: "0.1%" },
];

const V3_DECAY_TOPICS = [
  // 7 topics × 12 weeks (most recent on right). Higher = staler.
  { topic: "Pricing FAQ",      weeks: [10,20,28,40,55,62,70,72,78,84,88,92] },
  { topic: "ICP v1",           weeks: [12,18,24,32,40,48,56,64,72,78,82,86] },
  { topic: "Onboarding",       weeks: [22,32,38,44,50,56,62,68,72,76,80,84] },
  { topic: "Pathfinder docs",  weeks: [55,42,30,22,18,14,12,10, 9, 8, 8, 8] },
  { topic: "Metacron design",  weeks: [40,32,26,20,18,16,16,14,14,12,10,10] },
  { topic: "Customer notes",   weeks: [18,14,12,10, 8, 6, 6, 5, 5, 4, 4, 3] },
  { topic: "Vault hygiene",    weeks: [22,18,14,10, 8, 6, 5, 5, 4, 4, 3, 3] },
];

const V3_MEMORY_RESULTS = [
  { id: "m-1041", title: "Pricing v3 — net-15 trial for Northwind", source: "Decision · May 4", backlinks: 6, score: 0.94 },
  { id: "m-0987", title: "Helix renewal exposure model",            source: "Vault · Apr 28", backlinks: 12, score: 0.89 },
  { id: "m-0962", title: "Pathfinder tenant churn signal",          source: "Signal · Apr 22", backlinks: 4, score: 0.81 },
  { id: "m-0901", title: "Metacron agent fleet — load shape",       source: "Architect · Apr 14", backlinks: 9, score: 0.78 },
];

const V3_SCHEDULED_JOBS = [
  { id: "job-01", name: "Daily digest",        cron: "0 6 * * *",   owner: "Curator",      lastRun: "06:00",  nextRun: "Tomorrow 06:00", status: "ok",   on: true  },
  { id: "job-02", name: "Vault decay sweep",   cron: "0 7 * * MON", owner: "Janitor",      lastRun: "Mon 07:00", nextRun: "Mon 07:00", status: "ok",   on: true  },
  { id: "job-03", name: "Renewal nudge",       cron: "0 9 * * *",   owner: "Maya · CSM",   lastRun: "09:00",  nextRun: "Tomorrow 09:00", status: "ok",   on: true  },
  { id: "job-04", name: "Trend scan",          cron: "0 6 * * *",   owner: "Trend Scout",  lastRun: "06:00",  nextRun: "Tomorrow 06:00", status: "ok",   on: true  },
  { id: "job-05", name: "Backup snapshot",     cron: "0 2 * * *",   owner: "Telemetry",    lastRun: "02:00",  nextRun: "Tomorrow 02:00", status: "ok",   on: true  },
  { id: "job-06", name: "Stripe re-auth ping", cron: "0 8 * * MON", owner: "Boundary",     lastRun: "Mon 08:00", nextRun: "Mon 08:00", status: "warn", on: true  },
  { id: "job-07", name: "Embedding refresh",   cron: "0 3 * * SUN", owner: "Curator",      lastRun: "Sun 03:00", nextRun: "Sun 03:00", status: "ok",   on: false },
  { id: "job-08", name: "Procurement pull (hourly)", cron: "0 * * * *", owner: "Procurement Pull", lastRun: "14:00", nextRun: "15:00", status: "ok", on: true, voice: true },
];

const V3_AUDIT = [
  { ts: "May 7 · 10:14", actor: "Keenan G", action: "decision.approve",   subject: "Northwind net-15 billing",        meta: "audit_id=a-9821" },
  { ts: "May 7 · 09:30", actor: "Curator",  action: "vault.archive",       subject: "12 stale notes",                  meta: "batch=cln-0507" },
  { ts: "May 7 · 09:12", actor: "Curator",  action: "skill.run",           subject: "Morning Brief",                   meta: "cost=$0.07" },
  { ts: "May 6 · 16:41", actor: "Taboo Keeper", action: "policy.refuse",   subject: "impersonation",                   meta: "agent=Maya" },
  { ts: "May 6 · 11:01", actor: "Kyle B",   action: "taboo.override.add",  subject: "wire-without-co-sign · AWS",      meta: "expires=Jun 5" },
  { ts: "May 5 · 14:22", actor: "Kyle B",   action: "service.reauth",      subject: "Slack",                           meta: "—" },
  { ts: "May 5 · 09:18", actor: "System",   action: "job.toggle",          subject: "Embedding refresh OFF",           meta: "by=Kyle" },
  // Voice action types
  { ts: "May 7 · 14:30", actor: "Procurement Pull", action: "voice_dispatch",        subject: "Harris County FCD",                meta: "cfg=cfg-1 · cost=$1.84", voice: true },
  { ts: "May 7 · 13:42", actor: "Kyle B",       action: "voice_config_update",   subject: "Phoenix Procurement cron",          meta: "cfg-2 · 0 10 1 * * → 0 10 1,15 * *", voice: true },
  { ts: "May 7 · 10:58", actor: "Taboo Keeper", action: "voice_taboo_bounce",    subject: "Reno Capital Projects",             meta: "reason=no_consent_recorded", voice: true },
  { ts: "May 6 · 18:04", actor: "Kyle B",       action: "voice_assistant_update",subject: "Marie · Zedcor SDR · firstMessage", meta: "asst_01HG7QXB2K", voice: true },
];

const V3_CONTINUITY = [
  { ts: "May 7 · 10:14", kind: "decision",  who: "Keenan G",       title: "Approved net-15 billing for Northwind",    detail: "1-year auto-renew with 30-day pilot extension." },
  { ts: "May 6 · 17:55", kind: "signal",    who: "Trend Scout",    title: "Competitor priced new tier at $1,200/mo",  detail: "3 sources cross-referenced; promoted to vault." },
  { ts: "May 6 · 11:01", kind: "override",  who: "Kyle B",         title: "Lifted wire-co-sign for AWS auto-pay",     detail: "Expires Jun 5. Audit_id a-9772." },
  { ts: "May 5 · 14:22", kind: "decision",  who: "Curtis L",       title: "Pathfinder pricing v3 ready for review",   detail: "Tier 2 margin still under 40%; Kyle to approve Friday." },
  { ts: "May 4 · 09:30", kind: "refusal",   who: "Taboo Keeper",   title: "Blocked customer-list egress",             detail: "Pipe Hunter attempted external send. severity=high." },
  { ts: "May 2 · 13:00", kind: "decision",  who: "Kyle B",         title: "Helix renewal moves to red watch",         detail: "Champion left; new buyer cold. Triage Wed." },
];

// ---------- Sub-tab nav ----------
const V3_SYS_TABS = [
  { id: "agents",     label: "Agents",         icon: "Brain" },
  { id: "taboos",     label: "Taboos",         icon: "Lock"  },
  { id: "refusals",   label: "Refusal log",    icon: "Lock"  },
  { id: "services",   label: "Services",       icon: "Compass" },
  { id: "voice",      label: "Voice",          icon: "Phone", voice: true },
  { id: "decay",      label: "Decay",          icon: "Pulse" },
  { id: "memory",     label: "Memory",         icon: "Search" },
  { id: "jobs",       label: "Scheduled jobs", icon: "Now"   },
  { id: "audit",      label: "Audit log",      icon: "Doc"   },
  { id: "continuity", label: "Continuity",     icon: "Book"  },
];

// ---------- Sub-tab strip (light style, sits inside the page body) ----------
const V3SubTabs = ({ tabs, active, setActive }) => (
  <div style={{
    display: "flex", gap: 0, padding: "0 28px",
    borderBottom: "1px solid var(--v3-line)", background: "var(--v3-bg)",
    overflowX: "auto", flexShrink: 0,
  }}>
    {tabs.map(t => {
      const Icon = I[t.icon] || I.Bolt;
      const on = active === t.id;
      return (
        <button key={t.id} onClick={() => setActive(t.id)} style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "12px 16px", marginBottom: -1,
          fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap",
          color: on ? "var(--v3-blue)" : "var(--v3-ink-md)",
          borderBottom: `2px solid ${on ? "var(--v3-blue)" : "transparent"}`,
        }}>
          <Icon size={13}/> {t.label}
        </button>
      );
    })}
  </div>
);

// ---------- Section title ----------
const V3SectionTitle = ({ title, sub, action }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--v3-ink)", margin: 0, letterSpacing: -0.3 }}>{title}</h2>
      {sub && <div style={{ fontSize: 13, color: "var(--v3-ink-lo)", marginTop: 4 }}>{sub}</div>}
    </div>
    {action}
  </div>
);

// ---------- 1. Agents galaxy ----------
const V3AgentsGalaxy = () => {
  // Place agents in concentric rings by archetype
  const groups = {};
  V3_AGENTS.forEach(a => { (groups[a.archetype] = groups[a.archetype] || []).push(a); });
  const order = ["guardian", "operator", "curator", "research", "sales", "builder"];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18 }}>
      {/* Galaxy canvas */}
      <div style={{
        background: "var(--v3-surface)", borderRadius: 12,
        boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
        padding: 24, position: "relative", minHeight: 480, overflow: "hidden",
      }}>
        <V3SectionTitle title="Agent fleet" sub="12 agents · 6 archetypes · all healthy except Pipe Hunter (load 81%)"/>

        {/* Concentric rings */}
        <svg viewBox="0 0 800 440" style={{ width: "100%", height: 420 }}>
          <defs>
            <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(232,118,58,0.08)"/>
              <stop offset="100%" stopColor="rgba(11,21,48,0)"/>
            </radialGradient>
          </defs>
          <rect width="800" height="440" fill="url(#bgGlow)"/>
          {[80,140,200].map(r => <circle key={r} cx="400" cy="220" r={r} fill="none" stroke="var(--v3-line-soft)" strokeWidth="1" strokeDasharray="2 4"/>)}
          {/* Center: Atrium core */}
          <circle cx="400" cy="220" r="22" fill="var(--v3-orange)"/>
          <circle cx="400" cy="220" r="22" fill="none" stroke="rgba(232,118,58,0.25)" strokeWidth="8"/>
          <text x="400" y="225" textAnchor="middle" fontSize="11" fontWeight="600" fill="#FFF">CORE</text>

          {order.map((arch, ai) => {
            const list = groups[arch] || [];
            const ring = ai < 3 ? 110 : 175;
            const angleOffset = ai < 3 ? (ai * 120) : ((ai - 3) * 120 + 60);
            return list.map((a, i) => {
              const totalInRing = order.slice(ring === 110 ? 0 : 3, ring === 110 ? 3 : 6)
                .reduce((sum, k) => sum + (groups[k]||[]).length, 0);
              const offsetIdx = order.slice(ring === 110 ? 0 : 3, ai)
                .reduce((sum, k) => sum + (groups[k]||[]).length, 0) + i;
              const theta = (offsetIdx / totalInRing) * Math.PI * 2 + (ring === 110 ? 0 : Math.PI/8);
              const x = 400 + Math.cos(theta) * ring;
              const y = 220 + Math.sin(theta) * ring;
              const c = V3_ARCHETYPE_COLOR[arch];
              const r = 9 + (a.load/100) * 6;
              return (
                <g key={a.id}>
                  <line x1="400" y1="220" x2={x} y2={y} stroke={c} strokeWidth="1" opacity="0.15"/>
                  <circle cx={x} cy={y} r={r} fill={c} opacity={a.status === "ok" ? 0.85 : 1}/>
                  {a.status === "warn" && (
                    <circle cx={x} cy={y} r={r+3} fill="none" stroke="var(--v3-amber)" strokeWidth="2"/>
                  )}
                  {a.voice && (
                    <g>
                      <circle cx={x + r - 2} cy={y - r + 2} r="5" fill="#FFF" stroke="#E8763A" strokeWidth="1"/>
                      <text x={x + r - 2} y={y - r + 4.5} textAnchor="middle" fontSize="6" fill="#E8763A" fontWeight="700">☎</text>
                    </g>
                  )}
                  <text x={x} y={y + r + 13} textAnchor="middle" fontSize="10.5" fill="var(--v3-ink-md)">{a.name}</text>
                </g>
              );
            });
          })}
        </svg>

        {/* Legend */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, justifyContent: "center" }}>
          {order.map(arch => (
            <div key={arch} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--v3-ink-md)" }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: V3_ARCHETYPE_COLOR[arch] }}/>
              <span style={{ textTransform: "capitalize" }}>{arch}</span>
              <span style={{ color: "var(--v3-ink-lo)" }}>· {(groups[arch]||[]).length}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Agent list (compact) */}
      <div style={{
        background: "var(--v3-surface)", borderRadius: 12,
        boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--v3-line-soft)", fontSize: 13.5, fontWeight: 600, color: "var(--v3-ink)" }}>Roster</div>
        <div style={{ maxHeight: 480, overflow: "auto" }}>
          {V3_AGENTS.map(a => (
            <div key={a.id} style={{
              padding: "11px 18px", borderTop: "1px solid var(--v3-line-soft)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: V3_ARCHETYPE_COLOR[a.archetype], flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "var(--v3-ink)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                  {a.name}
                  {a.voice && <VoicePhone size={10}/>}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--v3-ink-lo)", marginTop: 1 }}>
                  {a.role}
                  {a.voice && <span style={{ marginLeft: 8, color: "var(--v3-ink-lo)" }}>· last {a.voiceLast} · ${a.voiceCost.toFixed(2)}/call · {Math.round(a.voiceSuccess*100)}% structured</span>}
                </div>
              </div>
              <span className="mono" style={{ fontSize: 12, color: a.load > 75 ? "var(--v3-amber)" : "var(--v3-ink-lo)" }}>{a.load}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------- 2. Taboos (markdown) ----------
const V3MarkdownLite = ({ src }) => {
  // Tiny markdown renderer: # ## headings, **bold**, > blockquote, - list
  const lines = src.split("\n");
  const out = [];
  let listBuf = [];
  const flushList = () => {
    if (listBuf.length) {
      out.push(<ul key={"ul"+out.length} style={{ paddingLeft: 22, margin: "0 0 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        {listBuf.map((t, i) => <li key={i} style={{ fontSize: 14, color: "var(--v3-ink-md)", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: inline(t) }}/>)}
      </ul>);
      listBuf = [];
    }
  };
  const inline = (t) => t
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--v3-ink);font-weight:600">$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="font-family:Geist Mono,monospace;background:var(--v3-bg-soft);padding:1px 6px;border-radius:4px;font-size:12.5px">$1</code>');
  lines.forEach((l, i) => {
    if (l.startsWith("# ")) { flushList(); out.push(<h1 key={i} style={{ fontSize: 24, fontWeight: 600, color: "var(--v3-ink)", margin: "0 0 16px", letterSpacing: -0.3 }}>{l.slice(2)}</h1>); }
    else if (l.startsWith("## ")) { flushList(); out.push(<h2 key={i} style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: "20px 0 10px", textTransform: "uppercase", letterSpacing: 0.5 }}>{l.slice(3)}</h2>); }
    else if (l.startsWith("- ")) { listBuf.push(l.slice(2)); }
    else if (l.startsWith("> ")) { flushList(); out.push(<blockquote key={i} style={{ borderLeft: "3px solid var(--v3-blue)", paddingLeft: 14, margin: "16px 0", color: "var(--v3-ink-md)", fontSize: 13.5, fontStyle: "italic", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: inline(l.slice(2)) }}/>); }
    else if (l.trim() === "") { flushList(); }
    else { flushList(); out.push(<p key={i} style={{ fontSize: 14, color: "var(--v3-ink-md)", lineHeight: 1.6, margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: inline(l) }}/>); }
  });
  flushList();
  return <div>{out}</div>;
};

const V3TaboosTab = () => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18 }}>
    <div style={{
      background: "var(--v3-surface)", borderRadius: 12, padding: "26px 30px",
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, paddingBottom: 16, borderBottom: "1px solid var(--v3-line-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--v3-ink-lo)", padding: "2px 7px", background: "var(--v3-bg-soft)", borderRadius: 4 }}>Memory/taboos.md</span>
          <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>Updated May 2 · Kyle B</span>
        </div>
        <button style={{
          padding: "7px 14px", borderRadius: 7, border: "1px solid var(--v3-line-strong)",
          fontSize: 13, fontWeight: 500, color: "var(--v3-ink)", display: "flex", alignItems: "center", gap: 6,
        }}>
          <I.Github size={12}/> Propose edit
        </button>
      </div>
      <V3MarkdownLite src={V3_TABOOS_MD}/>
    </div>

    <div style={{
      background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden",
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
      alignSelf: "start", position: "sticky", top: 0,
    }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--v3-ink)" }}>Recent overrides</span>
        <span className="mono" style={{ fontSize: 11.5, color: "var(--v3-ink-lo)" }}>30d</span>
      </div>
      {V3_TABOO_OVERRIDES.map((o, i) => (
        <div key={i} style={{ padding: "13px 18px", borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span className="mono" style={{ fontSize: 12, color: "var(--v3-orange)", fontWeight: 600 }}>{o.rule}</span>
            <span style={{ fontSize: 11.5, color: "var(--v3-ink-lo)" }}>exp {o.expires}</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--v3-ink-md)", lineHeight: 1.45 }}>{o.action}</div>
          <div style={{ fontSize: 11.5, color: "var(--v3-ink-lo)", marginTop: 4 }}>{o.ts} · {o.who}</div>
        </div>
      ))}
    </div>
  </div>
);

// ---------- 3. Refusal log table ----------
const V3RefusalLog = ({ scope } = {}) => {
  const [q, setQ] = React.useState("");
  const [sev, setSev] = React.useState("all");
  const filtered = V3_REFUSALS.filter(r =>
    (sev === "all" || r.severity === sev) &&
    (q === "" || (r.attempt + r.agent + r.rule).toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <div style={{
      background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden",
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    }}>
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>{scope === "items" ? "Refusals on action items + sprints" : "Refusal log"}</h3>
          <span style={{ fontSize: 13, color: "var(--v3-ink-lo)" }}>{filtered.length} of {V3_REFUSALS.length} · last 7 days</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "var(--v3-bg-soft)", borderRadius: 7, border: "1px solid var(--v3-line-soft)" }}>
            <I.Search size={12} style={{ color: "var(--v3-ink-lo)" }}/>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search refusals…" style={{ background: "transparent", border: "none", outline: "none", fontSize: 12.5, color: "var(--v3-ink)", width: 160 }}/>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["all","high","med","low"].map(s => (
              <button key={s} onClick={() => setSev(s)} style={{
                padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, textTransform: "capitalize",
                background: sev === s ? "var(--v3-bg-soft)" : "transparent",
                color: sev === s ? "var(--v3-ink)" : "var(--v3-ink-md)",
              }}>{s}</button>
            ))}
          </div>
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Timestamp","Agent","Rule","Attempted action","Outcome","Severity"].map((c, i) => (
              <th key={i} style={{ textAlign: "left", padding: "11px 22px", fontSize: 12, fontWeight: 500, color: "var(--v3-ink-md)", borderBottom: "1px solid var(--v3-line)" }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--v3-line-soft)" }}>
              <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-md)" }} className="mono">{r.ts}</td>
              <td style={{ padding: "13px 22px", fontSize: 13, color: "var(--v3-ink)" }}>{r.agent}</td>
              <td style={{ padding: "13px 22px" }}>
                <span className="mono" style={{ fontSize: 11.5, padding: "2px 7px", borderRadius: 4, background: "var(--v3-red-soft)", color: "var(--v3-red)", fontWeight: 600 }}>{r.rule}</span>
              </td>
              <td style={{ padding: "13px 22px", fontSize: 13, color: "var(--v3-ink-md)" }}>{r.attempt}</td>
              <td style={{ padding: "13px 22px", fontSize: 12.5, color: r.outcome.includes("blocked") ? "var(--v3-red)" : "var(--v3-amber)", fontWeight: 500 }}>{r.outcome}</td>
              <td style={{ padding: "13px 22px" }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4,
                  background: r.severity === "high" ? "var(--v3-red-soft)" : r.severity === "med" ? "var(--v3-amber-soft)" : "var(--v3-bg-soft)",
                  color:      r.severity === "high" ? "var(--v3-red)"      : r.severity === "med" ? "var(--v3-amber)"      : "var(--v3-ink-md)",
                }}>{r.severity}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------- 4. Services ----------
const V3ServicesTab = () => {
  const [reauth, setReauth] = React.useState(null);
  return (
    <>
      <div style={{
        background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden",
        boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
      }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Connected services</h3>
          <div style={{ fontSize: 13, color: "var(--v3-ink-lo)", marginTop: 4 }}>{V3_SERVICES.length} services · 1 needs re-auth</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            {["Service","Status","Latency","Quota","Re-auth","Owner",""].map((c, i) =>
              <th key={i} style={{ textAlign: i === 6 ? "right" : "left", padding: "11px 22px", fontSize: 12, fontWeight: 500, color: "var(--v3-ink-md)", borderBottom: "1px solid var(--v3-line)" }}>{c}</th>)}
          </tr></thead>
          <tbody>
            {V3_SERVICES.map((s, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--v3-line-soft)" }}>
                <td style={{ padding: "13px 22px", fontSize: 13.5, color: "var(--v3-ink)", fontWeight: 500 }}>{s.name}</td>
                <td style={{ padding: "13px 22px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: s.status === "ok" ? "var(--v3-green)" : "var(--v3-amber)", fontWeight: 500 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: s.status === "ok" ? "var(--v3-green)" : "var(--v3-amber)" }}/>
                    {s.status === "ok" ? "Healthy" : "Re-auth needed"}
                  </span>
                </td>
                <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-md)" }} className="mono">{s.latency}</td>
                <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-md)" }} className="mono">{s.quota}</td>
                <td style={{ padding: "13px 22px", fontSize: 12.5, color: s.reauthIn === "—" ? "var(--v3-ink-lo)" : s.reauthIn.endsWith("d") && parseInt(s.reauthIn) < 20 ? "var(--v3-amber)" : "var(--v3-ink-md)" }}>{s.reauthIn}</td>
                <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-md)" }}>{s.owner}</td>
                <td style={{ padding: "13px 22px", textAlign: "right" }}>
                  {s.status === "warn" ? (
                    <button onClick={() => setReauth(s)} style={{
                      padding: "6px 12px", borderRadius: 6, background: "var(--v3-orange)", color: "#FFF",
                      fontSize: 12, fontWeight: 600,
                    }}>Re-auth</button>
                  ) : (
                    <button style={{ fontSize: 12.5, color: "var(--v3-blue)" }}>View</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reauth && (
        <div onClick={() => setReauth(null)} style={{
          position: "fixed", inset: 0, background: "rgba(11,21,48,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "min(460px, 100%)", background: "var(--v3-surface)", borderRadius: 14, overflow: "hidden", boxShadow: "0 30px 80px rgba(11,21,48,0.30)" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--v3-line-soft)" }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--v3-ink)" }}>Re-authenticate {reauth.name}</div>
              <div style={{ fontSize: 13, color: "var(--v3-ink-lo)", marginTop: 4 }}>Token expires in {reauth.reauthIn} · scopes: read, write, billing</div>
            </div>
            <div style={{ padding: 24, fontSize: 13.5, color: "var(--v3-ink-md)", lineHeight: 1.55 }}>
              You'll be redirected to {reauth.name} to grant the requested scopes. Atrium will only request what's listed above.
              <ul style={{ marginTop: 14, paddingLeft: 20, color: "var(--v3-ink-md)" }}>
                <li style={{ marginBottom: 4 }}>read · accounts, transactions</li>
                <li style={{ marginBottom: 4 }}>write · subscriptions</li>
                <li>billing · invoice events</li>
              </ul>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid var(--v3-line-soft)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setReauth(null)} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid var(--v3-line-strong)", fontSize: 13, fontWeight: 500, color: "var(--v3-ink)" }}>Cancel</button>
              <button onClick={() => setReauth(null)} style={{ padding: "8px 14px", borderRadius: 7, background: "var(--v3-orange)", color: "#FFF", fontSize: 13, fontWeight: 600 }}>Continue to {reauth.name} ↗</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ---------- 5. Decay heatmap ----------
const V3DecayHeatmap = () => {
  const cellColor = (v) => {
    // 0-100 → green-amber-red
    if (v < 25) return "rgba(46,142,102,0.85)";
    if (v < 50) return "rgba(46,142,102,0.45)";
    if (v < 70) return "rgba(194,138,31,0.55)";
    if (v < 85) return "rgba(225,75,75,0.45)";
    return "rgba(225,75,75,0.85)";
  };
  const weeks = ["W12","W11","W10","W9","W8","W7","W6","W5","W4","W3","W2","W1"];
  return (
    <div style={{
      background: "var(--v3-surface)", borderRadius: 12, padding: "22px 26px",
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    }}>
      <V3SectionTitle title="Signal decay heatmap" sub="Topic freshness over the last 12 weeks · darker = staler"/>
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, alignItems: "center" }}>
        <div></div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${weeks.length}, 1fr)`, gap: 4 }}>
          {weeks.map(w => <div key={w} className="mono" style={{ fontSize: 10.5, color: "var(--v3-ink-lo)", textAlign: "center" }}>{w}</div>)}
        </div>
        {V3_DECAY_TOPICS.map(t => (
          <React.Fragment key={t.topic}>
            <div style={{ fontSize: 13, color: "var(--v3-ink)", fontWeight: 500 }}>{t.topic}</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${weeks.length}, 1fr)`, gap: 4 }}>
              {t.weeks.map((v, i) => (
                <div key={i} title={`${t.topic} · ${weeks[i]} · staleness ${v}`} style={{
                  height: 28, borderRadius: 4, background: cellColor(v),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10.5, color: v > 60 ? "#FFF" : "var(--v3-ink)", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                }}>{v}</div>
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 18, fontSize: 11.5, color: "var(--v3-ink-lo)" }}>
        <span>Scale:</span>
        {[10, 30, 60, 80, 95].map(v => (
          <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: cellColor(v) }}/>
            {v < 25 ? "Fresh" : v < 50 ? "Warm" : v < 70 ? "Aging" : v < 85 ? "Stale" : "Critical"}
          </span>
        ))}
      </div>
    </div>
  );
};

// ---------- 6. Memory search ----------
const V3MemorySearch = () => {
  const [q, setQ] = React.useState("renewal");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 18 }}>
      <div style={{
        background: "var(--v3-surface)", borderRadius: 12, padding: "22px 26px",
        boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--v3-bg-soft)", borderRadius: 9, border: "1px solid var(--v3-line-soft)", marginBottom: 18 }}>
          <I.Search size={14} style={{ color: "var(--v3-ink-lo)" }}/>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Semantic search vault + ledger…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 14, color: "var(--v3-ink)" }}/>
          <span className="mono" style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>{V3_MEMORY_RESULTS.length} results · 142ms</span>
        </div>
        {V3_MEMORY_RESULTS.map(r => (
          <div key={r.id} style={{ padding: "16px 0", borderTop: "1px solid var(--v3-line-soft)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--v3-ink-lo)" }}>{r.id}</span>
              <span style={{ fontSize: 14.5, color: "var(--v3-ink)", fontWeight: 500 }}>{r.title}</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--v3-ink-lo)", display: "flex", gap: 14 }}>
              <span>{r.source}</span>
              <span>·</span>
              <span>{r.backlinks} backlinks</span>
              <span>·</span>
              <span className="mono">score {r.score.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Backlinks visualization */}
      <div style={{
        background: "var(--v3-surface)", borderRadius: 12, padding: "22px 24px",
        boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
        alignSelf: "start",
      }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--v3-ink)", marginBottom: 14 }}>Backlinks · m-1041</div>
        <svg viewBox="0 0 320 280" style={{ width: "100%", height: 280 }}>
          <circle cx="160" cy="140" r="26" fill="var(--v3-blue)"/>
          <text x="160" y="144" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#FFF">m-1041</text>
          {[
            { id: "m-0987", x: 50,  y: 60,  label: "Helix renewal" },
            { id: "m-0962", x: 270, y: 80,  label: "Pathfinder churn" },
            { id: "m-0901", x: 60,  y: 220, label: "Metacron load" },
            { id: "m-0855", x: 270, y: 220, label: "Pricing v2" },
            { id: "m-0822", x: 160, y: 30,  label: "Q1 retro" },
            { id: "m-0801", x: 160, y: 250, label: "Northwind notes" },
          ].map(n => (
            <g key={n.id}>
              <line x1="160" y1="140" x2={n.x} y2={n.y} stroke="var(--v3-line)" strokeWidth="1"/>
              <circle cx={n.x} cy={n.y} r="14" fill="var(--v3-bg-soft)" stroke="var(--v3-line-strong)"/>
              <text x={n.x} y={n.y + (n.y < 140 ? -20 : 28)} textAnchor="middle" fontSize="10" fill="var(--v3-ink-md)">{n.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};

// ---------- 7. Scheduled jobs (with GatedAction) ----------
const V3GatedAction = ({ children, label, onConfirm }) => {
  const [state, setState] = React.useState("idle"); // idle | validating | ok | blocked
  const handle = () => {
    setState("validating");
    setTimeout(() => {
      const ok = Math.random() > 0.15;
      setState(ok ? "ok" : "blocked");
      if (ok && onConfirm) onConfirm();
      setTimeout(() => setState("idle"), 1400);
    }, 900);
  };
  const colors = {
    idle:       { bg: "var(--v3-surface)", border: "var(--v3-line-strong)", color: "var(--v3-ink)" },
    validating: { bg: "var(--v3-bg-soft)", border: "var(--v3-line-strong)", color: "var(--v3-ink-md)" },
    ok:         { bg: "var(--v3-green-soft)", border: "var(--v3-green)", color: "var(--v3-green)" },
    blocked:    { bg: "var(--v3-red-soft)",   border: "var(--v3-red)",   color: "var(--v3-red)" },
  };
  const c = colors[state];
  return (
    <button onClick={handle} disabled={state !== "idle"} style={{
      padding: "6px 11px", borderRadius: 6, fontSize: 12, fontWeight: 600,
      border: `1px solid ${c.border}`, background: c.bg, color: c.color,
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      {state === "validating" && <span style={{ width: 9, height: 9, borderRadius: 999, border: "1.5px solid currentColor", borderTopColor: "transparent", animation: "v3spin 700ms linear infinite" }}/>}
      {state === "ok" && <I.Check size={11}/>}
      {state === "blocked" && <I.X size={11}/>}
      {state === "idle" && (children || label)}
      {state === "validating" && "Validating…"}
      {state === "ok" && "Triggered"}
      {state === "blocked" && "Blocked by Taboo Keeper"}
    </button>
  );
};

const V3JobsTab = () => {
  const [jobs, setJobs] = React.useState(V3_SCHEDULED_JOBS);
  const toggle = (id) => setJobs(jobs.map(j => j.id === id ? { ...j, on: !j.on } : j));
  return (
    <div style={{
      background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden",
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    }}>
      <style>{`@keyframes v3spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)" }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Scheduled jobs</h3>
        <div style={{ fontSize: 13, color: "var(--v3-ink-lo)", marginTop: 4 }}>{jobs.filter(j => j.on).length} of {jobs.length} active · cron-driven</div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          {["", "Name", "Cron", "Owner", "Last run", "Next run", "Status", ""].map((c, i) =>
            <th key={i} style={{ textAlign: i === 7 ? "right" : "left", padding: "11px 22px", fontSize: 12, fontWeight: 500, color: "var(--v3-ink-md)", borderBottom: "1px solid var(--v3-line)" }}>{c}</th>)}
        </tr></thead>
        <tbody>
          {jobs.map(j => (
            <tr key={j.id} style={{ borderBottom: "1px solid var(--v3-line-soft)", opacity: j.on ? 1 : 0.55 }}>
              <td style={{ padding: "13px 22px" }}>
                <button onClick={() => toggle(j.id)} style={{
                  width: 32, height: 18, borderRadius: 999, position: "relative",
                  background: j.on ? "var(--v3-green)" : "var(--v3-line-strong)",
                  transition: "background 150ms",
                }}>
                  <span style={{ position: "absolute", top: 2, left: j.on ? 16 : 2, width: 14, height: 14, borderRadius: 999, background: "#FFF", transition: "left 150ms" }}/>
                </button>
              </td>
              <td style={{ padding: "13px 22px", fontSize: 13.5, color: "var(--v3-ink)", fontWeight: 500 }}>{j.name}</td>
              <td style={{ padding: "13px 22px", fontSize: 12, color: "var(--v3-ink-md)" }} className="mono">{j.cron}</td>
              <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-md)" }}>{j.owner}</td>
              <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-lo)" }}>{j.lastRun}</td>
              <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-lo)" }}>{j.nextRun}</td>
              <td style={{ padding: "13px 22px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: j.status === "ok" ? "var(--v3-green)" : "var(--v3-amber)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: j.status === "ok" ? "var(--v3-green)" : "var(--v3-amber)" }}/>
                  {j.status === "ok" ? "Healthy" : "Warning"}
                </span>
              </td>
              <td style={{ padding: "13px 22px", textAlign: "right" }}>
                <V3GatedAction>Trigger now</V3GatedAction>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------- 8. Audit log ----------
const V3AuditLog = () => {
  const [q, setQ] = React.useState("");
  const filtered = V3_AUDIT.filter(a => q === "" || (a.actor + a.action + a.subject).toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{
      background: "var(--v3-surface)", borderRadius: 12, overflow: "hidden",
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    }}>
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--v3-line-soft)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Audit log</h3>
          <div style={{ fontSize: 13, color: "var(--v3-ink-lo)", marginTop: 4 }}>Every system change · immutable · {V3_AUDIT.length} entries shown</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "var(--v3-bg-soft)", borderRadius: 7, border: "1px solid var(--v3-line-soft)" }}>
          <I.Search size={12} style={{ color: "var(--v3-ink-lo)" }}/>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search actor, action, subject…" style={{ background: "transparent", border: "none", outline: "none", fontSize: 12.5, color: "var(--v3-ink)", width: 220 }}/>
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          {["Timestamp","Actor","Action","Subject","Meta"].map((c, i) =>
            <th key={i} style={{ textAlign: "left", padding: "11px 22px", fontSize: 12, fontWeight: 500, color: "var(--v3-ink-md)", borderBottom: "1px solid var(--v3-line)" }}>{c}</th>)}
        </tr></thead>
        <tbody>
          {filtered.map((a, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--v3-line-soft)" }}>
              <td style={{ padding: "13px 22px", fontSize: 12.5, color: "var(--v3-ink-md)" }} className="mono">{a.ts}</td>
              <td style={{ padding: "13px 22px", fontSize: 13, color: "var(--v3-ink)" }}>{a.actor}</td>
              <td style={{ padding: "13px 22px" }}>
                <span className="mono" style={{ fontSize: 11.5, padding: "2px 7px", borderRadius: 4, background: "var(--v3-bg-soft)", color: "var(--v3-ink-md)", fontWeight: 500 }}>{a.action}</span>
              </td>
              <td style={{ padding: "13px 22px", fontSize: 13, color: "var(--v3-ink-md)" }}>{a.subject}</td>
              <td style={{ padding: "13px 22px", fontSize: 12, color: "var(--v3-ink-lo)" }} className="mono">{a.meta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------- 9. Continuity timeline (shared component) ----------
const V3ContinuityTimeline = ({ events = V3_CONTINUITY }) => {
  const [filters, setFilters] = React.useState({ decision: true, signal: true, override: true, refusal: true });
  const filterDefs = [
    { id: "decision", label: "Decisions", color: "var(--v3-blue)"   },
    { id: "signal",   label: "Signals",   color: "var(--v3-green)"  },
    { id: "override", label: "Overrides", color: "var(--v3-orange)" },
    { id: "refusal",  label: "Refusals",  color: "var(--v3-red)"    },
  ];
  const visible = events.filter(e => filters[e.kind]);
  const dotColor = (kind) => filterDefs.find(f => f.id === kind)?.color || "var(--v3-ink-lo)";

  return (
    <div style={{
      background: "var(--v3-surface)", borderRadius: 12, padding: "22px 26px",
      boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 14, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)", margin: 0 }}>Continuity timeline</h3>
          <div style={{ fontSize: 13, color: "var(--v3-ink-lo)", marginTop: 4 }}>Decisions, signals, overrides, refusals — chronological</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {filterDefs.map(f => (
            <button key={f.id} onClick={() => setFilters({ ...filters, [f.id]: !filters[f.id] })} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 500,
              background: filters[f.id] ? "var(--v3-bg-soft)" : "transparent",
              color: filters[f.id] ? "var(--v3-ink)" : "var(--v3-ink-lo)",
              border: `1px solid ${filters[f.id] ? "var(--v3-line-strong)" : "var(--v3-line-soft)"}`,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: f.color, opacity: filters[f.id] ? 1 : 0.4 }}/>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        {visible.map((e, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 24px 1fr", gap: 12, padding: "14px 0", borderTop: i === 0 ? "none" : "1px solid var(--v3-line-soft)" }}>
            <div className="mono" style={{ fontSize: 12, color: "var(--v3-ink-lo)", paddingTop: 2 }}>{e.ts}</div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: dotColor(e.kind), marginTop: 5 }}/>
              {i < visible.length - 1 && <span style={{ width: 1, flex: 1, background: "var(--v3-line)", marginTop: 6 }}/>}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, color: dotColor(e.kind) }}>{e.kind}</span>
                <span style={{ fontSize: 14, color: "var(--v3-ink)", fontWeight: 500 }}>{e.title}</span>
                <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>· {e.who}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--v3-ink-md)", marginTop: 4, lineHeight: 1.5 }}>{e.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------- Main System screen ----------
const V3SystemScreen = () => {
  const [tab, setTab] = React.useState("agents");
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--v3-rail)" }}>
      <V3Topbar active="system"/>
      <V3PageBody>
        <V3PageTitle title="System"/>
        <V3SubTabs tabs={V3_SYS_TABS} active={tab} setActive={setTab}/>
        <div style={{ flex: 1, overflow: "auto", padding: "22px 28px", display: "flex", flexDirection: "column", gap: 22 }}>
          {tab === "agents"     && <V3AgentsGalaxy/>}
          {tab === "taboos"     && <V3TaboosTab/>}
          {tab === "refusals"   && <V3RefusalLog/>}
          {tab === "services"   && <V3ServicesTab/>}
          {tab === "voice"      && <V3VoiceSystemTab/>}
          {tab === "decay"      && <V3DecayHeatmap/>}
          {tab === "memory"     && <V3MemorySearch/>}
          {tab === "jobs"       && <V3JobsTab/>}
          {tab === "audit"      && <V3AuditLog/>}
          {tab === "continuity" && <V3ContinuityTimeline/>}
        </div>
      </V3PageBody>
    </div>
  );
};

window.V3SystemScreen = V3SystemScreen;
window.V3RefusalLog = V3RefusalLog;
window.V3ContinuityTimeline = V3ContinuityTimeline;
window.V3GatedAction = V3GatedAction;
