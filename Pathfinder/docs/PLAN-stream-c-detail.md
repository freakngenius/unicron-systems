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
5. `Pathfinder/lib/catalog/internalSignals.ts` — extracts the per-signal evidence strings (NOT numeric contributions) from `CompanyLeadView` + `raw_payload`. Pure function used by `CompanyDetail.tsx`.
6. `Pathfinder/components/catalog/CatalogDetailRenderer.tsx` — server component that calls `resolveAllSlots` and renders the three detail slots (`detail.body`, `detail.outreach`, `detail.relationships`). Pure orchestration.
7. Tests: `Pathfinder/__tests__/catalog/internalDetail.test.tsx`, `Pathfinder/__tests__/catalog/internalSignals.test.ts`.

Stream C edits these files:
- `Pathfinder/lib/catalog/floor-stubs.tsx`. Replace the four loader thunks for `company-detail`, `outreach-composer`, `hubspot-sync`, `warm-intro-panel`. Keep the other seven stubs intact. The file's intent is exactly this swap; Stream A's comments call it out.
- `Pathfinder/lib/catalog/registry.ts`. Remove `score_components` from `company-detail`'s dependencies per the updated SPEC's SCORE-COMPONENTS NOTE. Single-line change; everything else in the file is unchanged.
- `Pathfinder/app/[slug]/leads/[projectId]/page.tsx`. Add catalog branching: when `architecture.modules` is present, mount the catalog renderer instead of `<CompanyDetailContents>`. For every other org (no modules block, e.g. Zedcor, Realberry, Funder) the existing path runs unchanged.
- `MEMORY/spec-references.md`. Append entries for new `lib/` files Stream C adds (per repo CI convention).

Stream C does NOT touch:
- `lib/catalog/types.ts`, `lib/catalog/renderer.ts`, `lib/catalog/gating.ts`, `lib/catalog/validation.ts`, `lib/catalog/index.ts`. These are Stream A's contracts. (Registry is touched for the one-line score_components removal per the updated SPEC.)
- `components/design/*`. Imports only.
- `components/lead/CompanyDetailContents.tsx`, `components/lead/LeadDetail.tsx`, `components/lead/LeadDetailShell.tsx`, `components/lead/FunderDetailContents.tsx`. These are Zedcor / Funder / pre-catalog Internal surfaces. Keeping them untouched is what guarantees no regression.
- The dashboard route, the pipeline route, the digest cron. Stream B and D scope.
- Any backend, migration, schema, or Inngest file. Stream C is presentation-only.

## Module-by-module design

### Module 1: company-detail (slot `detail.body`)

Component file: `Pathfinder/components/catalog/modules/CompanyDetail.tsx`. Default export matches `ModuleComponentProps`. Sections, top to bottom, in a vertical stack of `Card` shells with `SectionHeader`s:

1. Header. Company name (font `xl`, semi), `ScoreBadge` top-right with `label` true (the real total score, prominently). Below: `WhyLine` accent tone summarizing rationale in one sentence (truncated if needed). Mono eyebrow shows source + posted-date.
2. Signals panel (the SPEC's qualitative replacement for a numeric breakdown). Six rows, one per weighted signal. Each row: label (e.g. "Federal signal"), mono weight badge (e.g. "15%"), and a `WhyLine` summarizing the real stored evidence that fired the signal (e.g. "SAM registered, federal awardee"). When a signal has no evidence in this company's data, the row reads its evidence cell as a soft empty marker (`-`) rather than fabricating a value. NEVER displays a derived or calibrated numeric contribution. Documented inline.
3. Rationale. Prose with preserved line breaks. `EmptyState` when missing.
4. Qualifying signals. Bullet list of concrete evidence pulled from raw_payload (sales-team postings, federal awardee, association memberships, footprint breadth). `EmptyState` when none surfaced.
5. Enriched data. Two-column key-value grid: Service category, Sales motion, Operating footprint, Headquarters, Contractor licensure, Federal registration, Size, Trade associations, Website (linked), LinkedIn (linked). Each label is the architecture `display_label`, never the field key. Missing fields are dropped, not zero-padded.
6. Sources. List of per-company source records (id, type, posted_date, url if any). `EmptyState` when absent (soft gate).
7. Timeline. Chronological list of activity events on this company (verified-at, enriched-at, scored-at, outreach-sent). Pulled from the row's timestamp columns plus `raw_payload.internal_timeline` if present. `EmptyState` when none.

Hard gating note. Per the updated SPEC, `company-detail`'s only hard dep is `enriched_record` (the `score_components` hard dep is dropped). `enriched_record` resolves true when `raw_payload.internal_enrichment` is non-null and non-empty. When unmet the slot falls back to floor.

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

## Signals panel (qualitative, no derivation)

Per the updated SPEC's SCORE-COMPONENTS NOTE (b72f4eb): "Do NOT fabricate them or apply a calibration scalar. company-detail renders the six signals qualitatively: each signal with its architecture weight and the real stored evidence that fired it, plus the real total score prominently. No fabricated point contributions, so there is nothing to reconcile."

`Pathfinder/lib/catalog/internalSignals.ts` exports a pure helper `extractInternalSignals(lead, raw_payload)` that returns one entry per weighted signal with the architecture weight and a short evidence string. NO numeric contribution. Examples (subject to refinement during implementation against real fixture data):

- `sales_motion_strength` (weight 25%): evidence is the `lead.sales_motion` display label and, when present, the qualifier hint (`raw_payload.internal_sales_motion_signal`). When neither is present, evidence is empty.
- `operational_footprint` (weight 20%): evidence is the count and list of `operating_states` from `raw_payload.internal_geo`. When only HQ is known, evidence is the HQ state. When neither, empty.
- `federal_signal` (weight 15%): evidence is the `lead.federal_registration` display label. When `none` or null, empty.
- `project_driven_fit` (weight 15%): evidence is the `lead.service_category` display label and, when present, the qualifier hint (`raw_payload.internal_inferred_service_category`).
- `recency` (weight 15%): evidence is the formatted `posted_date` (e.g. "Posted 2026-05-22"). When null, empty.
- `association_presence` (weight 10%): evidence is the count and first two `lead.associations` (e.g. "2 memberships: ABC, AGC"). When empty, empty.

The component renders the six rows in weight-descending order. The signals panel is descriptive of what the ranker considered, not a re-derivation of how it scored. The real total score is shown in the header `ScoreBadge` with `label` true so the operator never has to do arithmetic.

This is the most-honest surface we can build given persisted-data on hand. Switching to a stored breakdown later is a ranker change that swaps `internalSignals.ts`'s implementation without changing the consumer.

## Tests

`Pathfinder/__tests__/catalog/internalSignals.test.ts`:
- For a representative Internal company fixture: extractInternalSignals returns exactly six entries in weight-descending order with correct weight percentages and the expected evidence strings drawn from observable fields.
- No entry exposes a numeric contribution field.
- Edge cases: null `posted_date` → recency evidence empty; missing `associations` → association_presence evidence empty; unknown `sales_motion` → sales_motion evidence empty; missing `internal_geo` → footprint evidence empty.
- Snapshot test to catch unintended evidence-string changes during review.

`Pathfinder/__tests__/catalog/internalDetail.test.tsx` (RTL):
- Detail route renders for the Internal fixture (slug `internal`, a fixture company). Asserts:
  - Header shows the company name and the displayed score badge.
  - Signals panel renders six rows in weight-descending order, each with a weight badge (e.g. "25%", "20%", ...).
  - No fabricated point contribution appears anywhere in the DOM (assert via querying for forbidden patterns like calibration text or numeric contribution columns).
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

## Auto-merge + auto-revert posture (per updated SPEC)

Operator-authorized self-merge for this batch (SPEC b72f4eb AUTHORITY block). When the gate passes I merge directly to main.

After merge + Vercel deploy:
- Watch Pathfinder Vercel deployment for green.
- Smoke-load `/pathfinder/internal/leads/<a real company id>` and confirm: signals panel renders six rows with weights and evidence, no fabricated point contributions appear, no raw schema keys appear, back-link returns to `/pathfinder/internal`.
- If the deploy fails OR a fabricated contribution leaks OR a raw key leaks OR Zedcor / Realberry / Funder are visibly changed: `git revert` the merge commit (never destructive reset), push, move the four kanban cards to Bug Fixes with evidence.

Cards move to Deployed on green merge + green Vercel. Never Verified.
