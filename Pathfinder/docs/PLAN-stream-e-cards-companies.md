# PLAN: Stream E, Cards and Companies (Internal rework V2)

Branch: stream-e-cards-companies
SPEC authority: docs/SPEC-Internal-Parallel-Build.md (SHARED section verbatim
matches the launch-prompt non-negotiables; SPEC-Internal-Rework-V2.md was not
present in the repo at session start, so the SHARED section of the parallel
build SPEC governs and the launch prompt body is the STREAM E body).

Pre-approved per the SHARED PLAN-GATE: write this PLAN for the record, then
proceed directly to code.

## Defect (confirmed against production DB)

`pathfinder.organizations` where slug='internal' has:
- lead_unit.name = 'company', lead_unit.schema with display_label set for every
  schema key (company_name -> "Company", service_category -> "Service category",
  footprint -> "Operating footprint", sales_motion -> "Sales motion",
  score -> "Score", etc.)
- ui_plan.lead_card_layout.primary_fields = ["company_name", "service_category",
  "footprint", "sales_motion", "score"]
- ui_plan.lead_card_layout.secondary_fields = ["hq_location", "licensure",
  "federal_registration", "association_memberships", "source"]

But `app/[slug]/leads/page.tsx` projects every row through
`projectFunderLead(r)`, returning a Funder shape (id, title, score, verified,
raise_target, thesis_area, ...) that has none of the Internal schema keys.

`components/LeadCard.tsx` then renders each `field` directly inside a span with
`textTransform: 'uppercase'`, producing labels like "COMPANY_NAME", and reads
`lead[field]` which is undefined, producing the em-dash placeholder. Only
`score` resolves because both projections set it.

Zedcor (slug='zedcor') has lead_card_layout = null, never reaches this code.
Funder (slug='funder') has its own funder-shaped primary_fields that match its
projection. Realberry has no architecture row that uses this surface.

## Fix, additive and Internal-scoped

### Change 1: `components/LeadCard.tsx`

Add two optional props:
- `schema?: LeadUnitSchema` (the architecture lead_unit.schema map)
- `placeholder?: string` (default keeps the existing em-dash for byte-identical
  Funder rendering; Internal passes "-")

When `schema` is provided:
- The primary/secondary label renders `displayLabel(schema, field)` instead of
  the raw key (so "Company" not "COMPANY_NAME") and the CSS removes the
  uppercase transform on the label (a labeled display_label like "Service
  category" must not be mangled to "SERVICE CATEGORY").
- The placeholder for missing values uses the `placeholder` prop (default em
  dash for callers that do not pass schema, "-" for Internal).

When `schema` is absent (Funder, every other org): identical output to today,
byte-for-byte. The Funder regression vector is the only thing the AUTO-MERGE
gate cares about here.

Reuse `displayLabel` and `LeadUnitSchema` from
`lib/catalog/modules/ranked-feed/labels.ts` (the Stream B chokepoint already
established for this exact translation).

### Change 2: `app/[slug]/leads/page.tsx`

Add an Internal branch keyed on `architecture.lead_unit?.name === 'company'`
(the existing mechanism documented in
`lib/agents/internal/companyLeadView.ts`):

- Internal branch: map rows via `projectToCompanyLeadView`, sort by the chosen
  sort key (see Change 3), render via `LeadCardList` with `schema` and
  `placeholder="-"`.
- Non-Internal branch (existing path): unchanged. Funder still uses
  `projectFunderLead`, still renders byte-identical LeadCard markup with raw
  keys (Funder's keys read as words anyway: org_name, thesis_area, ...).

### Change 3: Sort controls on the Companies route

Sort options per the launch prompt:
- score-desc (default): score descending, nulls last; verified first as a
  pre-sort tiebreaker so the existing verified-first floor behavior is
  preserved
- name: company_name (Internal) / title (Funder) ascending, case-insensitive
- category: service_category display label ascending
- recent: posted_date / created_at descending, nulls last

URL param: `?sort=score|name|category|recent`. Default value is `score`. A
client component renders the four-option control as a row of radio-style
buttons styled with the Stream A design primitives (Card, design tokens).
Implementation lives at
`components/internal/CompaniesSortControl.tsx` (NEW file, Internal-scoped).

The sort runs server-side in `OrgLeadsPage` after the projection so labels
sort by the humanized text the user sees, not the slug.

### Change 4: Strip em-dash and en-dash from the Internal path

`components/LeadCard.tsx` currently has a single em-dash literal as the empty
placeholder. The launch prompt forbids em-dashes in new code. The Internal
path will use ASCII "-"; the Funder default path keeps the em-dash so Funder
stays byte-identical.

No other file gains an em-dash.

## File scope (final)

NEW:
- `components/internal/CompaniesSortControl.tsx` (client component, sort UI)
- `lib/agents/internal/sortCompanies.ts` (server-side sort helper, pure)
- `__tests__/agents/internal/sortCompanies.test.ts`
- `__tests__/components/LeadCard-internal.test.tsx`

EDITED:
- `components/LeadCard.tsx` (additive: new optional props, branch on schema
  prop, Funder path byte-identical)
- `app/[slug]/leads/page.tsx` (Internal branch on lead_unit.name='company';
  read ?sort; project + sort + render with schema)
- `docs/PLAN-stream-e-cards-companies.md` (this file)
- `MEMORY/spec-references.md` (per CLAUDE.md, lib/ entry for the new
  `lib/agents/internal/sortCompanies.ts`)

UNTOUCHED:
- `lib/agents/funder/leadView.ts`
- `app/[slug]/page.tsx` (dashboard already routes Internal to InternalDashboard
  per Stream B; floor LeadCardList path stays byte-identical for Funder)
- `app/[slug]/pipeline/page.tsx` (Stream D scope)
- Every Zedcor / Realberry / Funder file
- `supabase/migrations/*` (no schema or data changes)

## Tests

1. `__tests__/components/LeadCard.test.tsx` (EXISTING) keeps passing
   unchanged. Proves Funder backward compat at the component layer.
2. `__tests__/components/LeadCard-internal.test.tsx` (NEW):
   - With Internal schema + lowercase primary_fields, labels render
     "Company", "Service category", "Operating footprint", "Sales motion"
     (display_labels), NOT "COMPANY_NAME" or "company_name".
   - With Internal-projected lead values, the value cells render the real
     strings ("Thalle Construction", "Equipment rental", "HQ TX ops TX / OK /
     NM", "Active outbound", 55), not "-" placeholders.
   - With schema present and a null field, the placeholder is "-", not the em
     dash.
3. `__tests__/agents/internal/sortCompanies.test.ts` (NEW):
   - score-desc: rows in descending score, nulls last, verified breaks ties.
   - name: ascending case-insensitive by company_name.
   - category: ascending by service_category display label.
   - recent: descending by posted_date, nulls last.

## Gate evidence checklist (AUTO-MERGE GATE)

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck` (or `tsc --noEmit`)
- [ ] `pnpm test` (existing + new tests green)
- [ ] `pnpm tsx scripts/verify-orgs-byte-unchanged.ts` (Internal block intact,
      zedcor/realberry/funder have no modules key)
- [ ] DB diff: only the architecture rows for Internal carry modules; no rows
      for zedcor/realberry/funder are modified by this PR (no migration).
- [ ] Pathfinder Vercel preview green for the branch.
- [ ] LIVE-VERIFICATION on the preview URL of internal.unicron.systems
      Companies route: cards show real labels and values (no raw keys, no
      blanks), sort controls flip the order.

## Auto-revert triggers

- Any Pathfinder deploy failure post-merge.
- Any change to Zedcor / Realberry / Funder rendering byte-output.
- Any em-dash or en-dash in the diff (search the diff before merge).

## Hard-halt conditions

- Destructive git event.
- Backend or schema change beyond what this stream allows (this stream
  declares no schema or data change).
- Unresolved failing test after honest iteration.
