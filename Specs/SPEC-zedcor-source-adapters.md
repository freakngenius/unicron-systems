# SPEC — Zedcor Houston Source Adapters (10 sources)

Last updated: 2026-05-27
Parent spec: SPEC-zedcor-tier1-manual.md
Status: Approved for Claude Code build

## Adapter interface

Every adapter exports a single function:

```ts
export async function ingest(
  runId: number,
  orgId: string,    // Zedcor: 6cd87740-7c72-4337-ac79-316a54242eef
  hubId: string,    // 'houston'
): Promise<IngestResult>;

type IngestResult = {
  source_slug: string;
  candidates_found: number;
  projects_inserted: number;
  dedup_skips: number;
  geofence_skips: number;
  errors: string[];
  status: 'success' | 'empty' | 'failed';
};
```

File path convention: `lib/adapters/zedcor/<source_slug>.ts`.

## Per-adapter behavior

1. Read the source's row from `pathfinder.data_sources` to confirm `candidate_url`, `enabled=true`, and current `status='live'`. If disabled or paused, return `status='failed'` with reason logged.
2. Fetch the URL server-side (no browser). Use undici or built-in `fetch`. 30-second timeout per source.
3. Parse the opportunity list with cheerio (HTML) or `await res.json()` (Bonfire/IonWave when JSON endpoints expose).
4. For each opportunity, build a `PathfinderProject` row.
5. Geofence check: skip if outside `houston` hub's `geofence_states`. Log `geofence_skip` count.
6. Dedupe against `pathfinder.projects` via `(organization_id, source_url)` over 90 days. On hit, log `dedup_skip`.
7. On new: `INSERT` with `phase='unknown'`, `phase_confidence=0.0`, `score=null`, `agent_run_id=runId`, `organization_id=orgId`, `hub_id=hubId`.
8. Log `source_hit` (per opportunity processed), `project_inserted` (per insert), `source_empty` (if 0 candidates), `source_failed` (with verbatim error excerpt).
9. After all opportunities processed, update the source's `pathfinder.data_sources.last_polled_at` and `last_event_at`.

## Project signature for dedup

```
project_id = "<source_slug>:<external_id_or_url_hash>"
project_signature = sha1(source_slug + normalized_title + normalized_agency + posted_date)
```

Dedup checks both `source_url` and `project_signature`. Either match = skip.

## PathfinderProject schema mapping

Map source-parsed fields to `pathfinder.projects` columns. Required fields per insert:

```
organization_id, hub_id, agent_run_id, source_slug, source_url,
project_id, project_signature, title, agency, city, county, state,
posted_date, response_deadline, estimated_value, raw_payload (jsonb),
phase ('unknown'), phase_confidence (0.0), score (null), verified (false)
```

`raw_payload` stores the full parsed object so the phase mapper and ranker can re-read context without re-fetching.

## 10 sources — build order and config

Run `SELECT id, name, candidate_url, config, metadata FROM pathfinder.data_sources WHERE id = '<uuid>';` to confirm canonical URLs before writing each adapter. Update `adapter_kind` from `tier_2_pending` to one of `html_scrape`, `bonfire_public`, `ionwave_public`, `workday_public`, `agency_direct` when the adapter is written and tested.

| Order | source_slug | data_source_id | URL | Parsing approach |
|---|---|---|---|---|
| 1 | houston-obo | `e82e787e-8ac0-41c2-a3d6-4e322cce9cf1` | houstontx.gov/obo/currentcontractingopportunities.html | HTML table scrape via cheerio |
| 2 | houston-public-works | `f2dcd12d-f8c4-4623-8177-5f58d7326e1a` | (look up `candidate_url`) | HTML scrape |
| 3 | harris-county-bonfire | (look up by slug) | harriscountytx.bonfirehub.com/portal/?tab=openOpportunities | Bonfire public list (HTML or JSON if exposed) |
| 4 | houston-metro | (look up by slug) | ridemetro.org/about/business-to-business/procurement-opportunities | HTML scrape |
| 5 | port-houston | (look up by slug) | port-of-houston-authority.public-portal.us.workdayspend.com | Workday public portal HTML |
| 6 | fort-bend-county | `9e30fd57-7021-4980-8ee4-6584d20f6b3d` | fortbendcountytx.gov/government/departments/purchasing-agent/current-bids-rfps-rfqs-quotes | HTML scrape |
| 7 | galveston-county | `a41f2f1a-0489-4db2-8fa2-b064514880cf` | galvestoncountytx.gov/county-offices/purchasing/solicitations-bids | Bonfire portal |
| 8 | brazoria-county | `4f1d6e7f-a852-42ed-b2f6-f577f4fc28fa` | brazoriacountytx.gov/departments/purchasing/bid-opportunities | HTML or Bonfire |
| 9 | hisd-ionwave | (look up by slug) | houstonisd.ionwave.net/CurrentSolicitations.aspx | IonWave public HTML |
| 10 | txdot-houston-district | `389bb1f0-e486-42a3-aa80-9d52ccb5c3b7` | (look up `candidate_url`) | HTML scrape |

## Parallel execution

Dispatch all 10 adapters as parallel subagents using the `dispatching-parallel-agents` skill. Each subagent owns one adapter end-to-end including its own smoke test (fetch the URL, log opportunity count before insertion). Subagents return when their adapter is committed and the smoke test produced ≥1 candidate OR a verbatim "0 candidates found, source not currently posting" verdict.

## Per-source caps

- 50 candidates evaluated per source per run
- 600 candidates total across all sources per run

If a source exceeds 50, take the 50 most-recent by posted_date and log `event_data.deferred=true` on the rest.

## Per-source error handling

- 4xx response: log `source_failed` with status code + URL, move on.
- 5xx response: log `source_failed`, move on. No retry within run.
- Timeout (30s): log `source_failed` with `reason='timeout'`, move on.
- Parser drift (HTML 200 but 0 parseable rows where rows expected): log `source_failed` with `reason='parser_drift'`, move on. Operator updates the parser later.
- Source returns rows but all fail geofence: log `source_empty` (not failed).

## Smoke test per adapter

Each adapter's smoke test (run by the subagent before commit):

1. Call `ingest(testRunId, zedcorOrgId, 'houston')` against the live source.
2. Confirm at least one of:
   - ≥1 row written to `pathfinder.projects` for that source_slug
   - Verbatim "0 candidates currently posted" with the fetched HTML excerpt as evidence
3. Confirm `pathfinder.data_sources.last_polled_at` updated.
4. Confirm `pathfinder.agent_log` events written for the run.
