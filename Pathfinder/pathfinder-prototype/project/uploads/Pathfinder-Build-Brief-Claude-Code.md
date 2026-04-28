# Pathfinder — Build Brief for Claude Code

**Status:** Draft v1 · **Date:** April 25, 2026 · **Pairs with:** Pathfinder-PRD.md
**Audience:** Claude Code (build execution)
**Build target:** 5 days, deployed live demo at a Vercel subdomain

This brief defines what Pathfinder must do, what it must contain, and how it must be wired. Visual design is yours — pick a coherent direction and execute it consistently. Guidance under "Design Freedom" below sets the boundaries.

---

## Overview

Pathfinder is a 5-day demo prototype that proves the agent-driven field-intelligence pattern using public data + synthetic Zedcor structure. Output is a deployable Vercel web dashboard demoed live to land a paid pilot. Computer (Perplexity) runs the ingestion side. Claude Code builds the dashboard, ranking layer, and ingestion API endpoints.

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
│   │   ├── ingest/[source]/route.ts  POST endpoint Computer pushes to
│   │   ├── rank/route.ts             POST trigger Claude ranking batch
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
│   ├── claude.ts                     Ranking prompt + API call
│   ├── scoring.ts                    Distance + branch matching
│   ├── ingest/
│   │   ├── usaspending.ts
│   │   ├── samgov.ts
│   │   ├── googlenews.ts
│   │   └── harriscounty.ts
│   └── types.ts
├── public/seed-data/
│   ├── branches.json                 5 synthetic Zedcor branches
│   └── customers.json                30 synthetic customers
├── scripts/
│   ├── seed.ts
│   └── backfill.ts
├── prompts/
│   ├── computer-usaspending.md
│   ├── computer-samgov.md
│   ├── computer-googlenews.md
│   ├── computer-harriscounty.md
│   └── claude-ranking.md
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

**Schemas:**

```
branches: id, name, code, lat, lon, coverage_radius_miles, opened_date, region

customers: id, name, lat, lon, served_by_branch_id, customer_since, monthly_value

projects: id, source, source_id, title, summary, lat, lon, project_value,
          project_stage, posted_date, raw_payload (jsonb), claude_rationale,
          claude_score (0-100), nearest_branch_id, distance_miles,
          outreach_hook, ingested_at

ingestion_runs: id, source, started_at, completed_at, records_pulled,
                records_new, status (success|failed), error_message
```

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

- It works when all 4 ingestion sources are wired and pulling real records on a 6-hour cron into Supabase, with `ingestion_runs` logged.
- It works when the dashboard renders 5 synthetic Zedcor branches with 300-mile coverage radii and project pins on the map.
- It works when clicking a branch reveals that branch's top-15 ranked projects with Claude rationale visible per project.
- It works when clicking a project opens a modal showing full Claude reasoning, source link, recommended outreach, and raw record.
- It works when toggling cross-pollination view shows synthetic customer markers and visually distinguishes warm-intro candidate projects.
- It works when basic auth gates the public URL and Curtis can demo from any browser with the password.
- It works when at least 100 real projects across the 4 sources are visible after a 7-day backfill window.

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

1. **DB Subagent** — Supabase project setup, schema migrations, seed scripts loading 5 synthetic branches + 30 customers, realtime subscription config. Owns `lib/supabase.ts`, `scripts/seed.ts`, all migrations.

2. **Ingestion Subagent** — 4 source connectors as Vercel API routes (`/api/ingest/[source]`). Pure-function ingest modules in `lib/ingest/`. Each module: fetch from source, normalize to project schema, deduplicate, insert. Also writes the 4 Computer prompts in `prompts/`.

3. **Map Dashboard Subagent** — Next.js app shell, layout, map integration, all map components, basic auth middleware.

4. **Ranking Subagent** — Claude API integration in `lib/claude.ts`, prompt engineering for the rationale generation (`prompts/claude-ranking.md`), scoring logic in `lib/scoring.ts`, `/api/rank/route.ts` endpoint, batch ranking flow.

5. **Polish Subagent** — Activity counter, modal, FilterBar, cross-pollination toggle, loading and empty states, deploy to chosen Vercel subdomain.

**Computer's separate workstream (not Claude Code)**

Computer runs the 4 scheduled scrapers/API pollers, hitting Pathfinder's `/api/ingest/[source]` endpoints every 6 hours. The Ingestion Subagent's deliverable includes the 4 Computer prompts (`prompts/computer-*.md`). Drop these into Computer scheduled-agent slots once the API routes are live.

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
