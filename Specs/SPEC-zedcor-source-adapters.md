# SPEC — Zedcor Houston Source Adapters (10 sources)

Last updated: 2026-05-27
Parent spec: SPEC-zedcor-tier1-manual.md
Status: Approved for Claude Code build

## Adapter interface

Each adapter exports a `SourceAdapter` object registered through the existing id-keyed `SOURCE_ADAPTERS` registry at `lib/adapters/sources/index.ts`. This reuses the Funder/Internal-onboarding adapter contract; the 10 Houston adapters plug in alongside `propublica-nonprofit-explorer`, `sam-gov-entity`, etc. — no parallel registry.

**Contract (Z1A — additive extension of `SourcePollOptions` at `lib/adapters/sources/types.ts`):**

```ts
// lib/adapters/sources/types.ts — additive extension for Z1A:
export interface SourcePollOptions {
  organizationId: string;
  organizationSlug: string;
  architecture: OrgArchitecture;
  lookbackSeconds?: number;
  config?: Record<string, unknown>;
  fetch?: typeof fetch;
  // Z1A additions — optional, ignored by Funder/Internal adapters:
  runId?: number;        // pathfinder.agent_runs.id; orchestrator threads this
  hubId?: string;        // 'houston'; geofence + projects.hub_id
}

// Each adapter:
export const houstonOboAdapter: SourceAdapter = {
  id: 'houston-obo',                 // matches data_sources.config->>'source_slug'
  type: 'registered',
  description: 'City of Houston OBO opportunities (HTML table).',
  async poll(opts) { /* fetch + parse → SourceEvent[] */ },
};
```

**Orchestrator wraps the adapter call** and computes the per-source `IngestResult` (geofence + dedup + insert + agent_log writes). The adapter itself is "dumb": fetch + parse + return `SourceEvent[]`. This keeps tenant policy (geofence, dedup keys, projects-schema mapping) in one place rather than fanning it across 10 files.

```ts
// lib/orchestrator/run-source.ts (Z1A — orchestrator-side, not adapter-side):
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

**File path convention: `lib/adapters/sources/<source_slug>.ts`** (alongside existing adapters).

## Per-adapter behavior (the adapter's job)

1. Read the source's row from `pathfinder.data_sources` to confirm `candidate_url`, `enabled=true`, `status='live'`. If disabled or paused, throw with a clear message — the orchestrator turns this into `status='failed'`.
2. Fetch the URL server-side (no browser). Native global `fetch` (Node 18+). 30-second `AbortSignal.timeout(30_000)` per source.
3. Parse the opportunity list with cheerio (HTML) or `await res.json()` (Bonfire/IonWave when JSON endpoints expose).
4. For each opportunity, return a `SourceEvent` with: `source_event_id` (stable per-source id), `title`, `summary`, `posted_date`, `raw_payload` (full parsed object), and the fields the orchestrator promotes to `projects` columns inside `raw_payload`: `agency`, `city`, `county`, `state`, `source_url`, `response_deadline`, `estimated_value`.

## Per-orchestrator behavior (per source, after adapter returns)

5. Geofence check: skip events whose `raw_payload.state` is outside `houston` hub's `geofence_states` (`['TX','LA','OK','AR']`). Bump `geofence_skip` counter.
6. Dedupe by `(source, source_id)` — the existing `pathfinder.projects` UNIQUE constraint. Use `INSERT ... ON CONFLICT (source, source_id) DO NOTHING RETURNING id`. Rows with returned id are new; rows that didn't return are dedup-skipped.
7. On new insert: set `source=source_slug`, `source_id=adapter.source_event_id`, `title`, `posted_date`, `summary`, `raw_payload`, `organization_id=orgId`, `hub_id=hubId`, `agent_run_id=runId`, `project_stage='unknown'`, `phase_confidence=0.0`, `score=NULL`, `response_deadline`, `source_url`, plus other promoted columns (see Schema mapping below).
8. Write `agent_log` events: `source_hit` (per opportunity processed), `project_inserted` (per insert), `source_empty` (if 0 candidates), `source_failed` (with verbatim error excerpt and HTML excerpt for parser-drift).
9. After the source is processed, `UPDATE pathfinder.data_sources SET last_polled_at=now(), last_event_at=now() WHERE id=<source uuid>`.

## Project identity + dedup

The existing `pathfinder.projects` UNIQUE constraint `(source, source_id)` is the dedup primitive — no separate SHA1 signature needed. The `source_id` value used by adapters should be the source's stable opportunity id (e.g. `RFP-2026-042`) so dedup survives parser cosmetic changes. When the upstream source exposes no stable id, fall back to `sha1(source_url)`.

Notion's `Project ID` field carries `<source_slug>:<source_id>` (e.g. `houston-obo:RFP-2026-042`) — the source-prefixed form is the Notion-side dedup key, computed at write time by `lib/notion/zedcor-writer.ts`.

## PathfinderProject schema mapping (Z1A)

`pathfinder.projects` reality (after Z1A migration `zedcor_z1a_projects_columns`):

**Promoted to columns** (hot reads — tag-phase, digest, Notion writer):

```
id (text, supplied), source (text), source_id (text), title, summary,
posted_date, response_deadline (Z1A), source_url (Z1A), hub_id (Z1A, text),
agent_run_id (Z1A, bigint FK → agent_runs.id), external_refs (Z1A, jsonb),
project_stage (text, holds the phase string: 'pre-bid'|'open'|'closing-soon'|'awarded'|'unknown'),
phase_confidence (numeric), score (integer, nullable), rationale (text),
raw_payload (jsonb), organization_id (uuid), verified (bool), country (text)
```

**Stays in raw_payload** (display-only, no query pattern in Z1A):

```
agency, city, county, state, estimated_value
```

The Notion writer reads from columns + `raw_payload->>agency` / `->>city` / etc. when mapping to Notion properties.

The `id` column is `text NOT NULL` (not auto-generated). Orchestrator computes it as `<source_slug>:<source_id>` for human readability and Notion cross-referencing.

## 10 sources — build order and config

All 10 sources confirmed present in `pathfinder.data_sources` (4 of 10 inserted as Z1A first commit; UUIDs captured 2026-05-27). `candidate_url` is the canonical URL (the DB rules; the spec's URL column is for human reference). Adapter must update `adapter_kind` from `tier_2_pending` to the actual kind (`html_scrape` / `bonfire_public` / `ionwave_public` / `workday_public` / `agency_direct`) when the adapter ships and smokes green.

| Order | source_slug | data_source_id | candidate_url (canonical, from DB) | Parsing approach |
|---|---|---|---|---|
| 1 | houston-obo | `e82e787e-8ac0-41c2-a3d6-4e322cce9cf1` | houstontx.gov/obo/current_contracting_opportunities.html | HTML table scrape via cheerio |
| 2 | houston-public-works | `f2dcd12d-f8c4-4623-8177-5f58d7326e1a` | houstonpublicworks.org/office-business-opportunity | HTML scrape |
| 3 | harris-county-bonfire | `6f3906b4-8012-4fac-94d2-f11728cb4d19` | harriscountytx.bonfirehub.com/portal/?tab=openOpportunities | Bonfire public list (HTML or JSON if exposed) |
| 4 | houston-metro | `842fd75f-a18e-4396-ad51-d60c559be9f8` | ridemetro.org/about/business-to-business/procurement-opportunities | HTML scrape |
| 5 | port-houston | `14d19633-58b0-46d8-bf54-2e028a8c52ae` | port-of-houston-authority.public-portal.us.workdayspend.com | Workday public portal HTML |
| 6 | fort-bend-county | `9e30fd57-7021-4980-8ee4-6584d20f6b3d` | fortbendcountytx.gov/government/departments/purchasing-agent/current-bids-rfps-rfqs-quotes | HTML scrape |
| 7 | galveston-county | `a41f2f1a-0489-4db2-8fa2-b064514880cf` | galvestoncountytx.gov/county-offices/purchasing/solicitations-bids | Bonfire portal |
| 8 | brazoria-county | `4f1d6e7f-a852-42ed-b2f6-f577f4fc28fa` | brazoriacountytx.gov/departments/purchasing | HTML or Bonfire (root URL — adapter follows to bid-opportunities subpage) |
| 9 | hisd-ionwave | `69d6d4d3-c20f-4339-95b3-f7834e7e639c` | houstonisd.ionwave.net/CurrentSolicitations.aspx | IonWave public HTML |
| 10 | txdot-houston-district | `389bb1f0-e486-42a3-aa80-9d52ccb5c3b7` | txdot.gov/about/districts/houston.html | HTML scrape (district landing — adapter follows to contracting subpage) |

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
