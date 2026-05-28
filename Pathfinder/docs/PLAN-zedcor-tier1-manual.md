# PLAN — Sprint Z1A · Zedcor Houston Tier 1 Pilot · Adapters + Backend

Branch: `feat/zedcor-tier1-manual`
Worktree: `/Users/kylekesterson/Desktop/Claude/cloned-repo-worktrees/zedcor-tier1-manual/`
Kanban card: [Zedcor Houston Tier 1 Pilot — Adapters + Backend (Sprint Z1A)](https://www.notion.so/36e785c67e72810aafcdec22706fce05) (In Process)
Parent specs (canonical for this sprint): `Specs/SPEC-zedcor-tier1-manual.md`, `Specs/SPEC-zedcor-source-adapters.md`, `Specs/SPEC-zedcor-digest-template.md`

GATE 1 deliverable. Halt for "approved" before any code beyond migrations/specs that already shipped.

---

## TL;DR

Z1A ships the backend half of the Zedcor Houston pilot: 10 source adapters, an orchestrator endpoint that runs them in-process and writes survivors to Notion, the Send Digest + digest-preview endpoints, and a per-handler cron guard. Z1B (parallel sprint, branch `feat/zedcor-tier1-ui`) owns the operator-facing page that calls these endpoints. The chain must work end-to-end with Anthropic disabled (`score=null`, `phase='unknown'` survive to Notion). No data flows through a cron; the only way to trigger ingest in this sprint is the Z1B button.

## Pre-flight already shipped (commits on this branch)

| Commit | Subject |
|---|---|
| `fc91de7` | specs: add Z1 spec files for zedcor tier-1 manual sprint |
| `21188e9` | specs: reconcile Z1A — adapter path, schema reality, scope split |

Pre-flight side effects:
- **Migration `zedcor_z1a_projects_columns`** applied to `pathfinder.projects`: added `response_deadline date`, `source_url text`, `hub_id text`, `agent_run_id bigint FK→agent_runs.id`, `external_refs jsonb DEFAULT '{}'`, plus indexes on `agent_run_id`, `hub_id`, `source_url`. Additive, non-breaking; no existing column modified.
- **Migration `zedcor_z1a_organizations_config`** applied to `pathfinder.organizations`: added `config jsonb NOT NULL DEFAULT '{}'`. Zedcor's row initialized with `{"manual_only": false}`.
- **4 `pathfinder.data_sources` rows inserted** (harris-county-bonfire `6f3906b4...`, houston-metro `842fd75f...`, port-houston `14d19633...`, hisd-ionwave `69d6d4d3...`) with `config.source_slug`, `config.hub_id='houston'`, `config.bucket=2`, `config.introduced_by_sprint='Z1A'`. All 10 sources now present.
- **Kanban**: card already in In Process (Cowork action 2026-05-27).
- **SourcePollOptions extension** documented in `Specs/SPEC-zedcor-source-adapters.md` — to be applied to `lib/adapters/sources/types.ts` in the first code commit.

## Sprint scope — what Z1A owns, what Z1B owns

### Z1A (this branch)

Migrations + inserts above. The following files (new unless noted; all under `Pathfinder/`):

**Adapters (10 new, dispatched in parallel during execution):**
- `lib/adapters/sources/houston-obo.ts`
- `lib/adapters/sources/houston-public-works.ts`
- `lib/adapters/sources/harris-county-bonfire.ts`
- `lib/adapters/sources/houston-metro.ts`
- `lib/adapters/sources/port-houston.ts`
- `lib/adapters/sources/fort-bend-county.ts`
- `lib/adapters/sources/galveston-county.ts`
- `lib/adapters/sources/brazoria-county.ts`
- `lib/adapters/sources/hisd-ionwave.ts`
- `lib/adapters/sources/txdot-houston-district.ts`

**Adapter registry (1 edit):**
- `lib/adapters/sources/index.ts` — additive: import + register the 10 new adapter objects in `SOURCE_ADAPTERS`. Existing entries untouched.

**Adapter contract extension (1 edit):**
- `lib/adapters/sources/types.ts` — additive: `runId?: number; hubId?: string` on `SourcePollOptions`. Existing adapters compile unchanged.

**Orchestrator + per-source wrapper:**
- `lib/orchestrator/orchestrator.ts` — `runZedcorOrchestrator(opts): Promise<RunSummary>`. Opens agent_runs row, iterates the 10 adapters in order, runs tag-phase + ranker + relaxed verifier + Notion writes, closes agent_runs row, returns summary.
- `lib/orchestrator/run-source.ts` — `runSource(adapter, runCtx): Promise<IngestResult>`. Wraps adapter.poll() with geofence + dedup + insert + agent_log per the SPEC steps 5-9.
- `lib/orchestrator/tag-phase.ts` — deterministic date-based phase tagger (verbatim from SPEC).
- `lib/orchestrator/tag-phase.test.ts` — 5-case unit test (awarded / closing-soon / open with deadline / open without deadline / unknown).
- `lib/orchestrator/relaxed-verifier.ts` — thin wrapper around the existing verifier that filters `agent_log` writes to soft-flag (no project deletion) when project state is in the hub's `geofence_states`.

**Notion writer:**
- `lib/notion/zedcor-writer.ts` — `writeProjectToNotion(project): Promise<{leadId, notionPageUrl, alreadyExists}>`. Reads `NOTION_API_TOKEN`. Dedupes by `Project ID` property. Maps fields per the SPEC column list.
- `lib/notion/types.ts` — TS types for the Notion-property payload (Phase enum, State enum, Rep Status enum).

**Digest render layer:**
- `lib/email/zedcor-digest-template.html` — copied verbatim from `/Users/kylekesterson/Documents/Claude/Unicron/Pathfinder Digest - Design/Pathfinder Digest.template.html`. Do NOT modify.
- `lib/email/handlebars-setup.ts` — exports configured Handlebars + `renderDigest(template, data)`. Registers `eq` helper.
- `lib/email/build-digest-data.ts` — `buildDigestData(runId, recipients): Promise<DigestData>` per SPEC-zedcor-digest-template.md §"Variable computation rules". Queries Notion Rep View, formats America/Chicago dates, etc.
- `lib/email/TEMPLATE-PATCHES.md` — only created if the `leads_remaining_count==0` guard is needed (Spec 9.3 condition). If created, the patched template lives at `lib/email/zedcor-digest-template.guarded.html`.

**API routes (Pathfinder Next.js basePath `/pathfinder/api/...`):**
- `app/api/zedcor/run-orchestrator/route.ts` — POST handler, no body required, returns `RunSummary` JSON.
- `app/api/zedcor/run-status/route.ts` — GET `?run_id=N` returns `{ progress: "Polling 4 of 10: Houston OBO...", sources_done: 4, sources_total: 10, status: 'running'|'success'|'partial_failure'|'failed' }` for the Z1B UI to poll every 2 seconds.
- `app/api/zedcor/send-digest/route.ts` — POST `{ recipients?: string[] }`, returns `{ resend_message_id, lead_count, recipients }`.
- `app/api/zedcor/digest-preview/route.ts` — GET returns rendered HTML. Same auth as `/internal` routes.
- `app/api/zedcor/scheduled-toggle/route.ts` — POST `{ enabled: boolean }` (UI sends `enabled: !manual_only`). Flips `organizations.config.manual_only`. Writes audit row to `agent_log` with `event_type='manual_only_toggle'`, `event_data={by, from, to}`. Returns the new state.

All API routes protected by the existing `/internal` auth middleware. Each captures `request.auth.email` for audit attribution.

**Cron guard (per-handler, Pathfinder only):**
- Audit `Pathfinder/app/api/cron/**/route.ts` for handlers that read or write Zedcor org data. For each, add a guard at the top: query `pathfinder.organizations.config->>'manual_only'` for `6cd87740-7c72-4337-ac79-316a54242eef`. If true, write `agent_log` `event_type='cron_skipped_manual_only'` and return `new Response(null, { status: 204 })`. Wraps the existing handler logic; no behavior change when `manual_only=false`.
- Audit checklist (will be enumerated in execution phase): `cron/ingestor`, `cron/ranker`, `cron/verifier`, `cron/outreach`, `cron/briefing`, `cron/slack-alerts`, `cron/email-cron`, etc.

**Static assets:**
- `public/brand/atrium-mark-32-white.png` — copied from `/Users/kylekesterson/Documents/Claude/Unicron/Atrium-design/atrium-logo.png`, resized to 32×32 white-on-transparent (sharp). Used by `DIGEST_LOGO_URL` fallback.

**Package + config:**
- `package.json` — add `handlebars`, `cheerio`, `@notionhq/client` to dependencies. `resend` and `@anthropic-ai/sdk` already present. `undici` NOT added (native fetch).
- `.env.example` (if it exists) — add the 5 new env vars (see "Environment variables" below).

**Documentation:**
- `docs/PLAN-zedcor-tier1-manual.md` — this file.
- `docs/PR-zedcor-tier1-manual.md` — auto-generated draft PR body (assembled at PR-open time from this plan + smoke-test evidence at GATE 2).

### Z1B (NOT this branch — coordination only)

Z1B owns `app/(authenticated)/internal/zedcor/run/page.tsx` and any client components. Z1B consumes Z1A's API routes:
- POSTs `/api/zedcor/run-orchestrator` for the Run Zedcor button.
- Polls `/api/zedcor/run-status?run_id=N` every 2 seconds during a run.
- POSTs `/api/zedcor/scheduled-toggle` for the toggle.
- POSTs `/api/zedcor/send-digest` for the digest button.
- Reads recent runs from `pathfinder.agent_runs WHERE runner='manual' AND organization_id=Zedcor`.

Contract stability: Z1A treats these endpoint shapes as frozen on plan approval; any change is announced in the Z1A↔Z1B Slack thread (or Kyle relay). Z1B can stub against the documented shapes today and integrate post-merge.

File ownership conflict surface: none — Z1B's only sprint-current commit (`3083433`) touches `Specs/SPEC-zedcor-digest-template.md` and `Specs/SPEC-zedcor-tier1-manual.md`. Z1A also touched those. **Decision: Z1B rebases on Z1A after merge** (Z1A merges first because backend lands the data Z1B needs to render). Kyle's call if a different order is preferred.

## Environment variables

To set in **both** Vercel projects (pathfinder-ashy AND unicron-systems) before preview deploys:

| Var | Source / value |
|---|---|
| `NOTION_API_TOKEN` | Notion internal integration token. Integration must have write access to DB `856b43a02b4d43649344c5e1a05d206d` and to the parent "Zedcor" page tree. |
| `ZEDCOR_NOTION_DB_ID` | `856b43a02b4d43649344c5e1a05d206d` |
| `ZEDCOR_DISABLE_ANTHROPIC` | `false` in normal preview; flip to `true` for the third smoke run |
| `RESEND_FROM_ADDRESS` | e.g. `Pathfinder <pathfinder@unicron.systems>` (verified Resend sender domain) |
| `DIGEST_LOGO_URL` | Preview: `https://<preview-host>/pathfinder/brand/atrium-mark-32-white.png`; prod: `https://pathfinder-ashy.vercel.app/pathfinder/brand/atrium-mark-32-white.png`. Resolution order in SPEC-zedcor-digest-template.md §9.5. |
| `DIGEST_MAX_CARDS` | optional, default 10 |
| `ANTHROPIC_API_KEY` | already present (used by ranker) |
| `RESEND_API_KEY` | already present |
| `SAM_GOV_API_KEY` | already present (per spec note 2026-05-27) |

Plan calls Kyle to confirm `NOTION_API_TOKEN` and `RESEND_FROM_ADDRESS` are set in preview before GATE 2 smoke. Plan does NOT modify Vercel envs from code.

## API route shapes

### `POST /pathfinder/api/zedcor/run-orchestrator`

Request: empty body (auth header carries operator identity).

Response (synchronous, blocks until run completes — typical run is 10×fetch+parse + Anthropic ranker; if this approaches Vercel's 60s function timeout we'll switch to fire-and-poll, noted in risk register):

```json
{
  "run_id": 1234,
  "started_at": "2026-05-27T18:45:12Z",
  "completed_at": "2026-05-27T18:45:51Z",
  "status": "success",
  "sources_polled": 10,
  "sources_hit": 8,
  "sources_empty": 1,
  "sources_failed": 1,
  "projects_inserted": 47,
  "projects_deduped": 12,
  "notion_writes": 47,
  "notion_dedupes": 0,
  "errors": [{ "source_slug": "harris-county-bonfire", "message": "timeout 30s" }]
}
```

Same payload is written to `agent_runs.run_metadata` so the recent-runs log can replay history without re-running.

### `GET /pathfinder/api/zedcor/run-status?run_id=N`

Returns the current state of an in-flight or recently-completed run for Z1B's polling:

```json
{
  "run_id": 1234,
  "status": "running",
  "sources_total": 10,
  "sources_done": 4,
  "current_source": "houston-metro",
  "progress_label": "Polling 4 of 10: METRO Houston Procurement",
  "projects_inserted_so_far": 12
}
```

Reads from `agent_runs` + `agent_log` events for the run_id.

### `POST /pathfinder/api/zedcor/send-digest`

Request: `{ "recipients"?: string[] }` (default `["team@unicron.systems"]`).

Response: `{ "resend_message_id": "...", "lead_count": 8, "recipients": [...] }` or `{ "error": "..." }` on Resend failure.

### `GET /pathfinder/api/zedcor/digest-preview`

Returns rendered HTML (`Content-Type: text/html`). Same auth as `/internal`. No email send. Kyle bookmarks the URL.

### `POST /pathfinder/api/zedcor/scheduled-toggle`

Request: `{ "enabled": boolean }` (`enabled=true` means scheduled cron is live, which sets `manual_only=false`; `enabled=false` sets `manual_only=true`).

Response: `{ "manual_only": boolean, "by": "kyle@freakngenius.com", "ts": "ISO" }`.

Writes `agent_log` audit row with `event_type='manual_only_toggle'`, `event_data={by, from, to}`.

## The 10 source adapters

Build order, file paths, data_source_id, parsing approach per `Specs/SPEC-zedcor-source-adapters.md` (final table after Z1A reconcile). Each adapter is dispatched as a parallel subagent during execution (the SPEC's "Parallel execution" section). Each subagent owns its file end-to-end including its own smoke fetch and verbatim "0 candidates" verdict if the source has nothing today.

Smoke criteria per adapter:
1. Live fetch of `candidate_url` returns 200 within 30s.
2. cheerio (or JSON parse for IonWave/Bonfire) yields ≥1 row OR the verbatim "0 candidates currently posted" verdict with the fetched HTML excerpt.
3. `adapter_kind` updated from `tier_2_pending` to the actual kind via `UPDATE pathfinder.data_sources SET adapter_kind=... WHERE id=...`.
4. Adapter committed in its own commit (`feat(adapter): <source_slug> live + smoke`).

## DB writes summary

| Table | Operation | Frequency |
|---|---|---|
| `pathfinder.agent_runs` | `INSERT ... RETURNING id` at run start; `UPDATE` at run end | 1 per run |
| `pathfinder.agent_log` | `INSERT` per source_hit, project_inserted, source_empty, source_failed, run_summary, manual_only_toggle, digest_sent, cron_skipped_manual_only | many per run |
| `pathfinder.projects` | `INSERT ... ON CONFLICT (source, source_id) DO NOTHING RETURNING id` per opportunity | up to 600 per run (50 per source × 10) |
| `pathfinder.projects` | `UPDATE SET project_stage=..., phase_confidence=... WHERE agent_run_id=$1` (tag-phase) | 1 batch per run |
| `pathfinder.projects` | `UPDATE SET score=..., rationale=... WHERE id=$1` (ranker) | per project per run (when Anthropic enabled) |
| `pathfinder.projects` | `UPDATE SET external_refs = external_refs \|\| jsonb_build_object(...) WHERE id=$1` (Notion writeback) | per new project per run |
| `pathfinder.data_sources` | `UPDATE SET last_polled_at=now(), last_event_at=now(), adapter_kind=... WHERE id=$1` | 1 per source per run |
| `pathfinder.organizations` | `UPDATE SET config = config \|\| jsonb_build_object('manual_only', $1) WHERE id=Zedcor` | per toggle flip |

All writes use the `supabaseAdmin()` server client (same pattern as `lib/inngest/functions/ingest-org-requested.ts`). RLS bypassed; org_id passed explicitly.

## Notion write contract

`writeProjectToNotion(project)` reads `NOTION_API_TOKEN`, queries the DB by `Project ID` filter, and creates or returns the existing page. Mapping:

| Notion property | Source |
|---|---|
| `Title` (title) | `projects.title` |
| `Phase` (select, one of pre-bid/open/closing-soon/awarded/unknown) | `projects.project_stage` |
| `Score` (number) | `projects.score` (null when Anthropic disabled) |
| `Rep Status` (select) | hardcoded `'new'` on first insert; never overwritten on re-runs |
| `Response Deadline` (date) | `projects.response_deadline` (YYYY-MM-DD or null) |
| `Posted Date` (date) | `projects.posted_date` (YYYY-MM-DD or null) |
| `Agency` (text) | `projects.raw_payload->>'agency'` |
| `City` (text) | `projects.raw_payload->>'city'` |
| `County` (text) | `projects.raw_payload->>'county'` |
| `State` (select, one of TX/LA/OK/AR) | `projects.raw_payload->>'state'`; outside-geofence → null + Rationale note `"geofence_outside_primary"` prepended |
| `Estimated Value` (number, dollar-formatted) | `projects.raw_payload->>'estimated_value'` cast to number |
| `Source` (text, internal) | source_slug (e.g. `houston-obo`) |
| `Source URL` (url) | `projects.source_url` |
| `Project ID` (text, internal dedup key) | `<source_slug>:<source_id>` |
| `Rationale` (text) | `projects.rationale` (with `"(scoring disabled)"` when Anthropic disabled) |
| `Rep Notes` (text) | never set by Z1A (rep-owned) |

Lead ID (`ZED-N`) is auto-incremented by Notion (`auto_increment_id` property). After insert, the writer reads back the lead ID + page URL and writes them to `pathfinder.projects.external_refs`:

```jsonb
{ "notion_lead_id": "ZED-1234", "notion_page_url": "https://www.notion.so/...", "notion_written_at": "ISO" }
```

## Cron disable approach

Layer 1 is already shipped (commit `92c9b5e`): `Pathfinder/vercel.json` has `"crons": []`. Z1A does not touch this file.

Layer 2 (Z1A scope): per-handler `manual_only` guard. Apply to every Pathfinder cron handler that touches Zedcor data:

```ts
// shared helper at lib/orchestrator/manual-only-guard.ts
export async function isManualOnly(orgId: string): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data } = await admin.from('organizations').select('config').eq('id', orgId).single();
  return Boolean((data as any)?.config?.manual_only);
}

// in each Zedcor-touching cron handler:
if (await isManualOnly('6cd87740-7c72-4337-ac79-316a54242eef')) {
  await supabaseAdmin().from('agent_log').insert({
    agent_name: 'cron-guard', event_type: 'cron_skipped_manual_only',
    event_data: { handler: '<route-path>' }, organization_id: '6cd87740-7c72-4337-ac79-316a54242eef',
    runner: 'cron', ts: new Date().toISOString(),
  });
  return new Response(null, { status: 204 });
}
```

Execution-phase task: enumerate Pathfinder cron handlers, install the guard in each. Multi-tenant guards (handlers that loop over orgs) skip Zedcor and continue with the others.

## Execution sequencing (post-GATE-1, halt-free until GATE 2)

**Wave 0** (single-threaded, lays the foundation):
1. Add `handlebars`, `cheerio`, `@notionhq/client` to `package.json`. `pnpm install`.
2. Extend `lib/adapters/sources/types.ts` with `runId?: number, hubId?: string`.
3. Write `lib/orchestrator/tag-phase.ts` + tests. `pnpm test` green.
4. Write `lib/orchestrator/manual-only-guard.ts`.
5. Write `lib/notion/zedcor-writer.ts` + `lib/notion/types.ts`.
6. Copy `Pathfinder Digest.template.html` → `lib/email/zedcor-digest-template.html` (byte-for-byte). Resize Atrium logo to 32×32 white → `public/brand/atrium-mark-32-white.png`.
7. Write `lib/email/handlebars-setup.ts` + `lib/email/build-digest-data.ts`.

**Wave 1** (parallel, 10 subagents): 10 adapters as separate subagents per the SPEC's "Parallel execution" section. Each subagent commits its own adapter file + `SOURCE_ADAPTERS` registration + adapter_kind UPDATE + smoke evidence.

**Wave 2** (single-threaded, integrates):
8. Write `lib/orchestrator/run-source.ts` + `lib/orchestrator/orchestrator.ts`.
9. Write `lib/orchestrator/relaxed-verifier.ts`.
10. Write the 5 API route handlers.
11. Install per-handler cron guards across Pathfinder cron routes.

**Wave 3** (verification + halt at GATE 2):
12. `pnpm build` in `Pathfinder/` and at the unicron-systems Vercel root (both must compile clean).
13. `pnpm lint` and `pnpm test` green.
14. Deploy preview to pathfinder-ashy.
15. Run E2E smoke test (see below).
16. Post evidence in PR description. **HALT GATE 2.** Wait for "smoke ok, open PR".

## E2E smoke test plan (Phase 10)

Run from preview deployment after Wave 3 deploys clean:

1. **Run Zedcor (Anthropic ON)**: `curl -X POST /pathfinder/api/zedcor/run-orchestrator` (or via Z1B's button if Z1B has merged a UI stub). Capture the response JSON. Verify ≥1 row in Notion DB.
2. **Notion row inspection**: pull URLs for 3 newly-created Notion pages; confirm Title, Phase, Posted Date or Response Deadline, Agency, City, State, Source, Source URL, Project ID populated.
3. **Digest preview**: open `/pathfinder/api/zedcor/digest-preview` in a browser. Confirm rendered layout matches design (header band, gold underline, cream stats strip, ≥2 lead cards, CTA, footer with gold dot).
4. **Render-test in email clients**: capture screenshots in Gmail web + Apple Mail iOS at minimum (Outlook 2019 + Outlook mobile if time).
5. **Send Digest**: POST `/api/zedcor/send-digest` with default recipient `team@unicron.systems`. Capture Resend message ID. Confirm receipt in inbox.
6. **Toggle smoke**: POST `/api/zedcor/scheduled-toggle {enabled: false}` (manual_only=true) → query `agent_log` for the audit row → POST `{enabled: true}` (manual_only=false) → verify second audit row. Confirm `organizations.config.manual_only` reflects the final state.
7. **Anthropic-disabled run**: set `ZEDCOR_DISABLE_ANTHROPIC=true` in preview env → run #2 of `/api/zedcor/run-orchestrator` → verify new rows in Notion with `Score=null` and `Rationale="(scoring disabled)"`.
8. **Multi-Vercel verification**: confirm pathfinder-ashy deploy green AND unicron-systems deploy green (per HARD CONSTRAINT #4). Capture both deploy URLs.

## GATE 2 evidence (PR description)

Per `Specs/SPEC-zedcor-tier1-manual.md` "Verbatim-evidence requirements":

- For each of the 10 adapters: URL fetched, exact opportunity-count parsed, ≥1 example parsed row as JSON
- Orchestrator summary JSON from the Anthropic-ON smoke run
- URLs of ≥3 sample Notion lead pages
- Two `agent_log` rows showing the toggle on→off→on flip
- Anthropic-disabled run summary showing `score=null` rows landed in Notion
- Screenshot of rendered digest in Gmail web
- Screenshot of rendered digest in Apple Mail iOS
- Resend message ID from the test send
- Diff (or "no diff") between `Pathfinder/lib/email/zedcor-digest-template.html` and the canonical source. If `TEMPLATE-PATCHES.md` was created, the patch diff.

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Orchestrator route exceeds Vercel function timeout (60s default) | Medium — 10 fetches × 30s timeout × Anthropic ranker | Run adapters sequentially with `Promise.race(adapter, timeout=20s)` to bound each. If still tight, switch the route to fire-and-poll: route immediately returns `{run_id}`, work continues via Inngest step. Decision made when first end-to-end smoke is timed. |
| Notion API rate limit (3 req/s burst, 1/s sustained per integration) | Medium — typical run inserts ~50-100 rows | Sequential Notion writes with `await new Promise(r => setTimeout(r, 350))` between calls. If too slow, batch with `Promise.all` chunked at 3-at-a-time. |
| Notion integration not shared with DB | Low — Kyle to confirm before smoke | Pre-flight curl in smoke test: GET the DB schema. 401/403 → halt and ask Kyle to share. |
| Adapter parser drift (HTML 200 but 0 rows) | Medium — government sites change | Log `source_failed reason=parser_drift` with HTML excerpt. Orchestrator continues with other 9. Sprint Z3 (or operator follow-up) updates parsers. |
| 4 newly-inserted sources have unfamiliar HTML structures | High — Bonfire, IonWave, Workday public are uncommon | Subagents own per-source debugging. If a source can't be parsed in one subagent cycle, return a verbatim "0 candidates parseable; structure unfamiliar, follow-up needed" with HTML excerpt rather than blocking the sprint. |
| Z1B merges before Z1A | Low — backend lands first by design | Decision documented above. If Kyle reverses order, Z1A rebases on Z1B's Specs/ branch. |
| `unicron-systems` Vercel project build regression from shared lib changes | Low — Z1A only adds new files | Multi-Vercel verification at Wave 3 step 12. If unicron-systems breaks, investigate the shared import surface (likely `lib/types/*` or `lib/supabase.ts`); revert the offending import and re-route through a Pathfinder-only path. |
| Anthropic ranker silently fails partway through ranking | Medium | Wrap each ranker call in try/catch; on failure, project gets `score=null, rationale="(ranker error: <message>)"` and the run continues. Orchestrator returns `status='partial_failure'`. |
| Digest template's `eq` helper needs Handlebars-compiled subexpression `{{#if (eq ...)}}` syntax | Low — Spec explicitly registers this | `handlebars-setup.ts` registers helper before compile; tests will exercise template-render against `sample-data.json` to catch syntax issues pre-smoke. |

## Multi-Vercel verification protocol

After every push that touches `Pathfinder/lib/` or `Pathfinder/app/`:
1. `cd Pathfinder && pnpm build` — must compile clean
2. `cd <repo-root> && pnpm build` (whichever script the unicron-systems project uses) — must compile clean
3. Push triggers both Vercel projects; check both deployments are green before claiming success

HARD CONSTRAINT #4 ("Pathfinder and unicron-platform are separate Vercel projects in the same repo. Verify each independently. One healthy does not imply the other.") is non-negotiable.

## Hard-halt conditions (carried from SPEC)

- Notion API token cannot write to `856b43a02b4d43649344c5e1a05d206d` → STOP, ask Kyle to share DB
- A second additive migration would be needed beyond `zedcor_z1a_projects_columns` and `zedcor_z1a_organizations_config` → STOP and batch-question Kyle
- Cross-sprint file ownership conflict with Z1B (Z1A touches a file Z1B is editing in their branch) → STOP and resolve via chat

## What this plan deliberately does not include

- **No verifier rewrite.** Soft-flag policy only; per the SPEC non-goals.
- **No HubSpot or Slack integration.** Notion + email only.
- **No Z1B UI work.** Owned by `feat/zedcor-tier1-ui`.
- **No real phase mapper.** Date-based tagger only; pre-bid inference deferred to Sprint Z2.
- **No Anthropic-side prompt tuning.** Reuses existing ranker as-is; `ZEDCOR_DISABLE_ANTHROPIC=true` is the escape hatch if the ranker misbehaves.
- **No vercel.json edits.** Crons already empty.
- **No edits to `pathfinder.data_sources` adapter_kind for the 6 originals** until each adapter ships green in its own subagent commit.

## Open questions to batch (none today)

All questions raised during pre-flight were resolved in Kyle's 2026-05-27 chat. The plan is internally consistent. If execution surfaces a new question, it will be batched and posted as a single numbered list per the new operating protocol — never one-at-a-time.

---

**Awaiting**: Kyle to write `approved` in PR or chat to unblock Wave 0.
**Halts after that**: only GATE 2 (E2E smoke evidence) and the hard-halt conditions above.
