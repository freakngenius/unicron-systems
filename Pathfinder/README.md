# Pathfinder

Customer-facing lead-intelligence app for Zedcor (construction site security). The first vertical instance of the Unicron platform.

**Production:** [www.unicron.systems/pathfinder](https://www.unicron.systems/pathfinder)
**Vercel project:** `kekas-projects-89ac4317/pathfinder` (deployed via the parent `unicron-systems` Next.js project's server-side rewrite)
**Supabase project:** `anfihcusvekpovcchpoh` (`pathfinder` schema)
**GitHub:** [freakngenius/unicron-systems](https://github.com/freakngenius/unicron-systems)

---

## Stack

- **Framework:** Next.js 14.2 (App Router) + React 18 + TypeScript 5.6 + Tailwind 3.4
- **Package manager:** pnpm 10
- **Test runner:** Vitest 2.1
- **Database:** Supabase Postgres (`pathfinder` schema, RLS enabled — anon read, service-role write)
- **LLM gateway:** `lib/llm/run.ts` routes Anthropic + Perplexity, writes per-call cost telemetry to `pathfinder.llm_calls`
- **Agent runtime:** Vercel cron (source polling + canonical agent processing) + Inngest (event-driven retried delivery for the slack-alert path; full pipeline cutover is Phase 2)
- **Email delivery:** Resend
- **Slack delivery:** native bot (P0-04) + legacy webhook fallback
- **CRM sync:** custom HubSpot REST wrapper (P0-03)
- **Observability:** Axiom (env-gated) + Helicone (env-gated)

## Local dev

```bash
pnpm install
cp .env.example .env.local       # then fill in keys
pnpm dev                         # http://localhost:3000
```

Optional: run the Inngest dev server alongside to exercise the event bus:

```bash
npx inngest-cli@latest dev
```

**Troubleshooting:** if `pnpm typecheck` fails with `TS7031` errors on `react-markdown` component overrides (typically in `components/chat/markdown/MarkdownRenderer.tsx`), run `pnpm install` from `Pathfinder/` — stale `node_modules` can leave the `Components` type unresolved, collapsing it to `any` and cascading into "implicit any" errors on every destructured prop.

## Scripts

```bash
pnpm dev          # Next.js dev server
pnpm build        # Production build
pnpm start        # Run the production build locally
pnpm lint         # next lint
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run (unit + integration with mocked LLMs)
pnpm seed         # Idempotent seed of branches + customers from public/seed-data/
pnpm backfill     # Backfill ~30 synthetic projects + agent_log + agent_runs
```

## Architecture

```
app/
├─ /                              Dashboard (server-fetches initial branches/customers/projects, hands to <Dashboard/>)
├─ /settings                      Operator settings shell
└─ /api/
   ├─ cron/
   │   ├─ ingestor                Pulls USAspending + SAM.gov on schedule (`0 */6 * * *`)
   │   ├─ ranker                  Scores new projects (`0,30 * * * *`)
   │   ├─ verifier                4-check verification + emits Inngest events (`0,30 * * * *`)
   │   ├─ outreach                Outreach drafter (`15,45 * * * *`)
   │   ├─ briefing                Friday weekly brief (`0 6 * * 5`)
   │   ├─ slack-alerts            Polling fallback for Slack high-priority alerts (`*/10 * * * *`)
   │   └─ cost-alert              Daily LLM cost alert (`0 13 * * *`, threshold COST_ALERT_THRESHOLD_USD)
   ├─ inngest                     Inngest function-serve endpoint (PUT discovery + POST dispatch)
   ├─ chat                        Intelligence Chat panel SSE backend (Perplexity Sonar)
   ├─ hubspot/, slack/, webhooks/ Integration endpoints
   ├─ cost-summary                Cost telemetry rollup (llm_calls + legacy agent_log)
   └─ ...                         (full inventory in MEMORY/audit-pathfinder.md § 2)

lib/
├─ llm/                           Gateway (run, runStream, types, pricing, recorder)
├─ inngest/                       Inngest client + events + functions
├─ observability/                 Axiom logger
├─ scoring.ts                     Pure-function scoring kernel (guarded against LLM/Supabase imports)
├─ anthropic.ts, chat/sonar.ts    LLM call sites delegating to lib/llm/run
├─ ingestor.ts, outreach.ts       Agent helpers used by cron handlers
├─ briefing.ts, notifications.ts  Briefing payload + Resend/Slack delivery
├─ slack/, hubspot/               Integration libraries
└─ types.ts                       Single source of truth for the pathfinder.* schema

supabase/migrations/              SQL migrations 0001-0014 (see DEPLOY.md for apply runbook)
agent-specs/                      Operational specs for Computer Space agents (Adjacent, Pulse, etc.)
prompts/                          System prompts (Claude rationale, Computer Adjacent, Outreach Drafter)
docs/                             Architecture + per-feature plans + integration setup guides
__tests__/                        Vitest suites (271 tests at G1 exit; mocked LLMs, live test Supabase)
```

## Phase 1 G1 + G2 deliverables (2026-04-30 → 2026-05-01)

- **G0:** audit + demo snapshot at `_demo-snapshot-2026-04-30/` + gap analysis. See `MEMORY/`.
- **G1:** LLM gateway, Inngest hybrid, cost telemetry, end-to-end verified on USAspending + SAM.gov.
- **G2:** Axiom + Helicone wiring, GitHub Actions CI, husky pre-commit, daily cost alert, this README + DEPLOY.md.

## Working in this codebase

- **Worktree-only feature work** per `Pathfinder/CLAUDE.md`. AI feature sessions live under `Pathfinder-worktrees/<branch-slug>/`, never in the main directory.
- **No direct push to main.** All changes flow through PR + human merge.
- **No CLI deploy.** Vercel auto-deploys on merge to main.
- **Conventions** in `MEMORY/conventions.md`: snake_case in DB, camelCase in TS; UUIDs only (no integer PKs except sequential serials); test files co-located; LLM calls always through the gateway; commit messages `<type>(<scope>): <description>`.
- **Drift discipline** in `MEMORY/spec-references.md`: every non-trivial source file maps to a spec section. PRs touching `lib/` or `services/` must update the references map (CI gate).

## Specs (workspace root)

- `PRD - Unicron Master.md` — overall product
- `SPEC - Backend Architecture.md` — data model + agent runtime
- `SPEC - Pathfinder Customer Dashboard.md` — this app's surface

See `INDEX - All Docs.md` at workspace root for the full list.

## Runbook for production operations

→ `DEPLOY.md`
