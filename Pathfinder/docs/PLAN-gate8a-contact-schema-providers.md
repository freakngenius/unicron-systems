# PLAN — Gate 8A: Contact Enrichment schema + provider abstraction + role classification

Branch: `demo-polish-ux/gate8a-contact-schema-providers`
Spec: `Company Docs/Specs/SPEC - Contact Enrichment.md`
Base: `origin/main` at `13427ad` (Gate 7B merged).

## Goal

Land the data + interface layer for the Contact Enrichment Engine. Schema, provider interface contract, and deterministic role → decision-authority classification. No live provider calls in this gate; that lands in 8B.

## Scope (files in/out)

In:
- `Pathfinder/supabase/migrations/0112_lead_contacts.sql` — new table + additive `provider` column on `llm_calls`.
- `Pathfinder/services/contact-enricher/providers/types.ts` — `ContactEnricher` interface, `EnrichedContact`, `EnrichRequest`.
- `Pathfinder/lib/contacts/role-classification.ts` — pure function role + owner_type → `decision_authority` + `seniority`.
- `Pathfinder/tests/contact-enricher-types.test.ts` — interface contract sanity (compile-time + tiny runtime).
- `Pathfinder/tests/role-classification.test.ts` — covers all 5 owner-type role mappings.

Out (later gates):
- Provider implementations (8B).
- Cron, on-demand API (8B).
- UI (8C).
- Production rollout (8D).

## Spec deviations

1. **`project_id` column type is `text`, not `uuid`.** `pathfinder.projects.id` is text in the live schema (`sam.gov:...`, `usaspending:...` slugs). FK target dictates shape. Documented inline in the migration.

2. **`llm_calls.provider` column added in this migration.** Spec calls for cost telemetry rows with `provider` set (`clay` / `apollo` / `hunter`). The column did not exist previously — added as `text null` (additive, idempotent). Existing rows have `provider = null` which is correct (legacy LLM-only telemetry).

3. **Existing empty `pathfinder.project_contacts` table is left untouched.** Different schema (no decision_authority, no email_status enum), 0 rows, RLS off — looks like unfinished prior work. Scope discipline says don't touch it; the new `lead_contacts` is the spec'd target.

## Risks

- Migration apply: Supabase MCP `apply_migration` against live DB. Additive only (every `create` and `add column` is `if not exists`). Re-runnable. Hard halt if Postgres rejects.
- Interface drift between 8A and 8B: providers must conform to 8A's `ContactEnricher` interface. Lock the contract in 8A; tests in 8B re-use the type.

## Validation

- `pnpm typecheck` clean.
- `pnpm lint` clean.
- `pnpm test` ≥ existing baseline + new tests pass.
- Migration applied to live Supabase via MCP; `select count(*) from pathfinder.lead_contacts` returns `0`; new column visible on `pathfinder.llm_calls`.

## Auto-merge gate criteria (per Gate 8 prompt)

- Schema diff in PR body.
- Role classification table dump (matrix of role × owner_type → decision_authority).
- All standard checks green.
