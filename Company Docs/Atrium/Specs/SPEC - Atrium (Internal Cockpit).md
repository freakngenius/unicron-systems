# SPEC — Atrium (Internal Cockpit)

**Status:** Draft v0.1
**Owner:** Kyle Kesterson (Internal Org Cowork chat)
**Reviewers:** Keenan Hock
**Date:** 2026-05-05
**Parent SPEC:** SPEC - Unicron Nervous System.md
**Companion SPEC:** SPEC - Nervous System Addendum 1 (Kanban Surface Routing).md

---

## 1. Purpose

Atrium is the visible front of the Unicron Nervous System. The Nervous System SPEC defines the substrate (ledger, vault, agents, refusal layer, ingest pipeline). This SPEC defines the cockpit humans use to see it, feel it, direct it, and edit it.

Without Atrium, the Nervous System is invisible to the team. Slack and Notion provide partial views. Atrium provides the unified surface.

Atrium answers eight verbs:
1. What needs me right now?
2. What is the state of X?
3. Show me everything happening (live).
4. Let me change a setting.
5. Where are we with [customer / campaign / sprint]?
6. How are we doing against [goal / KPI]?
7. What did the system decide while I was away?
8. Can I find that thing I created?

If a feature does not answer one of these eight verbs, it does not ship in Atrium.

## 2. Scope and non-goals

**In scope:**
- Operator console for Unicron itself (Kyle, Keenan, future team members; Curtis at reduced visibility)
- Read views over the substrate (ledger, vault, kanbans, calendars, connected services)
- Editing surface for system configuration (taboos, agents, team_members, scheduled jobs, DRI assignments)
- Live activity feed
- Notification preferences
- Mobile-readable Home and Work tabs

**Out of scope:**
- Customer-facing features for Pathfinder or Metacron (those have their own surfaces)
- Replacing source-of-truth systems (Stripe, HubSpot, calendar providers, GitHub). Atrium aggregates and surfaces; it does not own the truth.
- Replacing Notion as the kanban authoring surface. Atrium embeds read-only and links through.
- Content management or wiki authoring beyond what the vault on git provides.
- Replacing direct git interaction for code work (engineers still use Claude Code, GitHub, IDEs for code).

## 3. Architectural placement

**Option B confirmed: inside `unicron-platform` (Metacron's repo) under a feature flag and tenant scope.**

Reasoning:
- Metacron is already a Vite + React 19 app for operators. Same audience shape.
- Reuses Metacron's existing primitives: agent console, galaxy view, Supabase client setup, auth.
- Saves a third Vercel project. The multi-Vercel verification rule already covers Pathfinder + unicron-platform; adding Atrium under unicron-platform keeps the count at two.
- Tenant scope: Atrium routes are visible only when authenticated as a Unicron team_member. Customer Metacron operators see no Atrium routes.
- If Atrium grows beyond what the Metacron chassis can carry, fork to a standalone codebase later. For now, build it in.

**Routes:**
- `atrium.unicron.systems` (production; dedicated subdomain)
- `unicron-platform.vercel.app` preview deployments per branch (Vercel default)
- `localhost:5173` for dev (with subdomain emulation via `/etc/hosts` if needed, or simple path-based routing locally)

**DNS:** add `atrium.unicron.systems` CNAME to the unicron-platform Vercel project. Sprint 1 handles DNS provisioning.

**Email whitelist gate:** authentication checks email against an allowlist of four:
- kyle@unicron.systems
- keenan@unicron.systems
- curtis@unicron.systems
- team@unicron.systems (shared inbox / service account)

Anyone authenticating with an email not in the whitelist is rejected at the auth callback regardless of whether the magic link or SSO succeeded. Whitelist lives in env (`ATRIUM_EMAIL_ALLOWLIST`) and is checked at sign-in. Adding a fifth member is a code or env change, deliberately friction-high to prevent accidental access expansion.

**Feature flag:** `ATRIUM_ENABLED=true` in env. Production-on for the dedicated subdomain; off for any other route.

## 4. Auth and tenant model

### 4.1 Authentication

- Supabase Auth (existing, already used by Metacron)
- Each team_member has a Supabase user linked to `nervous_system.team_members.id`
- Two methods supported from day one: email magic link AND SSO (Google as initial provider; expandable to GitHub, Microsoft later)
- Sign-in flow: email entry → choose magic link or "Continue with Google" → email checked against `ATRIUM_EMAIL_ALLOWLIST` after auth succeeds → rejected if not in allowlist
- Per-user session attached to team_member id for RLS and per-section gating

### 4.2 Tenant scope

- Atrium reads only Unicron's own data: `nervous_system.*` tables, Unicron-as-tenant rows in shared tables
- If a future Atrium-like product surfaces for customers, it would be a separate scope or a separate codebase

### 4.3 Per-role visibility

| Role | Sees |
|------|------|
| founder (Kyle) | Everything. All editing surfaces. Override authority. |
| cofounder (Keenan) | Everything. All editing surfaces. Override authority. |
| advisor (Curtis) | Equal to founder/cofounder. Full visibility across all tabs. Full editing surface. Override authority. Title remains "advisor" for legal/contractual purposes; system permissions are at peer tier with Kyle and Keenan. |
| contractor (future) | Configurable; default is Now + their assigned surface(s) only |

Role gates enforced at route level and component level. RLS at the database level provides defense in depth.

## 5. Tech stack

- Vite + React 19 + TypeScript (matches unicron-platform)
- Tailwind for styling
- Supabase client + Realtime for live data
- Notion API (via Notion MCP from server-side, not browser) for kanban embeds
- pgvector via Supabase RPC for semantic vault search
- Recharts or Chart.js for data viz (bundled, not CDN, per Atrium being a real app)
- React Router for routing
- Server-side functions in `unicron-platform/api/` for Atrium-specific endpoints (taboo edit proposals, agent reconfigurations, refusal-gate-protected mutations)

## 6. Top-level layout principles

### 6.1 Calm at rest

- No auto-refresh faster than once per 60 seconds on Home
- No flashing, no aggressive color changes, no notification badges unless an action is genuinely required
- Activity feed is throttled and deduped; "5 ledger writes in the last 30 seconds" collapses to one summary line
- Animations are subtle (fade, slide, no bounce, no spin unless waiting state)
- Empty states are descriptive, not punitive

### 6.2 Mobile-first for Home and Work

- Home and Work tabs render fully on phone screens
- Other tabs are desktop-primary; phone access shows a compact view with link to "open on desktop" for full functionality
- Quick capture works from any screen size

### 6.3 Drillable, not dense

- Cards on Home are summaries with a click-through to detail
- Detail views show full data
- Avoid putting more than 5-7 elements on a single Home screen

### 6.4 Edit through gates

- Every system-config edit posts to a server endpoint
- Endpoint runs Taboo Keeper validation before persisting
- Audit log records the edit with actor_id and previous value
- "Undo" is a first-class affordance for non-destructive edits

## 7. Home (Now tab)

The morning view. One screen. Mobile-readable.

### 7.1 Components, top to bottom

**Header**
- Greeting: "Good morning, Kyle" (time-of-day adaptive)
- Date and local time
- Status pulse: four indicators in a horizontal strip
  - Agent fleet (green/yellow/red): green if all active agents are healthy and within budget
  - Escalations: count of open items in `#orchestrator-escalations` style queue
  - Budget burn: % of monthly budget consumed for the current cycle
  - Decay alerts: count of topics with no reinforcement in the last 14 days that the Analyst flagged

**Top of mind**
- 3 to 5 cards selected by an "attention scoring" heuristic:
  - Open escalations needing decision (highest priority)
  - Calls or decisions surfaced by the Analyst as "you should look at this"
  - Sprints with state changes since your last visit
  - Customer health alerts (if a customer card is in degraded state)
  - Calendar items in the next four hours
- Each card shows: title, why it surfaced, two action buttons (e.g., "Resolve", "Defer"), click-through to full context

**Today's calendar**
- Next three calendar events for the current user
- Pulled from connected Google Calendar (or other) per team_member
- Click-through to calendar provider for full detail

**Yesterday's digest**
- Single collapsed card: "Yesterday: 4 calls ingested, 12 action items created, 2 PRs merged, 0 Taboo bounces, 23 stale signals archived"
- Expand to read the full Analyst digest from `#orchestrator-feed`

**Live activity feed**
- Throttled stream of significant events from the last hour
- Examples: "Sprint 1 PR merged at 14:23", "Realberry call ingested by Plaud at 14:15", "Taboo Keeper bounced an outbound email about [redacted] at 14:08"
- Throttle: max one row per 30 seconds; events in same category collapse
- Click event for full detail

### 7.2 Data sources

- Status pulse: `nervous_system.agents`, `nervous_system.action_items` (escalations), LLM gateway (budget), Analyst flags (decay alerts)
- Top of mind: attention-scoring heuristic queries across `nervous_system.action_items`, `nervous_system.ledger`, calendar
- Calendar: per-user OAuth tokens to Google Calendar (or similar)
- Yesterday's digest: latest digest doc in vault `Inbox/digests/YYYY-MM-DD.md` plus Analyst summary
- Activity feed: Supabase Realtime channel on `nervous_system.ledger` and `nervous_system.audit_log`, throttled and deduped client-side

### 7.3 Always-visible affordances

- Global search bar (top-right, keyboard shortcut `/` or `cmd+k`)
- Quick capture button (top-right, microphone icon for voice, plus icon for text/photo)
- User menu (avatar; dropdown for notifications, preferences, sign-out)

## 8. People tab

### 8.1 Customers

- **Pipeline view**: stages from cold to active tenant. Cards per customer.
  - Stages: Cold, Discovery Scheduled, Discovery Completed, Proposal, Contract, Onboarding, Active, Churned
  - Drag cards between stages (writes to a `customers` table when implemented; for now, hardcoded list)
- **Per-customer health card** (click into a customer):
  - Usage frequency (active tenants only; pulled from product analytics)
  - Engagement depth (Slack, call, email frequency)
  - Last contact date and channel
  - Contract milestones
  - Sentiment signal from Slack and call ingest (Analyst-derived)
  - Recent activity feed (calls, emails, Slack threads about this customer)
  - Action items related to this customer
- **Outreach tracking**: who you've contacted, when, on what thread, with what response

### 8.2 Team

- List of team_members with avatar, name, role, default surface
- Click into a member for their "My Day":
  - Their open DRIs across all kanbans
  - Their calendar today
  - Their last digest read state
  - Their pending Verified-column reviews
  - Their action items requested by them and requested of them
- **Capacity heatmap**: visual indicator of how loaded each member is (open DRIs weighted by priority and due date)

### 8.3 Network

- Advisors, warm contacts, contributors
- Last-touch dates and channels
- "Who introduced who" graph (lightweight; full social graph not needed)
- Notes per contact (pulled from vault `Memory/people/<name>.md` if present)

### 8.4 Hiring (when active)

- Pipeline (Sourced, Screening, Interview, Offer, Accepted, Declined)
- Per-candidate card with resume link, notes, scheduled interviews
- Hidden when no active hiring

## 9. Work tab

### 9.1 Action items (cross-kanban view)

- Single table view of all `nervous_system.action_items` rows
- Filters: DRI, surface, due, priority, status, source
- Sort: priority (default), due, last_touched, created
- Bulk actions: reassign, defer, close (each goes through audit log)
- Click an item for full detail with linked ledger row, evidence, and Notion card

### 9.2 Calls

- Chronological log of all `nervous_system.ledger` rows where `source_type='call'`
- Per-call detail: participants, summary, full transcript (lazy-loaded), decisions extracted, action items created, evidence
- Replaces the Notion call logs page
- Search: by participant, date range, semantic content

### 9.3 Decisions

- Continuity log timeline view (renders `Memory/elder/continuity.md`)
- Filter by type: customer_promise, architectural_decision, public_statement, partnership, regulatory
- Click for detail and evidence
- Visual timeline showing supersedes relationships

### 9.4 Kanbans

- Read-only embeds of three Notion kanbans side by side: Pathfinder, Metacron, Internal Org
- Each shows columns and cards
- Click through to Notion for editing
- Filter by DRI to see "my cards across all kanbans"

### 9.5 Sprints

- Active and recent Claude Code sprints
- Each sprint card: name, surface, status, DRI, evidence link, kanban card link
- For multi-fork sprints (slime mold): show all N candidates with scores, reinforcement state
- Active sprint detail: live log of Claude Code session output (tail of agent run)

## 10. Money tab

### 10.1 Accounts

- Every connected service: Supabase, Vercel, OpenAI, Anthropic, Slack paid plan, Notion, GitHub, Plaud, Fathom, etc.
- Per service: status (healthy / degraded / broken), monthly cost (last billed), last billed date, owner team_member
- Click for credentials access (link to provider, not credentials themselves)
- Replaces the Notion accounts page

### 10.2 Runway

- Cash on hand (manual entry or bank-connector when implemented)
- Monthly burn (computed from accounts + payroll if entered)
- Runway months (cash / burn)
- Visual: burn-down chart

### 10.3 Revenue

- MRR / ARR if any (Stripe when connected)
- Per-customer revenue
- Pipeline-weighted forecast (sales pipeline stages × close probability)

### 10.4 Expenses

- Categorized monthly view: infrastructure, services, payroll, contractors, marketing, other
- Imported from accounts where automatic; manual entry otherwise
- Cost spike alerts: Analyst flags abnormal spend per category

### 10.5 Source-of-truth pushback

Atrium does not own financial truth. Stripe owns billing. Banks own cash positions. Accounting tools (when connected) own categorized expenses. Atrium reads and surfaces. Manual entry is the temporary fallback while connectors are missing; flag manually-entered fields as "manual" in the UI.

## 11. Marketing tab

### 11.1 Campaigns

- Active campaigns with goal, status, channels, start date, target metric
- Per-campaign card: KPIs against goals, content artifacts produced, attribution

### 11.2 Content

- Published artifacts: blog posts, social posts, manifesto pages, website pages
- Per-artifact: publish date, channel, traction (views, engagements, conversions where measurable)

### 11.3 Analytics

- Site traffic (PostHog, Plausible, GA when connected)
- Conversion funnels
- Social reach
- Attribution by channel

### 11.4 Brand assets

- Browsable thumbnail gallery of files in vault `Brand/`
- Folders: Images, Source, Manifesto Pages, Presentation
- Click for full asset, download, link

## 12. Products tab

### 12.1 Pathfinder

- Active tenants list
- Per-tenant: agent run health, leads ranked, cross-pollination signals, customer-zero (Zedcor) usage stats
- KPIs against goals (defined per tenant)
- Embeds existing Pathfinder analytics where Pathfinder already has them

### 12.2 Metacron

- Agent fleet across tenants (galaxy view from existing Metacron primitives)
- Architect proposals approved this week
- Configuration changes per tenant
- KPIs against goals

### 12.3 KPI definition

- Each product carries its own KPI set in vault `Products/<product>/kpis.md`
- Atrium reads the KPI file and renders against current measurements
- Editing KPIs is a vault PR (gate-protected)

## 13. System tab

This is the editing surface. All edits run through the Taboo Keeper.

### 13.1 Agents

- Galaxy view of every agent: archetype, name, last run, cost, budget remaining
- Click for detail: config, watches list, recent runs, recent outputs
- Edit affordances: toggle active, adjust budget, change watches list
- Each edit posts to `/api/atrium/agents/:id` which runs Taboo Keeper, validates schema, persists, audit logs

### 13.2 Services

- Connected services with auto-detected health: green (healthy), yellow (degraded), red (broken or unreachable)
- Per-service detail: last successful call, error rate, latency p95
- Re-auth flow surfaces inline when degraded due to expired tokens

### 13.3 Taboos

- Read view of `Memory/taboos.md`
- Propose edit: opens a vault PR via GitHub API; reviewer is the other founder; merge triggers Taboo Keeper reload
- "Recent overrides" sub-section: every Taboo Keeper bounce that was overridden, with reason and decider

### 13.4 Refusal log

- Every Taboo Keeper bounce: timestamp, action, matched taboo, reason, override status, decider
- Filter by date, taboo, decider
- Quarterly review surface for Analyst

### 13.5 Decay heatmap

- Visual representation of signal strength across topics
- Topics with strong reinforcement render bright; fading topics render dim
- Topic clusters with no reinforcement in N days surface as "candidates for archive"
- Click cluster to see signals, decide manually whether to keep or archive

### 13.6 Memory (vault search)

- Semantic search across vault docs and ledger via pgvector
- Filter by type (decision, call, retro, spec, etc.)
- Backlinks visualized for vault docs (graph view)
- Click result for full doc; "promote to memory" button for ledger insights

### 13.7 Scheduled jobs

- List of all Inngest functions and Vercel cron jobs
- Per job: schedule, last run status, next run, owner agent
- Toggle on/off (audit logged)
- Manually trigger (audit logged)

### 13.8 Continuity log

- Full Elder continuity log rendered with filters
- Read-only from Atrium; edits via vault PR

### 13.9 Audit log viewer

- Searchable log of every system change: schema migrations, taboo overrides, agent reconfigurations, RLS bypasses, manual job triggers
- Filter by actor, table, date
- Quarterly Analyst review

## 14. Library tab

Library splits into two views: Wiki (curated, entry-point, onboarding) and Repo (searchable everything). Toggle between views; Wiki is the default landing.

### 14.1 Wiki view

The wiki is the entry surface for anyone new to the company OR anyone who wants to understand or evolve the system. Curated, human-readable, organized by topic. Source content lives at `vault/Memory/wiki/*.md` and is rendered in Atrium with sidebar nav, table of contents, search, and edit affordances.

Default page set:

**Welcome** (`vault/Memory/wiki/welcome.md`)
- One-paragraph overview: what Unicron Systems is, what the Nervous System is, what Atrium is
- Links to the rest of the wiki
- "If you have 5 minutes" reading order: Welcome → How You Participate → Quick Start → Glossary

**What This Is** (`vault/Memory/wiki/what-this-is.md`)
- Unicron Systems: the company, what it does, who's on it
- The two products: Pathfinder (customer-facing), Metacron (operator-facing)
- The Nervous System: what runs the company itself
- The philosophical frame: living systems, refusal layer, decay, closed loops, seven generations
- Pointer to the manifesto in `vault/Vision/`

**How It Works** (`vault/Memory/wiki/how-it-works.md`)
- The substrate: Supabase ledger, knowledge vault on git, agents, refusal gate
- The surfaces: Slack, Notion, Atrium, Cowork chats
- The loops: capture, direction, judgment, reflection
- The agents: Orchestrator, Analyst, Elder, Taboo Keeper, Specialists
- Diagram (rendered inline)

**How You Participate** (`vault/Memory/wiki/how-you-participate.md`)
- Daily rhythm walk-through: morning briefing on phone, mid-day directives, evening review
- DM the Orchestrator: what to say, what to expect
- Mobile capture: quick capture button, voice memos, Slack DM
- Verified column: human-only, why
- Override authority: when and how to override Taboo bounces

**What's Connected** (`vault/Memory/wiki/whats-connected.md`)
- Auto-generated section: reads from `nervous_system.agents` and a connectors registry
- Lists every connected service, what it does, who owns the account, status
- Updated continuously; not hand-maintained

**Best Practices** (`vault/Memory/wiki/best-practices.md`)
- Direct the Orchestrator with intent, not steps
- Move cards to Verified after a real review
- Approve overrides only with reasons that make sense in writing (continuity log captures them)
- Add a new memory only when it generalizes beyond the current task
- Don't replicate truth that lives in another system
- Push back on the system when it's wrong; the Analyst will pick up the pattern

**Quick Start: First 30 Minutes** (`vault/Memory/wiki/quick-start.md`)
- Onboarding checklist for a new team member
- Confirm Slack invitation accepted
- Confirm Atrium login works
- Confirm Notion access (read or write per role)
- Read taboos.md
- Read seven_generations.md
- Read most recent continuity log entry
- File first action item ("Read the welcome briefing")
- DM Orchestrator with "Hello, I'm new"

**Adding a Team Member** (`vault/Memory/wiki/adding-a-team-member.md`)
- The onboarding flow Kyle or Keenan runs to bring someone new in
- DM Orchestrator: "Onboard [Name] as [role]"
- The Orchestrator's automated steps
- What humans must do (introductions, context handoffs)

**Editing the System** (`vault/Memory/wiki/editing-the-system.md`)
- How to propose a taboo edit
- How to reconfigure an agent
- How to add a scheduled job
- How to update DRI defaults
- The refusal-gate workflow for edits

**Glossary** (`vault/Memory/wiki/glossary.md`)
- Ledger, vault, signal, decay, TTL, DRI, refusal gate, Taboo Keeper, Elder, Orchestrator, Analyst, Specialist, mycelium, beehive, ant colony, starling, slime mold, seven generations, R3/R4/R5, ABSTAIN, NO_SIGNAL, break-off, stigmergy
- Plain definitions, no jargon-on-jargon

**FAQ** (`vault/Memory/wiki/faq.md`)
- Common questions: "What does the system do without me?" "When should I check Atrium?" "How do I know if my action item is real?" "What if I want to undo something?" "How do I find the SPEC for X?"

### 14.2 Repo view

- All vault docs organized by folder: Vision, Specs, PRD, Plans, Reports, Prompts, Decisions, Calls, Retros, Memory (excluding wiki, which renders in Wiki view)
- Tag-based and semantic search
- Recent docs surface at top
- "My recent" filter for current user's recent edits

### 14.3 Brand and presentation assets

- Browsable thumbnail gallery for `Brand/`, `Presentation/`, `Manifesto Pages/` (read from disk at current Dropbox path; vault migration deferred)
- Download, link, copy-to-clipboard

### 14.4 Templates

- PRD template, SPEC template, Prompt template, Retro template, Decision template
- Click to instantiate: opens a new vault doc with frontmatter prefilled, lands in `Inbox/`

### 14.5 Wiki editing

- Pages with `editable: open` frontmatter: edit directly in Atrium with a markdown editor; commit goes through the same auth and audit log as any other system edit
- Pages with `editable: pr` frontmatter (taboos, seven_generations, anything sensitive): edit opens a vault PR; reviewer is the other founder or peer-tier member
- Pages with `editable: auto` frontmatter (whats-connected, etc.): regenerated by the Analyst nightly; manual edits get overwritten unless protected blocks are used

## 15. Quick capture

Always-available capture surface, accessible from every screen.

- **Voice**: tap microphone, record, transcribed via Whisper, posted to `/api/ingest` with source_type=voice_memo
- **Text**: type or paste, posted to `/api/ingest` with source_type=manual
- **Photo**: take or upload, posted to `/api/ingest` with the photo as evidence
- **Inbox routing**: every captured item lands in vault `Inbox/` for Analyst's nightly sweep into the right folder

Confirmation: brief toast "Captured. The Orchestrator will route it." Click toast to see what happened.

## 16. Global search

- Keyboard shortcut: `/` or `cmd+k`
- Searches across: ledger, vault docs, kanbans, calls, decisions, contacts, action items, agents, audit log
- Semantic + literal hybrid via pgvector + Postgres full-text search
- Results grouped by category
- Click for detail; arrow keys navigate

## 17. Editing surfaces and refusal-gate integration

Every system-modifying action follows the same pattern:

1. UI form posts to `/api/atrium/<resource>/<action>` server endpoint
2. Endpoint validates user role and permissions
3. Endpoint sends proposed change to Taboo Keeper validation function
4. If Taboo Keeper returns `bounce`, endpoint returns 403 with reason; UI shows the reason inline
5. If Taboo Keeper returns `pass`, endpoint persists change, writes to `nervous_system.audit_log`, returns 200
6. UI updates optimistically; rollback if persistence fails

Endpoints to build (Sprint 3 onward):
- `POST /api/atrium/team_members` (add)
- `PATCH /api/atrium/team_members/:id` (update)
- `PATCH /api/atrium/agents/:id/config`
- `PATCH /api/atrium/agents/:id/budget`
- `PATCH /api/atrium/agents/:id/active`
- `POST /api/atrium/taboos/propose-edit` (opens vault PR)
- `POST /api/atrium/taboos/override` (with reason; writes continuity log)
- `PATCH /api/atrium/scheduled-jobs/:id`
- `POST /api/atrium/scheduled-jobs/:id/trigger`
- `PATCH /api/atrium/action-items/:id` (reassign DRI, defer, close)
- `POST /api/atrium/insights/:ledger_id/promote-to-memory`

## 18. Notification preferences

Per-user, accessible from user menu.

Configurable per channel:
- Slack DM (always on; Slack is the primary)
- Slack `#orchestrator-escalations` (always on)
- Atrium notification badge (per category: escalations, calendar, calls, sprints)
- Email digest (off by default; opt-in)
- Mobile push (when Atrium has a PWA wrapper or native app; not Sprint 1)

Default: only escalations and DMs ping the phone. Everything else accumulates and surfaces in Atrium next time you open it.

## 19. Mobile considerations

- Home and Work tabs render fully on mobile (320px to 768px wide)
- Other tabs show a compact view with "open on desktop" prompt for full functionality
- Quick capture works on mobile (voice especially important)
- PWA wrapping in Sprint 7 for installable home-screen icon

## 20. Real-time activity feed throttling

The activity feed must feel alive but not overwhelming. Rules:

- Subscribe to Supabase Realtime channel on `nervous_system.ledger` and `nervous_system.audit_log`
- Client-side queue of events
- Throttle: max one event display per 30 seconds; queued events collapse into a single summary
- Dedupe: events of the same source_type within 5 minutes collapse to one row with a count
- Highlight: events tagged irreversible or escalation pop into Top of Mind, not just feed
- "Show more" button reveals queued events; default state is the summarized view

## 21. Sequencing changes to existing Sprint plan

The Nervous System SPEC section 20 (migration plan) is amended. Atrium ships in slices alongside the substrate. Replaces the original Sprint 6+ wait-until-substrate-done plan.

| Sprint | Substrate work (existing) | Atrium work (new) |
|--------|--------------------------|-------------------|
| 0 (in flight) | Foundation: repo, vault, tables, ingest stub, Inngest placeholder | None. Atrium not yet scaffolded. |
| 1 | Call ingest pipeline + `nervous_system.customers` table provisioned and seeded with Zedcor + DNS for `atrium.unicron.systems` | Atrium scaffolded as empty shell in unicron-platform with feature flag, auth (SSO + magic link), email allowlist gate, and dedicated subdomain |
| 2 | Slack Orchestrator app + persistent agents start | **Atrium Home tab** (Now view): greeting, status pulse, top of mind, calendar, yesterday's digest, throttled activity feed |
| 3 | Persistent Analyst and Elder | **Atrium System tab** (partial): agents galaxy, taboos, refusal log, services |
| 4 | Voice memo, Apple Notes, mobile capture | **Atrium Now and Work tabs (mobile)**: action items cross-kanban, calls log, decisions timeline, kanban embeds, sprints; mobile-readable |
| 5 | Email ingest, multi-fork sprints, full bounded peer attention | **Atrium People and Money tabs**: customers pipeline, team my-day views, network, accounts, runway, revenue, expenses |
| 6 | (Atrium-focused) | **Atrium Marketing, Products, Library tabs**: campaigns, content, brand assets, product analytics, vault search, templates |
| 7 | (Atrium-focused) | **Atrium polish**: PWA wrapping, notification preferences, audit log viewer, decay heatmap, scheduled jobs UI, edge polish |

By Sprint 5, you have a working cockpit with substrate fully functional underneath. By Sprint 7, polished.

This sequencing supersedes section 20 of SPEC - Unicron Nervous System.md when v0.2 of that SPEC merges. Until then, both SPECs reference each other as companions.

## 22. Resolved decisions

1. **Domain**: `atrium.unicron.systems` dedicated subdomain. Sprint 1 provisions DNS.

2. **Email whitelist gate**: Kyle, Keenan, Curtis. Hardcoded in `ATRIUM_EMAIL_ALLOWLIST` env var; expanding requires code or env change.

3. **Auth flow**: SSO (Google initial) AND email magic link from day one. Both check the email allowlist post-auth.

4. **PWA wrapping**: ship as a PWA in Sprint 7. Manifest + service worker. Installable on phone home screen, fullscreen launch, push notifications, limited offline. Native iOS/Android app deferred until adoption justifies.

5. **Customers table**: lands in Sprint 1 alongside the call ingest pipeline. Reasoning: ingest skill writes call records that mention customers; structured customer references are cleaner than free-text from day one. Schema lives in `nervous_system.customers` with: id, name, status (cold/discovery/proposal/contract/onboarding/active/churned), primary_contact_team_member_id, notes, created_at. CRUD UI lands in Sprint 5; Sprint 1 just provisions the table and seeds Zedcor.

6. **Brand assets**: stay in place at `/Users/keka/Dropbox/Projects/Unicron Systems/Brand/` for now. Atrium Library tab reads from disk via the connected workspace mount. Vault migration deferred; brand is not yet load-bearing.

7. **Curtis visibility**: equal tier with Kyle and Keenan. Full visibility, full editing, override authority. Title remains "advisor" for legal/contractual purposes; system permissions are at peer tier. Auto-DRI eligible.

## 23. Done criteria

Atrium is considered shipped (full v1) when:

1. All eight tabs are reachable and functional from desktop and mobile (Home and Work fully mobile)
2. Status pulse and Top of Mind on Home pull live data correctly
3. Throttled activity feed renders without overwhelming
4. Quick capture works on desktop and mobile
5. Global search returns results across all categories
6. System tab editing surfaces (taboos, agents, scheduled jobs, team_members) all route through Taboo Keeper validation
7. Refusal log and audit log render every system change
8. Per-role visibility verified for Kyle, Keenan, and Curtis
9. Notification preferences configurable per user
10. Pathfinder and Metacron product KPIs render against current measurements
11. Vault search returns docs by tag, semantic, and full-text
12. Container tensions section in parent SPEC remains honest: Atrium exposes the refusal layer publicly, does not hide it

## 24. Pushback to retain

Three architectural cautions noted in chat that survive into the SPEC:

1. **Don't replicate truth.** Atrium aggregates and surfaces. Stripe owns billing truth. HubSpot owns CRM truth. Calendar providers own meeting truth. Vault and Notion own work-in-flight truth. Atrium is a window onto these, never a competing system. Manual entry is a temporary fallback only.

2. **Scope creep risk.** Eight tabs is the limit. Every feature answers one of the eight verbs from section 1. New feature requests must name which verb they answer. If they don't, they don't ship.

3. **The cockpit is not a backdoor.** Every system-modifying edit routes through the same Taboo Keeper humans see in Slack and Cowork. Fast UI does not mean unguarded UI. Refusal-gate endpoints are mandatory.

End SPEC v0.1.
