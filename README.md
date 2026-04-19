# Unicron Systems — 5-Pattern Prototype Suite

**Production:** [unicron-systems.vercel.app/app](https://unicron-systems.vercel.app/app) (passcode-gated)
**Landing:** [unicron-systems.vercel.app](https://unicron-systems.vercel.app) (paradigm-map ping-pong)

Five living-systems coordination patterns, running as live prototypes on Supabase + Anthropic + Notion. Built as a contest entry for **Perplexity Billion Dollar Build** (April 14 – June 10, 2026).

## Patterns

| Pattern | What it demonstrates | Route |
|---|---|---|
| **Mycelium** | Shared signal substrate. Strong signals reinforce; weak signals decay. | `/app/mycelium` |
| **Beehive** | Specialist pipeline (Research → Strategy → Copy → Validator) with bounce-on-fail. | `/app/beehive` |
| **Ant Colony** | 50 parallel Haiku workers on fixture blobs; Sonnet aggregator clusters themes. | `/app/colony` |
| **Murmuration** | 7 agents × 5 cycles with local peer references; emergent convergence or divergence. | `/app/murmuration` |
| **Slime Mold** | 10 hypotheses → 3 pruning cycles → 2 winners. Adaptive selection with full reasoning. | `/app/slime` |

All five are wired to:
- **Supabase** `anfihcusvekpovcchpoh` (persistence, per-pattern schemas)
- **Anthropic** Claude Sonnet 4.5 (orchestration/judgment) + Haiku 4.5 (fan-out)
- **Notion** under page `347785c67e728096bd2dcaa75b5928d1` (promoted artifacts — **requires integration grant; see BLOCKERS.md**)

## Local dev

```bash
# 1. Clone
git clone https://github.com/freakngenius/unicron-systems.git
cd unicron-systems

# 2. Install
npm install

# 3. Env — fill in .env.local with:
#    NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#    SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, NOTION_API_KEY,
#    NOTION_PRODUCT_PAGE_ID, CRON_SECRET, ADMIN_PASSCODE

# 4. Seed Supabase (wipes + reloads mycelium fixtures)
npm run seed

# 5. Create Notion databases (idempotent; requires integration grant)
npm run notion:setup

# 6. Dev
npm run dev
# → http://localhost:3000/gate → enter ADMIN_PASSCODE → /app
```

## Scripts

```bash
npm run dev          # Next.js dev server
npm run build        # Production build
npm run typecheck    # tsc --noEmit
npm run test         # Vitest (unit + integration against live Supabase)
npm run test:e2e     # Playwright against localhost:3000 (or E2E_BASE_URL)
npm run seed         # Wipe + reload Mycelium fixtures in prod Supabase
npm run notion:setup # Create the 5 Notion databases
```

## Architecture

```
app/
├─ /                      landing (paradigm-map ping-pong video, preserved from original)
├─ /gate                  passcode form, sets unicron-admin cookie
├─ /app                   meta dashboard — 5 live tiles + "Run Demo Suite"
├─ /app/{mycelium,beehive,colony,murmuration,slime}  pattern UIs
└─ /api/
   ├─ mycelium/...        signals + reinforce + topics + promote
   ├─ beehive/...         run/execute/runs (2-phase for Vercel fn lifetime)
   ├─ colony/...          dispatch/execute/jobs/markets (2-phase)
   ├─ murmuration/...     run/execute/runs (2-phase)
   ├─ slime/...           seed/cycle/runs
   ├─ cron/...            mycelium-decay (daily), slime-tick (daily)
   ├─ demo/run-all        NDJSON-streamed suite orchestrator
   └─ gate                sets passcode cookie

lib/
├─ env.ts                 zod-validated env, lazy requireServerEnv
├─ supabase.ts            browser (anon) + server (service role) clients
├─ anthropic.ts           shared client, SONNET + HAIKU constants, callJSON helper
├─ notion.ts + notion-setup.ts + notion-ids.ts
├─ server-guard.ts        browser-import assertion (replaces `server-only`)
├─ logger.ts              structured JSON logger
└─ patterns/
   ├─ mycelium/           {types, classify, similarity, decay, promote}
   ├─ beehive/            {schemas, bounce, run, stages/{research,strategy,copy,validate}, notion}
   ├─ colony/             {types, semaphore, worker, aggregator, dispatch, notion}
   ├─ slime/              {types, judge, prune, cycle, notion}
   ├─ murmuration/        {peers, flock, heat, notion}
   └─ meta.ts             dashboard summary aggregator

supabase/migrations/      {0001 mycelium, 0002 beehive, 0003 colony, 0004 murmuration, 0005 slime, 0006 notion_meta}
fixtures/                 mycelium-seed, beehive-seed, slime-seed, colony/{5 markets × 50 blobs}
tests/                    unit/ (36 tests) + integration/mycelium + e2e/smoke
```

### Key design decisions

- **Extended the root Next.js app** rather than building under `Product/`. Landing was already `/` with the paradigm-map ping-pong; patterns slot cleanly under `/app/*`.
- **Two-phase API pattern** (create → execute) for Beehive, Colony, Murmuration. The execute endpoint awaits the work so Vercel's serverless function stays alive; the client polls the create endpoint's returned id and sees progressive writes.
- **LLM-based similarity** for Mycelium reinforcement (no pgvector setup).
- **Sonnet for judgment / orchestration; Haiku for fan-out / classification.** Concurrency capped at 10 for Colony workers, 5 for Slime judge, 7 for Murmuration agents.
- **Deterministic validator** in Beehive (subject < 55 chars, lines ≤ 20 words, actionable CTA). Stable bounces make the demo predictable.

## Demo script (judges, ~90s)

1. **Open `/app`.** Five live tiles. Click **Run Demo Suite**.
2. **Watch the NDJSON feed** as each pattern ticks. Mycelium (5s) → Beehive (15s) → Colony 20 workers (25s) → Murmuration 15 variants (20s) → Slime 10→5→3→2 (30s).
3. **Tiles refresh.** Click into each for detail:
   - **Mycelium:** strong signals surface, drop a new one live — classify → reinforce OR new.
   - **Beehive:** stage nodes lit green / one bounced orange → copy retry → pass. Click a stage for input/output JSON. Final email visible.
   - **Colony:** 10×5 dot grid filled green; cluster chips sized by theme count; click for verbatim examples.
   - **Murmuration:** 7×5 grid of headline variants. Hover a late-cycle winner → peer-inspiration cells highlight. Convergence heat score.
   - **Slime Mold:** tree-view shows 10 hypotheses pruning to 2. Click a survivor → full per-cycle reasoning trail.
4. **Pitch:** *Five coordination patterns. One system. Two humans + Computer vs. fifty.*

## Test coverage

- **Unit (36 tests):** Mycelium decay math, similarity short-circuit, Beehive schemas + bounce loop (TDD), Colony semaphore + aggregator schema, Slime prune + parseTam + Judge schema, Murmuration peer selection.
- **Integration (2 tests):** Mycelium round-trip against real Supabase.
- **E2E (7 Playwright tests):** landing, meta dashboard, all 5 pattern pages render correctly through the passcode gate.

All 44 unit+integration tests and 7 E2E tests pass against production.

## Status + known follow-ups

- ✅ All 5 patterns live and demoable <60s each on prod.
- ✅ Meta dashboard + Run Demo Suite working end-to-end.
- ✅ Vercel cron scheduled (mycelium-decay daily, slime-tick daily — Hobby tier limit is daily max).
- ⚠️ **Notion integration grant pending** — see [BLOCKERS.md](./BLOCKERS.md). Pattern flows work without it; Notion mirrors activate once the Product page is connected to the "Unicron Product Suite" integration.
- ⚠️ 9 open audit advisories in Next 14.2 (DoS / image-optimizer). Upgrade to Next 16 is a breaking change; deferred past contest.
- 📋 Mycelium classifier sometimes creates topics too specific (e.g. `public-adjuster-revenue-loss` instead of `public-adjusters`). Future: provide known-topic list in prompt.

## Repo / infra

- **GitHub:** [freakngenius/unicron-systems](https://github.com/freakngenius/unicron-systems)
- **Vercel:** `kekas-projects-89ac4317/unicron-systems` → [unicron-systems.vercel.app](https://unicron-systems.vercel.app)
- **Supabase:** [anfihcusvekpovcchpoh](https://supabase.com/dashboard/project/anfihcusvekpovcchpoh)
- **Notion parent page:** [Product](https://www.notion.so/347785c67e728096bd2dcaa75b5928d1)

## Not touched (explicit scope)

- `unicron-paradigm-map.netlify.app` — separate repo, separate Netlify deploy. This build only links to it.
- `/` landing — the rAF ping-pong video setup is preserved as-is.
