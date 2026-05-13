# PLAN — DoD synthetic smoke harness (`scripts/dod-smoke.ts`)

## Card

Metacron kanban "Card 2 — author scripts/dod-smoke.ts harness" — approved by Kyle as the post-RLS-PR card on overnight Demo Push 2026-05-13.

## Why

Demo Push prompt's self-review loop fires after every merge and grades the run on the 11-step TestCorp synthetic smoke from `Company Docs/Metacron/SPEC - Definition of Done - End-to-End Operational.md`. Until tonight there was no harness — the loop's self-review was theatrical. This card builds the verification scaffold so the loop becomes meaningful.

Per Kyle: "Build it lean — per-step probe + pass/fail/blocked output + JSON summary. Don't over-engineer; it's a verification scaffold, not a test framework."

## What ships

`Pathfinder/scripts/dod-smoke.ts` (tsx-runnable) + `npm run dod-smoke` entry in `Pathfinder/package.json`.

- Creates fresh synthetic `testcorp-<timestamp>` org via service-role insert.
- Probes each of the 11 DoD steps in sequence.
- Each step returns `{step, name, status: 'pass'|'fail'|'blocked', latency_ms, details, error?}`.
- Prints per-step lines to stdout (color-coded if TTY).
- Writes JSON summary to `/tmp/dod-smoke-<timestamp>.json`.
- Cleans up the synthetic test org at the end (skip with `DOD_KEEP_TESTORG=1`).
- Exit codes: 0 = all pass, 1 = any fail, 2 = any blocked (no fail).

## Expected first-run output (today)

Most steps will return `blocked` because the upstream infrastructure isn't fully built yet:

| Step | Expected (overnight first-run) | Why |
|---|---|---|
| 1 | blocked | Architect doesn't yet emit `ui_plan` in `output_payload` (Build-Out Pass card pending) |
| 2 | pass | `organizations` insert works against current Phase 2A schema |
| 3 | blocked | `org.created` Inngest auto-dispatch wiring per Phase 2E in flight |
| 4 | blocked | `ingestOrgFunction` per-org dispatch dependent on step 3 |
| 5 | blocked | No leads yet because ingestion didn't fire |
| 6 | blocked | `build_out_complete` status + verification Inngest function pending (Build-Out Pass) |
| 7 | pass / blocked | `/api/customers` route reachability check; auth-required is OK |
| 8 | blocked | `/[slug]` route renders but ui_plan markers absent until renderer ships |
| 9 | blocked | follow-on from 5 |
| 10 | pass | direct `agent_verifications` insert works |
| 11 | pass | anon client should be denied after PR #380 RLS sweep |

So tonight: ~3 pass / ~7 blocked / 0 fail (target). As cards progress through Phase 2E and the Build-Out Pass, blocked → pass.

## Schema notes (verified pre-write via Supabase MCP)

- `pathfinder.organizations.customer_org_id` is NOT NULL text — the harness sets it to the slug.
- `pathfinder.agent_verifications` uses legacy `customer_org_id` (text), `dispatch_id` (uuid NOT NULL), `agent_name`, `verified_by_user_id` (uuid NOT NULL), `verified_by_user_email`, `summary` — synthetic uuids are fine for the smoke probe.
- `pathfinder.architect_sessions` stores blueprint in jsonb `output_payload`; the DoD `business_summary` / `decomposition` / `ui_plan` are jsonb keys, not columns. Step 1 probes for those keys.
- `pathfinder.projects` is the lead table; the harness counts by `organization_id` (uuid).

## Out of scope

- Real Playwright headless browser render check for step 6 — the harness probes the org status field and HTML markers, not real DOM. Playwright integration ships with the Build-Out Pass.
- Real Architect onboarding HTTP roundtrip — step 1 reads schema state rather than driving the modal.
- Cross-schema bridge verification depth (step 10) beyond inserting an agent_verifications row.

These are all expected to flip from blocked → pass as later cards ship. The harness reports their current state honestly.

## Auto-merge

Per Demo Push overnight pre-auth window. Codex review skipped (usage limit until 2026-05-17); follow-up audit card filed on Metacron kanban. Auto-merge on CI green + multi-Vercel green.

After merge: run the harness once against prod, attach the JSON summary to overnight thread as the first DoD baseline.
