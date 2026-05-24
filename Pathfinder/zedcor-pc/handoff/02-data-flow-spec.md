# 02 — Data flow spec (how PC writes reach the dashboard)

The dashboard at `zedcor.unicron.systems` reads from Supabase via the anon key. PC agents write via service-role via MCP. They never touch the same table from both ends at the same time, so coexistence is clean.

## Read path (dashboard → Supabase)

`app/page.tsx` → `fetchInitialData()` runs four parallel queries:

1. `supabase.from('branches').select('*').order('code', { ascending: true })`
2. `supabase.from('customers').select('*').order('id', { ascending: true })`
3. `supabase.from('projects').select('*').order('score', { ascending: false, nullsFirst: false }).order('ingested_at', { ascending: false })`
4. `fetchCrossPollMatches(supabase)` — reads `pathfinder.lead_cross_pollination` joined with `zedcor_customer_sites`

These rows hydrate the `<Dashboard />` client component which then subscribes to Supabase realtime for:

- `pathfinder.projects` INSERT/UPDATE events → updates lead rail + counters
- `pathfinder.agent_log` INSERT events → updates the agent log ticker at the bottom

## Write path (PC agents → Supabase)

Each PC agent uses Supabase MCP `execute_sql` (or equivalent) to:

1. INSERT a row in `pathfinder.agent_runs` (status='running') at start, capture id as `$RUN_ID`
2. Do work, logging events into `pathfinder.agent_log` with `agent_run_id=$RUN_ID`
3. INSERT rows into `pathfinder.projects` (Ingestor) or UPDATE (Verifier) or INSERT into `pathfinder.customer_signals` (Customer Intel)
4. UPDATE the `pathfinder.agent_runs` row at end with `status='success'|'failed'`, `completed_at=now()`, `records_processed`, `records_new`

Every write carries `runner='pc'` so cron and PC writes are distinguishable.

## Why the dashboard currently shows 0 counters (the actual bug)

The `LiveStat` counters (`New 24h`, `Tracked`, `Ranked`, `Errors`) read from a Supabase realtime channel subscription. If the channel isn't subscribed (anon key wrong, RLS denying, or websocket blocked), counters stay at 0.

**Diagnostic Claude Code should run:**

1. In Pathfinder repo, find `components/TopBar.tsx` and trace how `LiveStat valueKey="new"` / `tracked` / `err` resolves
2. Likely candidates: `lib/realtime/` or a hook in `lib/hooks/`
3. Check whether subscription is gated by `organization_id`. If yes, confirm Zedcor's UUID is what the dashboard expects.

This is NOT a blocker for the submission. The agent_log ticker at the bottom shows PC writes regardless of whether the counters work. Focus there.

## Why the map is black (likely cause)

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set in Vercel, but the Google Maps API key in Google Cloud Console may not have `zedcor.unicron.systems` listed in its HTTP referrer restrictions. The browser loads the script with the key, Google rejects requests from the unauthorized referrer, the map fails silently.

**Diagnostic for Kyle (not Claude Code — Claude has no Google Cloud access):**

1. Open https://console.cloud.google.com/apis/credentials
2. Find the API key starting with `AIzaSyAnOnQu...`
3. Application restrictions → HTTP referrers → add `https://zedcor.unicron.systems/*` and `https://*.unicron.systems/*`
4. Save, wait 5 min, hard refresh dashboard

Document this in `Pathfinder/zedcor-pc/handoff/04-paste-into-perplexity.md` as a Kyle-side prereq.

## Cross-pollination (warm-intro overlay) — why it doesn't work

`fetchCrossPollMatches` reads from `pathfinder.lead_cross_pollination`. That table is populated by a separate cron (`/api/cron/cross-pollination` or similar). If no rows exist there, the overlay shows nothing.

**Acceptance for submission:** if PC agents write new projects AND existing cron cross-pollination runs against the new project data, overlay populates. If not, leave it — not required for submission.

## Chat panel — why it doesn't open

The `Chat` button likely toggles a state and renders `components/chat/ChatPanel.tsx`. If a runtime error fires inside the panel (missing env, broken API route, missing fixture), the panel mounts but throws.

**Diagnostic Claude Code should run:**

1. Open `components/chat/` directory
2. Find the panel component and trace what API route it calls
3. Check if that route depends on `PERPLEXITY_API_KEY` or similar env that may be missing on `pathfinder-ashy`

**If broken and not trivially fixable in 30 min:** disable the Chat button on the `zedcor.unicron.systems` host with a guard. Don't sink hours into chat — it's not required for the submission video.

## What the submission video actually needs to show

1. The dashboard loading with at least the lead rail populated (already works)
2. The agent log ticker at the bottom showing live PC writes streaming in (this is the headline visual)
3. A project card on the right rail with `buy_window_open=true` and `phase_confidence > 0.7` — proves PC Verifier added value
4. Optional: branches sidebar showing real Zedcor branches (currently works but duplicates)

If 1+2+3 work, the submission qualifies. Map / chat / cross-pollination are bonus.

## Acceptance tests (run before declaring done)

Run these from the Supabase SQL Editor after the first PC scheduled cycle completes:

```sql
-- PC ingestor wrote new rows today
SELECT count(*) AS pc_new_24h
FROM pathfinder.projects
WHERE ingested_at > now() - interval '24 hours'
  AND organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor')
  AND id IN (
    SELECT (event_data->>'project_id')::text FROM pathfinder.agent_log
    WHERE runner='pc' AND event_type='project_inserted'
      AND ts > now() - interval '24 hours'
  );
-- Expect: > 0 (target ≥ 50)

-- PC Verifier inferred phases
SELECT count(*) AS pc_phases_today
FROM pathfinder.agent_log
WHERE runner='pc' AND event_type='phase_inferred'
  AND ts > now() - interval '24 hours';
-- Expect: > 0

-- Buy window open rows exist
SELECT count(*) AS buy_window_count
FROM pathfinder.projects
WHERE buy_window_open = true
  AND organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor');
-- Expect: ≥ 5

-- Customer signals written
SELECT count(*) AS cs_count
FROM pathfinder.customer_signals
WHERE organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor');
-- Expect: ≥ 3
```

If all four queries return their expected counts, the engine is real. Submission qualifies.
