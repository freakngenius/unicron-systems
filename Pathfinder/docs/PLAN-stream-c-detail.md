# PLAN: Stream C, Internal company-detail surface

Branch: `feat/stream-c-detail`. Branches from `main` at `3c2c927` (Stream A: catalog foundation, PR #509).

Scope: replace the four floor stubs in `Pathfinder/lib/catalog/floor-stubs.tsx` for the Internal detail surface, wire the catalog renderer into the existing `/[slug]/leads/[projectId]` route for orgs with a modules block, and keep every other org rendering byte-identically to today.

Per `Pathfinder/CLAUDE.md`: never commit to `main`, never merge own PR, stay inside declared file scope, push at logical checkpoints.

## Discovery summary, real paths

Catalog primitives (Stream A, do not redefine):
- Types: `Pathfinder/lib/catalog/types.ts`. `Slot`, `Dependency`, `ModuleDefinition`, `OrgModuleEntry`, `SlotResolution`, `GateContext`, `ModuleComponentProps`, eleven-id `ModuleId` union.
- Registry: `Pathfinder/lib/catalog/registry.ts`. The four Stream C ids are `company-detail` (slot `detail.body`, hard deps `enriched_record`, `score_components`; soft `sources`), `outreach-composer` (slot `detail.outreach`, hard `resend`; soft `outreach_drafts`; agent `outreach-drafter`), `hubspot-sync` (slot `detail.outreach`, `slotMode: 'action-affordance'`, hard `hubspot`), `warm-intro-panel` (slot `detail.relationships`, soft `adjacency_graph`; agent `adjacency-mapper`).
- Renderer: `Pathfinder/lib/catalog/renderer.ts`. `resolveAllSlots(ctx)` returns `Record<Slot, SlotResolution>`. Each resolution has a `mode` (`active` / `inactive` / `floor` / `hidden`) plus an optional `module` and resolved `affordances`.
- Gating: `Pathfinder/lib/catalog/gating.ts`. `makeSupabaseGateContext` wires production data_signal lookups; tests pass a stub.
- Floor stubs: `Pathfinder/lib/catalog/floor-stubs.tsx`. `FLOOR_STUB_LOADERS` is the swap point. Stream A's own note says "surface streams can replace with real `() => import('./real-component')` thunks."
- Validation: `Pathfinder/lib/catalog/validation.ts`. `validateOrgModules` enforces slot collision, schema, hard sync gates.
- Single import surface: `Pathfinder/lib/catalog/index.ts`.
- Nav helper: `Pathfinder/lib/nav/orgPath.ts`. `orgPaths.dashboard(slug)` → `/internal`. Back-link target for the detail surface.
- Design primitives: `Pathfinder/components/design/{Card,ScoreBadge,WhyLine,EmptyState,SectionHeader,index}.tsx`. Tokens at `Pathfinder/lib/design/tokens.ts`.

Internal data layer (Stream C consumes, does not redefine):
- Detail route: `Pathfinder/app/[slug]/leads/[projectId]/page.tsx`. Server fetches `organizations` by slug, then `projects` row by id. Branches on `architecture.lead_unit.name === 'company'`. Mounts `<CompanyDetailContents lead={lead} />` inside `<LeadDetailShell>`.
- Projection: `Pathfinder/lib/agents/internal/companyLeadView.ts`. `projectToCompanyLeadView(row)` returns `CompanyLeadView` with display-label-friendly fields (`service_category` already mapped through `SERVICE_LABELS`, `sales_motion` through `SALES_MOTION_LABELS`, `federal_registration` through `FEDERAL_REG_LABELS`). Reads `raw_payload.internal_enrichment` and `raw_payload.internal_geo`.
- Architecture fixture: `Pathfinder/__tests__/fixtures/internal-architecture.json`. Weights `sales_motion_strength 0.25, operational_footprint 0.20, federal_signal 0.15, project_driven_fit 0.15, recency 0.15, association_presence 0.10`. Integrations `["hubspot", "slack", "resend"]`. Outreach config has `persona`, `tone`, `value_prop`.
- Zedcor reference: `Pathfinder/components/lead/LeadDetail.tsx` (v2 RedesignedBody). Section order: Quick metrics, Rationale, Project Facts, Contacts, HubSpot, Relationship Context, Outreach, Verifier, Source Record, Timeline. Stream C does not reuse these components (they are Funder-shaped); it matches their density and ordering using Stream A's design primitives over Internal-shaped data.

## File scope

Stream C adds these files:
1. `Pathfinder/components/catalog/modules/CompanyDetail.tsx` — slot `detail.body` real component.
2. `Pathfinder/components/catalog/modules/OutreachComposer.tsx` — slot `detail.outreach` real component (claim).
3. `Pathfinder/components/catalog/modules/HubspotSync.tsx` — slot `detail.outreach` action-affordance.
4. `Pathfinder/components/catalog/modules/WarmIntroPanel.tsx` — slot `detail.relationships` real component (active + pending layouts).
5. `Pathfinder/lib/catalog/scoring/internalScoreComponents.ts` — derives the six weighted contributions from observable signals so the breakdown reconciles to the displayed score.
6. `Pathfinder/components/catalog/CatalogDetailRenderer.tsx` — server component that calls `resolveAllSlots` and renders the three detail slots (`detail.body`, `detail.outreach`, `detail.relationships`). Pure orchestration.
7. Tests: `Pathfinder/__tests__/catalog/internalDetail.test.tsx`, `Pathfinder/__tests__/catalog/internalScoreComponents.test.ts`.

Stream C edits these files:
- `Pathfinder/lib/catalog/floor-stubs.tsx`. Replace the four loader thunks for `company-detail`, `outreach-composer`, `hubspot-sync`, `warm-intro-panel`. Keep the other seven stubs intact. The file's intent is exactly this swap; Stream A's comments call it out.
- `Pathfinder/app/[slug]/leads/[projectId]/page.tsx`. Add catalog branching: when `architecture.modules` is present, mount the catalog renderer instead of `<CompanyDetailContents>`. For every other org (no modules block, e.g. Zedcor, Realberry, Funder) the existing path runs unchanged.
- `MEMORY/spec-references.md`. Append entries for new `lib/` and `lib/catalog/` files Stream C adds (per repo CI convention).

Stream C does NOT touch:
- `lib/catalog/types.ts`, `lib/catalog/registry.ts`, `lib/catalog/renderer.ts`, `lib/catalog/gating.ts`, `lib/catalog/validation.ts`, `lib/catalog/index.ts`. These are Stream A's contracts.
- `components/design/*`. Imports only.
- `components/lead/CompanyDetailContents.tsx`, `components/lead/LeadDetail.tsx`, `components/lead/LeadDetailShell.tsx`, `components/lead/FunderDetailContents.tsx`. These are Zedcor / Funder / pre-catalog Internal surfaces. Keeping them untouched is what guarantees no regression.
- The dashboard route, the pipeline route, the digest cron. Stream B and D scope.
- Any backend, migration, schema, or Inngest file. Stream C is presentation-only.

## Module-by-module design

### Module 1: company-detail (slot `detail.body`)

Component file: `Pathfinder/components/catalog/modules/CompanyDetail.tsx`. Default export matches `ModuleComponentProps`. Sections, top to bottom, in a vertical stack of `Card` shells with `SectionHeader`s:

1. Header. Company name (font `xl`, semi), `ScoreBadge` top-right with `label` true. Below: `WhyLine` accent tone summarizing rationale in one sentence (truncated if needed). Mono eyebrow shows source + posted-date.
2. Score breakdown. Six rows, one per weighted signal. Each row: label, weight badge (mono micro), contribution value (mono), contribution-to-total bar. Footer row: "Total" with sum, asserted equal to displayed score. The contribution math is documented inline and unit-tested.
3. Rationale. Prose with preserved line breaks. `EmptyState` when missing.
4. Qualifying signals. Bullet list of concrete evidence pulled from raw_payload (sales-team postings, federal awardee, association memberships, footprint breadth). `EmptyState` when none surfaced.
5. Enriched data. Two-column key-value grid: Service category, Sales motion, Operating footprint, Headquarters, Contractor licensure, Federal registration, Size, Trade associations, Website (linked), LinkedIn (linked). Each label is the architecture `display_label`, never the field key. Missing fields are dropped, not zero-padded.
6. Sources. List of per-company source records (id, type, posted_date, url if any). `EmptyState` when absent (soft gate).
7. Timeline. Chronological list of activity events on this company (verified-at, enriched-at, scored-at, outreach-sent). Pulled from the row's timestamp columns plus `raw_payload.internal_timeline` if present. `EmptyState` when none.

Hard gating note. `enriched_record` resolves true when `raw_payload.internal_enrichment` is non-null and non-empty. `score_components` resolves true when both `row.score` is non-null AND we can derive six contributions from observable signals (always true once score is non-null, by design of the derivation). When either hard gate is unmet the slot falls back to floor.

### Module 2: outreach-composer (slot `detail.outreach`)

Component file: `Pathfinder/components/catalog/modules/OutreachComposer.tsx`. Three stacked draft cards inside a single `Card` shell with `SectionHeader` "Outreach":

- Email draft. Synthesized client-side from `architecture.outreach.persona`, `tone`, `value_prop`, plus the company's `first_step` (when set) and `warm_intro` (when set). Subject + body in monospace. Copy button.
- LinkedIn draft. Shorter, same source config. Copy button.
- Internal HubSpot note. Operator-facing summary referencing score, sales_motion, and the first_step. Copy button.

Affordance row. Renders below the three drafts. Iterates `affordances` from the slot resolution and mounts each `<Component {...props} />`. Action-affordance modules (only hubspot-sync today) appear here.

Send action. Single primary "Send email" button. Resend hard gate state:
- When `architecture.integrations` includes `resend`: button enabled. Clicking POSTs `/pathfinder/api/outreach/send` with the synthesized email (a thin wiring; this endpoint already exists for Zedcor). On success: "Sent." On failure: surfaced error.
- When `resend` is absent: button rendered disabled, hover tooltip / inline reason text "Send disabled: Resend integration not connected for this org."

Soft data_signal `outreach_drafts` resolution:
- When present (cached AI drafts exist in DB): preference the cached drafts over client-side synthesis (out of scope wiring for now since Internal has no cached drafts; render client-side synthesis when the data signal is absent or empty).
- When absent: still render the three synthesized drafts. The soft gate keeps the module visible; it does not blank the panel.

The above keeps the soft-gate semantics honest: render the inactive state only when the slot is genuinely inactive (e.g. config-time integration unavailable). With Internal's `resend` present, the module is active, and the absence of `outreach_drafts` is just "compose from config."

### Module 3: hubspot-sync (action-affordance on `detail.outreach`)

Component file: `Pathfinder/components/catalog/modules/HubspotSync.tsx`. Default export matches `ModuleComponentProps`. Renders only the affordance:

- A secondary "Push to HubSpot" button. Clicking POSTs to `/pathfinder/api/hubspot/sync` (existing endpoint reuse if present; otherwise wire a thin handler that calls the existing Zedcor hubspot lib).
- Hard gate on `integration:hubspot`. If unmet the affordance does not render at all (per the renderer dropping affordances whose hard gates fail). Internal has `hubspot` in `integrations`, so the affordance renders.
- The slot-collision resolution is the `slotMode: 'action-affordance'` field on the registry entry. The renderer keeps `outreach-composer` as the slot claimer; hubspot-sync renders in the affordance row. Documented in the PR.

### Module 4: warm-intro-panel (slot `detail.relationships`)

Component file: `Pathfinder/components/catalog/modules/WarmIntroPanel.tsx`. Default export matches `ModuleComponentProps`. Two layouts inside a `Card` shell:

- Inactive (pending) state. Rendered when soft gate `adjacency_graph` is unmet (current Internal state, per SPEC). `EmptyState` with eyebrow `WARM INTRO`, title "Cross-pollination pending", body explaining that adjacency seed data has not landed yet. No fake matches, no skeleton placeholders.
- Active state. Rendered when `adjacency_graph` has at least one match for this org. List of related companies grouped by relationship type (shared trade association, common customer, shared license region, etc). Each row: related-company link via `orgPaths.leadDetail(slug, id)`, relationship tag, one-line "why" via `WhyLine`. Build the layout now; activation requires no code change later because the same component handles both branches.

Soft-gate behavior. `adjacency_graph` resolving false today means the renderer mounts the module in `inactive` mode, since `fallback: 'inactive'`. My component uses `affordances` and `config` arguments to detect the mode (or, cleaner, the module reads whether the active payload is present from its own data hook and decides). For Stream C the module always renders its own card and chooses pending vs active based on whether it received any matches (data layer for this is a thin Supabase lookup against `pathfinder.adjacency_matches` or the equivalent; if no table exists yet we render pending unconditionally).

## Renderer wiring (route edit)

File: `Pathfinder/app/[slug]/leads/[projectId]/page.tsx`.

Pseudocode for the new branching:

```
const resolved = architecture.modules
  ? await resolveAllSlots({ org, architecture, gateContext: makeSupabaseGateContext(supabaseAdmin().from) })
  : null;

if (resolved && resolved['detail.body'].mode !== 'floor') {
  return <LeadDetailShell …><CatalogDetailRenderer lead={lead} resolved={resolved} org={…} architecture={…} /></LeadDetailShell>;
}

// Existing branches unchanged (Funder + the legacy Internal CompanyDetailContents).
```

The branching keys on `architecture.modules` presence + the body slot resolving non-floor. This guarantees:
- Zedcor, Realberry, Funder (no modules block): existing render path. No diff visible.
- Internal with a complete modules block: renderer mounts.
- Internal with a degraded modules block (e.g. `enriched_record` empty for a specific company): the body slot resolves `floor` and the route falls through to the existing `CompanyDetailContents`. No blank surface.

`CatalogDetailRenderer` is the small server component that takes the three relevant slot resolutions and mounts the resolved modules, passing the standard `ModuleComponentProps`. It does NOT touch the dashboard / pipeline slots; this is a detail-route surface only.

## Score-components reconciliation

The architecture defines weights and thresholds but no per-company score-component values are stored anywhere I can find. To honor the SPEC's revert trigger ("the score breakdown not reconciling to the total") I implement a deterministic derivation in `Pathfinder/lib/catalog/scoring/internalScoreComponents.ts`:

- For each of the six signals, derive a normalized contribution in `[0, 1]` from observable fields in `raw_payload` + `CompanyLeadView`:
  - `sales_motion_strength`: `active-outbound` → 1.0, `hiring-bd` → 0.7, `inbound-only` → 0.3, `unknown` → 0.0.
  - `operational_footprint`: count of `operating_states` mapped to `[0, 1]` (1 state → 0.25, 2-3 → 0.5, 4-6 → 0.75, 7+ → 1.0). HQ-only → 0.1.
  - `federal_signal`: `both` → 1.0, `federal-awardee` → 0.8, `sam-registered` → 0.5, `none`/null → 0.0.
  - `project_driven_fit`: SERVICE_CATEGORY mapped to a high/mid/low band reflecting project-driven revenue intensity.
  - `recency`: posted_date age in days, decayed.
  - `association_presence`: `min(1.0, associations.length / 3)`.
- Multiply each by its weight and report.
- The total of the six weighted contributions reconciles to a 0-100 score. To make this match the displayed `row.score` exactly, the helper accepts the displayed score and computes one calibration scalar applied to all six contributions: `contributions_i = raw_i * weight_i * (displayed_score / raw_total)` (when `raw_total > 0`). When `raw_total === 0` the helper renders six zero contributions and a one-line note "Score predates breakdown; six contributions cannot be derived."
- The breakdown is the most-honest reconstruction available given the data on hand. The math is documented inline and surfaced in a one-line note under the breakdown so the operator can read what they're looking at.

If Kyle wants stored-not-derived breakdown the right place is the ranker, which is out of scope; the helper interface is built so a future ranker upgrade swaps the derivation for a read of stored components without a UI change.

## Tests

`Pathfinder/__tests__/catalog/internalScoreComponents.test.ts`:
- For a representative Internal company (e.g. Thalle Construction Co Inc), the six derived contributions sum to exactly the displayed score.
- Edge cases: zero raw_total → six zeros and the note; null `posted_date` → recency 0; missing `associations` → association_presence 0; unknown `sales_motion` → 0.
- Snapshot of the SERVICE_CATEGORY → project_driven_fit mapping to make tuning changes visible in review.

`Pathfinder/__tests__/catalog/internalDetail.test.tsx` (RTL):
- Detail route renders for the Internal fixture (slug `internal`, a fixture company). Asserts:
  - Header shows the company name and the displayed score badge.
  - Score breakdown renders six rows whose values sum (via DOM text) to the displayed score.
  - At least one display_label (e.g. `Service category`) appears verbatim; no field key (e.g. `service_category`) leaks into rendered text.
  - Back-link target via `orgPaths.dashboard('internal')` is `/internal`.
- Gating matrix:
  - With `integrations: ['hubspot', 'slack', 'resend']` (Internal default): outreach Send button enabled; hubspot-sync affordance visible.
  - With `resend` removed: Send button disabled, reason text rendered.
  - With `hubspot` removed: hubspot-sync affordance not rendered.
  - With `adjacency_graph` data signal true: warm-intro active layout (rendered against a stub data hook).
  - With `adjacency_graph` empty: warm-intro pending layout.
- With `architecture.modules` absent (Funder fixture): the existing CompanyDetailContents path is rendered, no Stream C component mounts. Regression boundary.

`Pathfinder/__tests__/catalog/internalDetail-zedcor-untouched.test.ts`:
- Resolve `app/leads/[projectId]` (Zedcor route) data layer via a snapshot or rendered fragment, asserting it does not import any Stream C module. (Cheap implementation: a `grep` style assertion in a test that imports `LeadDetail.tsx` and verifies it does not transitively pull anything from `@/components/catalog/modules`.)

## Gate evidence checklist (run before opening PR)

- `pnpm install --frozen-lockfile` clean.
- `pnpm typecheck` clean.
- `pnpm lint` clean for staged files.
- `pnpm test` clean. Capture output verbatim for PR body.
- `pnpm build` clean. Capture output verbatim.
- Zedcor regression: load `app/leads/[projectId]` and `components/lead/LeadDetail.tsx`; confirm zero touched files in this branch's diff that are imported by them.
- `MEMORY/spec-references.md` entries appended for every new file under `lib/`.
- Pathfinder Vercel preview (post-push): green.
- No em-dashes or en-dashes anywhere in the diff (grep before commit).

## Open question for Kyle (non-blocking)

The score-components derivation strategy is the one operator-facing call I cannot infer from the SPEC alone. The SPEC requires the breakdown to reconcile to the displayed score, but per-signal components are not stored. The plan derives + calibrates from observable signals so the sum equals the total exactly, with a footer note explaining the derivation. If you want this stored at ranker-time instead, that is a backend change outside Stream C scope; flag and I will adjust the module to read stored components when they appear.

## Auto-revert posture (per launch prompt)

After PR merges and Vercel deploys:
- Watch Pathfinder Vercel deployment for green.
- Smoke-load `/pathfinder/internal/leads/<a real company id>` and confirm: score breakdown renders, six rows sum to displayed score, no raw schema keys appear, back-link returns to `/pathfinder/internal`.
- If the deploy fails OR the breakdown does not reconcile OR a raw key leaks: open a revert PR for the merge commit, move the four kanban cards to Bug Fixes with evidence.

Cards stay in Review until merge (operator-controlled), then move to Deployed on green Vercel. Never Verified.
