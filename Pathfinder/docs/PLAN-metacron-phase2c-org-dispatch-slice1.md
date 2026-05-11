# PLAN — Phase 2C Slice 1: Org Architecture Foundation + Per-Org Inngest Dispatch

Branch: `feat/metacron-phase2c-org-dispatch-slice1`
Worktree: `Pathfinder-worktrees/phase2c-org-dispatch-slice1`
Base: `origin/main` @ dd72627

## Why this slice (and not the whole 2C)

The Phase 2C SPEC delivers seven capabilities (per-org dispatch, source registry, ranker weights, geography filter, outreach persona, verifier thresholds, compliance filter). They cannot ship as one cycle without exceeding what one Claude Code session can verify cleanly.

Slice 1 lands the **foundation layer everything else stacks on**: typed architecture, base template, resolver, server-side loader, and a per-org Inngest dispatch cron that emits `pathfinder/org.ingest_requested` events carrying `{organization_id, architecture, trigger}`. No agent behavior changes yet — Zedcor's existing kernel keeps running unchanged.

This is also the part Phase 2B sketched but never fully landed. Existing `lib/org-context.tsx` is just a thin user/org wrapper; it does not expose architecture or use BASE_ARCHITECTURE.

## Scope

In:
1. `Pathfinder/lib/types/architecture.ts` — TypeScript types for `OrgArchitecture` per Phase 2B SPEC
2. `Pathfinder/lib/config/baseTemplate.ts` — `BASE_ARCHITECTURE` constant
3. `Pathfinder/lib/config/resolveArchitecture.ts` — partial-merge resolver
4. `Pathfinder/lib/agents/loadOrgArchitecture.ts` — server-side loader from `pathfinder.organizations`
5. `Pathfinder/lib/inngest/events.ts` — add `pathfinder/org.ingest_requested` event contract
6. `Pathfinder/lib/inngest/functions/ingest-all-orgs-cron.ts` — new Inngest cron, lists `status='active'` orgs, dispatches per-org event
7. `Pathfinder/lib/inngest/functions/index.ts` — export new function
8. `Pathfinder/app/api/inngest/route.ts` — register new function
9. `Pathfinder/__tests__/config/resolveArchitecture.test.ts` — unit tests (TDD)
10. `Pathfinder/__tests__/agents/loadOrgArchitecture.test.ts` — unit tests with mocked Supabase

Out (deferred to slice 2+):
- Refactoring `lib/scoring.ts` (Zedcor kernel — locked, tests will fail if touched)
- Org-aware `scoreCandidate(weights)` dispatcher
- Outreach persona/tone wiring
- Verifier threshold wiring
- Geography filter wiring
- Compliance filter
- Source adapter registry
- Cross-pollination signal exposure
- Routing real Zedcor traffic through the new cron (it stays parallel to existing crons; a follow-up slice flips the switch once we trust the dispatch)

## Schema

None. `pathfinder.organizations.architecture jsonb DEFAULT '{}'::jsonb` already exists (verified 2026-05-10 via `information_schema.columns`).

The current `organizations` table does not yet have a `status` column. The cron query will use `WHERE coalesce(architecture->>'status','setting_up') NOT IN ('paused','archived')` for now — Phase 2E will add a real status state machine column. Slice 1's cron tolerates missing column.

If a real `status` column is needed for ergonomic querying we will surface a migration draft and HALT for Kyle's apply approval — but slice 1 does not require it.

## TDD order

1. Write `__tests__/config/resolveArchitecture.test.ts` covering:
   - null architecture returns BASE_ARCHITECTURE
   - empty `{}` architecture returns BASE_ARCHITECTURE
   - partial overrides merge (vertical, lead_unit, pipeline, scoring.weights, geography.defaults)
   - vocabulary merges shallow (override + add)
   - thresholds clamped 0–1 invariant preserved
2. Implement types + baseTemplate + resolveArchitecture until tests pass
3. Write `__tests__/agents/loadOrgArchitecture.test.ts` covering:
   - returns BASE_ARCHITECTURE for org with `architecture: {}`
   - merges partial architecture for org with vertical+vocabulary
   - throws if organization_id not found
4. Implement loadOrgArchitecture
5. Write Inngest cron + register
6. Verify: vitest, typecheck, build (Pathfinder), build (unicron-platform)

## Multi-Vercel impact

- Pathfinder: new files only, no existing-file behavior change → low regression risk
- unicron-platform: untouched
- Both must build green for the PR

## Halt boundaries

- No DDL → no migration apply halt expected
- If Supabase types regen needed → halt and surface
- If existing test fails after my changes (would indicate accidental regression) → halt, root-cause, fix in branch before PR
- If both Vercel previews not green on push → halt, fix in branch

## Success criteria for slice 1 PR

- All new tests pass
- `vitest run` exits 0 in `Pathfinder/`
- `npm run typecheck` exits 0
- `npm run build` exits 0 (Pathfinder)
- `unicron-platform` build green on Vercel preview
- New Inngest function registered and visible in `/api/inngest` discovery payload
- No row inserted into `pathfinder.*` tables by the cron in this PR (the dispatch event has no subscriber yet — that's slice 2)

## Out-of-band followups (file as cards after merge)

- Slice 2: org-aware ranker dispatcher (route Zedcor → existing kernel, others → generic weighted scorer derived from architecture.scoring.weights)
- Slice 3: outreach drafter persona/tone/value_prop wiring
- Slice 4: verifier thresholds from architecture.scoring.thresholds
- Slice 5: geography filter wiring
- Slice 6: source adapter registry
- Slice 7: compliance filter (SEC orgs reject retail-investor language)

End.
