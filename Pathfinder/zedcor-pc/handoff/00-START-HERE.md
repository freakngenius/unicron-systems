# START HERE — Claude Code handoff

You are picking up a Perplexity Billion Dollar Build competition submission mid-flight. The deadline is days away. Your job is **NOT** to refactor or improve the UI broadly — it is to make Perplexity Computer (PC) agents the visible engine of Pathfinder so the submission qualifies.

## What the submission needs

> "Perplexity Computer is the primary tool — it must drive, orchestrate, and visibly power the build."

PC agents must be writing real data into the Pathfinder dashboard at `zedcor.unicron.systems`. The submission video has to show PC writes flowing into the UI.

## What's been done (do NOT redo)

- Branch `main` is current and deployed at `zedcor.unicron.systems`
- Additive migration deployed: `phase_confidence`, `phase_signals`, `buy_window_open` columns on `pathfinder.projects`; new tables `pathfinder.hubs`, `pathfinder.source_licenses`, `pathfinder.customer_signals`; `runner` column on `agent_log` + `agent_runs`
- Seed `02_zedcor_branches_and_customers.sql` already run — Zedcor branches (34) + customer sites (1,825) in `pathfinder.zedcor_branches` + `pathfinder.zedcor_customer_sites`
- Transformed copies also seeded into `pathfinder.branches` (74 total) and `pathfinder.customers` (3,650 total) per Kyle's manual SQL inline run
- 50+ rows in `pathfinder.data_sources` with `source_slug` in metadata; license classifications in `pathfinder.source_licenses`
- Houston hub seeded in `pathfinder.hubs` for `organization_id` matching `slug='zedcor'`
- Vercel env vars set on `pathfinder-ashy` project: `NEXT_PUBLIC_ZEDCOR_FULL_NETWORK=1`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<set>`
- Subdomain `zedcor.unicron.systems` routes through parent `unicron-systems` edge middleware to Pathfinder root (clean URL bar, no /pathfinder prefix)
- Pathfinder middleware bypasses basic-auth for `zedcor.unicron.systems` host
- PR #471, #472, #473, #474, #475 all merged

## What's broken on the dashboard (Kyle wants fixed)

- Map renders as black void (Google Maps script not initializing despite API key being set)
- Top counters all 0 (`New 24h`, `Tracked`, `Ranked`, `Errors`) — `LiveStat` realtime subscription not connecting
- Chat panel doesn't open when clicked
- Project modal doesn't expand to fullscreen
- Cross-pollination button doesn't fire
- Branch dock shows duplicates ("Alabama" twice with IDs `ALABAMA-AL` and `ALABAMA`) because seed transform created variants
- Default `Score ≥ 30` filter hides most data
- Kyle says: too many cities, only Houston region matters

**Important:** Fix these only as a side-effect of getting PC agents writing data. The submission lives or dies on PC being the engine, not on UI polish.

## Your mission

1. Read `01-pc-agents-spec.md` — the 3 Perplexity Computer agents that must be running daily and writing into Supabase.
2. Read `02-data-flow-spec.md` — how PC writes connect to the dashboard.
3. Read `03-submission-narrative.md` — what the submission needs to show.
4. Execute in that order.

## How to know you're done

These three things must all be true:

1. `SELECT count(*) FROM pathfinder.projects WHERE runner='pc' AND ingested_at > now() - interval '24 hours';` returns ≥ 50.
2. `SELECT count(*) FROM pathfinder.projects WHERE buy_window_open = true;` returns ≥ 5 (PC Verifier inferred phase + buy window).
3. Opening `zedcor.unicron.systems/` renders a working map + counters that include the PC-written rows, with at least one `agent_log` event tickering through showing `runner='pc'`.

If you cannot achieve all three, document blockers in `99-blockers.md` so Kyle knows what to fix vs what to skip.

## Constraints — do not violate

- **Additive only.** Do not break the existing Vercel cron pipeline. PC and cron coexist via the `runner` column.
- **No new orgs.** `pathfinder.organizations` already has Zedcor as slug `zedcor`. Use the existing UUID.
- **Use existing `agent_name` CHECK constraint values.** Legal values: `ingestor`, `ranker`, `adjacent`, `verifier`, `outreach`, `pulse`, `competitive`, `briefing`, `customer-intel`, `eval`. Do NOT use `pc-*` names.
- **Don't try to test in Perplexity Spaces yourself.** You cannot. Write the chat-starter prompts as `.md` files; Kyle pastes them into Perplexity Spaces.
- **Do not redo the schema migration.** It's deployed.
- **Do not load more data.** All seed data is in place.

## Workspace layout

- `Pathfinder/zedcor-pc/prompts/` — agent chat-starter prompts (already drafted, may need polish)
- `Pathfinder/zedcor-pc/seeds/` — SQL seeds (already executed)
- `Pathfinder/zedcor-pc/runbook/RUNBOOK.md` — original execute runbook
- `Pathfinder/zedcor-pc/handoff/` — these spec docs (you are here)
- `Pathfinder/supabase/migrations/20260524_zedcor_pc_additive.sql` — the deployed migration
- `Pathfinder/lib/`, `Pathfinder/app/`, `Pathfinder/components/` — Next.js app
- Root `middleware.ts` — parent edge middleware (host routing)

## Direct line to Kyle

If you hit a true blocker (Supabase MCP not connected, Vercel env unreachable, agent prompt won't accept), write a single tight question to `99-blockers.md` and stop. Don't churn.

Otherwise: execute through to the finish line. The competition deadline is real.
