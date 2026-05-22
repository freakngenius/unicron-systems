# Pathfinder Internal Onboarding, Build Report

**Status:** in progress.
**Integration branch:** `internal-onboarding`, off `origin/main` at `b00f11f`.
**Worktree:** `Pathfinder-worktrees/internal-onboarding/` (integration-branch worktree; stage worktrees follow `internal-<stage-slug>` convention under the same parent).
**Pre-prior state:** A previous halt report at this path on `main` (untracked) flagged the spec files missing. The revised runner prompt now carries those specs inline in its appendices, and Stage 0 materializes them. This report supersedes that one.

---

## Stage 0, Bootstrap spec files

**Status:** complete.
**Commit:** `2eeaab0 chore: materialize Internal spec files from approved blueprint`.
**Push:** `https://github.com/freakngenius/unicron-systems` branch `internal-onboarding` set up to track `origin/internal-onboarding`.

### Evidence

```
$ git log --oneline -2
2eeaab0 chore: materialize Internal spec files from approved blueprint
b00f11f fix(routing): move funder host rewrite to edge middleware (#460)

$ git push -u origin internal-onboarding
 * [new branch]      internal-onboarding -> internal-onboarding
branch 'internal-onboarding' set up to track 'origin/internal-onboarding'.
```

JSON validation (Pathfinder-Internal-Architecture.json):
```
parsed OK. top-level keys: _comment,vertical,lead_unit,pipeline,scoring,
                            geography,sources,outreach,vocabulary,branding,
                            compliance,integrations,business_summary,ui_plan
display_name: Unicron Internal
vertical: construction-vertical-b2b-prospecting
sources count: 6
weights sum: 1
```

Blueprint validation (Pathfinder-Internal-Blueprint.md):
```
$ head -1 Pathfinder/Pathfinder-Internal-Blueprint.md
# Pathfinder Internal Instance Blueprint
$ wc -l Pathfinder/Pathfinder-Internal-Blueprint.md
192 Pathfinder/Pathfinder-Internal-Blueprint.md
```

### Notes
- Blueprint Section 5 intentionally defers the JSON to APPENDIX B / `Pathfinder-Internal-Architecture.json` to keep a single source of truth (the on-disk untracked blueprint in `main`'s working tree was 313 lines because it inlined the JSON; the approved appendix version is 192 lines).
- Stage 0 has no kanban card per the runner prompt.
- The first commit on `internal-onboarding` adds only the two spec files; the runner Kickoff doc itself is intentionally not committed by this revised prompt.

---

## Pre-Stage 1, kanban initialization

11 cards created in Pathfinder Features Kanban (`collection://1e675609-7a89-47ff-8edb-f8ed9ccd38c1`), Stages 1 through 11, all under `Not Yet Started`. Title prefix `[Internal] Stage N: ...`. (See REPORT entries below for card moves as stages progress.)

---

## Stage 1, Platform audit and resized stage plan

**Status:** complete (no merge required; no-code stage per runner prompt).
**Commit:** `f6166e9 docs(stage1): platform audit and resized stage plan for Internal`.
**Push:** `2eeaab0..f6166e9 internal-onboarding -> internal-onboarding`.
**Artifact:** `Pathfinder/docs/PLAN-internal-onboarding.md`, 418 lines, 69 file:line cites, 0 em-dashes / en-dashes.
**Kanban:** moved to Deployed (Stage 1 card) with audit-summary append.

### Headline audit findings (full evidence in PLAN doc)

1. **Funder closed all three blueprint-named platform gaps on this branch's ancestor**, and Internal inherits them unchanged:
   - `lib/agents/ranker/genericRationale.ts:145-188` (Sonnet call with fallback) closes the prior debug-string rationale for non-Zedcor orgs.
   - `lib/metrics/kpiQueries.ts` populated for 4 metric_ids (Funder set; Internal's KPI metric_ids are additive in Stage 10).
   - `lib/adapters/sources/index.ts` ships a source-id-keyed `SOURCE_ADAPTERS` registry (no longer kind-only).

2. **Two new Funder-introduced hardcoded org gates the blueprint did not anticipate**, both requiring additive Internal branches:
   - `lib/inngest/functions/ingest-org-requested.ts:56` has `SUBSCRIBER_OPT_IN_SLUGS = new Set(['funder'])`; Internal needs to be added here as part of Stage 4.
   - `app/api/cron/verifier/route.ts:483` unconditionally calls `verifyFunderProject` for non-Zedcor projects; Stage 7 must add an org-aware switch reading from `architecture.scoring.thresholds`.

3. **Pre-existing platform bug**: `app/[slug]/page.tsx:63` filters projects by `org_id` instead of `organization_id`. Silently empties Funder and Realberry LeadCardList too. Fix folded into Stage 10; cross-customer regression check must be run.

4. **Adapter scope correction**: sam-gov and usaspending were billed as "reconfigure" in the blueprint, but the legacy code in `lib/ingestor.ts` is Zedcor-coupled and points at the wrong SAM endpoint (Opportunities, not Entity Management). Six net-new SourceAdapter modules total, not "reconfigure 2 + build 4." Stage 4 plan resized accordingly.

5. **Daily-digest path is net-new for the platform**: no daily cadence exists in `lib/briefing.ts`; the briefer is Zedcor-only weekly. Stage 8 builds the daily variant, the Slack digest format, and the pipeline-kanban load.

### Cross-cutting risks for downstream stages
1. Stage 4 is the largest lift (six net-new adapters). Three are gated on operator env vars (Socrata token for SOS, possibly trade-association portals, fragile contractor-license boards).
2. Stages 4, 6, 7, 8, 10 each touch shared files (`lib/inngest/functions/ingest-org-requested.ts`, `lib/agents/ranker/genericScorer.ts`, `app/api/cron/verifier/route.ts`, `lib/briefing.ts`, `lib/metrics/kpiQueries.ts`). Per CLAUDE.md `vercel.json`-style merge rule, all edits must append-only and gated by `organization_id`. Funder regression suite (per `docs/REPORT-funder-onboarding.md`: 47 tests across 5 files) is the regression bar.
3. Slack and HubSpot integrations (Stage 9) require Unicron-tenant credentials and explicit graceful-degradation tests; otherwise the cron will hard-fail in CI when credentials are absent.

### CI status
Doc-only changes through `f6166e9`. No `lib/` files touched, so `MEMORY/spec-references.md` policy check does not apply. `pnpm-lock.yaml` not regenerated (no dep changes). Vercel branch deployment auto-builds from `internal-onboarding` push; status surfaced in Stage 2 verification.

---
