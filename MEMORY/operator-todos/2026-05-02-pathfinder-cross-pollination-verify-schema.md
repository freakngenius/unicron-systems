# 2026-05-02 — Pathfinder cross-pollination verify schema additions

Discovered during Phase 1 / Stream M5 (Cross-Pollination Modal) build. The M5 prompt assumed `pathfinder.cross_pollination_matches` with `verified_by_user_id` / `verified_at` / `manual` columns. Reality (verified via `Pathfinder/supabase/migrations/0101_zedcor_cross_pollination.sql`):

- Actual table is **`pathfinder.lead_cross_pollination`** (not `cross_pollination_matches`).
- Schema has 16 columns covering match metadata (lead_id, customer_canonical, match_layer, match_confidence, branch_count, etc.) but **no operator-verification columns**.
- RLS: anon/authenticated have SELECT, only service-role has INSERT/UPDATE.
- Cross-pollination is cron-driven (`Pathfinder/lib/cross-pollination/engine.ts`). No HTTP dispatch endpoint exists.

## What M5 shipped

Review-only mode. Operator can:
- Query `pathfinder.lead_cross_pollination` for a lead ID or batch.
- See the matches sorted by confidence with the ambiguous band (0.7–0.9) highlighted.
- "Verify" a match — writes to `unicron.agent_dispatches` only (no Pathfinder mutation). Records the operator's decision in the metacron audit trail; doesn't yet feed back to Pathfinder.
- "Add manual match" button is rendered but disabled with a tooltip pointing at this operator-todo.

## What needs to happen (Pathfinder territory — out of scope for any Metacron stream)

Add four columns to `pathfinder.lead_cross_pollination`:

```sql
alter table pathfinder.lead_cross_pollination
  add column if not exists verified_by_user_id uuid references auth.users(id),
  add column if not exists verified_at timestamptz,
  add column if not exists rejected_by_user_id uuid references auth.users(id),
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists manual boolean not null default false;

-- RLS: allow authenticated UPDATE to verified_/rejected_ columns only.
create policy lead_cross_pollination_verify
  on pathfinder.lead_cross_pollination
  for update to authenticated
  using (true)
  with check (true);
```

Once those land, M5 modal flips a feature flag (`VITE_CROSS_POLL_VERIFY_ENABLED=true`) and the Verify button writes to both `unicron.agent_dispatches` AND `pathfinder.lead_cross_pollination` (the latter via authenticated client, not service-role). Manual match form similarly enables.

## Optional: HTTP dispatch endpoint

If Pathfinder ships `POST /api/cross-pollination/run?lead_id=…` (re-runs the engine for a single lead or batch), M5 modal can flip from review-only to on-demand dispatch. Not blocking; cron-driven coverage is the steady-state path.

## Acceptance for closing this todo

- Schema migration applied to live Supabase.
- M5 Verify button writes a row to `pathfinder.lead_cross_pollination` (and the existing `unicron.agent_dispatches` row).
- M5 manual-match form re-enabled and writes a `manual=true` row.
- `MEMORY/audit-unicron-platform.md` updated with the new Stream C↔E cross-pollination contract section.
