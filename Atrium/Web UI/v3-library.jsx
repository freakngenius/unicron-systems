/* v3-library.jsx — Library tab full content. Mounted from v3.jsx. */

const V3_WIKI_PAGES = [
  { id: "welcome",       title: "Welcome",            kind: "open", icon: "pencil" },
  { id: "what-this-is",  title: "What This Is",       kind: "open", icon: "pencil" },
  { id: "how-it-works",  title: "How It Works",       kind: "pr",   icon: "lock"   },
  { id: "how-you-participate", title: "How You Participate", kind: "open", icon: "pencil" },
  { id: "whats-connected",title: "What's Connected",  kind: "auto", icon: "sparkle"},
  { id: "best-practices",title: "Best Practices",     kind: "pr",   icon: "lock"   },
  { id: "quick-start",   title: "Quick Start",        kind: "open", icon: "pencil" },
  { id: "add-team",      title: "Adding a Team Member", kind: "pr",icon: "lock"   },
  { id: "edit-system",   title: "Editing the System", kind: "pr",   icon: "lock"   },
  { id: "glossary",      title: "Glossary",           kind: "auto", icon: "sparkle"},
  { id: "faq",           title: "FAQ",                kind: "open", icon: "pencil" },
];

const V3_WIKI_BODIES = {
  "welcome": `# Welcome to Atrium

Atrium is the cockpit Unicron Systems runs the company from. Three humans, twelve agents, one continuity surface.

This wiki is the living manual — how the cockpit works, how to participate, and how to extend it without breaking the things that keep us safe.

## What's here

Atrium fuses six surfaces into one substrate: **work** (action items, decisions), **people** (customers, team, network), **money** (accounts, runway, expenses), **products** (Pathfinder + Metacron), **marketing**, and the **system** itself (agents, taboos, refusals, services).

Behind every surface is a vault of structured memory and a fleet of specialist agents. Behind every action is a refusal gate, an audit log, and a continuity timeline.

## The shape of the day

Mornings start in **Now**. The Curator drops a brief — what needs you, what changed, what to ignore. You triage, you capture, you delegate. Agents work the long tail. You work the things only you can.

> If it's worth doing twice, it's worth a skill.`,

  "what-this-is": `# What This Is

Atrium is not a CRM. It is not a dashboard. It is the place where the *operating intelligence* of Unicron Systems lives — the memory, the rules, the agents, the moves.

## Three principles

- **Continuity over context.** Decisions are durable. Refusals are durable. Signals decay unless promoted. Nothing important should depend on a human's recall.
- **Refusals before tools.** Every tool call passes through Taboo Keeper before it hits the wire. The taboo register is the bright line.
- **Skills over scripts.** Repeated work becomes a Skill. Skills are versioned, costed, and gated.`,

  "how-it-works": `# How It Works

The substrate is four layers: **Vault** (durable memory), **Ledger** (immutable audit), **Fleet** (specialist agents), **Gates** (taboos + approvals). Surfaces compose from those four.

## Vault

Markdown + frontmatter, embedded weekly, graph-aware. Promotion is explicit — Curator pass required. Decay is visible (see System → Decay).

## Ledger

Append-only. Every state change carries an audit_id. The Continuity timeline is a projection of the ledger filtered to the kinds humans care about: decisions, signals, overrides, refusals.

## Fleet

Six archetypes: Curator, Research, Sales, Builder, Guardian, Operator. Each agent has a defined role, a budget, a refusal posture, and a continuity contract.

## Gates

Taboo Keeper validates every tool call. The taboos register lives at \`Memory/taboos.md\` and is PR-gated. Time-bounded overrides are visible on the Taboos page.`,

  "how-you-participate": `# How You Participate

Atrium is not autonomous. It is a cockpit — leverage for three humans. The flight controls are yours.

## Daily

Start in Now. Read the brief. Triage the action items. Make the decisions only you can make. Capture signals as they arrive (voice, text, photo).

## Weekly

Review the Continuity timeline. Decide what got promoted, what got refused, what got overridden. Approve Architect proposals. Confirm renewal exposure.

## When stuck

Ask Atrium. The search bar in the topbar is semantic across vault + ledger. \`⌘K\`.`,

  "whats-connected": `# What's Connected

This page is **auto-generated** from the live services registry. See System → Services for the source of truth.

## Today

12 services connected: Supabase, Vercel, OpenAI, Anthropic, Slack, Notion, GitHub, Plaud, Fathom, Google Workspace, Inngest, Higgsfield.

> Regenerated nightly at 03:00. Last run: today.`,

  "best-practices": `# Best Practices

Patterns that have earned their place by surviving contact with reality.

## Promote sparingly

Signals are cheap. Durable memory is expensive. Curator pass exists for a reason — most signals decay correctly without intervention.

## Refusals are features

When Taboo Keeper blocks something, that's the system working. Add an override only when the rule is wrong, not when the moment is inconvenient.

## Decisions need detail

Continuity entries should answer: *who decided, when, on what grounds, expiring when?* Vague entries decay into folklore.`,

  "quick-start": `# Quick Start

If you have ten minutes, do these in order.

1. Open **Now**. Read the brief.
2. Open **System → Taboos**. Skim the register.
3. Open **System → Continuity**. Scroll the last seven days.
4. Try a Skill — Morning Brief or Daily Digest.
5. Capture something with the orange button in the topbar.

You're now operating the cockpit.`,

  "add-team": `# Adding a Team Member

PR-gated workflow. The full doc lives in the repo.

## Stub

1. Add the human to \`team.yaml\`.
2. Define their default DRI surfaces.
3. Wire them into the audit log roles.
4. Open a PR. Tag Kyle.`,

  "edit-system": `# Editing the System

Two paths. Pick the right one.

## Open edits

Anything labeled "open" in the wiki sidebar — edit in place. Saves directly to the vault.

## PR-gated edits

Anything labeled with the lock glyph — propose an edit, opens a PR. Reviewed and merged by a system maintainer.

## Auto-generated

Regenerated nightly. Don't edit. Edit the source.`,

  "glossary": `# Glossary

This page is **auto-generated** from frontmatter \`term:\` keys across the vault.

- **Continuity** — durable record of decisions, signals, overrides, refusals.
- **Decay** — measure of how stale a signal or doc has become.
- **DRI** — directly responsible individual.
- **Fleet** — the set of specialist agents.
- **Gate** — a refusal or approval checkpoint.
- **Promote** — move a signal from ephemeral memory to the vault.
- **Refusal** — an attempted action blocked by Taboo Keeper.
- **Surface** — a top-level area of the cockpit (Now, Work, People, etc.).
- **Taboo** — a bright-line rule agents will not cross.

> Regenerated nightly.`,

  "faq": `# FAQ

## Why three people?

Because the leverage is in the cockpit, not the headcount.

## Why orange?

It's the only warm color in the palette. We use it for *distribution* — the moments where the cockpit is actively reaching out to the world.

## Can I run this for my company?

Not yet. Pathfinder is the first product surface; Metacron is the first multi-tenant surface. Talk to Curtis.`,
};

const V3_TEMPLATES = [
  { name: "PRD",      desc: "Product requirements", icon: "Doc" },
  { name: "SPEC",     desc: "Technical spec",        icon: "Doc" },
  { name: "Prompt",   desc: "Versioned LLM prompt", icon: "Bolt"},
  { name: "Retro",    desc: "Sprint retrospective", icon: "Pulse"},
  { name: "Decision", desc: "Continuity entry",     icon: "Check"},
];

const V3_REPO_DOCS = [
  { path: "Products/pathfinder/kpis.md",   updated: "May 7", tag: "products" },
  { path: "Memory/taboos.md",              updated: "May 2", tag: "memory"   },
  { path: "Memory/seven-generations.md",   updated: "Apr 28",tag: "memory"   },
  { path: "Customers/zedcor/notes.md",     updated: "May 6", tag: "customers"},
  { path: "Decisions/pathfinder-pricing-v3.md", updated: "May 5", tag: "decisions" },
  { path: "Brand/Manifesto Pages/part-i.md", updated: "Apr 22", tag: "brand"  },
  { path: "Products/metacron/architect-spec.md", updated: "May 1", tag: "products" },
  { path: "People/team.yaml",              updated: "Apr 18", tag: "people"   },
];

const V3KindIcon = ({ kind }) => {
  const sz = 11;
  if (kind === "lock")    return <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="var(--v3-ink-lo)" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
  if (kind === "pencil")  return <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="var(--v3-blue)" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>;
  if (kind === "sparkle") return <svg width={sz} height={sz} viewBox="0 0 24 24" fill="var(--v3-orange)"><path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z"/></svg>;
  return null;
};

const V3WikiToc = ({ src }) => {
  const headings = src.split("\n").filter(l => l.startsWith("## ")).map(l => l.slice(3));
  if (headings.length === 0) return null;
  return (
    <div style={{ position: "sticky", top: 0, alignSelf: "start" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--v3-ink-lo)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10 }}>On this page</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {headings.map((h, i) => (
          <a key={i} style={{ fontSize: 12.5, color: "var(--v3-ink-md)", textDecoration: "none", borderLeft: "2px solid var(--v3-line)", paddingLeft: 10 }}>{h}</a>
        ))}
      </div>
    </div>
  );
};

const V3WikiView = () => {
  const [pageId, setPageId] = React.useState("welcome");
  const page = V3_WIKI_PAGES.find(p => p.id === pageId);
  const body = V3_WIKI_BODIES[pageId] || "";
  const editAffordance = page.kind === "open"
    ? <button style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid var(--v3-line-strong)", fontSize: 13, fontWeight: 500, color: "var(--v3-ink)", display: "inline-flex", alignItems: "center", gap: 6 }}><I.Doc size={11}/> Edit</button>
    : page.kind === "pr"
    ? <button style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid var(--v3-line-strong)", fontSize: 13, fontWeight: 500, color: "var(--v3-ink)", display: "inline-flex", alignItems: "center", gap: 6 }}><I.Github size={11}/> Propose edit</button>
    : <span style={{ padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, color: "var(--v3-orange)", background: "var(--v3-orange-soft)", textTransform: "uppercase", letterSpacing: 0.5 }}>Regenerated nightly</span>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 200px", gap: 18 }}>
      {/* Sidebar */}
      <aside style={{ background: "var(--v3-surface)", borderRadius: 12, padding: "16px 0", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)", alignSelf: "start", position: "sticky", top: 0 }}>
        <div style={{ padding: "0 16px 12px", fontSize: 11, fontWeight: 600, color: "var(--v3-ink-lo)", letterSpacing: 0.6, textTransform: "uppercase" }}>Wiki</div>
        {V3_WIKI_PAGES.map(p => (
          <button key={p.id} onClick={() => setPageId(p.id)} style={{
            display: "flex", alignItems: "center", gap: 9, width: "100%",
            padding: "9px 16px", textAlign: "left",
            background: p.id === pageId ? "var(--v3-bg-soft)" : "transparent",
            color: p.id === pageId ? "var(--v3-ink)" : "var(--v3-ink-md)",
            fontSize: 13, fontWeight: p.id === pageId ? 500 : 400,
            borderLeft: `2px solid ${p.id === pageId ? "var(--v3-blue)" : "transparent"}`,
          }}>
            <V3KindIcon kind={p.icon}/>
            <span style={{ flex: 1 }}>{p.title}</span>
          </button>
        ))}
      </aside>

      {/* Main */}
      <article style={{ background: "var(--v3-surface)", borderRadius: 12, padding: "30px 40px", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)", minHeight: 600 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingBottom: 18, borderBottom: "1px solid var(--v3-line-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="mono" style={{ fontSize: 11.5, color: "var(--v3-ink-lo)", padding: "2px 7px", background: "var(--v3-bg-soft)", borderRadius: 4 }}>Wiki/{page.id}.md</span>
            <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>· {page.kind === "open" ? "Open edits" : page.kind === "pr" ? "PR-gated" : "Auto-generated"}</span>
          </div>
          {editAffordance}
        </div>
        <V3MarkdownLite src={body}/>
      </article>

      {/* TOC */}
      <V3WikiToc src={body}/>
    </div>
  );
};

const V3RepoView = () => {
  const [q, setQ] = React.useState("");
  const filtered = V3_REPO_DOCS.filter(d => q === "" || d.path.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ background: "var(--v3-surface)", borderRadius: 12, padding: "22px 26px", boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--v3-bg-soft)", borderRadius: 9, border: "1px solid var(--v3-line-soft)", marginBottom: 18 }}>
        <I.Search size={14} style={{ color: "var(--v3-ink-lo)" }}/>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search vault by path, content, or tag…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 14, color: "var(--v3-ink)" }}/>
        <span className="mono" style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}>{filtered.length} of {V3_REPO_DOCS.length}</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--v3-ink-lo)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10 }}>Recent</div>
      {filtered.map(d => (
        <div key={d.path} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid var(--v3-line-soft)" }}>
          <I.Doc size={13} style={{ color: "var(--v3-ink-lo)" }}/>
          <span className="mono" style={{ fontSize: 13, color: "var(--v3-ink)", flex: 1 }}>{d.path}</span>
          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: "var(--v3-bg-soft)", color: "var(--v3-ink-md)", textTransform: "capitalize" }}>{d.tag}</span>
          <span style={{ fontSize: 12, color: "var(--v3-ink-lo)", minWidth: 60, textAlign: "right" }}>{d.updated}</span>
        </div>
      ))}
    </div>
  );
};

const V3TemplatesView = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
    {V3_TEMPLATES.map(t => {
      const Icon = I[t.icon] || I.Doc;
      return (
        <div key={t.name} style={{
          background: "var(--v3-surface)", borderRadius: 12, padding: "22px 24px",
          boxShadow: "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
          cursor: "pointer", transition: "transform 120ms",
        }}
        onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
        onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
        >
          <div style={{ width: 38, height: 38, borderRadius: 8, background: "var(--v3-orange-soft)", color: "var(--v3-orange)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <Icon size={18}/>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--v3-ink)" }}>{t.name}</div>
          <div style={{ fontSize: 13, color: "var(--v3-ink-lo)", marginTop: 4 }}>{t.desc}</div>
          <button style={{ marginTop: 14, fontSize: 12.5, color: "var(--v3-blue)", fontWeight: 500 }}>Instantiate →</button>
        </div>
      );
    })}
  </div>
);

const V3LibraryScreen = () => {
  const [view, setView] = React.useState("wiki");
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--v3-rail)" }}>
      <V3Topbar active="library"/>
      <V3PageBody>
        <V3PageTitle title="Library"/>

        {/* Compact metric strip */}
        <div style={{ padding: "12px 28px 16px", display: "flex", gap: 26, fontSize: 13, color: "var(--v3-ink-md)", borderBottom: "1px solid var(--v3-line)", background: "var(--v3-bg)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><I.Doc size={12} style={{ color: "var(--v3-ink-lo)" }}/> 1,247 docs</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><I.Pulse size={12} style={{ color: "var(--v3-green)" }}/> 62% fresh</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><I.Bolt size={12} style={{ color: "var(--v3-orange)" }}/> 18 templates</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><I.Brain size={12} style={{ color: "var(--v3-blue)" }}/> 98.3% embeddings</span>
        </div>

        {/* View toggle */}
        <div style={{ padding: "16px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--v3-bg-soft)", borderRadius: 9, border: "1px solid var(--v3-line-soft)" }}>
            {[
              { id: "wiki",      label: "Wiki" },
              { id: "repo",      label: "Repo" },
              { id: "templates", label: "Templates" },
            ].map(v => (
              <button key={v.id} onClick={() => setView(v.id)} style={{
                padding: "7px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500,
                background: view === v.id ? "var(--v3-surface)" : "transparent",
                color: view === v.id ? "var(--v3-ink)" : "var(--v3-ink-md)",
                boxShadow: view === v.id ? "0 1px 2px rgba(11,21,48,0.06)" : "none",
              }}>{v.label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 28px" }}>
          {view === "wiki"      && <V3WikiView/>}
          {view === "repo"      && <V3RepoView/>}
          {view === "templates" && <V3TemplatesView/>}
        </div>
      </V3PageBody>
    </div>
  );
};

window.V3LibraryScreen = V3LibraryScreen;
