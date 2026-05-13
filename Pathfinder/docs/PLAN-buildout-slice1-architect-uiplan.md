# PLAN — Build-Out Pass Slice 1: Architect emits ui_plan

Branch: `buildout-slice1-architect-uiplan`
Spec: `Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md`
DoD: `Company Docs/Metacron/SPEC - Definition of Done - End-to-End Operational.md` (Step 1 expects business_summary + decomposition + ui_plan).

## Scope (this PR only)

Opens the schema gate so Architect can emit `ui_plan` alongside `business_summary` and the decomposition. No renderer, no headless verification, no status flips. Those are separate slices.

## Changes

1. `Pathfinder/lib/types/architecture.ts`
   - Add `UIPlan` interface verbatim from the SPEC's TypeScript block (lead_card_layout, kpis, charts, filters, dashboard_emphasis).
   - Add `ui_plan?: UIPlan` (optional) to `OrgArchitecture` for backward compat with existing orgs.

2. `Pathfinder/lib/config/baseTemplate.ts` + `Pathfinder/lib/config/resolveArchitecture.ts`
   - Add a safe default `ui_plan` to `BASE_ARCHITECTURE`: empty `primary_fields`/`secondary_fields`, `score_position: 'top-right'`, empty `kpis`/`charts`/`filters`, `dashboard_emphasis: 'volume'`.
   - Extend the resolver so `ui_plan` from the org architecture jsonb merges shallowly over the base default, in the same style as `branding`/`outreach`.

3. `Pathfinder/services/architect/prompts/decomposition.ts`
   - Append a new section after the business_summary block instructing the Architect to generate a `ui_plan` object, using the SPEC's "Architect prompt extension" guidance verbatim.
   - Bump `DECOMPOSITION_PROMPT_VERSION` to `2026-05-13-v4`.

4. `MEMORY/spec-references.md`
   - Add a Slice 1 reference entry pointing `services/architect/prompts/decomposition.ts` at the Build-Out Pass SPEC; update prompt version to v4.

5. Tests: `Pathfinder/__tests__/architect/decomposition-prompt-shape.test.ts` (new, small)
   - Asserts the prompt string contains `ui_plan` + `dashboard_emphasis` + at least one of the four emphasis values (volume | quality | velocity | coverage).
   - Asserts `DECOMPOSITION_PROMPT_VERSION === '2026-05-13-v4'`.

   Also extend `Pathfinder/__tests__/config/resolveArchitecture.test.ts`:
   - BASE_ARCHITECTURE carries a default `ui_plan` with `dashboard_emphasis: 'volume'`.
   - Partial `ui_plan` overrides merge field-by-field (and `OrgArchitecture` type allows the field).

## Explicit out-of-scope

- Architect output validation that the LLM actually emits `ui_plan` (needs a live LLM session).
- Pathfinder `/[slug]` renderer changes (Slice 2).
- Inngest `verify_build_out` function (Slice 3).
- Iterate-to-green loop (Slice 4).
- `build_out_complete` / `build_out_failed` status state extensions (Slice 5).
- Any file outside the list above.

## TDD

1. Write failing prompt-shape test (assert `ui_plan` + `dashboard_emphasis` substring + new version).
2. Write failing resolver test (BASE has `ui_plan`, partial merges).
3. Update types → BASE_ARCHITECTURE → resolver → prompt → version.
4. Green: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## Auto-merge gates (overnight Demo Push 2026-05-13)

- `gh pr checks` all green: lint, typecheck, vitest, spec-references, eval scaffolding.
- All 4 Vercel previews green (multi-Vercel verification rule).
- Codex review: SKIP (usage limit until 2026-05-17 — noted in PR body).
- On green: `gh pr merge --squash` (keep branch).

## DoD impact

Step 1 of the End-to-End DoD smoke (`business_summary + decomposition + ui_plan` in Architect output) gets its schema gate opened by this PR. The actual emission still depends on a fresh Architect session running against the v4 prompt — that will surface naturally on the next onboarding run.
