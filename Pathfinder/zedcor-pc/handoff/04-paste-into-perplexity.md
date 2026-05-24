# 04 — Paste into Perplexity (Kyle copy-paste runbook)

This document is the **final** step in the handoff chain. It assumes:

- The deployed migration is in place (`Pathfinder/supabase/migrations/20260524_zedcor_pc_additive.sql`)
- Seeds are loaded (`Pathfinder/zedcor-pc/seeds/01_zedcor_pc_seed.sql` and `02_zedcor_branches_and_customers.sql`)
- `zedcor.unicron.systems` resolves and serves the Pathfinder UI
- The three PC prompt files are committed and ready to paste:
  - `Pathfinder/zedcor-pc/prompts/01-ingestor-pc.md`
  - `Pathfinder/zedcor-pc/prompts/02-verifier-pc.md`
  - `Pathfinder/zedcor-pc/prompts/03-customer-intel-pc.md`

If any of those are not true, see `00-START-HERE.md` and `Pathfinder/zedcor-pc/runbook/RUNBOOK.md` first.

---

## Part A — Prerequisites (10 min)

These are Kyle-side actions Claude Code cannot perform. Do them before opening Perplexity.

### A.1 — Google Maps API key referrer (fixes the black map)

The map on `zedcor.unicron.systems` renders as a black void today. Root cause per `02-data-flow-spec.md`: the Google Maps API key in Google Cloud Console does not list `zedcor.unicron.systems` in its HTTP referrer allowlist, so Maps rejects the script load.

1. Open https://console.cloud.google.com/apis/credentials
2. Find the API key starting with `AIzaSyAnOnQu…` (the one set in Vercel as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)
3. **Application restrictions → Website restrictions → HTTP referrers**, add:
   - `https://zedcor.unicron.systems/*`
   - `https://*.unicron.systems/*` (covers any other tenant subdomain)
   - `https://*.vercel.app/*` (covers Vercel preview deploys you may use for the video shoot)
4. Save. Wait ~5 minutes for propagation.
5. Hard-refresh `zedcor.unicron.systems`. Map should render.

If the map is still black after 5 minutes, check the browser console for `RefererNotAllowedMapError` to confirm; anything else is a different problem.

### A.2 — Vercel environment variable sanity check

Open Vercel → `pathfinder-ashy` project → **Settings → Environment Variables**. Confirm these exist in `Production`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_ZEDCOR_FULL_NETWORK=1`

Per `00-START-HERE.md` these are already set. If any are missing, fix and redeploy.

### A.3 — Supabase project access for the Space

You will need the Supabase service-role key (Supabase → Settings → API → `service_role` secret) to give Perplexity's Supabase connector write access when you configure it in Part B. Have it ready. Do **not** paste the key into chat messages — only into the connector settings panel.

---

## Part B — Create the Perplexity Space (15 min)

Per `Pathfinder/zedcor-pc/runbook/RUNBOOK.md` step 7.

1. Open https://www.perplexity.ai/spaces (logged in as `kyle@demystified.ai`).
2. Create new Space:
   - **Title:** `Zedcor · Pathfinder Engine`
   - **Description:** `Live agentic intelligence engine for Zedcor Security Systems. PC-driven daily signal acquisition across 50+ procurement and project sources in Houston (300mi radius). Writes directly to the Pathfinder dashboard at zedcor.unicron.systems.`
   - **Instructions** (paste this block verbatim):

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

3. **Connectors:** at the Space level, add the **Supabase** connector.
   - **Project URL:** `https://anfihcusvekpovcchpoh.supabase.co`
   - **Service-role key:** paste from Supabase Settings → API → `service_role`
   - Save.

Some Perplexity Space deployments require the connector to be re-enabled per-chat (see Part C step 2 for each chat). The agent prompts already handle the case where the connector isn't enabled — they post `BLOCKED` and stop.

---

## Part C — Create the three chats (30 min)

Order matters: **Ingestor → Verifier → Customer Intel.** Verifier needs Ingestor's rows to work on; Customer Intel needs `zedcor_customer_sites` populated (already seeded).

For each chat, the flow is identical:
1. New chat in the Space.
2. Click **+ → Connectors → Supabase** (if not inherited from Space level).
3. Set the model.
4. Paste the matching prompt file's contents (everything inside the triple-backtick block).
5. Send.
6. The agent runs preflight and a manual dry run, then posts a summary.
7. If the summary looks right, reply `schedule` to flip on the daily cron. If not, reply with whatever the agent needs.

### Chat 1 — Ingestor

- **Model:** **GPT-5.5** (cheap, fast, browser-heavy)
- **Prompt file:** `Pathfinder/zedcor-pc/prompts/01-ingestor-pc.md`
- **What to expect in the dry-run summary:** counts of sources hit / empty / failed, rows new / deduped, per-bucket breakdown, top sources by yield.
- **Schedule reply:** `schedule` → enables `0 6 * * *` UTC (daily 06:00 UTC).

If the agent posts `BLOCKED: Supabase connector is not enabled on this chat`, click + → Connectors → enable Supabase, then resend the prompt.

### Chat 2 — Verifier

- **Model:** **Opus 4.7** (judgment-heavy phase inference)
- **Prompt file:** `Pathfinder/zedcor-pc/prompts/02-verifier-pc.md`
- **What to expect in the dry-run summary:** evaluated count, verified pass/fail, phases inferred, buy-window hits, phase distribution.
- **Schedule reply:** `schedule` → enables `0 10 * * *` UTC (runs ~1 hour after Ingestor's last bucket).

If the Verifier's dry run reports zero candidates, that's expected if Ingestor hasn't filled the queue yet. Wait for Ingestor's first scheduled run (or rerun Ingestor manually with `rerun`), then retry the Verifier.

### Chat 3 — Customer Intel

- **Model:** **Opus 4.7** (inference / synthesis)
- **Prompt file:** `Pathfinder/zedcor-pc/prompts/03-customer-intel-pc.md`
- **What to expect in the dry-run summary:** customers checked, signals new / deduped, high-urgency count, breakdown by signal type.
- **Schedule reply:** `schedule` → enables `0 11 * * *` UTC.

If the Customer Intel agent posts `BLOCKED: pathfinder.zedcor_customer_sites has no active rows for Zedcor`, that means the seed didn't load for some reason. Re-run `02_zedcor_branches_and_customers.sql` and resend the prompt. (Per `00-START-HERE.md` this is already loaded — 1,825 active rows expected.)

---

## Part D — Acceptance tests (run after each scheduled cycle completes)

These four queries are from `02-data-flow-spec.md`. Run them in the Supabase SQL Editor against project `anfihcusvekpovcchpoh`, schema `pathfinder`.

```sql
-- D.1 — PC ingestor wrote new rows today
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
```

```sql
-- D.2 — PC Verifier inferred phases
SELECT count(*) AS pc_phases_today
FROM pathfinder.agent_log
WHERE runner='pc' AND event_type='phase_inferred'
  AND ts > now() - interval '24 hours';
-- Expect: > 0
```

```sql
-- D.3 — Buy window open rows exist
SELECT count(*) AS buy_window_count
FROM pathfinder.projects
WHERE buy_window_open = true
  AND organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor');
-- Expect: ≥ 5
```

```sql
-- D.4 — Customer signals written
SELECT count(*) AS cs_count
FROM pathfinder.customer_signals
WHERE organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor');
-- Expect: ≥ 3
```

If all four return their expected counts, the engine is real and the submission qualifies per `00-START-HERE.md`'s "how to know you're done" criteria.

For ongoing monitoring, also save the "Zedcor PC — Agent Status" Supabase snippet from `Pathfinder/zedcor-pc/runbook/RUNBOOK.md` step 10 — it gives a per-agent health rollup (status emoji, hours-ago, errors-24h).

---

## Part E — Headline visual for the submission video

Per `02-data-flow-spec.md`, the video needs to show three things:

1. The dashboard loading with the lead rail populated (already works).
2. **The agent log ticker at the bottom showing live PC writes streaming in** — this is the headline. Schedule the morning of the shoot so timestamps are tight.
3. A project card on the right rail with `buy_window_open=true` and `phase_confidence > 0.7` — proves PC Verifier added value.

Optional: branches sidebar showing real Zedcor branches (works today; duplicate-branch cleanup is documented as a known issue in `99-blockers.md` and isn't required for the video).

---

## Part F — Rollback (if a PC agent goes off the rails)

PC writes are isolated from cron via the `runner='pc'` column. To silence PC without breaking cron:

1. In each chat in the Space, send `pause schedule` (or disable from Space settings).
2. Surgical cleanup of bad rows (inspect before deleting):

```sql
-- Inspect
SELECT id, source, source_id, title, ingested_at
FROM pathfinder.projects
WHERE organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor')
  AND ingested_at > '<bad run start timestamp>'
  AND id IN (
    SELECT (event_data->>'project_id')::text FROM pathfinder.agent_log
    WHERE runner='pc' AND agent_name='ingestor' AND event_type='project_inserted'
      AND ts > '<bad run start timestamp>'
  );

-- Then, after confirming the inspect set is what you want:
DELETE FROM pathfinder.projects WHERE id IN (...);
```

Cron-written rows (`runner='cron'`) are untouched.

The full rollback playbook (including schema-drop sequence — last-resort only) is in `Pathfinder/zedcor-pc/runbook/RUNBOOK.md` step "Rollback plan if anything goes wrong".
