# Zedcor PC variant — Execute today runbook

**Goal:** Get `zedcor.unicron.systems` live with PC agents driving daily ingestion + verification, alongside the existing Vercel cron pipeline. Zero destruction of v1.

**Estimated time end-to-end:** 90 minutes if everything goes smoothly. ~3 hours with the usual hiccups.

**Branch:** `zedcor-pc` on `freakngenius/unicron-systems`. All changes additive. Merge to `main` only after dry-run validation tonight.

---

## Step 1 — Run the additive migration (5 min)

1. Open Supabase SQL Editor for project `anfihcusvekpovcchpoh`.
2. Paste the contents of `Pathfinder/supabase/migrations/20260524_zedcor_pc_additive.sql`.
3. Run.
4. Verify with these probes:
   ```sql
   -- All should return without error and the column listings should include the new fields:
   \d pathfinder.projects
   \d pathfinder.hubs
   \d pathfinder.source_licenses
   \d pathfinder.customer_signals
   SELECT runner, count(*) FROM pathfinder.agent_runs GROUP BY 1;
   SELECT runner, count(*) FROM pathfinder.agent_log  GROUP BY 1;
   ```
   Expected: existing rows all show `runner='cron'`. New tables exist and are empty.

**If any error:** copy the error, abort, ping Kyle. The migration is wrapped in BEGIN/COMMIT so a failure rolls back cleanly.

---

## Step 2 — Run the seeds (5 min)

1. In the same Supabase SQL Editor, open a new query tab.
2. Paste the contents of `Pathfinder/zedcor-pc/seeds/01_zedcor_pc_seed.sql`.
3. Run.
4. Verify:
   ```sql
   SELECT hub_slug, status, radius_miles, geofence_states FROM pathfinder.hubs
     WHERE organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor');
   -- Expect: 1 row, hub_slug='houston', status='live', radius_miles=300

   SELECT license_status, count(*) FROM pathfinder.source_licenses GROUP BY 1 ORDER BY 2 DESC;
   -- Expect: ~50 commercial_ok, ~20 agency_direct_required, ~6 blocked, ~2 legal_review

   SELECT (metadata->'config'->>'bucket') AS bucket, status, count(*)
   FROM pathfinder.data_sources d
   WHERE d.organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor')
     AND d.metadata->>'source_slug' IS NOT NULL
   GROUP BY 1, 2 ORDER BY 1, 2;
   -- Expect: rows for bucket 1, 2, 3, 4 with status='live' (1 paused for license review)

   -- Count of sources the PC ingestor will run against:
   SELECT count(*) FROM pathfinder.data_sources d
     JOIN pathfinder.source_licenses sl ON sl.source_slug = d.metadata->>'source_slug'
     WHERE d.organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor')
       AND d.status='live' AND sl.license_status='commercial_ok';
   -- Expect: roughly 50–55 sources.
   ```

---

## Step 3 — Wire DNS (5 min)

In Namecheap (or whatever registrar holds `unicron.systems`):

1. Domain → `unicron.systems` → Advanced DNS
2. Add a new record:
   - Type: **CNAME**
   - Host: `zedcor`
   - Value: `cname.vercel-dns.com`
   - TTL: Automatic (or 30 min)
3. Save.

DNS will propagate in 5–30 minutes. You can verify with:
```
dig zedcor.unicron.systems CNAME
```

---

## Step 4 — Add domain to Vercel (5 min)

1. Open Vercel dashboard → `unicron-systems` project (the **parent** project, not `pathfinder-ashy`).
2. Settings → Domains → Add Domain.
3. Enter `zedcor.unicron.systems`. Vercel will detect the existing CNAME and verify.
4. Once verified, the domain shows green.

**Why the parent project, not Pathfinder:** The parent's edge middleware does the host rewrite to `pathfinder-ashy.vercel.app/pathfinder/zedcor`. Same pattern as `funder.unicron.systems` and `internal.unicron.systems`.

---

## Step 5 — Merge or preview the routing patch (5 min)

The middleware changes are on branch `zedcor-pc`:

**Option A (safer, recommended):** Preview deploy first.
1. Vercel will auto-deploy the `zedcor-pc` branch as a preview.
2. Once preview deploys, the parent middleware on the preview supports `zedcor.unicron.systems`.
3. **However**, the production domain still routes via the production `main` branch's middleware.
4. To test routing without merging: in Vercel parent project → Settings → Domains, temporarily promote the preview deploy.

**Option B (decisive):** Merge `zedcor-pc` to `main`.
1. `gh pr create --base main --head zedcor-pc --title "Zedcor PC variant"` then merge.
2. Production redeploys with the new middleware.
3. `zedcor.unicron.systems` becomes live within ~60s.

Pick B if you trust the patches (they are strictly additive — funder and internal branches untouched). The branch URL: https://github.com/freakngenius/unicron-systems/pull/new/zedcor-pc

---

## Step 6 — Verify the URL is live (2 min)

In a browser, hit `https://zedcor.unicron.systems/`. Expected:

- Redirects (rewrites) to the existing Pathfinder `/zedcor` route — shows the Zedcor leads page that's already in production
- URL bar stays at `zedcor.unicron.systems/`
- No basic-auth prompt (PUBLIC_HOSTS bypasses it)

If you get a 401, it means the Pathfinder middleware `PUBLIC_HOSTS` set isn't deployed — re-check Step 5.

If you see the Funder dashboard, the parent middleware rewrite isn't matching — re-check the `ZEDCOR_HOST` constant + branch in `middleware.ts`.

---

## Step 7 — Stand up the Perplexity Space (15 min)

1. Open https://www.perplexity.ai/spaces (logged in as kyle@demystified.ai).
2. Create new Space:
   - **Title:** `Zedcor · Pathfinder Engine`
   - **Description:** `Live agentic intelligence engine for Zedcor Security Systems. PC-driven daily signal acquisition across 50+ procurement and project sources in Houston (300mi radius). Writes directly to the Pathfinder dashboard at zedcor.unicron.systems.`
   - **Instructions:** paste this block:

```
You are an agent in the Zedcor · Pathfinder Engine Space. You and your
peers (Ingestor, Verifier, Customer Intel) cooperate to run the live
intelligence layer for Zedcor Security Systems.

OUTPUT SURFACE
Your work lands in the Pathfinder dashboard at https://zedcor.unicron.systems.
State lives in Supabase project anfihcusvekpovcchpoh, schema `pathfinder`,
scoped to organization slug `zedcor`. You write through the Supabase
MCP only — never raw HTTP.

PARALLEL OPERATION
The existing Vercel-cron Pathfinder pipeline continues to run. You coexist
with it via the `runner` column ('cron' vs 'pc'). You never modify rows
written by 'cron'.

OPERATING RULES
1. Use the agent_name from the existing CHECK constraint:
   'ingestor' | 'ranker' | 'adjacent' | 'verifier' | 'outreach' | 'pulse'
   | 'competitive' | 'briefing' | 'customer-intel' | 'eval'.
   Do NOT use 'pc-*' names.
2. Always write runner='pc' on agent_log and agent_runs.
3. Token discipline. Cheapest viable model per step. Sonnet only for
   final reasoning or synthesis steps.
4. Dedup before write. Use the source+source_id unique constraint.
5. No invented data. source_empty is a legitimate outcome.
6. Refuse out-of-scope writes. Log refusal event and abort.

CONNECTORS REQUIRED
Each chat in this Space must have Supabase enabled via + → Connectors
before first message. If Supabase is missing, the agent stops and asks
the operator to enable it.

BEFORE ANY RUN
The agent runs preflight, confirming:
- Supabase MCP is connected on this chat
- pathfinder.organizations has a row for slug='zedcor'
- pathfinder.hubs has a row for organization_id=<zedcor> AND hub_slug='houston'
If any preflight fails, the agent stops with a BLOCKED message and waits.
```

3. **Connectors:** at the Space level, add **Supabase** (project URL: `https://anfihcusvekpovcchpoh.supabase.co`, service-role key from Supabase API settings).

---

## Step 8 — Spin up the 3 agent chats (20 min)

For each of the 3 prompts in `Pathfinder/zedcor-pc/prompts/`:

1. In the Zedcor Space, click **New Chat**
2. Click **+ → Connectors → Supabase** (enable for this thread — required every new chat)
3. Set model:
   - **`01-ingestor-pc.md`**: GPT-5.5 (cheap, fast, browser/parse heavy)
   - **`02-verifier-pc.md`**: Opus 4.7 (judgment-heavy phase inference)
   - **`03-customer-intel-pc.md`**: Opus 4.7 (inference/synthesis)
4. Paste the entire prompt block from the file
5. Send
6. Wait for preflight + dry-run summary (5–20 min each agent)
7. Read the summary. If it looks reasonable, reply `schedule` to flip it to daily cron.

**Order matters:**
- Run Ingestor first, alone. Wait for its dry run to write at least 5 rows into `pathfinder.projects` before starting Verifier.
- Then run Verifier on the rows Ingestor wrote.
- Customer Intel runs last and is independent (reads `zedcor_customer_sites`, not `projects`).

---

## Step 9 — Load Zedcor's customer CSV (10 min) — REQUIRED FOR CUSTOMER INTEL

Customer Intel won't run cleanly until `pathfinder.zedcor_customer_sites` has rows for Zedcor.

If Kyle has the CSV ready:
1. Format: one row per customer site (customer name, parent company, address, city, state, lat, lon, active).
2. Use the existing import flow at `/pathfinder/zedcor/onboarding` if available, OR
3. Run a one-time INSERT via Supabase SQL Editor (template in `Pathfinder/zedcor-pc/seeds/02_customer_sites_template.sql` — write if needed).

If Kyle doesn't have the CSV yet:
- Customer Intel parks itself with the BLOCKED message
- That's fine — Ingestor and Verifier run on their own
- Add the CSV later, Customer Intel auto-runs on next scheduled cycle

---

## Step 10 — Monitor (ongoing)

Save this query as a Supabase Snippet named "Zedcor PC — Agent Status":

```sql
WITH expected AS (
  SELECT unnest(ARRAY['ingestor','verifier','customer-intel']) AS agent_name
),
last_pc_run AS (
  SELECT DISTINCT ON (agent_name)
    agent_name, id AS run_id, status, started_at, completed_at,
    records_processed, records_new,
    EXTRACT(EPOCH FROM (completed_at - started_at))::int AS runtime_s,
    EXTRACT(EPOCH FROM (now() - COALESCE(completed_at, started_at)))/3600 AS hours_ago
  FROM pathfinder.agent_runs
  WHERE organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor')
    AND runner = 'pc'
  ORDER BY agent_name, started_at DESC
),
recent_pc_errors AS (
  SELECT agent_name, count(*) AS n
  FROM pathfinder.agent_log
  WHERE organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor')
    AND runner = 'pc'
    AND event_type IN ('source_failed','error','refusal')
    AND ts > now() - interval '24 hours'
  GROUP BY 1
),
sources_today AS (
  SELECT count(DISTINCT (event_data->>'source_slug')) AS sources_hit_24h
  FROM pathfinder.agent_log
  WHERE organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor')
    AND runner = 'pc'
    AND event_type = 'source_hit'
    AND ts > now() - interval '24 hours'
),
projects_today AS (
  SELECT count(*) AS new_rows_24h
  FROM pathfinder.projects p
  WHERE p.organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor')
    AND p.ingested_at > now() - interval '24 hours'
)
SELECT
  e.agent_name,
  CASE
    WHEN l.run_id IS NULL THEN '⏸ never ran'
    WHEN l.status = 'running' AND l.hours_ago > 2 THEN '⚠ stuck (running >2h)'
    WHEN l.status = 'running' THEN '🟡 running'
    WHEN l.status = 'failed' THEN '🔴 last run failed'
    WHEN l.hours_ago > 26 THEN '⚠ overdue (>26h)'
    WHEN l.status = 'success' THEN '🟢 ok'
    ELSE '? ' || l.status
  END AS status,
  ROUND(l.hours_ago::numeric, 1) AS hrs_ago,
  l.records_new AS new_rows,
  l.runtime_s,
  COALESCE(re.n, 0) AS errors_24h
FROM expected e
LEFT JOIN last_pc_run l ON l.agent_name = e.agent_name
LEFT JOIN recent_pc_errors re ON re.agent_name = e.agent_name
ORDER BY e.agent_name;

-- Bonus rollup row, run separately:
SELECT
  (SELECT sources_hit_24h FROM (
    SELECT count(DISTINCT (event_data->>'source_slug')) AS sources_hit_24h
    FROM pathfinder.agent_log
    WHERE organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor')
      AND runner = 'pc' AND event_type = 'source_hit'
      AND ts > now() - interval '24 hours'
  ) s) AS pc_sources_hit_24h,
  (SELECT count(*) FROM pathfinder.projects p
   WHERE p.organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor')
     AND p.ingested_at > now() - interval '24 hours') AS rows_new_24h,
  (SELECT count(*) FROM pathfinder.projects p
   WHERE p.organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor')
     AND p.buy_window_open = true) AS buy_window_open_total;
```

Run it any time. Bookmark the snippet.

---

## Step 11 — Verify end-to-end (after first PC ingest run)

After Ingestor's first scheduled run lands (or after the manual dry-run posts its summary):

1. Open https://zedcor.unicron.systems/leads
2. Confirm new rows appear in the table — ones with recent `ingested_at` timestamps
3. Click into a project, confirm raw_payload is populated and source attribution is correct
4. Run the Verifier dry-run, confirm `phase_confidence` and `buy_window_open` populate on those rows
5. Check the Score Distribution widget — should still work (no schema change visible to dashboard)

**The product is live when these steps pass.** Welcome.

---

## Rollback plan if anything goes wrong

The PC variant is fully additive. To roll back:

1. **Stop the PC agents:** In each chat in the Perplexity Space, send "stop scheduled runs". They self-unschedule.
2. **Remove the Vercel domain:** Vercel → Domains → remove `zedcor.unicron.systems`. (DNS CNAME can stay; it just stops resolving on Vercel.)
3. **Revert the middleware:** `git revert <commit>` on the `zedcor-pc` branch, OR don't merge to main.
4. **Schema changes:** The additive migration is reversible by dropping the new columns + tables. The default `runner='cron'` means existing rows are untouched.
   ```sql
   -- ONLY if needed:
   alter table pathfinder.projects drop column if exists phase_confidence;
   alter table pathfinder.projects drop column if exists phase_signals;
   alter table pathfinder.projects drop column if exists buy_window_open;
   drop table if exists pathfinder.customer_signals;
   drop table if exists pathfinder.source_licenses;
   drop table if exists pathfinder.hubs;
   alter table pathfinder.agent_log  drop column if exists runner;
   alter table pathfinder.agent_runs drop column if exists runner;
   ```
5. The v1 Pathfinder system is unaffected throughout. Funder, Internal, and the existing Zedcor cron pipeline keep running.

---

## What's deferred to Phase 2 (after submission)

- `pc-license-checker` agent (automated ToS classification) — manual seeded table for now
- `pc-officer-extractor` agent (PIA officer contact extraction) — phase 2
- Customer-side connector for walled sources (Bonfire, IonWave behind Zedcor's vendor session) — phase 2
- Multi-city: Dallas / Phoenix / Atlanta hubs — phase 2, additive (one row in `hubs`, one new bucket of `data_sources` rows, same agents)
- Cron-style PC scheduling automation — for submission, manually `schedule` each agent in chat after dry-run

---

## What Kyle does next

1. Execute steps 1–11 in order.
2. After step 11 passes, record the submission demo against `zedcor.unicron.systems`.
3. Get on a call with Kyle Doenz to lock the bid-window phase mapping (Phase Mapper v1.0 → v1.1).
4. Merge `zedcor-pc` to `main` once confident.
