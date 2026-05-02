# 2026-05-02 — Pathfinder needs `pathfinder.agent_verifications` (Living System bridge)

Coordination request from the Metacron chat to the Pathfinder chat.

## Why

`SPEC - Agent Console (Metacron).md` § 6 + § 7 describe the Living System bridge: when an operator clicks Verify in Metacron, a row is written to `pathfinder.agent_verifications`. Pathfinder's customer-facing UI subscribes via Supabase Realtime to surface the verification (activity ticker, attribution badge, "verified by Architect's tuning, last updated …" caption).

Phase 0.5 (Metacron) shipped the `unicron.*` half — `unicron.agent_dispatches` and `unicron.agent_dispatch_events` exist in production, with full RLS and Realtime publication membership. The cross-schema FK `unicron.agent_dispatches.agent_run_id → pathfinder.agent_runs(id)` is live (with `ON DELETE SET NULL` so Pathfinder cleanup of old runs never blocks on dispatch references).

What's missing is the table on the Pathfinder side that the Metacron Verify path will write to. Until that ships, Phase 1 streams (Coverage Expansion, Source Onboarder, Architect, Cross-Pollination) will mark dispatches as `verified` in `unicron.agent_dispatches.status`, but no row will land in Pathfinder's customer-facing schema and the ticker won't fire.

## What needs to happen on the Pathfinder side

Create `pathfinder.agent_verifications` per `SPEC - Agent Console (Metacron).md` § 8. Verbatim SQL from the spec, ready to drop into a new migration (next free number on `Pathfinder/supabase/migrations/`):

```sql
create table pathfinder.agent_verifications (
  id                    uuid primary key default gen_random_uuid(),
  dispatch_id           uuid not null,
  customer_org_id       text not null,
  agent_name            text not null,
  affected_entity_type  text,
  affected_entity_id    uuid,
  verified_by_user_id   uuid references auth.users(id),
  verified_at           timestamptz not null default now(),
  summary               text
);
```

Recommended additions when Pathfinder picks this up — none of these are spec drift, just operational hygiene:

- Index `agent_verifications_dispatch_idx` on `(dispatch_id)` for the cross-schema lookup from Metacron Verify path.
- Index `agent_verifications_org_recent_idx` on `(customer_org_id, verified_at desc)` for the customer activity ticker query.
- Cross-schema FK back to `unicron.agent_dispatches(id)` is intentionally NOT requested — Pathfinder owns its schema and Metacron's table existence is implementation-detail for Pathfinder. `dispatch_id uuid not null` without FK is fine; integrity is enforced by the application layer (Verify path inserts both rows in the same transaction).
- RLS: customer-org-scoped read (mirror the pattern in `pathfinder.lead_feedback`, which uses `current_setting('request.jwt.claims', true)::jsonb->>'org_id'`). Service-role write only — Metacron's authenticated operators never write directly to `pathfinder.*`; the dispatch backend writes via service role.
- Add to `supabase_realtime` publication so Pathfinder's customer-facing UI can `supabase.channel('verifications:<org>').on('postgres_changes', { schema: 'pathfinder', table: 'agent_verifications', filter: 'customer_org_id=eq.<org>' }, ...)`.

## Phase 1F downstream surface (Pathfinder customer UI)

After the migration lands, Pathfinder customer UI should ship:

1. **Activity ticker** — anonymized verified-dispatch summaries: "Coverage Expansion just added 3 new sources for your region…". Subscribed to via Realtime; falls back to a 10s polling cycle on disconnect.
2. **Attribution badge per lead/source/etc.** — when an entity has a recent `agent_verifications` row, surface "verified by <agent_name> on <verified_at.toLocaleDateString()>" under it. Operator-curated badge distinct from auto-generated content.

Neither the ticker nor the badge requires changes to Metacron — the contract is one-directional (Metacron writes, Pathfinder reads).

## Coordination protocol

- Pathfinder chat owns the migration and the customer-facing ticker/badge UI.
- Metacron chat will wire the Verify-path INSERT into `pathfinder.agent_verifications` once the table exists. Metacron's PR for that wiring will land AFTER Pathfinder's migration.
- If Pathfinder wants different column shapes than SPEC §8 (e.g. polymorphic affected_entity instead of `affected_entity_type` + `affected_entity_id`), surface back via this todo before merging — Metacron's Verify-path code is a small surface and will adapt.

## State at handoff (verifiable)

- `unicron.agent_dispatches` and `unicron.agent_dispatch_events` exist in production Supabase (`anfihcusvekpovcchpoh`) with RLS, indexes, and Realtime publication membership confirmed via `pg_publication_tables`.
- Metacron live Realtime smoke (`unicron-platform/scripts/realtime-smoke.mjs`) PASS at 1063ms event delivery.
- Reference to the Phase 0.5 PR will land in this todo as a final line once the PR opens.

## Priority

This is a Phase 1F prerequisite, not a Phase 1 prerequisite. Phase 1 streams can ship Metacron-side modal + dispatch + verify against `unicron.agent_dispatches` alone; the customer-facing ticker activates once Pathfinder ships this migration. Park for after Tuesday demo if the demo doesn't depend on it; bring forward if Houston demo wants the live "Pathfinder activity ticker" moment per SPEC §12.
