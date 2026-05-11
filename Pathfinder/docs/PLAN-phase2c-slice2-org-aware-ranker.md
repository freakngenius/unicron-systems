# PLAN — Phase 2C slice 2: Org-aware ranker dispatcher

Pre-implementation plan per Pathfinder/CLAUDE.md `writing-plans` requirement.
Surfaces design choices for explicit operator approval before any code change.

**Worktree:** `Pathfinder-worktrees/phase2c-slice2-org-aware-ranker`
**Branch:** `feat/pathfinder-phase2c-slice2-org-aware-ranker`
**Base:** main @ `4b3df17`
**SPEC:** `Company Docs/Metacron/SPEC - Phase 2C Dynamic Agent Dispatch.md` §"Ranker"
**Slice scope:** Zedcor → existing kernel · other orgs → generic weighted scorer
**Builds on:** Phase 2C slice 1 (PR #307) — `loadOrgArchitecture`, `OrgArchitecture` type, `BASE_ARCHITECTURE`, `resolveArchitecture`

## Why now

Slice 1 shipped the foundation (typed architecture + per-org loader + per-org Inngest dispatch). The ranker itself still runs as a Vercel cron at `/api/cron/ranker/route.ts` and is Zedcor-only: hardcoded construction/security classifier prompt, `zedcor_branches` proximity, `org_geo_config WHERE org_id='zedcor'`. Realberry (and any future Architect-onboarded org) has zero ranking today. Phase 2D dashboard now reads per-org metrics, so the ranker is the next bottleneck for the TestCorp smoke gate.

## Current state (verified by reading 1110 lines of `app/api/cron/ranker/route.ts`)

- **Queue:** `SELECT * FROM pathfinder.projects WHERE score IS NULL ORDER BY ingested_at DESC LIMIT 30`. No org filter — all unranked projects across all orgs land in one batch.
- **Stage 1 — classifier (Haiku 4.5):** prompt is Zedcor-specific (construction/security/perimeter capability matrix, GCs list, etc.). Returns yes/no.
- **Stage 2 — geographic scoring:** `lib/scoring.ts:scoreProject({ project, branches, customers })` against `pathfinder.branches` (multi-tenant view) + `pathfinder.customers`. Then separately computes `nearest_zedcor_branch_id` from `pathfinder.zedcor_branches` (Zedcor-specific).
- **Stage 3 — Sonnet rationale:** prompt template at `Pathfinder/prompts/claude-ranking-rationale.md` — Zedcor-flavored capability matrix.
- **Stage 4 — write back:** `nearest_zedcor_branch_id`, `zedcor_distance_miles`, distance-gating against `org_geo_config WHERE org_id='zedcor'`.
- **Cross-pollination boost:** `+10` if matches found.
- **Geo_unknown cap:** 50 when project has no coords.
- **Distance gating:** `rejection_reason='no_branch_coverage'` if `zedcor_distance_miles > org_geo_config.max_supported_distance_miles`.

**Org_id presence on projects:** `pathfinder.projects.organization_id uuid` shipped in PR #314 (Phase 2A completion migration). Existing 1825 Zedcor projects backfilled. Realberry has 0 projects in production today.

## Architecture decision — three options considered

### Option A — minimal dispatch inside the existing loop (RECOMMENDED)

Keep the cron route as the single entry point. Inside the per-project loop, look up the project's `organization_id` and route:

- If org_id matches Zedcor's UUID (or org has no architecture row): run the **existing Zedcor kernel** verbatim. Zero behavior change for the customer-zero pipeline.
- For any other org: load `OrgArchitecture` via `loadOrgArchitecture(org_id)`, run a new `scoreGenericProject(project, architecture)` helper that uses `architecture.scoring.weights`, `architecture.geography.defaults`, `architecture.compliance` to compute a score. Sonnet rationale uses `architecture.outreach` + `architecture.branding` instead of the Zedcor capability matrix.

**Pros:** Smallest diff. Customer-zero pipeline untouched. New orgs get rationale + score without rewriting the cron.
**Cons:** Two code paths in the same file (already 1110 lines). Mitigated by extracting `scoreGenericProject` into `lib/agents/ranker/genericScorer.ts` with its own tests.

### Option B — per-org Inngest dispatch (full SPEC alignment)

Replace the global queue cron with `ingest-all-orgs-cron`-style iteration: cron lists active orgs, dispatches per-org `rankOrgFunction` Inngest invocations. Each invocation owns its org's queue.

**Pros:** Cleanest separation. Matches Phase 2E's planned `ingestOrgFunction` / `rankAndVerifyOrgFunction` pattern.
**Cons:** Substantial refactor of the cron entry point. Risk of regressing Zedcor's working pipeline during slice 2. Better to land Option A first, then migrate to Option B as part of Phase 2E slice 2 wiring.

### Option C — separate cron per org

Two crons: `/api/cron/ranker/route.ts` (Zedcor) and `/api/cron/ranker-generic/route.ts` (all other orgs).

**Pros:** Total isolation.
**Cons:** Code duplication, two cron entries in `vercel.json`, two sets of operational dashboards. Worst option for maintainability.

**Recommendation: Option A.** Surfacing here for your override.

## File scope (declared up-front per protocol)

In scope for the implementation if Option A approved:

- `Pathfinder/app/api/cron/ranker/route.ts` — add dispatch logic at the top of the per-project loop
- `Pathfinder/lib/agents/ranker/genericScorer.ts` — NEW, holds `scoreGenericProject` + its types
- `Pathfinder/__tests__/agents/ranker/genericScorer.test.ts` — NEW, TDD tests for the generic path
- `Pathfinder/prompts/claude-ranking-rationale-generic.md` — NEW, org-agnostic rationale prompt template (interpolates `architecture.outreach.persona`, `architecture.outreach.value_prop`, `architecture.branding.display_name`)
- `Pathfinder/__tests__/api/cron/ranker.test.ts` — extend existing tests with org-dispatch coverage
- `Pathfinder/docs/PLAN-phase2c-slice2-org-aware-ranker.md` — this file

Out of scope (file scope discipline):
- Anything touching the verifier, outreach drafter, source registry — those are slices 3-7.
- Schema changes — none required.
- Phase 2E status-machine wiring — separate card.
- Customer-facing UI — Customer Detail dashboard reads aggregates and doesn't care which scorer ran.

## Generic scoring approach

`scoreGenericProject(project, architecture)` computes a 0-100 composite by weighted sum of feature scores. Feature extractors map to the keys the Architect surfaces in `architecture.scoring.weights`:

- `geography_match`: 1.0 if project state ∈ `architecture.geography.defaults`, else 0
- `asset_class_match`: keyword match between project title/summary and `architecture.vertical` + `architecture.business_summary.business_area` (if present)
- `trigger_strength`: stage-based (RFP=1.0, PRE=0.75, PLN=0.55, NWS=0.35, else 0.5)
- `basis_fit`: value-bracket bonus if `architecture.business_summary.lead_type` hints at value-sensitive verticals
- `unit_count_fit`: real-estate-specific (e.g. RentCafe units); 0 otherwise

Score = Σ (weight × featureScore × 100), clamped to [0, 100]. Cross-pollination boost stays org-agnostic (already is). Geo-unknown cap stays at 50 globally.

For Realberry's expected scoring weights (e.g. `geography_match: 0.4, asset_class_match: 0.3, trigger_strength: 0.2, basis_fit: 0.1`), the Architect's emitted JSON drives the math. Missing weights fall back via `BASE_ARCHITECTURE` (slice 1's resolver).

## Rationale prompt template (org-agnostic)

`prompts/claude-ranking-rationale-generic.md` will mirror the structure of the existing Zedcor template but interpolate from architecture:

```
You are the {{architecture.branding.display_name}} Ranker rationale-and-hook step.

Persona: {{architecture.outreach.persona}}
Value proposition: {{architecture.outreach.value_prop}}
Tone: {{architecture.outreach.tone}}
Compliance constraints: {{architecture.compliance.join(', ')}}

Return three short paragraphs explaining why this {{architecture.lead_unit.name}}
is worth attention, then a blank line and "HOOK:" followed by a single-sentence
outreach opener.
```

For SEC-compliance orgs (per slice 7 SPEC), a compliance clause prefix is injected. This slice ships the template + a passthrough — the actual SEC-language gating is slice 7's territory; slice 2 just ensures the template path is wired and operational.

## Tests (TDD, written first per protocol)

`genericScorer.test.ts`:
1. weights sum to 1 → score is well-formed [0, 100]
2. geography_match=1 + others=0 with weight 1.0 → score 100
3. all features 0 → score 0
4. unknown feature in weights → ignored cleanly (no throw)
5. missing feature extractor → contributes 0
6. clamps negative weighted-sum to 0
7. clamps over-100 to 100

`ranker.test.ts` extensions:
8. Zedcor project → existing classifier + Zedcor kernel path invoked (verify via spy on `findNearestZedcorBranch`)
9. Realberry project → generic path invoked (verify via spy on `scoreGenericProject`)
10. Org without architecture row → falls back to Zedcor kernel (safe default)
11. Mixed-org queue → each project routes correctly

## Verification before completion

1. `npm run typecheck` green
2. `npm run lint` green  
3. `npm run test` — all existing 1563+ tests still passing, plus new 7 generic + 4 ranker tests
4. `npm run build` — Pathfinder Next.js production build green
5. SQL probe: simulate a Realberry project insert (test only, rolled back) → confirm ranker picks it up and writes a score
6. Codex review of branch before PR

## Risks + mitigations

- **Regressing Zedcor pipeline:** mitigation is the explicit `if (org_id === ZEDCOR_ID || !architecture)` fallthrough. Test 10 above locks this in. Production Zedcor projects continue down the unchanged code path.
- **Architect-emitted weights drift:** the resolver merges with `BASE_ARCHITECTURE.scoring.weights` so missing keys don't break math. Anomalies (e.g. weights summing to 5.0) are bounded by the [0, 100] clamp.
- **Sonnet template injection:** all `{{...}}` interpolations are JSON-stringified, not raw, so a malicious `architecture.outreach.persona` can't break out of the prompt envelope.
- **Cross-app boundary:** none. All changes in `Pathfinder/`. unicron-platform untouched.

## Rollback

`git revert` the merge commit. Zedcor pipeline returns to current behavior; Realberry returns to no-ranking. No schema or data changes to undo.

## Open questions for operator (require approval before implementation)

1. **Option A vs B vs C?** Recommending A. Override?
2. **Zedcor org UUID hardcode?** The existing ranker has no `organization_id` filter — it scores everything. To preserve Zedcor behavior, I need a way to identify Zedcor projects. Two paths: (a) hardcode `ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef'` (matches production UUID, brittle if Zedcor's org id ever changes); (b) lookup `pathfinder.organizations WHERE slug='zedcor'` once per cycle and compare. Recommending (b) — single extra read per cycle, no hardcode.
3. **Generic prompt location:** `prompts/claude-ranking-rationale-generic.md` OK, or prefer it inline in a helper module? Existing pattern is file-based.
4. **Feature extractor ownership:** does the operator want me to add `unit_count_fit` and `basis_fit` extractors in this slice (Realberry-shaped), or stub them as 0 and add real implementations in a follow-up when Realberry actually has projects to score? Recommending stubs — Realberry has 0 projects today; adding real extractors with no data to test against risks bit-rot.

## Out of scope (other Phase 2C slices)

- Slice 3: outreach drafter persona/tone wiring
- Slice 4: verifier thresholds from architecture
- Slice 5: geography filter wiring (separate from this slice's `geography_match` feature)
- Slice 6: source adapter registry
- Slice 7: compliance filter for SEC orgs

## Next step

Awaiting operator approval on the 4 open questions. Once approved (or override given), TDD implementation begins from test file #1 above.

End.
