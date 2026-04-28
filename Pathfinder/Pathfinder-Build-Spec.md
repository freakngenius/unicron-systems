# Pathfinder — Build Spec

**Status:** Draft v1 · **Date:** April 25, 2026 · **Pairs with:** Pathfinder-PRD.md
**Audience:** Claude Code (build) and Claude Design (front-end design pass before build)
**Build target:** 5 days, deployed live demo at a Vercel subdomain

---

## Overview

Pathfinder is a 5-day demo prototype that proves the agent-driven field-intelligence pattern using public data + synthetic Zedcor structure. Output is a deployable Vercel web dashboard that Curtis demos live to Zedcor's CTO to land the paid pilot. Computer runs the ingestion side; Claude Code builds the dashboard, ranking layer, and ingestion API endpoints.

## File Structure

```
pathfinder/
├── app/
│   ├── layout.tsx                    Root layout, dark mode default
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
│   ├── Map.tsx                       Mapbox wrapper
│   ├── BranchMarker.tsx
│   ├── ProjectPin.tsx
│   ├── CustomerMarker.tsx
│   ├── CoverageRadius.tsx
│   ├── BranchList.tsx                Left sidebar list
│   ├── ProjectList.tsx               Right slide-out per-branch list
│   ├── ProjectModal.tsx              Click-to-open detail
│   ├── ActivityCounter.tsx           Top-right live stats
│   └── FilterBar.tsx                 Top filters + cross-pollination toggle
├── lib/
│   ├── supabase.ts                   Client + admin instances
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
│   ├── seed.ts                       Load synthetic data into Supabase
│   └── backfill.ts                   Manual ingestion trigger for demo prep
├── prompts/
│   ├── computer-usaspending.md       Computer prompt for USASpending poll
│   ├── computer-samgov.md
│   ├── computer-googlenews.md
│   ├── computer-harriscounty.md
│   └── claude-ranking.md             System prompt for ranking + rationale
├── docs/
│   ├── CLAUDE.md                     Project memory for Claude Code
│   └── ARCHITECTURE.md
├── .env.example
├── next.config.js
├── tailwind.config.ts
└── package.json
```

## Screens / Views

**Main Dashboard (`/`)** — Full-screen Mapbox view of North America. Left sidebar (320px) lists 5 synthetic branches with project counts. Top bar holds logo, activity counter, cross-pollination toggle, source filter pills. Right panel (440px) slides in when a branch is selected, showing top 15 ranked projects.

**Project Detail Modal** — Overlays on click of any pin or list item. Shows: project title, source badge, posted date, project value, location, distance to nearest branch, distance to nearest customer, Claude rationale (3-paragraph block), recommended outreach hook, source URL (opens new tab), collapsible raw JSON.

**Loading State** — Skeleton shimmer on map and lists during initial fetch.

**Empty State** — Only appears if seed data missing; prompt to run seed script.

## User Flows

1. **Open demo.** Curtis hits the Vercel URL, basic auth prompts, enters password. Map loads centered on continental US. 5 branch markers visible. Activity counter shows totals.
2. **Focus a branch.** Click branch in sidebar → map pans/zooms to branch with coverage circle visible → right panel slides in showing top 15 ranked projects for that branch.
3. **View a project.** Click project in list (or pin on map) → modal opens with full Claude rationale, source link, recommended outreach. Esc or click-outside closes.
4. **Cross-pollination view.** Toggle "Show customers" in top bar → 30 synthetic customer markers appear → projects within 50 miles of a customer served by a different branch get a special highlight ring → toggle off to clear.
5. **Live ingest.** Computer hits `/api/ingest/[source]` every 6 hours → records insert into Supabase → realtime subscription on dashboard fires → new pins fade in with pulse animation → counter ticks up.

## Components

- **Map** — Wraps Mapbox GL JS. Inputs: branches, projects, customers, selectedBranchId, showCustomers. Renders all marker layers, handles click events, manages camera transitions.
- **BranchMarker** — Cobalt circle, branch code label. Click selects branch.
- **ProjectPin** — Color-coded by Claude score (mint / amber / neutral). Hover shows mini-tooltip. Click opens modal.
- **CustomerMarker** — Smaller, muted circle. Only visible when showCustomers=true.
- **CoverageRadius** — Translucent circle, 300-mile radius around selected branch.
- **BranchList** — Left sidebar. Each row: branch name, project count, "high-priority" count badge.
- **ProjectList** — Right panel. Sortable by score / distance / posted date. Each row: title, source pill, distance, score badge.
- **ProjectModal** — Overlay. Pulls full project record. Renders Claude rationale as Markdown.
- **ActivityCounter** — Top-right. Shows "Pulled in last 6h: X • This week: Y • High-priority: Z." Polls `/api/stats` every 30s.
- **FilterBar** — Source filter pills (4 sources), cross-pollination toggle, "demo mode" indicator.

## State & Data

- **Persistent:** All in Supabase. Tables: `branches`, `customers`, `projects`, `ingestion_runs`.
- **URL state:** `?branch=phx-001` selects branch, `?project=usa-12345` opens modal. Enables deep-linking for screenshots.
- **In-memory only:** Map camera position, hover state, filter selections.
- **Realtime:** Supabase realtime subscription on `projects` table → triggers pin animation on insert.

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

## Interactions & Behavior

- New project pin: 800ms fade-in with subtle scale-up + ring pulse, then settle
- Branch selection: 600ms map camera ease, sidebar highlights, right panel slides in (320ms)
- Modal: 200ms backdrop fade + 240ms modal scale-in from 96%
- Activity counter: number tick-up animation when value changes (250ms)
- Hover states: 120ms color transition on all interactive elements
- Keyboard: Esc closes modal, `/` focuses sidebar search (post-MVP, stub for now)
- Responsive: desktop only (≥1280px); iPad landscape works; below that show "Open on desktop for the demo"

## Design Tokens

**Surfaces**
- Background: `#0B0F14`
- Surface: `#131922`
- Surface-elevated: `#1B2230`
- Border: `#1F2735`

**Text**
- Primary: `#E6EAF0`
- Secondary: `#8A95A5`
- Muted: `#5B6675`

**Accents**
- Mint (new): `#3DDC97`
- Amber (high-priority): `#FFB454`
- Cobalt (branch markers): `#5B7FFF`
- Magenta (cross-pollination warm-intro): `#E879F9`

**Typography**
- Family: Inter or Geist Sans
- Scale: 12/16, 14/20, 16/24, 20/28, 32/40
- Tracking: -0.01em body, -0.02em headers

**Spacing & Shape**
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64
- Radius: 6 (small), 12 (cards), 16 (modals)
- Shadow: `0 8px 32px rgba(0,0,0,0.4)` on elevated surfaces only

## Edge Cases

- Source API down → ingestion_runs row marked failed → counter excludes from "new" but includes prior records → no UI error (silent for demo)
- No projects in branch coverage → list shows "No new opportunities in last 30 days for this branch" empty state
- Mapbox token missing → app boots with Leaflet fallback (free, OpenStreetMap tiles)
- Claude API rate limit → ranking job retries with exponential backoff up to 3 times → unranked projects show with "Ranking pending" badge
- Realtime subscription drops → polling fallback every 60s
- Basic auth: 3 wrong attempts → 60s lockout (Vercel middleware)

## Out of Scope

- Real Zedcor data
- HubSpot / Salesforce write-back
- Slack output
- User auth beyond basic auth
- Project edit / accept / decline / status workflow
- Mobile-optimized layout
- On-prem Llama deployment
- Scope-A production cross-pollination engine (the toggle is a visual demo only)

## Acceptance Criteria

- It works when all 4 ingestion sources are wired and pulling real records on a 6-hour cron into Supabase, with `ingestion_runs` logged.
- It works when the dashboard renders 5 synthetic Zedcor branches with 300-mile coverage radii and project pins layered on Mapbox.
- It works when clicking a branch reveals that branch's top-15 ranked projects with Claude rationale visible per project.
- It works when clicking a project opens a modal showing full Claude reasoning, source link, recommended outreach hook, and raw record.
- It works when toggling cross-pollination view shows synthetic customer markers and highlights warm-intro candidate projects.
- It works when basic auth gates the public URL and Curtis can demo from any browser with the password.
- It works when at least 100 real projects across the 4 sources are visible after a 7-day backfill window.

---

## Skills, Plugins & Subagents for Claude Code

**Skills to invoke during the build**

- `writing-plans` — already covered by this spec; Claude Code reads it before starting
- `subagent-driven-development` — required, this is a 5-stream parallel build
- `test-driven-development` — light, only for `lib/scoring.ts` (geographic distance, branch matching) and Claude rationale parsing — not full TDD across the codebase
- `verification-before-completion` — Claude Code must verify the live Vercel URL works before reporting done
- `requesting-code-review` — once each subagent ships, run a self-review pass
- `finishing-a-development-branch` — final step, merge feature branches, tag v0.1

**Plugins / MCPs to wire before kickoff**

- Supabase MCP — already connected; Claude Code uses for schema, migrations, seed
- Vercel MCP — already connected; deploy + env var management
- GitHub MCP — repo init, branch management, commits
- Notion MCP — Claude Code reads this spec from Notion as project memory; reads Zedcor lead notes for ranking-prompt context
- Computer (Perplexity) — separate engine, not a Claude Code MCP. Computer drives the 4 ingestion sources independently and posts to `/api/ingest/[source]` endpoints Claude Code builds.

**Subagent breakdown — dispatch in parallel**

1. **DB Subagent** — Supabase project setup, schema migrations, seed scripts loading 5 synthetic branches + 30 customers, realtime subscription config. Owns `lib/supabase.ts`, `scripts/seed.ts`, all migrations.

2. **Ingestion Subagent** — 4 source connectors as Vercel API routes (`/api/ingest/[source]`). Pure-function ingest modules in `lib/ingest/`. Each module: fetch from source, normalize to project schema, deduplicate, insert. Also writes the 4 Computer prompts in `prompts/` that drive these endpoints.

3. **Map Dashboard Subagent** — Next.js app shell, layout, Mapbox integration, all map components (Map, BranchMarker, ProjectPin, CustomerMarker, CoverageRadius), basic auth middleware.

4. **Ranking Subagent** — Claude API integration in `lib/claude.ts`, prompt engineering for the rationale generation (`prompts/claude-ranking.md`), scoring logic in `lib/scoring.ts`, `/api/rank/route.ts` endpoint, batch ranking flow.

5. **Demo Polish Subagent** — Activity counter, animations, modal interactions, FilterBar, cross-pollination toggle visual, loading and empty states, deploy to chosen Vercel subdomain.

**Computer's separate workstream (not Claude Code)**

Computer runs the 4 scheduled scrapers/API pollers, hitting Pathfinder's `/api/ingest/[source]` endpoints every 6 hours. The Ingestion Subagent's deliverable includes the 4 Computer prompts (`prompts/computer-*.md`). Kyle drops these prompts into Computer scheduled-agent slots once the API routes are live. This is what makes Computer the visible engine in the demo narrative.

**Build sequence**

- Day 1: DB Subagent (1 hour) → Map Subagent + Ingestion Subagent dispatch in parallel
- Day 2: Map and Ingestion continue; Ranking Subagent kicks off once DB schema is live
- Day 3: All 5 subagents converging; Computer scheduled agents wired against live `/api/ingest` endpoints
- Day 4: Polish Subagent runs; first end-to-end demo run-through
- Day 5: Buffer + Claude Code verification + demo dry-run with Curtis

## Open Items Before Kickoff

- **Project name** confirmation — assumed "Pathfinder"
- **Domain** — assumed `pathfinder.unicron.systems`; confirm or substitute
- **Mapbox token** — free tier; account setup is 5 minutes
- **Vercel project name** — pick before kickoff so subagents deploy consistently
- **Supabase project name** — same
