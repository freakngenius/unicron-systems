# SPEC — Zedcor Houston Tier 1 Pilot · Manual-Trigger Build (Sprint Z1)

Last updated: 2026-05-27
Author: Kyle Kesterson (relayed through Cowork)
Status: Approved for Claude Code build

## Goal

Stand up a manual-trigger system so Kyle can click one button and produce live Houston lead rows in a Notion database, with no cron running in the background. This is the substrate for the Zedcor pilot. The chain must work end-to-end with Anthropic disabled (score=null, phase=unknown, raw projects still written to Notion).

## Non-goals

- Verifier rewrite. The existing verifier rejects ~97.7% of rows on geofence radius. This sprint uses a relaxed-verifier policy (do not hard-reject inside geofence_states list, allow soft-flag only). Verifier-fix is its own sprint.
- Dashboard UI in the customer-facing Pathfinder app. The Notion database IS the delivery surface for Tier 1.
- HubSpot or Slack integration. Pure email + Notion only.
- Phase 2/3 contact resolution.
- Cross-pollination engine work.

## Architecture

Z1 split into two parallel sprints. **This spec is the union; sprint scope is divided as follows.**

### Z1A (this sprint, branch `feat/zedcor-tier1-manual`) — adapters + backend

API routes:
- `app/api/zedcor/run-orchestrator/route.ts` — orchestrator endpoint (POST).
- `app/api/zedcor/run-status/route.ts` — GET polling endpoint Z1B's UI calls during a run.
- `app/api/zedcor/send-digest/route.ts` — digest send (POST).
- `app/api/zedcor/digest-preview/route.ts` — digest render preview (GET).
- `app/api/zedcor/scheduled-toggle/route.ts` — POST that flips `pathfinder.organizations.config->>'manual_only'`; Z1B's toggle UI calls it.

Lib modules:
- `lib/notion/zedcor-writer.ts` — Notion write contract.
- `lib/email/handlebars-setup.ts`, `lib/email/build-digest-data.ts`, `lib/email/zedcor-digest-template.html` — digest render layer.
- `lib/orchestrator/orchestrator.ts` — the orchestrator implementation (separated from the route handler for testability).
- `lib/orchestrator/run-source.ts` — per-source orchestrator wrapper (geofence + dedup + insert + agent_log).
- `lib/orchestrator/tag-phase.ts` + `tag-phase.test.ts` — deterministic phase tagging (Phase 5 descope; see "Phase mapper descope" below).

Adapters: 10 new modules under `lib/adapters/sources/<source_slug>.ts`, registered through the existing `SOURCE_ADAPTERS` map in `lib/adapters/sources/index.ts`.

Migrations (already applied 2026-05-27):
- `zedcor_z1a_projects_columns` — additive: `response_deadline date`, `source_url text`, `hub_id text`, `agent_run_id bigint FK`, `external_refs jsonb`.
- `zedcor_z1a_organizations_config` — additive: `config jsonb` on `pathfinder.organizations`.

Cron guards: add `ZEDCOR_MANUAL_ONLY` config check at the top of every Pathfinder cron handler that processes the Zedcor org, in `Pathfinder/app/api/cron/...`.

### Z1B (parallel sprint, branch `feat/zedcor-tier1-ui`) — UI page

- `app/(authenticated)/internal/zedcor/run/page.tsx` — the manual trigger page (Run Zedcor button, Scheduled toggle, Send Digest button + recipients input).
- Any client-side components needed for the page.

Z1B consumes Z1A's API routes; Z1A delivers stable contracts so Z1B can stub against them before integration.

## Canonical constants

- Supabase project: `anfihcusvekpovcchpoh`
- Schema: `pathfinder`
- Zedcor org_id: `6cd87740-7c72-4337-ac79-316a54242eef`
- Houston hub: `hub_slug='houston'`, center (29.7604, -95.3698), radius 300mi, geofence_states `['TX','LA','OK','AR']`, status `live`
- Notion DB: `856b43a02b4d43649344c5e1a05d206d`
- Notion data source: `39b001e3-fa1f-4fbf-aeea-219d4ef2b19a`
- Notion column names (case-sensitive): `Title, Phase, Score, Rep Status, Response Deadline, Posted Date, Agency, City, County, State, Estimated Value, Source, Source URL, Project ID, Rationale, Rep Notes`
- Notion Phase enum: `pre-bid, open, closing-soon, awarded, unknown`
- Notion Rep Status default on insert: `new`
- Notion Lead ID auto-prefix: `ZED`

## Environment variables required

Set in BOTH Vercel projects (pathfinder-ashy AND unicron-systems):

- `NOTION_API_TOKEN` — Notion internal integration token, must have access to the Zedcor page tree
- `ZEDCOR_NOTION_DB_ID` — `856b43a02b4d43649344c5e1a05d206d`
- `ZEDCOR_DISABLE_ANTHROPIC` — boolean, default false; when true the ranker is skipped (score=null)
- `RESEND_API_KEY` — should already exist
- `RESEND_FROM_ADDRESS` — e.g., `pathfinder@unicron.systems` (verified Resend sender)
- `DIGEST_LOGO_URL` — public URL of the 32×32 white Unicron mark
- `DIGEST_MAX_CARDS` — optional, default 10
- `SAM_GOV_API_KEY` — provisioned 2026-05-27, confirm presence

## Manual trigger page contract

`/internal/zedcor/run` — protected by the same Supabase magic-link middleware used on other `/internal` routes.

UI sections:

1. **Run Zedcor — Houston** (large primary button)
   - Below: status line showing last run timestamp, last run summary, recent-runs log (table of last 20 from `pathfinder.agent_runs` where `runner='manual'` and `organization_id=Zedcor`).
   - While a run is in flight: button disabled, live progress shown via polling against `/api/zedcor/run-status?run_id=N` every 2 seconds. Progress format: `"Polling 4 of 10: Houston OBO..."`.

2. **Scheduled operation** (toggle, off by default)
   - Reads from and writes to `pathfinder.organizations.config->>'manual_only'` (true = cron muted; false = cron live).
   - Each flip writes audit row: `pathfinder.agent_log` `event_type='manual_only_toggle'`, `event_data={by: <user_email>, from: <prev>, to: <next>}`.

3. **Send Digest** (button + comma-separated email text input, default `team@unicron.systems`)
   - POSTs to `/api/zedcor/send-digest`.
   - Shows result inline: Resend message ID + recipient count, or error.

## Orchestrator endpoint contract

`POST /api/zedcor/run-orchestrator`

Behavior:

1. Open row in `pathfinder.agent_runs`: `agent_name='zedcor-orchestrator-manual'`, `runner='manual'`, `organization_id=Zedcor`, `hub_id=Houston`, `started_at=now()`, `status='running'`. Capture `run_id`.
2. Invoke each of the 10 source adapters in order (see SPEC-zedcor-source-adapters.md). Each adapter writes its own `source_hit` / `source_empty` / `source_failed` events to `pathfinder.agent_log` with `run_id`.
3. Run deterministic phase tagging (`lib/orchestrator/tag-phase.ts`) over all projects with `agent_run_id=run_id`. Updates `project_stage` + `phase_confidence`. Date-based only (no LLM). 4 of 5 phases covered (awarded / closing-soon / open / unknown); `pre-bid` inference is descoped to follow-up Sprint Z2 (kanban card already queued). See "Phase mapper descope" note at end of spec.
4. Run ranker (Anthropic). If `ANTHROPIC_API_KEY` absent or `ZEDCOR_DISABLE_ANTHROPIC=true`, skip — projects get `score=null`, `rationale="(scoring disabled)"`.
5. Run relaxed verifier (do not hard-reject on radius if state in geofence_states; soft-flag only).
6. For each new project, call `notionWriter.writeProjectToNotion(project)`. Capture `leadId`. Update `pathfinder.projects.external_refs` JSONB with `notion_lead_id` and `notion_page_url`.
7. Close `agent_runs` row: `status='success'` or `'partial_failure'`. Write summary event to `agent_log`.
8. Return JSON:

```json
{
  "run_id": 1234,
  "sources_polled": 10,
  "sources_hit": 8,
  "sources_empty": 1,
  "sources_failed": 1,
  "projects_inserted": 47,
  "projects_deduped": 12,
  "notion_writes": 47,
  "notion_dedupes": 0,
  "started_at": "ISO",
  "completed_at": "ISO"
}
```

## Notion writer contract

`lib/notion/zedcor-writer.ts`

Exports: `writeProjectToNotion(project: PathfinderProject): Promise<{leadId: string, notionPageUrl: string, alreadyExists: boolean}>`

Behavior:

- Read `NOTION_API_TOKEN` from env.
- Dedupe: query the DB for any page where `Project ID` property equals the incoming project's source-prefixed signature (e.g., `"houston-obo:RFP-2026-042"`). If found, return `alreadyExists=true` with the existing `leadId`.
- Map fields per the column list. Use ISO date strings (`YYYY-MM-DD`) for `Response Deadline` and `Posted Date`.
- Map Phase to one of the 5 enum values; default `unknown`.
- Map State to TX/LA/OK/AR; if outside, write the project anyway with `state=null` and tag a `geofence_outside_primary` note in Rationale.
- Set `Rep Status='new'` on first insert. Never overwrite on re-runs.
- Set `Score=null` if Anthropic disabled or no score computed.
- Return Notion lead ID (`ZED-N`) and the page URL.

## Cron disable behavior

Two-layer disable:

1. **`vercel.json` cron entries** — **already disabled** at commit `92c9b5e` ("Disable Pathfinder crons"). `Pathfinder/vercel.json` currently has `"crons": []`. Z1A does NOT touch this file.

2. **Per-handler guard (Z1A scope)** — at the top of every Pathfinder cron handler that processes the Zedcor org, read `pathfinder.organizations.config->>'manual_only'` for the org. If `true`, log `cron_skipped_manual_only` and return 204. Defense-in-depth in case Layer 1 is reverted.

The Scheduled toggle in the Z1B UI flips Layer 2 (config flag) via `POST /api/zedcor/scheduled-toggle`. To fully resume cron, both layers must be in the "live" state: vercel.json must list Zedcor crons AND the org-config flag must be `false`. Document this dual-layer in the PR description so future operators understand it.

## Smoke test plan

End-to-end smoke test in preview deployment:

1. Click Run Zedcor. Verify chain runs end-to-end. Recent-runs log shows the run.
2. Verify ≥1 new row in Notion DB at `856b43a02b4d43649344c5e1a05d206d` (Rep View tab).
3. Verify row has Title, Phase, Posted Date or Response Deadline, Agency, City, State, Source, Source URL, Project ID populated.
4. Open `/api/zedcor/digest-preview` in browser. Verify rendered HTML matches design.
5. Click Send Digest with default recipient. Verify email lands at `team@unicron.systems`. Capture Resend message ID.
6. Flip Scheduled toggle on then off. Verify audit rows in `pathfinder.agent_log`.
7. Set `ZEDCOR_DISABLE_ANTHROPIC=true` in preview env. Click Run Zedcor. Verify rows still write to Notion with `Score=null` and `Rationale="(scoring disabled)"`.

## Auto-merge criteria

- Plan (`docs/PLAN-zedcor-tier1-manual.md`) approved by Kyle in PR comment
- E2E smoke evidence posted and accepted
- All 10 adapters present, each with ≥1 successful smoke fetch OR verbatim "source not currently posting" verdict with HTML excerpt as evidence
- TypeScript compiles cleanly in BOTH Vercel projects (verify each independently)
- No new lint errors
- Verbatim-evidence checklist satisfied (see below)

## Auto-revert triggers

- Any production cron job fires Zedcor work after toggle is off
- Any Notion write produces duplicate rows in the DB
- Any adapter hard-5xxs the orchestrator (orchestrator must continue with other 9, log source_failed, return partial_failure)

## Hard-halt conditions

- Any of the 10 source slugs missing from `pathfinder.data_sources` — STOP, list missing in PR
- Notion API token cannot write to DB — STOP, instruct Kyle to share DB with integration
- Phase mapper or ranker unrecoverably broken — STOP, post verbatim trace, do not rewrite from scratch

## Verbatim-evidence requirements in PR description

- For each adapter: URL fetched, exact opportunity-count parsed, ≥1 example parsed row in JSON
- Orchestrator summary JSON from smoke test
- URLs of ≥3 sample Notion lead pages
- Two `pathfinder.agent_log` rows showing toggle on→off→on flip
- 3rd run summary showing `score=null` rows landed (Anthropic-disabled mode)
- Screenshots of rendered digest in Gmail web + Apple Mail iOS
- Resend message ID from test send
- Diff (or "no diff") between `lib/email/zedcor-digest-template.html` and the canonical source in `Pathfinder Digest - Design/`

## Multi-Vercel verification

The orchestrator and manual trigger page live in Pathfinder. Verify `pathfinder-ashy` deploys clean AND `unicron-systems` builds without regression. Both must be green before merge.

## Kanban hygiene

Z1 split into two cards (sprint scope split 2026-05-27 — see "Architecture" section):

- **Z1A** (this sprint): `Zedcor Houston Tier 1 Pilot — Adapters + Backend (Sprint Z1A)` at https://www.notion.so/36e785c67e72810aafcdec22706fce05 (In Process as of 2026-05-27).
- **Z1B** (parallel): `Sprint Z1B` UI card at https://www.notion.so/36e785c67e72812090f7c3dbaf8e7f46 (In Process).
- **Z2** (follow-up): "Zedcor — real phase mapper (Sprint Z2)" — Not Yet Started.

END (on merge): Move the Z1A card to Deployed with comment `Implemented at <commit-sha> · merged at <ISO timestamp>`. Do NOT move to Verified (human-only column).

## Phase mapper descope (Sprint Z2)

Phase 5 of the original sprint prompt assumed a reusable `phase-mapper.ts`. No such file exists in the codebase. Per Kyle's 2026-05-27 ratification, Z1A ships a **deterministic, date-based tagger** at `lib/orchestrator/tag-phase.ts`:

```ts
export type Phase = 'pre-bid' | 'open' | 'closing-soon' | 'awarded' | 'unknown';
export function tagPhase(project: {
  response_deadline?: string | Date | null;
  posted_date?: string | Date | null;
}): Phase {
  const now = Date.now();
  const deadlineMs = project.response_deadline ? new Date(project.response_deadline).getTime() : null;
  const postedMs = project.posted_date ? new Date(project.posted_date).getTime() : null;
  if (deadlineMs !== null && deadlineMs < now) return 'awarded';                       // deadline passed
  if (deadlineMs !== null && (deadlineMs - now) <= 7 * 86400000) return 'closing-soon';
  if (deadlineMs !== null && (deadlineMs - now) > 7 * 86400000) return 'open';
  if (postedMs !== null && deadlineMs === null) return 'open';
  return 'unknown';
}
```

`pre-bid` is not detectable from dates alone — Sprint Z2 ships a real phase mapper covering pre-bid inference, RFI/RFP classification, etc. Z1A writes `phase_confidence=1.0` when the deterministic rule fires (awarded/closing-soon/open), `0.0` for `unknown`.
