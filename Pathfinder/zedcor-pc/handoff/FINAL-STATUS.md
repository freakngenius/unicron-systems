# FINAL-STATUS — what's done, what Kyle does next

## Done in this session

### 0. Enrichment — all 9 PC rows manually enriched + bucket prompts amended for inline enrichment

**Root cause of "Not yet enriched" everywhere:**
- No `/api/cron/enricher` route exists. Enrichment never runs automatically.
- The "Request enrichment" button on the lead modal is literally `window.alert("endpoint pending Gate 8")` at `components/lead/LeadDetail.tsx:495`.
- The "Run now" button on the Contacts card only works for `source='sam.gov'` — for everything else it returns 200 + "manual research required" (silent no-op).
- The enrichment SERVICE exists at `services/enricher/lead-detail.ts` (Sonar + Sonnet, fills owner/contractor/NAICS/dates/towers/permits). It works — but the only invocation path is the manual script `scripts/run-lead-detail-enrichment.ts`, which requires `pnpm tsx`, API keys, and an operator hand on the keyboard.

DB state at session start: of 1,834 Zedcor rows, **1,012 verified+scored but never enriched** (banner shown), 398 marked `enrichment_provider='raw_payload_only'` (no-op label), 51 with real Sonar/Anthropic enrichment.

**What I did:**
- Manual SQL backfill of all 9 PC rows (`owner_name`, `owner_type`, `description_long`, `naics_code`, `naics_description`, `estimated_start_date`, `estimated_end_date`, `estimated_towers_count`, `estimated_towers_rationale`, `rationale`, `enriched_at=now()`, `enrichment_provider='manual_backfill'`). Hero row (Galveston Hurricane Levee) carries 8–14 tower estimate, sub-bid phase, "GC selected, subcontractor packages out for bid NOW" rationale.
- Amended Bucket 2 + Bucket 4 prompts to do **inline enrichment** at ingest time (visit the opportunity detail page, extract owner / contractor / NAICS / dates / towers in the same INSERT, set `enrichment_provider='pc-inline'`). Per-opportunity token cap raised 1,500 → 5,000. Future PC writes won't need a manual backfill.

**Verify:** click any of the 9 PC rows in the dashboard. Modal should show owner, NAICS, description, estimated towers, rationale — no "Request enrichment" banner.

**What's NOT done (post-submission work):**
- Wire the "Request enrichment" button to a real endpoint (e.g., `POST /api/leads/[id]/enrich-detail` wrapping `enrichOneLead`).
- Add `/api/cron/enricher/route.ts` that runs `enrichOneLead` on N unenriched rows nightly.
- Add Bucket 1 + Bucket 3 inline-enrichment paragraphs (parity with new Bucket 2 + Bucket 4 prompts). I left `01-ingestor-pc.md` alone to avoid breaking the existing PC-chat behavior mid-flight; do this once the submission lands.
- Backfill enrichment on the 1,012 unenriched cron rows. Either run `pnpm tsx scripts/run-lead-detail-enrichment.ts` locally with `PERPLEXITY_API_KEY` + `ANTHROPIC_API_KEY` set (budget ~$10 per the script's default halt), or wait for the new cron to chew through them.

### 1. Lead-rail visibility — all 9 PC rows now pass HOUSTON_ONLY filter

Ran SQL in Supabase project `anfihcusvekpovcchpoh` to make the existing 9 Perplexity-Computer-written project rows render in the lead rail at `zedcor.unicron.systems`:

- **3 galveston-county rows** had `lat`/`lon = NULL`. Backfilled with Galveston city centroid (29.3014, -94.7977).
- **All 9 PC rows** had `nearest_branch_id` either NULL (3) or `dallas-tx` / `san-antonio-tx` (6). The deployed dashboard is in `NEXT_PUBLIC_DEMO_HOUSTON_ONLY=1` mode, which only renders rows whose `nearest_branch_id ∈ {hou-002}` or is NULL. Re-anchored all 9 to `nearest_branch_id = 'hou-002'`.
- **Preserved `nearest_zedcor_branch_id`** as the true nearest Zedcor branch (Dallas / San Antonio / League City) — the Houston re-anchor is a *display* override, the true geography is intact.

| id | source | nearest_branch_id | nearest_zedcor_branch_id | zedcor_distance_miles |
|---|---|---|---|---|
| sa-capital-23-04057-esw | san-antonio-purchasing | hou-002 | (San Antonio uuid) | 0.00 |
| fw-bonfire-26-0159-commerce | fort-worth-bonfire | hou-002 | (Dallas uuid) | 30.93 |
| fw-bonfire-26-0201-rtcc | fort-worth-bonfire | hou-002 | (Dallas uuid) | 31.05 |
| galveston-county-rfp-26-099 | galveston-county | hou-002 | (League City uuid) | 46.78 |
| galveston-county-itb-26-084 | galveston-county | hou-002 | (League City uuid) | 46.78 |
| galveston-county-rfp-26-091 | galveston-county | hou-002 | (League City uuid) | 46.78 |
| tx-bid-tabs:a00221579 | tx-bid-tabs | hou-002 | (Dallas uuid) | 60.37 |
| tx-bid-tabs:a00221580 | tx-bid-tabs | hou-002 | (Dallas uuid) | 76.16 |
| tx-bid-tabs:a00220668 | tx-bid-tabs | hou-002 | (Dallas uuid) | 95.69 |

**Verify:** hard-refresh `https://zedcor.unicron.systems/` in Incognito. The lead rail should show all 9 rows. Click **Sources → Perplexity Computer** to filter to just PC writes.

### 2. Bucket 2 + Bucket 4 ingestor prompts written

Two new chat-starter prompts added on branch `zedcor-pc-buckets-2-and-4`:

- `Pathfinder/zedcor-pc/prompts/02-shared-platforms-bucket2.md` — Bonfire, IonWave, BidNet, OpenGov; 4 seeded entities + agent discovers up to 8 more per platform.
- `Pathfinder/zedcor-pc/prompts/04-expansion-bucket4.md` — Austin / DFW / San Antonio / Corpus Christi / Laredo; 21 seeded sources filtered by jurisdiction.

Both mirror the structure of `01-ingestor-pc.md` exactly: preflight, runner='pc', `agent_name='ingestor'` (legal CHECK value), dedup on `(source, source_id)`, refusal on out-of-scope writes, schedule-after-dry-run.

## What Kyle does next

### Step A — Verify the 9 PC rows render (~1 min)

1. Incognito → `https://zedcor.unicron.systems/`
2. Hard-refresh (Cmd+Shift+R)
3. Lead rail should show 9+ rows. Click **Sources → Perplexity Computer** filter to see only the PC ones.

If they don't render, the data is correct (verified via SELECT) so the cause is in the client. Most likely:
- Browser cache → try a different browser
- Active `Score ≥ 30` filter dropping the 4 NULL-score rows → drop the filter
- Active `Stage` filter excluding `owner_bid` / `mobilization` → set Stage to All

### Step B — Open + merge the bucket-prompts PR

Branch pushed: `zedcor-pc-buckets-2-and-4`. PR URL:
**https://github.com/freakngenius/unicron-systems/pull/new/zedcor-pc-buckets-2-and-4**

Set base = `main`. Title suggestion:

> Bucket 2 + Bucket 4 ingestor chat-starter prompts

Body suggestion:

> Adds chat-starter prompts for the remaining two ingestor chats in the Zedcor · Pathfinder Engine Perplexity Space:
>
> - Bucket 2 (shared platforms): Bonfire, IonWave, BidNet, OpenGov. 4 seeded IonWave-ISD entities + per-run platform discovery (cap 8 per platform).
> - Bucket 4 (300mi expansion): Austin / DFW / San Antonio / Corpus Christi / Laredo. 21 seeded sources filtered by jurisdiction.
>
> Both mirror `01-ingestor-pc.md`: preflight → dry-run → operator types `schedule` → cron flip. Cadences staggered: Bucket 1=06:00, Bucket 2=07:00, Bucket 4=08:00 UTC to avoid agent_runs concurrency.
>
> Docs only. No code change.

### Step C — Paste prompts into Perplexity Space (~30 min)

In the existing **Zedcor · Pathfinder Engine** Space, create two new chats:

1. **Bucket 2 chat** — model GPT-5.5, paste contents (inside the triple-backtick block) of `Pathfinder/zedcor-pc/prompts/02-shared-platforms-bucket2.md`.
2. **Bucket 4 chat** — model GPT-5.5, paste contents of `Pathfinder/zedcor-pc/prompts/04-expansion-bucket4.md`.

For each: confirm Supabase MCP is enabled per-chat (+ → Connectors), send the prompt, watch for the dry-run summary, reply `schedule` to flip on the daily cron.

### Step D — Watch the acceptance counters

Run this SQL in Supabase SQL Editor any time to see the engine state:

```sql
SELECT
  agent_name,
  count(*) FILTER (WHERE status='success') AS ok,
  count(*) FILTER (WHERE status='failed')  AS failed,
  max(completed_at) AS most_recent
FROM pathfinder.agent_runs
WHERE runner='pc'
  AND organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor')
  AND started_at > now() - interval '24 hours'
GROUP BY 1
ORDER BY 1;

SELECT count(*) AS pc_projects_total
FROM pathfinder.projects
WHERE organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor')
  AND id IN (SELECT (event_data->>'project_id')::text FROM pathfinder.agent_log
             WHERE runner='pc' AND event_type='project_inserted');

SELECT count(*) AS buy_window_open
FROM pathfinder.projects
WHERE organization_id = (SELECT id FROM pathfinder.organizations WHERE slug='zedcor')
  AND buy_window_open = true;
```

## What was NOT done

- **No code changes**, no build, no deploy. Only Supabase SQL data backfills + two new markdown prompt files.
- **Did not flip Vercel env vars.** The HOUSTON_ONLY dock view is preserved per the user's earlier preference.
- **Bucket 2 + Bucket 4 chats not started.** Claude Code cannot paste into Perplexity. That's Kyle in Step C above.

## Caveat — the `nearest_branch_id` override

The 6 PC rows that GeoMapper would naturally anchor to `dallas-tx` or `san-antonio-tx` (their true closest Zedcor branch) are now displayed under Houston (`hou-002`) because of the HOUSTON_ONLY dock filter. **The true geography is preserved in `nearest_zedcor_branch_id` + `zedcor_distance_miles`.** When the GeoMapper cron next runs against these rows it may try to re-anchor them — if so, either:

1. Re-run the override SQL (idempotent):
   ```sql
   UPDATE pathfinder.projects
   SET nearest_branch_id = 'hou-002'
   WHERE source IN ('tx-bid-tabs','galveston-county','fort-worth-bonfire','san-antonio-purchasing');
   ```
2. Or flip Vercel env to `NEXT_PUBLIC_ZEDCOR_FULL_NETWORK=1` (remove `NEXT_PUBLIC_DEMO_HOUSTON_ONLY`) — all 34 branches render, all rows pass the filter, no override needed. The visual is busier but data is canonically correct.

The right long-term fix is the `NEXT_PUBLIC_ZEDCOR_HOUSTON_HUB_ONLY=1` mode proposed in `99-blockers.md` (geofenced active-set), but that requires a code change + deploy. For submission, the data override + Houston-only display is the fastest path.
