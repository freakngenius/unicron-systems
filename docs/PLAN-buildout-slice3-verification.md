# PLAN — Build-Out Pass Slices 3+5 (verification + status flip)

Branch: `buildout-slice3-verification`
Spec: `Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md` §3 + §5

## Scope (combined Slices 3 + 5)

1. DB migration: extend `pathfinder.organizations.status` CHECK to allow
   `build_out_complete` and `build_out_failed`. Add `build_out_diagnostic jsonb null` column.
2. Inngest function `verifyBuildOut` at `Pathfinder/lib/inngest/functions/verify-build-out.ts`:
   - Trigger: `pathfinder/org.ready_to_view` (new event added to `events.ts`).
   - Flow: fetch org → HTTP GET `${PATHFINDER_BASE_URL}/pathfinder/${slug}` → parse HTML via regex →
     update `pathfinder.organizations.status` to `build_out_complete` on pass, `build_out_failed` on fail.
   - Diagnostic on fail: `{ reason, html_snippet?, http_status? }`.
   - Single-attempt only — TODO comment for iterate-to-green loop.
3. Emit `pathfinder/org.ready_to_view` from `check-ready-to-view-cron.ts` when status flips to `ready_to_view`.
4. Register `verifyBuildOut` in `lib/inngest/functions/index.ts` + `app/api/inngest/route.ts`.
5. Tests in `Pathfinder/__tests__/inngest/verifyBuildOut.test.ts`: pass, too-few-lead-cards, http_401, http_5xx.
6. Update MEMORY/spec-references.md if files require it.

## Out of scope

- Real Playwright headless screenshotting (follow-up card).
- Iterate-to-green retry loop (follow-up card).
- Component changes in `Pathfinder/app/[slug]/*` or `Pathfinder/components/*` — parallel sub-agent's Slice 2 scope.

## File scope

- `Pathfinder/supabase/migrations/<YYYYMMDD>_phase2e_buildout_status.sql` (new)
- `Pathfinder/lib/inngest/events.ts` (additive — add new event)
- `Pathfinder/lib/inngest/functions/verify-build-out.ts` (new)
- `Pathfinder/lib/inngest/functions/check-ready-to-view-cron.ts` (additive — emit new event on ready_to_view transition)
- `Pathfinder/lib/inngest/functions/index.ts` (additive export)
- `Pathfinder/app/api/inngest/route.ts` (additive registration)
- `Pathfinder/__tests__/inngest/verifyBuildOut.test.ts` (new)
- `docs/PLAN-buildout-slice3-verification.md` (this file)

## Verification markers (regex, per spec §"Build-out verification")

- `data-kpi-strip` — must be present (else `reason: 'missing_kpi_strip'`)
- `data-lead-card` count >= 3 OR `data-empty-state` present (else `reason: 'too_few_lead_cards'`)
- `data-chart` present (else `reason: 'no_charts'`)
- No `data-error` markers (else `reason: 'data_error_marker'`)
- HTTP 401 → `reason: 'http_401'`
- HTTP 5xx → `reason: 'http_5xx'`

## End-to-end dependency note

The data-* markers come from Slice 2 (parallel sub-agent's PR on
`Pathfinder/app/[slug]/page.tsx` and `Pathfinder/components/*`). Until that PR merges, the
verifyBuildOut function will run against HTML that lacks these markers and report
`build_out_failed`. Tests in this PR mock HTML strings literally containing the markers.
