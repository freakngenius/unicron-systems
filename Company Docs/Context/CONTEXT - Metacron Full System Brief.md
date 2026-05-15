# CONTEXT — Metacron Full System Brief

Handoff doc for a fresh Cowork session. Everything known about what Metacron is, how it
works, the code, the systems, the seams. Live state (kanban, schema, git, Vercel) must be
re-checked at session start — this doc is the map, not the current position.

---

## 1. What Metacron is

Metacron is the **operator-facing platform** of Unicron Systems — a self-designing agentic
intelligence platform built by a 2-person company (Kyle Kesterson + Keenan Hock, advisor
Curtis Smith at peer tier).

Operators (Kyle, Keenan, Curtis, agent-orchestrator engineers) use Metacron to:
- Run the **Architect** agent against a customer profile to generate a system blueprint
- Review/Approve/Deploy Architect proposals
- Monitor agent runs per customer org
- Configure customer onboarding
- Manage the customer roster (Customers tab)
- Eventually productize as Conductor / inter-customer learning / plugin marketplace

Metacron is the operator surface. **Pathfinder** is the customer surface. They share one
backend. The Architect's job: take a customer profile → emit a blueprint → that blueprint
materializes into a real running per-customer agent system + a tailored Pathfinder dashboard.

---

## 2. Three-surface architecture

Three product surfaces, one Supabase backend, deployed independently:

1. **Pathfinder** — customer-facing app. `Pathfinder/` dir. Next.js 14, basePath `/pathfinder`.
   Deploys to pathfinder-ashy.vercel.app, proxied through unicron.systems/pathfinder/*.
   Customer-zero is Zedcor (mobile solar surveillance towers, ~24 branches, construction
   security). Surfaces lead intelligence: scored leads from public data, AI-drafted outreach,
   cross-pollination, pipeline kanban, activity timeline.

2. **Metacron** — operator-facing platform. `unicron-platform/` dir. Vite + React 19.
   Deploys to the unicron-systems Vercel project at root domain. Also embeds inside Atrium.

3. **Atrium** — internal cockpit at atrium.unicron.systems. Lives inside `unicron-platform/`
   repo, feature-flagged + tenant-scoped. Team nervous-system surface (Now, People, Work,
   Money, Marketing, Products, System, Library tabs). SSO + email magic link, allowlist of
   kyle@/keenan@/curtis@/team@unicron.systems.

All three share `pathfinder.*`, `metacron.*`, and `nervous_system.*` schemas in ONE Supabase
project. Same agent backend.

---

## 3. Repos, dirs, deployment

Project root: `/Users/keka/Dropbox/Projects/Unicron Systems/`

Code dirs:
- `Pathfinder/` — Next.js 14 customer app (Vercel project: pathfinder)
- `unicron-platform/` — Vite + React 19; contains BOTH Metacron and Atrium (Vercel
  project: unicron-platform, also referenced as unicron-systems at root domain)
- `Pathfinder-worktrees/`, `Phase2-worktrees/` — active git worktrees
- `_demo-snapshot-2026-04-30/` — locked snapshot, do not touch
- `_archive/` — superseded artifacts; never delete, archive here instead

Vercel projects (SEPARATE — multi-Vercel verification is mandatory, one green ≠ other green):
- **pathfinder** — the Next.js customer app
- **unicron-platform** — serves Atrium + embedded Metacron via hostname routing
- **metacron** (prj_4LlPkQ30I4CMRm6hUfk7CJERWDAz) — standalone Metacron project
- **unicron-systems** — root domain

Hostname-based routing in `unicron-platform/src/App.tsx`:
- `window.location.hostname.startsWith('atrium.')` → AtriumApp
- else → standalone MetacronShell (takes an `embedded` prop)
- METACRON_TABS list lives in App.tsx

Metacron renders inside Atrium as a single left-rail item, v3 LIGHT theme.

---

## 4. Backend

**Supabase** — one project, three schemas: `pathfinder.*`, `metacron.*`, `nervous_system.*`.
- Customer data tables carry `organization_id` + RLS policies. Operator allowlist auth grants
  cross-org read; non-allowlisted sessions blocked. Service role bypasses RLS for system ops
  (cron, agent dispatch).
- Zedcor org_id: `6cd87740-7c72-4337-ac79-316a54242eef`
- Key pathfinder tables: `organizations`, `leads`, `projects`, `agent_log`, `data_sources`,
  `outreach_drafts`, `briefings`, `agent_runs`, `agent_verifications`, `architect_sessions`
  (~26 rows), `architect_proposals` (~13 rows), `org_memberships`, `invite_log`
- RLS sweep completed across 37+ tables. Phase 2A completion migration added
  `organization_id` + RLS to projects/agent_log/data_sources/outreach_drafts/briefings/
  agent_runs, backfilled with Zedcor org_id, projects.created_at backfilled from ingested_at.

**Inngest** (cloud) — event-driven agent dispatch.
- Serve URL: `https://www.unicron.systems/pathfinder/api/inngest`
- KNOWN BUG (diagnosed, fix in flight): event name mismatch. Emitter sends
  `pathfinder/org.ingest_requested` (~37/day); the orgCreated function ("Org created — flip
  status to first_run", Phase 2E slice 2) listens for `pathfinder/org.created` → 0 runs.
  CC paste issued to reconcile both ends to the canonical name.

**Agent backend** (shared across all surfaces):
- LLM gateway (tracks cost per call)
- Architect (decomposition, weekly tuning, weekly discovery) — SHIPPED
- Source Onboarder (Tier 1 sources) — SHIPPED
- Coverage Expansion Agent — SHIPPED
- Tier 2 human-assist queue — SHIPPED
- Orchestrator, Analyst, Elder, Taboo Keeper (refusal layer) — nervous-system agents
- Vercel cron + Inngest drive the pipeline

**Env vars** — Encrypted type, NOT Sensitive. The 2026-05-10 "Import .env" migration created
broken-ciphertext Sensitive vars (keys present, values empty at runtime). Fixed on
unicron-platform + pathfinder by re-adding 7 as Encrypted (ARCHITECT_API_TOKEN,
SOURCE_ONBOARDER_TOKEN, HUBSPOT_APP_ID/CLIENT_ID/CLIENT_SECRET/REDIRECT_URI/WEBHOOK_SECRET).
The standalone **metacron** project still has ~14 Sensitive vars from the same broken batch —
rotation CC paste issued, status unconfirmed.

---

## 5. Agent pipeline

Shipped pipeline (all on Vercel cron + Inngest, LLM gateway tracks cost):

Ingestor (sam.gov, USAspending, Harris County, news) → Ranker → Verifier → Enricher
(Perplexity) → AdjacencyMapper → GeoMapper → Outreach Drafter → Briefer → Slack Alerts.
Plus the Cross-pollination engine.

The blueprint is the runtime contract: every agent reads its instructions (persona, tone,
thresholds, scoring weights, geography filters, compliance constraints) from `architecture.*`
JSON at runtime — not hardcoded. If the Architect says "verifier threshold 0.85", the
verifier reads 0.85 from `architecture.scoring.thresholds.high_priority` at runtime.

---

## 6. The Architect flow (the core demo path)

The path Metacron must deliver end-to-end for ANY new customer (not just Zedcor):

1. Operator runs Architect with a customer profile/prompt in Metacron
2. Architect emits a blueprint JSON: `business_summary` + `decomposition` (sources, agents,
   scoring, pipeline, vocabulary, branding) + `ui_plan` (KPIs, charts, lead_card_layout,
   filters, dashboard_emphasis)
3. Operator reviews in the Approve/Deploy modal (ApproveDeployModal)
4. Approve & Deploy → org persisted to `pathfinder.organizations` with full architecture JSON,
   status starts at `setting_up`
5. Inngest `org.created` fires automatically on persistence (no manual step)
6. `ingestOrgFunction` runs every adapter declared in `architecture.sources`; status moves
   `first_run` → `ranking` → `ready_to_view`
7. Real ranked + verified leads land in `pathfinder.leads` scoped to that org's UUID
8. Build-out verification (headless) visits `/[slug]`, asserts KPI strip + ≥3 lead cards +
   charts + no console errors → status `build_out_complete`
9. Operator deep-links from Metacron Customers tab → tailored Pathfinder at
   `pathfinder.unicron.systems/[slug]` renders with that org's vocabulary, pipeline stages,
   lead schema, branding, ui_plan layout
10. Operator verifies a lead in Metacron → cross-schema bridge writes to
    `pathfinder.agent_verifications` → Pathfinder activity surface updates ~1s (Phase 1F)
11. SQL probe confirms RLS isolation across orgs

Status state machine: `setting_up` → `first_run` → `ranking` → `awaiting_threshold` (if
<3 leads) → `ready_to_view` → `build_out_complete` / `build_out_failed` → `ready_invite_pending`
→ `invite_sent` → `active`.

"This is not hardcoded or seeded" — zero mock fixtures anywhere customer-facing is a hard
DoD requirement.

---

## 7. Key endpoints / cross-system seams

API routes (Architect History, representative):
- `GET /api/orgs/:slug/architect-history` → list of Architect runs for an org
- `GET /api/orgs/:slug/architect-history/:id` → full run detail
- `POST /api/orgs/:slug/architect-history/rerun` → trigger new decomposition
- `POST /api/organizations` → org create (ApproveDeployModal target)
- `GET /api/organizations/:slug` → status polling
- `POST /api/organizations/:slug/resend-invite` → resend magic link
- `decompose-proxy` → Architect LLM call (verified HTTP 200, ~56s real LLM call)
- `/pathfinder/api/inngest` → Inngest serve endpoint

Cross-system seams:
- **Metacron → Pathfinder bridge** (Phase 1F, LIVE, merged commit 9e79aec): operator Verify
  in Metacron → cross-schema dual-write → `pathfinder.agent_verifications` → Pathfinder
  activity surface
- **Architect → Pathfinder spawn** (Phase 2E, in flight): Approve in Metacron → org persisted
  → Inngest `org.created` → first ingestion dispatches every agent → leads land → status
  flips → operator deep-links to Pathfinder
- **Metacron embedded in Atrium**: hostname routing in App.tsx, `embedded` prop on
  MetacronShell, v3 light theme

Connectors (Connector Framework Sprint): HubSpot OAuth bidirectional, Slack notifications,
Microsoft Teams. Each must roundtrip for at least the test org.

Data sources: every source declared by the Architect is in one of three states only — live
(real adapter), tier-2-queued (declared, awaits operator), or voice-agent (Phase 3+). Never
silent failure, never mock fallback.

---

## 8. Frontend

`unicron-platform/` — Vite + React 19.

Design: **v3 LIGHT theme**. Tokens inline in `Brand/Atrium Design System/v3.jsx`:
- `--v3-bg` #F6F7F9, `--v3-surface` #FFFFFF, `--v3-rail` #1D2D4F (navy),
  `--v3-blue` #6081BE, `--v3-orange` #E8763A, `--v3-ink` #0B1530
- `tokens.css` is the OLD dark v2 — do NOT use it.

Key components:
- `MetacronShell` (App.tsx) — standalone + embedded modes
- ApproveDeployModal — the Architect Approve/Deploy flow
- Customers tab — customer roster, status badges, Pathfinder deep-link button
- Customer Detail — per-org detail; Architect History tab planned (feat/architect-history
  branch unmerged)
- Architect Canvas Flowchart — infinite-canvas node flowchart (@xyflow/react). Replaced the
  static circle. v1 shipped (commit e7d5f47). v2 layout: 1/3 left text pane / 2/3 right
  canvas, both full-height edge-attached, fixed node overlap, removed "ARCHITECT · THINKING"
  label on completion. Renders data sources (top) → watchers → L2-4 agents → dashboard circle
  (bottom).
- Business Summary panel — shared component, reused in Pathfinder + Architect History

Pathfinder customer-facing UI (`Pathfinder/app/[slug]/`, `Pathfinder/components/`):
- Phase 2D dynamic UI rendering: schema-driven LeadCard, Field component, PipelineKanban
  (stages from architecture), `useVocab()` substitution, branding hooks (--accent CSS var),
  generic Filter component, vocab-aware empty states, Activity Ticker (Phase 1F)

---

## 9. Connected tools

- **Notion** — three kanbans, each managed by a dedicated Cowork chat. Claude Code never
  moves cards unless the prompt explicitly says so.
  - Pathfinder Features Kanban: data source `collection://1e675609-7a89-47ff-8edb-f8ed9ccd38c1`
  - Metacron Features Kanban: data source `collection://07970e18-984a-4034-b491-cde76b9b1bad`
    (https://app.notion.com/p/futuroso/Metacron-Features-KanBan-ef3f9250b6424fb6888e19352d2eb53f)
  - Internal Org Kanban: env var NOTION_DB_INTERNAL_KANBAN
  - Atrium Accounts DB: `350785c6-7e72-8039-b4ee-e158a72bf35c`
- **Supabase MCP** — list_migrations, execute_sql, apply_migration (apply is HALT-for-Kyle)
- **Vercel MCP** — deploy status, build logs, runtime logs for all projects
- **GitHub** — repo, PRs, worktrees
- **Inngest** (cloud dashboard) — event + function run inspection
- Connectors being built: HubSpot, Slack, Microsoft Teams

Kanban column semantics: Not Yet Started (backlog) / Zedcor Demo / In Process / Review (PR
not merged) / Deployed (merged, not human-verified) / Bug Fixes / **Verified (HUMAN-ONLY —
only Kyle/Keenan/Curtis)**.

Kanban hygiene on every CC sprint: touched cards → In Process at start, → Deployed/Review/
Bug Fixes per outcome at end. Append `Implemented at <SHA> · merged at <ISO timestamp>` on
merge. Never auto-promote to Verified.

---

## 10. Current state & in-flight work

Shipped:
- Phase 1F Living System Bridge — merged (9e79aec), `pathfinder.agent_verifications` live
- Phase 2A multi-tenant foundation + completion migration (org_id + RLS sweep)
- Architect Canvas Flowchart v1 + v2 — shipped (e7d5f47)
- 7 UI seam fixes — merged
- Architect decomposition working in production (decompose-proxy HTTP 200, real LLM call)
- Vercel deploy queue jam cleared (Pro plan concurrent build limit, flooded by parallel CC
  branch pushes — Kyle cancels stale QUEUED previews when this recurs)

In flight / pending:
- **Inngest event name mismatch** — CC paste issued; unblocks DoD smoke steps 3-4
- **Customer Profile Architect History** — feat/architect-history branch unmerged; CC paste
  issued. Data exists in architect_sessions/architect_proposals; gap is the UI tab.
- **Phase 2C slice 6** — source adapter registry, not started; unblocks DoD smoke steps 5-6
- **metacron Vercel project** — ~14 Sensitive env vars from broken import batch; rotation CC
  paste issued, unconfirmed
- **pathfinder production build failures** — every recent main build ERRORs ~17s (real build
  failure, separate from queue jam); diagnostic CC paste issued
- **Atrium Money Accounts Tab** — spec written, build CC paste issued
- **Phase 2E onboarding completion loop** — depends on 2A + 2C + 2D all merged

Recurring failure modes to watch:
- Write tool reports success but Dropbox sync eats untracked files between sessions → always
  bash-heredoc-write + immediate git commit for Metacron docs
- CC reports "done" but Vercel deploy never processed → after every merge, confirm PRODUCTION
  deployment reaches READY, not just CI green. Check both Vercel projects independently.
- PRs that strip mock fallbacks but leave queries pointing at non-existent columns → broke
  Customer Detail once (PR #280); always verify schema before stripping mocks.

---

## 11. Specs index (Company Docs/Metacron/ and Company Docs/Specs/)

- `SPEC - Definition of Done - End-to-End Operational.md` — AUTHORITATIVE pinned truth. The
  11-step synthetic smoke test (TestCorp-<timestamp>) is the acceptance gate. If any doc
  contradicts this, this wins.
- `SPEC - Architect Canvas Flowchart.md` — infinite-canvas node flowchart + v2 layout
- `SPEC - Customer Profile Architect History.md` — Architect History tab on Customer Detail
- `SPEC - Pathfinder Build-Out Pass.md` — ui_plan generation + headless verifyBuildOut
- `SPEC - Atrium Money Accounts Tab.md` — Notion Accounts DB → grouped paid/free view
- `SPEC - Phase 2A Multi-tenant Routing & Auth.md`
- `SPEC - Phase 2B Tenant Config Layer.md` — architecture types + useVocab
- `SPEC - Phase 2C Dynamic Agent Dispatch.md`
- `SPEC - Phase 2D Dynamic UI Rendering.md`
- `SPEC - Phase 2E Onboarding Completion Loop.md`
- `SPEC - Real Per-Org Dashboard Data.md`
- `SPEC - Production Hardening.md`
- `SPEC - Architect Business Summary Panel.md` (shipped — reference)
- `SPEC - Connectors (Slack, Teams, HubSpot).md`
- `SPEC - Agent Console (Metacron).md`
- `PRD - Phase 2 Tailored Pathfinder.md`
- `PROMPT - Metacron Production Sprint - Master Conductor.md` — re-pasteable autonomous loop
- `PROMPT - Demo Push - Overnight.md` — overnight autonomous loop
- `PROMPT - Demo Path Repair - Orchestrator Mode.md` — 7 broken seams catalog
- `PROMPT - Phase 2D Dynamic UI Rendering - Kickoff.md`
- `PROMPT - Phase 2E Onboarding Completion Loop - Kickoff.md`

---

## 12. Operating rules for the Cowork chat

**Three-engine rule:**
- Cowork = strategy, planning, prompt generation, Notion kanban management, doc writing,
  customer conversations. Does NOT write production code.
- Claude Code = execution. Code, PRs, deploys, autonomous sprints.
- Master Conductor = autonomous sprint dispatcher inside the Internal Org Cowork chat.
- Cowork generates paste-ready CC prompts; Kyle is the relay.

**Hard constraints** (from root CLAUDE.md):
- No destructive git ops (no reset --hard, clean, checkout -- ., restore .). Worktree
  pre-flight: `git status` before touching any worktree not created this session; stash if
  dirty. Incident 2026-05-10: reset --hard wiped a MEMORY file.
- Refusal layer (Taboo Keeper) validates every system-modifying action.
- Verified column is human-only.
- Multi-Vercel verification non-negotiable — pathfinder and unicron-platform are separate
  Vercel projects; verify each independently.
- No time estimates, no numeric cost caps in CC prompts. Safeguards are auto-merge criteria +
  auto-revert triggers + hard-halt conditions.

**Prompt generation rules:** no time estimates, no cost caps, kanban hygiene at start AND
end, bake suggestions INTO prompts (Kyle is the relay), verbatim-evidence requirement in PR
descriptions, multi-Vercel verification baked in.

**Kyle's format preference:** lead with the actionable answer. Tight, no fluff, no filler.
Push back when warranted. For anything to paste into terminal/Comet/CC, give an exact code
block and nothing else — Kyle scans for what to paste. No headers when copy-pasting outside
Cowork. Avoid em-dashes, the word "wedge", "this isn't X. It's X." framing, "what nobody is
naming." No emojis unless Kyle uses one first. Default model assumption is Sonnet unless
specified Opus.

**Orchestrator mode:** when blocked, plan-and-solve, don't halt-and-ask. Autonomous loops
should run until done, not halt every few minutes. Hard-halt list only: migration apply
needed, RLS leak (after fix applied), secret detected, CI red after retries, force-push
required.

---

End.
