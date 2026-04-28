# Pathfinder — Build Plan

**Owner:** Kyle (Unicron Systems)
**Drafted:** 2026-04-27
**Build window:** 5 days · ~2 hours/day human time · balance via Claude Code subagents + Computer scheduled runs
**Canonical specs:** `Pathfinder-PRD.md`, `Pathfinder-Build-Brief-Claude-Code.md`, `Pathfinder-Design-Feedback-Liveness.md`, `Pathfinder-Design-Feedback-Computer-As-Engine.md`
**Superseded:** `Pathfinder-Build-Spec.md` (older, push-endpoint architecture — do not use)

---

## 1. Frame

Pathfinder is the **operations console for a three-agent Perplexity Computer fleet** that runs Zedcor-shaped lead intelligence end to end. Computer is the engine (writes Supabase directly via MCP). Claude Code's job is the dashboard, the Supabase schema, and authoring the agents' system prompts in `prompts/`. Claude Code does NOT run the agents and does NOT build push-style `/api/ingest/*` endpoints.

**The one architectural rule that gates a Phase-2 rewrite:** `lib/scoring.ts` is pure functions only — zero `fetch`, zero Supabase, zero Anthropic. Everything else is cloud-elastic.

**Schema isolation:** All tables live in `pathfinder.*` inside the existing `unicron-systems` Supabase project (`anfihcusvekpovcchpoh`). The `public` schema is in active use by other Unicron projects and must not be touched.

---

## 2. Open items to confirm before dispatching subagents

These five gates block Day 1. Resolved answers below assume defaults; flag any that need to change:

| Item | Default | Action if non-default |
|---|---|---|
| Vercel project name | `pathfinder` (under `kekas-projects-89ac4317`) | Override before Map subagent dispatches |
| Vercel subdomain | `pathfinder.unicron.systems` | Confirm DNS or substitute a `*.vercel.app` URL for the demo |
| GitHub repo | `freakngenius/pathfinder` (new repo, separate from `unicron-systems`) | Confirm or substitute |
| Mapbox token | Use Mapbox (free tier) | If friction, fall back to Leaflet + OpenStreetMap; brief allows it |
| Basic auth password | One-time generated, dropped into Vercel env + 1Password under "Pathfinder · Demo Auth" | Confirm |
| **Design package** | **Both Anthropic design URLs returned 404 when fetched** (`gUxcVCzaBoZ5_UOtp2GUMA` and `x2x1QW56sCn9UKfkbaZR-w`) | **Need fresh URL or attached HTML.** Without it, design follows the explicit tokens already locked in `Pathfinder-Build-Spec.md` (still valid per "visual design holds") + the two Design Feedback documents. |

The design 404 is the only material blocker. Path A: re-share the design link. Path B: I implement against the tokens we already have (palette, typography, spacing in §6 below) and the Liveness + Computer-As-Engine feedback docs. Path B is workable but produces a hi-fi *informed by* the design, not pixel-matched to it.

---

## 3. Repo structure (per Build Brief)

```
Pathfinder/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                      # main dashboard
│   ├── api/
│   │   ├── projects/route.ts         # GET projects with filters
│   │   ├── projects/[id]/route.ts    # GET single project detail
│   │   ├── branches/route.ts
│   │   ├── customers/route.ts
│   │   ├── agents/route.ts           # GET agent status
│   │   ├── activity/route.ts         # GET agent_log tail (paginated)
│   │   └── stats/route.ts            # GET counters
│   └── middleware.ts                 # basic auth gate
├── components/
│   ├── Map.tsx · BranchMarker · ProjectPin · CustomerMarker · CoverageRadius
│   ├── BranchList · ProjectList · ProjectModal
│   ├── ActivityLogStrip · AgentStatusRow · ModelRoutingStrip
│   ├── ActivityCounter · FilterBar
├── lib/
│   ├── supabase.ts                   # client + service-role
│   ├── scoring.ts                    # PURE — distance, branch matching, score components
│   ├── claude.ts                     # streaming rationale fetch (cloud-only)
│   └── types.ts
├── prompts/
│   ├── computer-ingestor.md
│   ├── computer-ranker.md
│   ├── computer-adjacent.md
│   └── claude-ranking-rationale.md
├── public/seed-data/
│   ├── branches.json                 # 5 synthetic Zedcor-mirror branches
│   └── customers.json                # 30 synthetic customers
├── scripts/
│   ├── seed.ts
│   └── backfill.ts                   # local dev only — not in prod ingest path
├── supabase/migrations/              # schema + RLS, all `pathfinder.` qualified
├── docs/
│   ├── PLAN.md                       # this file
│   ├── ARCHITECTURE.md
│   └── CLAUDE.md                     # project memory for Claude Code
├── .env.example
├── next.config.js
├── tailwind.config.ts
└── package.json
```

---

## 4. Five subagent streams (parallel dispatch)

Each subagent owns its files end-to-end. Cross-stream contracts are the type definitions in `lib/types.ts` and the Supabase schema, both produced by Stream 1 first.

### Stream 1 · DB Subagent
**Owns:** `supabase/migrations/*`, `lib/supabase.ts`, `lib/types.ts`, `scripts/seed.ts`, `public/seed-data/*`
**Goal:** `pathfinder` schema live, six tables created, RLS configured, 5 branches + 30 customers seeded, realtime subscriptions enabled.
**Deliverables:**
1. Migration `0001_create_schema.sql` — `CREATE SCHEMA pathfinder; GRANT USAGE / SELECT / INSERT / UPDATE` to `authenticated` and `service_role`; `ALTER ROLE … SET search_path = pathfinder, public`.
2. Migration `0002_tables.sql` — `branches`, `customers`, `projects`, `agent_log`, `agent_runs`, `adjacent_targets` (column lists per Build Brief §State & Data).
3. Migration `0003_realtime.sql` — `ALTER PUBLICATION supabase_realtime ADD TABLE pathfinder.projects, pathfinder.agent_log;`.
4. Migration `0004_rls.sql` — RLS policies that allow Computer's MCP-authenticated writes scoped to `pathfinder` only. Anon read-only on `branches`, `customers`, `projects`, `agent_log`, `agent_runs`, `adjacent_targets`.
5. `lib/supabase.ts` — exports `supabase` (anon, browser) and `supabaseAdmin` (service-role, server). Both initialized with `db: { schema: 'pathfinder' }`.
6. `lib/types.ts` — TypeScript types matching the schema. Single source of truth for all streams.
7. `scripts/seed.ts` — loads `branches.json` + `customers.json` via service role.
8. Seed JSON: 5 Zedcor-mirror branches across NA real geographies (recommend HOU, ATL, PHX, DEN, CGY-Calgary), 30 customers distributed plausibly with `served_by_branch_id` filled.

**Acceptance:** Running `pnpm seed` populates `pathfinder.branches` (5 rows) and `pathfinder.customers` (30 rows). `select * from pathfinder.projects` works (empty). Realtime test publishes on insert.

### Stream 2 · Computer Agent Authoring Subagent
**Owns:** `prompts/*`
**Goal:** Three deployable Perplexity Spaces system prompts + the inner Claude rationale prompt. These are the contest's "Computer is the engine" deliverable.
**Inputs:** Notion lead notes (Zedcor scorecard `347785c67e72809a86f3de8a9c4dfd7c` and Zedcor PoC `34d785c67e72803c9686ca3db173b049`) — already read; the rationale prompt should reflect Zedcor's "pre-budget construction lead discovery" wedge and use ZoomInfo-style enrichment hooks.
**Deliverables:**
1. `computer-ingestor.md` — every-6-hours schedule. Browser automation against `harriscounty.tx.gov` permits; public-API calls to USAspending and SAM.gov; Google News construction-signal queries. Entity correlation rules (one announcement + one permit + one contract = same project, dedupe). Output schema = `pathfinder.projects` insert. Logs every step to `pathfinder.agent_log` with `event_type` ∈ {`ingest_start`, `source_fetch`, `entity_correlate`, `write_success`, `error`}. MCP write scope: `pathfinder` schema only.
2. `computer-ranker.md` — every-30-minutes (or new-ingest-triggered). Reads unranked projects, branches, customers from `pathfinder`. Multi-model orchestration: cheap classifier (gpt-oss-20b or claude-haiku) for "real opportunity yes/no"; Claude Sonnet for rationale + outreach hook; deterministic `lib/scoring.ts`-equivalent for geographic match. Writes `score`, `rationale`, `outreach_hook`, `nearest_branch_id`, `distance_miles` back to `pathfinder.projects`. Logs `model_route` events with `model_used` and `latency_ms`.
3. `computer-adjacent.md` — weekly. Researches multi-branch field-sales orgs in Zedcor's shape (specialty trades, restoration, multi-location services). Drafts personalized outreach. Writes to `pathfinder.adjacent_targets`. Produces the "the pattern repeats" evidence required for the contest submission.
4. `claude-ranking-rationale.md` — inner prompt the Ranker uses when calling the Anthropic API. Enforces the 3-paragraph rationale format + outreach hook.

**Acceptance:** Each prompt is self-contained and ready to drop into a Perplexity Space. Includes the MCP scope block, schedule, output-schema reminder, error-handling protocol.

### Stream 3 · Map Dashboard Subagent
**Owns:** `app/layout.tsx`, `app/page.tsx`, `app/middleware.ts`, all map components, the seven `app/api/*` read routes, basic-auth middleware.
**Goal:** Renders the dashboard shell — full-bleed map, branch sidebar, ranked-project panel, project modal — reading live from `pathfinder.*` via the API routes.
**Deliverables:**
1. Next.js 14 App Router scaffold, Tailwind 3, Inter + Geist Mono via `next/font`, dark-mode-default.
2. `middleware.ts` — basic auth via `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` env. 3-fail / 60-second lockout (cookie-based attempt counter is fine for the demo).
3. Mapbox GL JS integration with branded dark style. Leaflet + OpenStreetMap fallback gated on missing `NEXT_PUBLIC_MAPBOX_TOKEN`.
4. `Map.tsx`, `BranchMarker.tsx`, `ProjectPin.tsx` (3 score tiers), `CustomerMarker.tsx`, `CoverageRadius.tsx` (300-mi).
5. `BranchList.tsx`, `ProjectList.tsx`, `ProjectModal.tsx` (modal renders rationale as Markdown; raw JSON collapsible; opens in 240ms scale-in).
6. URL state: `?branch=…&project=…` deep-links.
7. Read routes (`projects`, `projects/[id]`, `branches`, `customers`, `agents`, `activity`, `stats`) — all qualified to `pathfinder`. Cached with `unstable_cache` 30s where possible; `activity` and `stats` are uncached.

**Acceptance:** Dashboard loads at `localhost:3000`, basic-auth gates it, 5 branches plot, branch click opens panel + coverage circle, pin click opens modal. Empty `projects` state renders gracefully.

### Stream 4 · Liveness Subagent
**Owns:** `ActivityLogStrip.tsx`, `AgentStatusRow.tsx`, `ModelRoutingStrip.tsx`, the pin-lifecycle animations on `ProjectPin.tsx`, the streaming-rationale logic on `ProjectModal.tsx`, the LIVE dot + ticking time-since-ingest on the top bar, count-up on score badges, branch-count tick highlights.
**Goal:** Make Computer's continuous operation visibly central — the contest's "Computer is the engine" criterion.
**Deliverables (per the two Design Feedback docs):**
1. **Activity Log Strip** — bottom drawer or right rail. Tail-f scroll. Reads `pathfinder.agent_log` via Supabase realtime (5-second polling fallback). Each line prefixed with `computer/ingestor`, `computer/ranker`, or `computer/adjacent`, each in a subtle distinct tint drawn from the existing palette. Timestamp · agent · message format from the Computer-As-Engine feedback.
2. **Agent Status Row** — three cells (Ingestor / Ranker / Adjacent), each with name, status pill (`running`/`idle`/`scheduled`/`failed`), 2–3 monospaced metrics. Replaces the older `INGEST·NORMALIZE·GEOCODE·RANK·DELIVER` pipeline strip.
3. **Multi-Model Routing Strip** — last-hour rollup of model usage from `agent_log`. Cheap → expensive top-down. Right-aligned call counts and costs. Footer total + cost-per-ranked-lead.
4. **Computer attribution** — small `engine: perplexity computer · 3 agents` near the top status bar.
5. **Two pin lifecycle moments** — sonar ping (~600ms expanding ring) on Ingestor insert; score count-up (0 → final, ~600ms) on Ranker score update. Never both on the same event.
6. **LIVE dot** — ~1.2s slow pulse, low amplitude.
7. **Time-since-ingest counter** — `LAST INGEST · 12s ago`, ticks every second.
8. **Top-bar stat counters** (`NEW`, `TRACKED`, `RANKED`) — tick + brief highlight on value change.
9. **Branch-count tick highlights** — sidebar branch counts highlight on change.
10. **Streaming rationale** — first time a freshly-ranked project's modal opens, the rationale streams character-by-character (~50 chars/sec). `ProjectModal` reads a `streamed_at` flag on the project row so subsequent opens render instant.

**Constraint:** Only one motion per region at a time. No background ambient motion. No anthropomorphic copy.

**Acceptance:** With Computer agents off, the dashboard is dead-quiet (no animation). With seeded `agent_log` rows arriving (or via the dev script that simulates inserts), every signal above fires correctly. Errors briefly tint amber; routine flow stays neutral.

### Stream 5 · Polish Subagent
**Owns:** `FilterBar.tsx`, `ActivityCounter.tsx`, the cross-pollination toggle visual, loading + empty states, deploy pipeline.
**Goal:** Demo-ready surface, deployed to Vercel, basic-auth gated.
**Deliverables:**
1. `FilterBar.tsx` — 4 source filter pills (USASpending, SAM.gov, Google News, Harris County), cross-pollination toggle, "demo mode" pill.
2. Cross-pollination view — toggle shows customer markers; projects within 50 mi of a customer served by a *different* branch get a magenta highlight ring.
3. Loading skeletons (map + lists during initial fetch).
4. Empty state — only when seed missing; copy directs to `pnpm seed`.
5. Vercel project setup + env wiring (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `BASIC_AUTH_USER`, `BASIC_AUTH_PASS`, `ANTHROPIC_API_KEY` for the streaming rationale fallback).
6. GitHub Actions or Vercel preview-on-PR.
7. `docs/ARCHITECTURE.md` — the half-page diagram + the Phase-2 transplant note about `lib/scoring.ts`.

**Acceptance:** The Vercel URL is live, gated, and Curtis can demo it cold. All five Day-1 gates from §2 are wired into env.

---

## 5. Day-by-day checkpoints

Each day's checkpoint is what I will confirm with you at the end of the day before the next day's streams continue.

### Day 1 — Foundation (Mon)
- [ ] Repo created, Next.js 14 + Tailwind scaffolded, `Pathfinder/` initialized as a sibling to `Unicron Systems/` apps.
- [ ] **Stream 1 (DB) ships in 60–90 min.** `pathfinder` schema live, 4 migrations applied, seed loaded.
- [ ] **Stream 2 (Prompts) ships first drafts.** All four `prompts/*.md` files committed.
- [ ] **Streams 3 + 5 dispatch in parallel** the moment `lib/types.ts` + Supabase URL/keys land.
- [ ] **Checkpoint:** I show you the schema in Supabase + the four prompt files. You sign off the prompts before we drop them into Perplexity Spaces.

### Day 2 — Map + Skeleton (Tue)
- [ ] Map renders 5 branches, coverage radius on click, basic auth working.
- [ ] All 7 read routes return data.
- [ ] Modal opens on pin click (with placeholder rationale; no streaming yet).
- [ ] **Stream 4 (Liveness) dispatches** the moment Stream 3's components are minimally interactive.
- [ ] **Checkpoint:** I share a working `localhost:3000` clip. We confirm the design read against the Hi-Fi (or against the tokens path if the design URL is still 404).

### Day 3 — Liveness + Computer goes live (Wed)
- [ ] Activity Log Strip + Agent Status Row + Model Routing Strip rendered against synthetic `agent_log` data.
- [ ] Sonar ping + count-up + LIVE dot + time-since-ingest counter all working.
- [ ] **Computer agents authored, dropped into Perplexity Spaces, schedules wired.** First Ingestor cycle runs against real public sources.
- [ ] **Checkpoint:** Real `agent_log` rows appear from Computer; the dashboard's liveness signals fire on real events.

### Day 4 — Polish + first dry run (Thu)
- [ ] Cross-pollination toggle, FilterBar, streaming rationale, empty states, loading skeletons.
- [ ] Vercel deploy live at the chosen subdomain. Basic auth verified from a clean browser.
- [ ] First end-to-end demo run-through. Curtis walks the demo cold.
- [ ] **Checkpoint:** I send the live URL + a recorded walkthrough.

### Day 5 — Buffer + verification (Fri)
- [ ] **`requesting-code-review` self-review pass per stream.**
- [ ] **`verification-before-completion`:** I hit the live URL fresh, walk every acceptance bullet, screenshot proof.
- [ ] 100-record threshold confirmed (Computer's 7-day backfill window — start it Day 3 so the threshold is met by Day 5).
- [ ] Demo dry-run with Curtis. Tag `v0.1`.
- [ ] **Checkpoint:** Final readout — what shipped, what's on the cut list, where Phase-2 (on-prem at Zedcor) picks up.

---

## 6. Design tokens (locked, from `pathfinder-prototype/project/hifi-tokens.jsx`)

The design is **white chrome panels over a deep-slate map** — Mapbox Studio / Bloomberg ops territory. Two meaning colors only.

```
Chrome surfaces  bg #ffffff · bgAlt #f6f7f9 · bgRaised #ffffff
Ink              ink #0a0a0a · inkSub #3a3f46 · inkDim #6b7280 · inkFaint #9ca3af
Rule             rule #0a0a0a · ruleSoft rgba(10,10,10,0.12) · ruleHair rgba(10,10,10,0.06)
Map surfaces     mapBg #0e1116 · mapLand #1a1f26 · mapStroke rgba(255,255,255,0.10) · mapGrid rgba(255,255,255,0.04)
Map ink          mapInk #e6e9ef · mapInkDim #9aa3b2
Meaning (only 2) hi #22d3ee (high-priority cyan) · warm #a3e635 (warm-intro lime)
Type             Inter (sans) · JetBrains Mono (mono)
Spacing          4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48
Radius           sm 3 · md 5 · lg 8
Shadow           sm 0 1px 2px / 0 0 0 1px rgba(10,10,10,0.06) · md 0 4px 12px · lg 0 12px 32px
Motion           600ms count-up · 700ms sonar · 900ms stat flash · 1200ms pulse · 50 chars/sec typewriter
```

**Agent color tints** (only two — Adjacent stays mono ink so we don't invent a third hue):
- Ingestor → `hi` cyan `#22d3ee`
- Ranker → `warm` lime `#a3e635`
- Adjacent → mono ink `#0a0a0a` (distinguished by tagging, not color)

**Reference implementations** in `pathfinder-prototype/project/`:
- `hifi-tokens.jsx` — full token map + base CSS classes (`pf-mono`, `pf-label`, `pf-h1`, `pf-h2`, `pf-body`, `pf-meta`, `pf-num`, `pf-btn`, `pf-pill`, `pf-pill-hi`, `pf-pill-warm`)
- `hifi-map.jsx` — `HiFiMap`, `BranchMarker` (square + ring), `ProjectPin` (dot or cyan dot), `CustomerMarker` (ring), `CoverageRadius` (300mi dashed cyan ring), `WarmPin` (lime diamond), synthetic NA path/Florida/Baja
- `hifi-shell.jsx` — `TopBar`, `BranchDock`, `ProjectList`, `ProjectRow`, `ScoreChip`, `AnchoredBranchCard`, `MapLegend`, `CoordsHUD`, `ProjectModal`, `CrossPollBanner`
- `hifi-live.jsx` — `AgentStatusRow`, `AgentCell`, `StatusPill`, `ModelRoutingStrip`, `ActivityRail`, `LiveStat`, `PulsingDot`, `LastIngestCounter`, `SonarPing`, `CountUpScore`, `Typewriter`, plus the event bus / hooks

**Translation work for Stream 3 + Stream 4:** the prototype uses `window.PFData` constants and a JS-driven simulation loop. We replace those two sources only — `window.PFData` becomes Supabase queries; `startSim()` becomes `pathfinder.agent_log` realtime subscription. Component shapes stay 1:1 with the prototype.

---

## 7. Risk register

| Risk | Probability | Mitigation |
|---|---|---|
| Design URL stays 404 | High | Path B: build against the tokens above + the two Feedback docs. Pixel-fidelity loss accepted. |
| Mapbox token friction | Low | Leaflet fallback wired Day 2. |
| Computer agent MCP write-scoping fails | Medium | RLS policy in `0004_rls.sql` enforces `pathfinder`-only writes regardless of MCP config. |
| 100-record threshold not met by Day 5 | Medium | Start Ingestor Day 3 morning; permits + USAspending alone reliably hit 100 in 48h. Synthetic backstop seed available. |
| Anthropic streaming rationale hits rate limits during demo | Low | Pre-generate rationale on every `pathfinder.projects` row at ingest time; streaming is a UI replay of the cached value (no live API call during demo). |
| Phase-2 transplant breaks because someone added a `fetch` to `lib/scoring.ts` | Medium | Add an ESLint rule + a `test-driven-development` test asserting purity (no imports from `@/lib/supabase` or `@anthropic-ai/sdk`). |

---

## 8. Approval gate

Before any subagents are dispatched, I need explicit sign-off on:

1. The §2 open items (Vercel + GitHub project names, design URL path).
2. The five-stream split as written.
3. The day-by-day checkpoints — particularly Day 3 (when Computer agents go live in Perplexity Spaces).

Reply `ship it` (or with corrections) and I'll dispatch Stream 1 first, then 2 + 3 + 5 in parallel as soon as Stream 1's `lib/types.ts` lands.
