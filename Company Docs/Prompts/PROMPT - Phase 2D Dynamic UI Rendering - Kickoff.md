# PROMPT — Phase 2D Dynamic UI Rendering Kickoff (paste-ready)

Paste into a fresh Claude Code session AFTER Phase 2A merges. Independent of Phase 2C — runs in parallel in a separate worktree.

---

## Pre-read

1. `Company Docs/PRD/PRD - Phase 2 Tailored Pathfinder.md`
2. `Company Docs/Specs/SPEC - Phase 2D Dynamic UI Rendering.md` — full scope.
3. `Company Docs/Specs/SPEC - Phase 2B Tenant Config Layer.md` — architecture types + `useVocab`.
4. `Company Docs/Specs/SPEC - Architect Business Summary Panel.md` — shared component.
5. Confirm Phase 2A merged: `[slug]/layout.tsx` exists, `OrgContext` provider available.
6. Existing Pathfinder UI: `Pathfinder/components/`, `Pathfinder/app/[slug]/`.
7. Grep for hardcoded "Zedcor", "lead", "construction security", and any other Zedcor-specific copy in customer-facing routes.

## Hard constraints

- No deletes, no time estimates, no cost caps, multi-Vercel verification, no auto-promotion to Verified.
- Verbatim evidence in PR description (paste actual screenshots, grep output, test results).
- Use a fresh worktree: `git worktree add .claude/worktrees/phase-2d-dynamic-ui feat/phase-2d-dynamic-ui`.
- Do not touch any backend agent code (Phase 2C territory). If a UI change requires a new lead field, file an operator-todo and use a placeholder.

## Phase A — Investigation (Explore sub-agent)

```
Investigate Pathfinder customer-facing UI to scope Stream 2D:

1. Map all customer-facing routes under Pathfinder/app/[slug]/.
2. Find every component that renders lead data: list cards, kanban, detail view, filters, empty states.
3. Grep for hardcoded strings: "Zedcor", "lead", "leads", "construction", "project value", any vocabulary that should be customer-driven.
4. Identify the existing pipeline kanban implementation. Hardcoded stages? Drag-drop library?
5. Identify the existing filter sidebar. Hardcoded filter fields?
6. Identify outreach drafter UI components.
7. Confirm Phase 1F Activity Ticker integration point.
8. Find any branding-related code (header logo, page title, color theming).
9. Check existing test coverage for these components (Vitest, RTL).

Report findings with file paths + line numbers + verbatim code snippets. Do not modify yet.
```

## Phase B — Lead card refactor

1. Create `Pathfinder/components/LeadCard.tsx` (generic, schema-driven) per spec.
2. Create `Pathfinder/components/Field.tsx` (renders any field by `LeadFieldDef.type`).
3. Migrate existing Zedcor card markup to use new generic. Same visual output for Zedcor inputs.
4. Add stories / component tests for: string field, currency field, enum chip, geography object, score badge.

## Phase C — Pipeline kanban refactor

1. Create `Pathfinder/components/PipelineKanban.tsx` per spec — stages and labels from architecture.
2. Migrate existing Zedcor kanban implementation. Drag-drop persistence to `pathfinder.leads.stage` unchanged.
3. Test: render with Zedcor stages → renders Zedcor stages. Render with Realberry stages (sourced/ioi/loi/under-contract/closed) → renders those. Drag-drop persists.

## Phase D — Vocabulary substitution

1. Apply `useVocab()` throughout customer-facing routes. Page titles, nav labels, filter labels, empty states, drafter UI labels.
2. Grep again for hardcoded "lead" / "leads" — should return zero matches in customer-facing components after this phase.

## Phase E — Branding hooks

1. Header reads `architecture.branding.display_name` and renders. Pathfinder wordmark stays in footer.
2. CSS var `--accent` set from `architecture.branding.accent_color`. All accent-colored UI uses var.
3. Optional logo support via `architecture.branding.logo_url`.
4. Test: render with Realberry branding → "Realberry" in header, accent color applied.

## Phase F — Business Summary at top

1. Extract `BusinessSummaryPanel` into shared package or shared components dir so both Metacron and Pathfinder can import.
2. Render at top of `[slug]/page.tsx` with `readOnly={true}`.
3. Pull from `architecture.business_summary`.
4. Skeleton loading + missing-summary fallback.

## Phase G — Filters

1. Generic `<Filter>` component reads schema and renders appropriate control per field type.
2. Geography filter pre-populated from `architecture.geography.defaults`.
3. Default sort: score descending.
4. Persist filter state to URL query params for shareability.

## Phase H — Empty states

1. Replace hardcoded empty-state copy with vocab-substituted versions per spec.
2. If `architecture.sources` has pending entries, show "X of Y sources active" indicator.

## Phase I — Activity Ticker (Phase 1F integration)

1. Confirm Phase 1F bridge merged. Activity Ticker component exists.
2. Place ticker in dashboard header or sidebar. Subscribes to `pathfinder.agent_verifications` filtered by `customer_org_id`.
3. Animate new entries.

## Phase J — Tests

- Component: each new component with mock OrgContext (Zedcor + Realberry shapes).
- E2E (Playwright): visit `/zedcor` → renders Zedcor vocab/stages/branding. Visit `/realberry` (with seed) → renders Realberry vocab/stages/branding.
- Regression: existing Zedcor flows unchanged.
- Visual regression (if Chromatic or similar configured): screenshots match for Zedcor.

## Phase K — PR open + verification

1. PR titled `Phase 2D: Dynamic UI Rendering — schema-driven, vocab-aware, branded`.
2. PR body: what ships, before/after screenshots (Zedcor regression + Realberry placeholder render), grep output showing zero hardcoded "lead"/"Zedcor" in customer routes.
3. Multi-Vercel: Pathfinder green; Metacron green (no regression — Metacron unaffected).
4. Worktree cleanup via `git worktree remove`.

## Failure modes — halt + report

- Phase 2A not merged at branch time.
- `OrgContext` not yet exported from agreed location.
- Existing Zedcor visual regression detected.
- E2E test cannot find required `BusinessSummaryPanel` shared module.

## Kanban hygiene

- Phase A start: Cowork moves Phase 2D card → In Process.
- PR merge: Cowork moves card → Deployed. CC reports merge SHA + ISO timestamp.

End.
