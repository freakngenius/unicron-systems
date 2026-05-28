# PLAN — Zedcor Houston Tier 1 Pilot · Manual Trigger UI (Sprint Z1B)

**Branch:** `feat/zedcor-tier1-ui`
**Worktree:** `/Users/kylekesterson/Desktop/Claude/cloned-repo-worktrees/zedcor-tier1-ui`
**Pairs with:** `feat/zedcor-tier1-adapters` (Z1A, separate session)
**Specs:** `Specs/SPEC-zedcor-tier1-manual.md`, `Specs/SPEC-zedcor-digest-template.md`

## Goal

Ship `/internal/zedcor/run` — a single operator-only page with a Run button, a Scheduled toggle, a Send Digest panel, a live-progress strip, and a recent-runs log. Six API routes back it. The page is functional against stub backends so it can ship independent of Z1A; the same code becomes the live operator console once Z1A's adapters + Notion writer + email build lands.

## Coordination posture with Z1A

Z1A is landing the schema migration as their first commit (filename: `Pathfinder/supabase/migrations/<timestamp>_zedcor_z1a_schema.sql`) — adds `runner` / `organization_id` / `hub_id` columns to `agent_runs`, widens the `agent_name` CHECK and `status` CHECK, adds `run_id` FK column to `agent_log`, and adds a `config` JSONB column to `organizations`. Z1B writes ALL code against that target schema. Until Z1A's migration is in `origin/main`, writes will fail and reads return empty — that's expected and the UI degrades gracefully (empty Recent Runs table with a quiet "No runs yet" line).

Before the GATE 2 smoke test I will `git fetch origin && git log origin/main` to confirm Z1A's migration has merged; if not, I block on it rather than introducing a JSONB shim.

## File-by-file change list

### New files (mine, exclusive)

```
Pathfinder/
├── app/
│   ├── (authenticated)/
│   │   ├── layout.tsx                                    [route group operator gate]
│   │   └── internal/
│   │       └── zedcor/
│   │           └── run/
│   │               ├── page.tsx                          [server entry, renders client wrapper]
│   │               └── components/
│   │                   ├── RunPanel.tsx                  [client root, owns polling + state]
│   │                   ├── RunButton.tsx
│   │                   ├── ScheduledToggle.tsx
│   │                   ├── SendDigestPanel.tsx
│   │                   ├── LiveProgress.tsx
│   │                   └── RecentRunsTable.tsx
│   └── api/
│       └── zedcor/
│           ├── recent-runs/route.ts                      [GET, real]
│           ├── run-status/route.ts                       [GET, real]
│           ├── toggle-scheduled/route.ts                 [POST, real]
│           ├── digest-preview/route.ts                   [GET, placeholder until Z1A]
│           ├── run-orchestrator/route.ts                 [POST, STUB until Z1A]
│           └── send-digest/route.ts                      [POST, STUB until Z1A]
└── docs/
    └── PLAN-zedcor-tier1-ui.md                           [this file]
```

### Files touched, not created (mine)

- None. I do not modify `lib/types.ts` (Z1A's territory — they widen `AgentName`/`AgentRunStatus` and add `Organization.config` when their migration lands). All schema-divergent calls use the established `as unknown as { insert: ... }` cast pattern, precedent at `Pathfinder/app/api/refresh/route.ts:107-119` and `Pathfinder/app/api/org-config/route.ts:35-49`.

### Files I do NOT touch

Per the ownership split in the prompt, Z1A owns and I do not touch:
- `Pathfinder/lib/adapters/zedcor/*`
- `Pathfinder/lib/notion/*`
- `Pathfinder/lib/email/*`
- `Pathfinder/lib/agents/phase-mapper.ts`, `Pathfinder/lib/agents/ranker.ts`
- `Pathfinder/vercel.json`
- `Pathfinder/app/api/cron/*`
- `Pathfinder/supabase/migrations/*` (including the schema migration Z1A lands)
- `Pathfinder/lib/types.ts`

If I discover I need a file Z1A owns, I halt and ask.

## Auth pattern (resolved with Kyle)

`/internal` stays in `PUBLIC_PATH_PREFIXES` (middleware.ts:99) — I do NOT remove it; that bypass is load-bearing for other public-host flows. The operator gate for `/internal/zedcor/run` lives in a **new route group layout** at `app/(authenticated)/layout.tsx`. Route groups don't affect the URL but their layouts apply to every page beneath them.

Logic mirrored verbatim from `app/[slug]/layout.tsx:58-90`:

1. Read `pf-access-token` cookie. Missing → `redirect('/login?next=/internal/zedcor/run')`.
2. `supabase.auth.getUser(accessToken)`. Error → `redirect('/login')`.
3. Look up `operator_allowlist` by email. Missing → `redirect('/login?error=unauthorized')`.
4. Render children.

No new auth code is invented. The `pf-access-token` set by `app/auth/callback/route.ts` already drives this pattern for the slug-based dashboards; we're just extending it to a static `/internal` subtree.

URL resolution: with `basePath: '/pathfinder'` (next.config.js), the page is reachable at `https://pathfinder-ashy.vercel.app/pathfinder/internal/zedcor/run` and (via the parent unicron-systems edge rewrite) at `https://internal.unicron.systems/zedcor/run`. The route-group layout runs in both cases — it does not depend on the host.

## Stub contract for the orchestrator endpoint

**`POST /api/zedcor/run-orchestrator`** — STUB, deleted-and-replaced by Z1A when their orchestrator lands.

Header at top of file:
```ts
// STUB — replaced by Sprint Z1A. Do not enhance.
```

Behavior:
1. Accepts empty body (or ignores any body).
2. Inserts a `pathfinder.agent_runs` row using the **target schema** (Z1A migration required for this to succeed):
   ```ts
   {
     agent_name: 'zedcor-orchestrator-manual',
     runner: 'manual-stub',
     organization_id: '6cd87740-7c72-4337-ac79-316a54242eef',  // Zedcor
     hub_id: <Houston hub id, looked up by slug='houston'>,
     started_at: nowIso,
     completed_at: nowPlus2sIso,
     status: 'success',
     records_processed: <random 30-60>,
     records_new: <records_processed minus 5-15>,
   }
   ```
3. Inserts one summary event to `pathfinder.agent_log`:
   ```ts
   {
     agent_name: 'zedcor-orchestrator-manual',
     event_type: 'orchestrator_run_summary_stub',
     event_data: {
       run_id: <agent_runs.id from step 2>,
       sources_polled: 10,
       sources_hit: 8,
       sources_empty: 1,
       sources_failed: 1,
       projects_inserted: records_processed,
       projects_deduped: <random 5-15>,
       notion_writes: records_processed,
       notion_dedupes: 0,
       runner: 'manual-stub',
     },
     run_id: <agent_runs.id>,           // Z1A migration adds this column
     organization_id: '6cd87740-...',
   }
   ```
4. Returns the JSON envelope from the spec:
   ```json
   {
     "run_id": 142,
     "sources_polled": 10,
     "sources_hit": 8,
     "sources_empty": 1,
     "sources_failed": 1,
     "projects_inserted": 47,
     "projects_deduped": 12,
     "notion_writes": 47,
     "notion_dedupes": 0,
     "started_at": "2026-05-27T20:34:11.040Z",
     "completed_at": "2026-05-27T20:34:13.040Z"
   }
   ```
5. The 2-second delay is real (`await new Promise(r => setTimeout(r, 2000))`) so the UI polling loop has at least one in-flight tick to render.

Failure mode during the parallel-build window (Z1A migration not yet merged): the insert call returns a Supabase error. The route returns `{ error: <message>, code: 'schema_pending_z1a' }` with HTTP 503. The UI catches that and shows "Backend schema not yet migrated — waiting on Z1A". This is the explicit graceful-empty-state Kyle approved.

## Stub contract for send-digest

**`POST /api/zedcor/send-digest`** — STUB, deleted-and-replaced by Z1A.

Header:
```ts
// STUB — replaced by Sprint Z1A. Do not enhance.
```

Behavior:
1. Accepts `{ recipients?: string[] }`. Defaults to `['team@unicron.systems']`.
2. Inserts a `pathfinder.agent_log` row with `event_type: 'digest_sent_stub'` and `event_data: { recipients, resend_message_id: 'stub-mock-id', lead_count: 12, runner: 'manual-stub' }`.
3. Returns `{ resend_message_id: 'stub-mock-id', lead_count: 12, recipients }`.

## Real endpoints (mine, no replacement when Z1A lands)

### `GET /api/zedcor/recent-runs`

Reads `pathfinder.agent_runs` filtered to:
- `runner IN ('manual', 'manual-stub')`
- `organization_id = '6cd87740-7c72-4337-ac79-316a54242eef'`
- Latest 20, ordered by `started_at DESC`.

For each row, also fetch the matching `agent_log` summary row (`event_type IN ('orchestrator_run_summary', 'orchestrator_run_summary_stub')` AND `run_id = agent_runs.id`) to get the `event_data` summary. One round-trip per page load is fine (latest-20).

Response:
```ts
{
  current_state: {
    manual_only: boolean,                  // from organizations.config->>'manual_only'
    scheduled_enabled: boolean,            // !manual_only
  },
  runs: Array<{
    run_id: number,
    started_at: string,
    completed_at: string | null,
    status: 'running' | 'success' | 'failed' | 'partial_failure',
    runner: 'manual' | 'manual-stub',
    summary: {
      sources_polled?: number,
      sources_hit?: number,
      sources_empty?: number,
      sources_failed?: number,
      projects_inserted?: number,
      projects_deduped?: number,
      notion_writes?: number,
      notion_dedupes?: number,
    } | null,
    duration_ms: number | null,
  }>;
}
```

Decision: bundle org-config + recent-runs into one endpoint to halve the round-trips on page mount. No separate `/api/zedcor/state` endpoint.

Empty-state behavior (parallel-build window or genuinely no runs): `runs: []`, `current_state` still resolvable from `organizations.config` (or `{manual_only: true, scheduled_enabled: false}` defaults if `config` column doesn't exist yet → which means Z1A migration not landed; we render the "No runs yet" line).

### `GET /api/zedcor/run-status?run_id=<n>`

Polled by the UI every 2 seconds while a run is in flight.

1. Read the matching `agent_runs` row by id, filtered to Zedcor org_id for safety.
2. If `status === 'running'`, find the most recent `agent_log` row where `run_id = ?run_id` ordered by `ts DESC`. Use `event_type` and `event_data.step_label` to compose `current_step` (e.g., `"Polling 4 of 10: Houston OBO"`). If no log rows yet, `current_step = "Starting..."`.
3. If `status !== 'running'`, fetch the summary row (`event_type IN ('orchestrator_run_summary', 'orchestrator_run_summary_stub')`) and return `finished: true` with the orchestrator-shape summary echo.

Response:
```ts
{
  run_id: number,
  finished: boolean,
  status: 'running' | 'success' | 'failed' | 'partial_failure',
  current_step: string,                    // "Polling 4 of 10: Houston OBO..." or "Starting..."
  percent_complete: number,                // 0-100, derived from event count or coarse heuristic
  summary?: <orchestrator JSON envelope> | null,
}
```

If the run isn't found (e.g., stale poll, wrong org), return `404 { error: 'run_not_found' }`. The client clears polling state.

### `POST /api/zedcor/toggle-scheduled`

Body: `{ enabled: boolean }` — `enabled=true` means scheduled cron is ON (so `manual_only=false`), `enabled=false` means cron muted (`manual_only=true`).

1. Read current `manual_only` from `organizations.config->>'manual_only'` for org `6cd87740-...`. Treat missing as `true` (default to muted).
2. Look up the operator's email from the `pf-access-token` cookie via `supabase.auth.getUser` (route is server, has access to cookies).
3. Update `organizations.config` JSONB with the new `manual_only` value. Hard-filter the update by `id = '6cd87740-...'` to avoid the auto-revert trigger "writes to the WRONG org's config".
4. Insert audit row to `agent_log`:
   ```ts
   {
     agent_name: 'zedcor-orchestrator-manual',
     event_type: 'manual_only_toggle',
     event_data: { by: <email>, from: <prev>, to: <next>, enabled: <body.enabled> },
     organization_id: '6cd87740-...',
   }
   ```
5. Return `{ manual_only: <new>, scheduled_enabled: !<new> }`.

### `GET /api/zedcor/digest-preview`

Placeholder until Z1A lands the Handlebars template. Returns full HTML page (Content-Type: text/html) with the same Pathfinder operator style as the rest of the page — a single card mid-page that says:

> **Digest preview will render here once Sprint Z1A's email template is wired in.**
>
> Expected layout (per `SPEC-zedcor-digest-template.md`):
> - Navy header band with gold underline
> - Cream stats strip (new leads · closing soon · sources polled)
> - 2-10 lead cards with phase pill, score, deadline, agency, italic rationale, estimated value
> - CTA section with "leads remaining" eyebrow and navy pill button
> - Mono uppercase footer with gold dot

Marker comment at top: `// PLACEHOLDER — Z1A replaces with full Handlebars-rendered digest using lib/email/.`

This route is wrapped by the same operator gate (it lives under `app/(authenticated)/` indirectly through the route group; technically it's an API route at `app/api/zedcor/digest-preview/route.ts` outside the route group, so it does its own cookie check at the top — same `pf-access-token` → getUser → allowlist pattern, factored into a small helper `lib/auth/require-operator.ts`).

**Helper file** (new, mine): `Pathfinder/lib/auth/require-operator.ts` — exports `requireOperatorEmail(req): Promise<string | NextResponse>` that returns the operator email or a 401/403 response. Used by all six API routes for consistent gating, since the route-group layout only protects pages, not API routes. This is a small additive file inside my scope.

## UI component breakdown

`page.tsx` (server component):
- Renders `<RunPanel />` (client component below).
- Sets metadata title `'Pathfinder · Zedcor Houston · Run'`.
- No data fetching at the server level — initial state comes from a `useEffect` fetch in `<RunPanel />` so the loading shell renders fast.

`RunPanel.tsx` (client root, `'use client'`):
- Owns all top-level state: `currentRunId`, `pollingState`, `recentRuns`, `currentToggle`, `lastRunSummary`.
- Renders six children: header, `<RunButton />`, `<LiveProgress />`, `<ScheduledToggle />`, `<SendDigestPanel />`, `<RecentRunsTable />`.
- On mount: GETs `/api/zedcor/recent-runs`, hydrates `recentRuns` + `currentToggle` + `lastRunSummary` (derived from `runs[0]?.summary`).
- Owns the polling loop: when `currentRunId != null`, sets `setInterval(2000)` against `/api/zedcor/run-status?run_id=N`. Three consecutive failures → set polling-error flag (banner: "Status temporarily unavailable — run continues in background"); keep polling. On `finished: true` → re-fetch `/api/zedcor/recent-runs`, clear `currentRunId`, clear interval, re-enable button.

`RunButton.tsx`:
- Large primary button labeled "Run Zedcor — Houston".
- Disabled while `currentRunId != null`.
- On click: POST `/api/zedcor/run-orchestrator`. On success: set `currentRunId` from response. On 503/schema-pending: toast "Backend schema not yet migrated — waiting on Z1A".

`ScheduledToggle.tsx`:
- Pill toggle with label "Scheduled operation".
- Reflects `currentToggle.scheduled_enabled` (off by default).
- On click: optimistic flip, POST `/api/zedcor/toggle-scheduled` with `{ enabled: !prev }`. Revert on error.
- Below: muted info line "When ON, scheduled crons fire for Zedcor in addition to manual triggers. When OFF, only manual triggers run." + small "i" hover that explains the two-layer disable (vercel.json + per-handler guard).

`SendDigestPanel.tsx`:
- Comma-separated email text input pre-filled with `team@unicron.systems`.
- Helper text: "Comma-separated emails."
- Send button. On click: parses recipients (split, trim, filter empty), POSTs `/api/zedcor/send-digest`, inline result `"Sent to N recipients · message ID xxx"` or error.
- Link below: `Preview digest →` opens `/pathfinder/api/zedcor/digest-preview` in a new tab.

`LiveProgress.tsx`:
- Sits between Run button and Recent Runs.
- Two modes:
  - **Active** (when `currentRunId != null`): full strip with spinner, `current_step` text, percent bar.
  - **Idle**: thin one-line strip `"Idle · last run 14:32 · 47 leads"` (when `lastRunSummary` exists) or `"No runs yet — click Run Zedcor to fire one."` (when empty).

`RecentRunsTable.tsx`:
- Columns: Run #, Started, Status pill, Projects inserted, Sources hit/total, Runner type, Duration.
- 20 rows max, newest first.
- Click a row → inline expand showing full `summary` JSON (pretty-printed) + a link `"Filter Notion DB by run_id=N →"` pointing to `https://www.notion.so/856b43a02b4d43649344c5e1a05d206d?filter=...` (the filter query string format documented in the digest spec).
- Empty state: a single muted row `"No runs yet."`

Styling: plain Tailwind utility classes consistent with `components/zedcor/ZedcorLeadList.tsx`. Operator surface = neutral grays + accent on action buttons. NOT the customer-facing LOI/digest-email design system.

## Auto-revert defenses (in code, not just process)

- **Operator-gate proof**: the `(authenticated)/layout.tsx` does the cookie + getUser + allowlist check. If any check fails, `redirect('/login')`. No fall-through render path. The smoke test includes hitting the route in an incognito window — must redirect to `/login`, not render the page.
- **Org isolation**: all five real API routes hard-code `organization_id = '6cd87740-7c72-4337-ac79-316a54242eef'` in WHERE clauses and INSERT payloads. The toggle endpoint additionally filters its UPDATE by `id = '6cd87740-...'`. Recent-runs filters by `organization_id` too, so no cross-tenant leak.
- **Stub markers**: both stub files have the `// STUB — replaced by Sprint Z1A. Do not enhance.` header so a future Z1A engineer can `git grep` and find their delete-and-replace targets.

## Smoke test plan (preview deploy, GATE 2)

Preconditions:
- Z1A migration merged into `main` (verified via `git fetch origin && git log origin/main -- Pathfinder/supabase/migrations/`).
- Vercel preview deploy of `feat/zedcor-tier1-ui` is live.
- `pf-access-token` cookie set by signing in via `/login` with an allowlisted operator email.

Steps + evidence:
1. Hit `/pathfinder/internal/zedcor/run` in an authed browser. Screenshot the rendered page.
2. Hit the same URL in incognito. Confirm `302 → /login`. Capture redirect chain.
3. Click "Run Zedcor — Houston". Wait for completion (≤4s including poll cycles). Screenshot Live Progress mid-flight if it lands during one of the poll ticks. Screenshot Recent Runs table after — should show one new row with runner='manual-stub'.
4. Click Run Zedcor a second time. Verify button is disabled until completion. Verify a second row appears.
5. Flip Scheduled toggle on, off, on. After each: GET `/api/zedcor/recent-runs` and assert `current_state.scheduled_enabled` flipped. Capture all three audit rows from `pathfinder.agent_log` (event_type='manual_only_toggle') as JSON.
6. Enter `team@unicron.systems, kyle@freakngenius.com` in the digest input. Click Send. Verify inline result shows `lead_count: 12, recipients: [...]`. Capture the response JSON.
7. Click "Preview digest →". Confirm placeholder card renders with the expected-layout description.
8. Refresh the page. Confirm Recent Runs and toggle state both persist.
9. `pnpm typecheck` from inside the Pathfinder worktree. Capture output.
10. From repo root (which is the unicron-systems Vercel project), run its typecheck if exposed in `package.json` scripts (it's a separate Vercel project) — capture output to satisfy the multi-Vercel-verification rule.

PR description includes: screenshots of steps 1, 3 (mid-flight + complete), 7; JSON dumps of the three toggle audit rows; the `recent-runs` API response JSON; both typecheck outputs.

## Auto-merge criteria

- Plan approved here (GATE 1)
- Smoke evidence accepted (GATE 2)
- `pnpm typecheck` green in Pathfinder worktree
- `unicron-systems` (root) Vercel project still builds — no regression
- Auth-gate evidence (step 2 above) shows redirect, not render
- Org-isolation evidence: recent-runs filtered to Zedcor only

## Auto-revert triggers (carry forward from prompt)

- Page renders but auth gate is bypassed
- Toggle writes to a wrong-org config
- Recent runs return rows from other tenants

## Kanban hygiene

- START: card already in In Process (`https://www.notion.so/36e785c67e72812090f7c3dbaf8e7f46`) — no action needed at start.
- END on merge: move to Deployed, append `Implemented at <commit-sha> · merged at <ISO timestamp>` to card content. Do NOT touch Verified.
