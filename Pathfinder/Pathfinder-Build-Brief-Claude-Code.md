# Pathfinder — Build Brief for Claude Code

**Status:** Draft v1 · **Date:** April 25, 2026 · **Pairs with:** Pathfinder-PRD.md
**Audience:** Claude Code (build execution)
**Build target:** 5 days, deployed live demo at a Vercel subdomain

This brief defines what Pathfinder must do, what it must contain, and how it must be wired. Visual design is yours — pick a coherent direction and execute it consistently. Guidance under "Design Freedom" below sets the boundaries.

---

## Overview

Pathfinder is a 5-day demo prototype that proves the agent-driven field-intelligence pattern using public data + synthetic Zedcor structure. Output is a deployable Vercel web dashboard demoed live to land a paid pilot. Perplexity Computer is the engine — it runs three named agents that own ingestion, ranking, and adjacent-account discovery. The dashboard is the operations console for that agent fleet. Claude Code builds the dashboard, the supporting backend, and authors the Computer agent system prompts; Claude Code does NOT run the agents — Computer does.

## The Three Computer Agents (engine)

Pathfinder is operated by three named Computer agents. Each lives in a dedicated Perplexity Space, has a system prompt stored in `prompts/`, runs on its own schedule, and writes directly to Supabase via the Supabase MCP. The dashboard surfaces what they do.

1. **Pathfinder Ingestor** — runs every 6 hours. Uses Computer's browser automation against Harris County permit portal. Hits USAspending and SAM.gov via their public APIs. Pulls Google News for construction signals. Cross-correlates entities across sources (one announcement + one permit + one contract = same project, deduplicate). Writes normalized records to Supabase via MCP. Logs every step to the `agent_log` table.

2. **Pathfinder Ranker** — runs every 30 minutes (or triggered by new ingest). Reads unranked projects, branches, and customers from Supabase. Uses Computer's multi-model orchestration: a fast/cheap model classifies "is this a real opportunity" (yes/no filter), Claude Sonnet generates the rationale paragraph and outreach hook. Computer also runs the geographic scoring deterministically. Writes scored projects back to Supabase. Logs model routing decisions.

3. **Pathfinder Adjacent Discovery** — runs weekly. Researches multi-branch field-sales companies in Zedcor's shape (specialty trades, restoration, multi-location services). Drafts personalized outreach. Produces the "the pattern repeats" evidence required for the contest submission. Writes target accounts to a separate Supabase table.

Computer agents are NOT triggered by Claude Code's API endpoints. Computer writes to Supabase directly. Eliminate any `/api/ingest/[source]` push endpoints from the architecture.

## File Structure

```
pathfinder/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                      Main dashboard
│   ├── api/
│   │   ├── projects/route.ts         GET projects with filters
│   │   ├── projects/[id]/route.ts    GET single project detail
│   │   ├── branches/route.ts         GET all branches
│   │   ├── customers/route.ts        GET all customers
│   │   ├── agents/route.ts           GET agent status (last run, queue, errors)
│   │   ├── activity/route.ts         GET recent agent_log events (paginated, polled)
│   │   └── stats/route.ts            GET activity counters
│   └── middleware.ts                 Basic auth guard
├── components/
│   ├── Map.tsx                       Map wrapper (Mapbox or Leaflet)
│   ├── BranchMarker.tsx
│   ├── ProjectPin.tsx
│   ├── CustomerMarker.tsx
│   ├── CoverageRadius.tsx
│   ├── BranchList.tsx
│   ├── ProjectList.tsx
│   ├── ProjectModal.tsx
│   ├── ActivityCounter.tsx
│   └── FilterBar.tsx
├── lib/
│   ├── supabase.ts
│   ├── scoring.ts                    Distance + branch matching (pure, no API deps)
│   └── types.ts
├── public/seed-data/
│   ├── branches.json                 5 synthetic Zedcor branches
│   └── customers.json                30 synthetic customers
├── scripts/
│   ├── seed.ts
│   └── backfill.ts
├── prompts/
│   ├── computer-ingestor.md          Pathfinder Ingestor system prompt
│   ├── computer-ranker.md            Pathfinder Ranker system prompt
│   ├── computer-adjacent.md          Pathfinder Adjacent Discovery system prompt
│   └── claude-ranking-rationale.md   Inner prompt used by Ranker for rationale gen
├── docs/
│   ├── CLAUDE.md
│   └── ARCHITECTURE.md
├── .env.example
└── package.json
```

## Screens / Views

**Main Dashboard (`/`)** — Single full-bleed dashboard. Contains: map of North America, list of synthetic branches, ranked project list for the selected branch, live activity counter, filter controls.

**Project Detail Modal** — Overlays on click of any pin or list item. Shows project metadata, distance to nearest branch and nearest customer, project stage, Claude rationale, recommended outreach hook, raw record (collapsible), source link.

**Loading State** — Reasonable loading treatment during initial fetch.

**Empty State** — Only appears if seed data is missing.

## User Flows

1. **Open demo.** Curtis hits the deployed URL. Basic auth gates the page. Map loads centered on continental US. 5 branch markers visible. Activity counter shows current totals.
2. **Focus a branch.** Click branch → map focuses on it with coverage radius visible → ranked projects for that branch appear.
3. **View a project.** Click project (in list or pin) → modal opens with Claude rationale, source link, recommended outreach. Esc or click-outside closes.
4. **Cross-pollination view.** Toggle "show customers" → synthetic customer markers appear → projects within 50 miles of a customer served by a different branch get visually distinguished as warm-intro candidates.
5. **Live ingest.** Computer hits `/api/ingest/[source]` every 6 hours → records insert into Supabase → realtime subscription fires → new pins appear on map → counter updates.

## Components

- **Map** — Wraps the chosen map library. Renders branch markers, project pins, customer markers, coverage circle. Inputs: branches, projects, customers, selectedBranchId, showCustomers. Click handlers select branch and open project modal.
- **BranchMarker** — Branch identifier. Click selects.
- **ProjectPin** — Visually distinguishes by Claude score tier. Click opens modal.
- **CustomerMarker** — Smaller / muted than branch and project markers. Only visible when showCustomers=true.
- **CoverageRadius** — Translucent circle, 300-mile radius around selected branch.
- **BranchList** — List of branches with project counts and a high-priority indicator.
- **ProjectList** — Ranked project list for selected branch. Sortable by score / distance / posted date. Each row: title, source, distance, score, key metadata.
- **ProjectModal** — Overlay with full project context.
- **ActivityCounter** — Shows ingestion stats. Polls `/api/stats` every 30s.
- **FilterBar** — Source filter pills (4 sources), cross-pollination toggle, demo-mode indicator.

## State & Data

- **Persistent:** All in Supabase. Tables: `branches`, `customers`, `projects`, `ingestion_runs`.
- **URL state:** `?branch=phx-001` selects branch, `?project=usa-12345` opens modal. Enables deep-linking.
- **In-memory only:** Map camera position, hover states, filter selections.
- **Realtime:** Supabase realtime subscription on `projects` table → triggers pin appearance on insert.

**Schema isolation:** All Pathfinder tables live in a dedicated `pathfinder` schema inside the existing `unicron-systems` Supabase project — not in `public`. The DB Subagent's first migration creates the schema and grants appropriate role access; every subsequent migration and every query uses the `pathfinder.` schema prefix. The Supabase MCP write access for Computer agents must be scoped to the `pathfinder` schema only (not `public`, not the whole project). Set the connection's `search_path` to `pathfinder, public` so unqualified references resolve correctly.

**Tables (all in the `pathfinder` schema):**

```
pathfinder.branches: id, name, code, lat, lon, coverage_radius_miles, opened_date, region

pathfinder.customers: id, name, lat, lon, served_by_branch_id, customer_since, monthly_value

pathfinder.projects: id, source, source_id, title, summary, lat, lon, project_value,
                     project_stage, posted_date, raw_payload (jsonb), rationale,
                     score (0-100), nearest_branch_id, distance_miles,
                     outreach_hook, ingested_at, ranked_at

pathfinder.agent_log: id, agent_name, event_type, event_data (jsonb), latency_ms,
                      model_used, ts
                      // event_type examples: ingest_start, source_fetch, entity_correlate,
                      // model_route, rationale_generate, score_assign, write_success, error

pathfinder.agent_runs: id, agent_name, started_at, completed_at, records_processed,
                       records_new, status (running|success|failed), error_message

pathfinder.adjacent_targets: id, company_name, geography, branch_count_estimate,
                             shape_match_reason, outreach_draft, surfaced_at
```

The `agent_log` table is the source of truth for the dashboard's activity log strip and pipeline strip. Computer writes one row per significant agent action. Dashboard polls `/api/activity` every 5s (or uses Supabase realtime).

## Behavior & Interactions

- New project pins should appear with restrained motion (no flashy or bouncy effects).
- Branch selection should produce a clear visual response — map should focus, project list should update.
- Modal open/close should feel quick and weightless.
- Activity counter should update visibly when values change.
- Hover and active states on every interactive element.
- Keyboard: Esc closes modal.
- Responsive: desktop-first (≥1280px). iPad landscape works. Below that, show "open on desktop for the demo."

## Edge Cases

- Source API down → ingestion_runs row marked failed → counter excludes from "new" but shows prior records → no UI error (silent for demo).
- No projects in branch coverage → list shows empty state with reasonable copy.
- Map token missing → fall back to a free alternative (Leaflet + OpenStreetMap).
- Claude API rate limit → ranking job retries with exponential backoff up to 3 times → unranked projects show with a "ranking pending" indicator.
- Realtime subscription drops → polling fallback every 60s.
- Basic auth: 3 wrong attempts → 60s lockout (Vercel middleware).

## Architecture Notes

These constraints exist because Phase 2 of this product is an on-prem deployment at Zedcor running on their L4 GPUs against their real MySQL. The cloud demo and the production embed share most of the codebase. A few separations now save a rewrite later.

- **`lib/scoring.ts` must have zero external API dependencies.** No Claude API, no Supabase, no fetch calls. Pure functions: take projects and branches/customers as inputs, return scored matches as outputs. This module gets transplanted into a container running on Zedcor's L4s in Phase 2; it cannot reach to the cloud at runtime.
- **`lib/claude.ts` (rationale generation) is cloud-only.** Claude API for the natural-language reasoning paragraph and recommended outreach hook. This stays in our infrastructure even in Phase 2.
- **Ingest endpoints (`/api/ingest/*`) are cloud-only.** Public-data ingestion is our SaaS layer.
- **Net result:** Phase 2 deploys `lib/scoring.ts` in a container on Zedcor's L4s with a small local model (Llama 3.1 8B via Ollama or vLLM) doing entity matching against their MySQL. The cloud side keeps ingesting public data and generating Claude rationale. The two halves talk via a thin API. Build with that split in mind from day one.

## Design Reference

The visual design is delivered as a Claude design file — fetch and read this before writing UI code:

`https://api.anthropic.com/v1/design/h/gUxcVCzaBoZ5_UOtp2GUMA?open_file=Pathfinder+Hi-Fi.html`

Read the readme included with the design file, then implement `Pathfinder Hi-Fi.html`. The design includes the liveness elements specified in `Pathfinder-Design-Feedback-Liveness.md` (activity log strip, pipeline strip, sonar pings on new pins, score count-ups, branch-count tick highlights, streaming rationale on first modal open, pulsing LIVE dot). Implement all of them — they're the contest's "Computer is the engine" signal.

## Out of Scope

- Real Zedcor data — branches and customers are synthetic, schema-mirrored
- HubSpot / Salesforce write-back
- Slack output
- User auth beyond basic auth
- Project edit / accept / decline / status workflow
- Mobile-optimized layout
- On-prem Llama deployment
- Production cross-pollination engine (the toggle is a visual demo only)

## Acceptance Criteria

- It works when the three Computer agents (Ingestor, Ranker, Adjacent Discovery) are authored as system prompts in `prompts/`, deployed into Perplexity Spaces, and writing to Supabase via the Supabase MCP on their defined schedules.
- It works when the dashboard renders 5 synthetic Zedcor branches with 300-mile coverage radii and project pins on the map.
- It works when clicking a branch reveals that branch's top-15 ranked projects with rationale visible per project.
- It works when clicking a project opens a modal showing full reasoning, source link, recommended outreach, and raw record.
- It works when toggling cross-pollination view shows synthetic customer markers and visually distinguishes warm-intro candidate projects.
- It works when basic auth gates the public URL and Curtis can demo from any browser with the password.
- It works when at least 100 real projects across the 4 public sources are visible after a 7-day backfill window — produced by the Ingestor agent, not by Claude Code.
- It works when the activity log strip and pipeline strip both visibly stream Computer's actions in real time during the demo.

## Design Freedom

This product looks like an instrument, not a consumer marketing site. Beyond that, design is yours. Some boundaries:

- Pick a coherent visual direction — light or dark, dense or airy, technical or refined — and execute it consistently across every surface.
- Color must encode meaning: branch markers, new opportunities, high-priority opportunities, low-signal noise, and cross-pollination warm-intros need to be visually distinguishable. Don't add color for decoration.
- Typography: one sans-serif family for everything readable, one monospace family for IDs / codes / numerics. No more.
- Spacing, border radius, and shadow tokens: pick a scale and stick to it.
- Motion: restrained. New pins arriving and modal opens are fine to animate; dashboards do not need showy transitions.
- The map is the protagonist of the dashboard view. UI panels float over or alongside it; they don't compete with it for attention.
- Information density over decoration. A CTO will look at this and judge whether it feels like a system.

If you want a directional reference: Linear, Mapbox Studio, or a Bloomberg-grade ops dashboard are all fair targets. Don't copy any of them — pick one direction and own it.

---

## Skills, Plugins & Subagents

**Skills to invoke during the build**

- `writing-plans` — already covered by this brief; read before starting
- `subagent-driven-development` — required, this is a 5-stream parallel build
- `test-driven-development` — light, only for `lib/scoring.ts` and Claude rationale parsing
- `verification-before-completion` — verify the live Vercel URL works before reporting done
- `requesting-code-review` — once each subagent ships, run a self-review pass
- `finishing-a-development-branch` — final step, merge feature branches, tag v0.1

**Plugins / MCPs to wire before kickoff**

- Supabase MCP — schema, migrations, seed
- Vercel MCP — deploy + env var management
- GitHub MCP — repo init, branch management, commits
- Notion MCP — read this brief, the PRD, and the Zedcor lead notes for ranking-prompt context
- Computer (Perplexity) — separate engine. Computer drives the 4 ingestion sources independently and posts to `/api/ingest/[source]` endpoints Claude Code builds.

**Subagent breakdown — dispatch in parallel**

1. **DB Subagent** — Supabase project setup, schema migrations (including `agent_log`, `agent_runs`, `adjacent_targets`), seed scripts loading 5 synthetic branches + 30 customers, realtime subscription config, RLS policies that allow Computer's MCP-authenticated writes. Owns `lib/supabase.ts`, `scripts/seed.ts`, all migrations.

2. **Computer Agent Authoring Subagent** — Authors the three Computer agent system prompts in `prompts/computer-*.md`. Each prompt specifies: schedule, tools (MCP connectors needed, browser automation directives), data sources, output schema (must match `projects` / `agent_log` / `adjacent_targets`), error handling. Also authors `prompts/claude-ranking-rationale.md` (the inner prompt the Ranker uses when calling Claude API). This subagent does NOT run the agents — it produces the prompts that go into Perplexity Spaces.

3. **Map Dashboard Subagent** — Next.js app shell, layout, map integration, all map components, basic auth middleware. Reads from Supabase via the read-side API routes.

4. **Liveness Subagent** — Activity log strip (reads `agent_log`, scrolling tail-f style), pipeline strip (reads `agent_runs` + `agent_log` aggregates, shows agent status + queue depth + avg latency), pulsing LIVE dot, sonar pings on new pin arrivals, score count-up animation, branch-count tick highlights, streaming Claude rationale on first modal open. Owns the visual signals that make Computer's work visible.

5. **Polish Subagent** — Activity counter, modal, FilterBar, cross-pollination toggle, loading and empty states, deploy to chosen Vercel subdomain.

**Pure-function library**

`lib/scoring.ts` is the only pure-function module — geographic distance, branch coverage matching, deterministic score components. Zero API dependencies. Phase 2 transplants this onto Zedcor's L4s in a container.

**Computer's separate workstream (not Claude Code)**

Computer runs the three scheduled agents authored by the Computer Agent Authoring Subagent. Kyle (or Curtis) drops the prompts into Perplexity Spaces, configures schedules, connects the Supabase MCP with write access, and points the agents at their data sources. From that point Computer operates the system continuously — the dashboard reads what Computer writes.

**Build sequence**

- Day 1: DB Subagent (1 hour) → Map and Ingestion Subagents dispatch in parallel
- Day 2: Map and Ingestion continue; Ranking Subagent kicks off once schema is live
- Day 3: All 5 subagents converging; Computer scheduled agents wired against live `/api/ingest` endpoints
- Day 4: Polish Subagent runs; first end-to-end demo run-through
- Day 5: Buffer + verification + demo dry-run

## Open Items Before Kickoff

- Project name confirmation — assumed "Pathfinder"
- Domain — confirm the Vercel subdomain to deploy under
- Map provider — Mapbox (preferred, requires free token) or Leaflet (no token, OpenStreetMap)
- Vercel project name
- Supabase project name
