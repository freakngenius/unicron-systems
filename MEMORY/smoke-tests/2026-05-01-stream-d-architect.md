# Stream D Architect — post-merge smoke

Date: 2026-05-01.
Branch state: main at `68f7bd7` (PR #37 squash-merge).

## What was tested

- ✓ Migration 0070 live in `pathfinder.architect_sessions` + `pathfinder.architect_proposals` (both tables present, RLS on, 0 rows).
- ✓ Schema shapes match `Pathfinder/services/architect/types.ts`:
  - `architect_sessions`: 15 columns — id (uuid), vertical_id, session_type, trigger, input_payload (jsonb), reasoning_log (jsonb), output_payload (jsonb), status, failure_reason, duration_ms, cost_usd (numeric), turns, customer_org_id, created_at, completed_at.
  - `architect_proposals`: 14 columns — id, session_id (uuid FK nullable), vertical_id, type, headline, body, details (jsonb), confidence (numeric), status, resolved_at, resolved_by_user_email, resolution_notes, source_input_summary, created_at.
- ✓ Mocked test suites green: 73 architect tests / 100% pass / 0 failures. Full Pathfinder suite: 451/0/23 (passed/failed/skipped).
- ✓ Inngest IDs unique across all 10 functions; only 2 cron-triggered (Stream D's), 2-hour offset (Sun 02:00 UTC tuning, Sun 04:00 UTC discovery). No collisions.

## What was NOT tested

- ✗ Live `POST /api/architect/decompose` — local shell has no `ARCHITECT_API_TOKEN` / `ANTHROPIC_API_KEY` / Supabase env (presence-only check via `process.env` returned all false).
- ✗ Real-LLM eval slices — same reason. Deferred to the scheduled 2026-05-08 smoke (routine `trig_015ZCGczmMBPHAmSzF5mGXmR`) which runs with production env.

## Why skipping is the right call here

The Architect routes live at `Pathfinder/app/api/architect/{decompose,tune,discover}/route.ts`. Each route's `authorize()` allows unauthenticated calls when `ARCHITECT_API_TOKEN` is unset AND `NODE_ENV !== 'production'`. So in dev mode an unauthenticated POST would actually attempt a real Anthropic call — which would either fail with `ANTHROPIC_API_KEY is not set` (the gateway throws at module-load when env is missing) or, worse, succeed and burn tokens against whatever ANTHROPIC_API_KEY happens to be in scope. Neither is useful for "smoke without real LLM tokens."

The scheduled remote agent (Anthropic Cloud) has the right env to run this safely.

## Open items captured to operator-todos

- `MEMORY/operator-todos/2026-05-01-stream-d-env.md` — set `ARCHITECT_API_TOKEN` in Vercel production env; confirm Inngest cloud sync picks up the two new architect functions.

## Cost spent

$0 LLM. All checks were schema reads, file inspection, and mocked tests.
