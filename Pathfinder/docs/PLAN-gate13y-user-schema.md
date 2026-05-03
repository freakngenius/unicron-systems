# PLAN — Gate 13Y-A — Multi-rep user + team schema (foundation)

Branch: `demo-polish-ux/gate13y-user-schema`
Base: `origin/main` `99d2e90`
Worktree: `Pathfinder-worktrees/gate13y-user-schema/`
Parent gate: 13Y — Per-rep ownership + assignment (5 sub-gates A–E)
Posture (operator-confirmed): all 5 sub-gates ship behind `MULTI_REP_ENABLED=0` default-off flag. Production render unchanged through Tuesday 2026-05-05 demo. Wednesday 2026-05-06 onward, flag flips to `1` and multi-rep UI surfaces.

---

## Goal

Land the schema and lazy-bootstrap user-resolution path so 13Y-B (deals.owner_user_id), 13Y-C (UI), 13Y-D (RLS scope), and 13Y-E (prod verification) each have a stable foundation. **No read-path coupling lights up unless the env flag flips.** Existing single-user basic-auth flow is bit-for-bit unchanged when flag off.

## Sub-gate scope (this gate is 13Y-A only)

**In scope (13Y-A):**
- Migration `0119_users_teams.sql` — `pathfinder.users`, `pathfinder.customer_orgs`, `pathfinder.deal_assignments`. Additive, idempotent.
- Backfill: one `customer_orgs` row `unicron-internal` + one `users` row `kyle@demystified.ai` mapped to it.
- Lazy bootstrap helper: `lib/auth/user-bootstrap.ts` — reads `OPERATOR_EMAILS` at request time, upserts `users` rows for any operator email not yet present. **Only invoked when `MULTI_REP_ENABLED=1`.** Flag-off path is the existing `getOperatorEmail()` only — no DB read added.
- Flag plumbing: `lib/feature-flags.ts` adds `multiRepEnabled()` reader of `process.env.MULTI_REP_ENABLED === '1'`.
- Type extensions in `lib/types.ts` for `User`, `CustomerOrg`, `DealAssignment`.
- Unit tests for the migration shape, the lazy-bootstrap upsert behavior, and idempotency.

**Out of scope (deferred to subsequent sub-gates):**
- `pathfinder.deals.owner_user_id` column (13Y-B, migration 0120)
- Assignment rules engine (`services/assignment/agent.ts`) — 13Y-B
- Lead-list Owner column + filter pills + reassign dropdown — 13Y-C
- `/pathfinder/settings/team` admin page — 13Y-C
- RLS scoping of lead-list query by `user_id` — 13Y-D
- Cross-tenant isolation production verification — 13Y-E

## Migration numbering coordination (operator-confirmed)

- `0116` reserved for HubSpot Gate 10C in flight (CC session)
- `0117_estimated_towers_columns.sql` already on origin/main
- `0118` reserved for Stream X reply detection (just merged elsewhere)
- **`0119` is this gate's** (users + customer_orgs + deal_assignments)
- `0120` reserved for 13Y-B (`deals.owner_user_id`)

I will not claim `0116` or `0118` even if I see numbering gaps.

## Schema — `0119_users_teams.sql`

```sql
-- 0119_users_teams.sql — Gate 13Y-A: multi-rep team foundation.
--
-- Three additive tables. No DROP, no destructive ALTER. All inserts use
-- ON CONFLICT DO NOTHING so the migration is idempotent against re-runs.
--
-- Coexistence with existing identity model:
--   - middleware.ts basic-auth + OPERATOR_EMAILS env list remains the
--     authoritative auth boundary. This migration adds shape, not gating.
--   - unicron.settings.operator_key (text) continues to identify the
--     current operator session for /settings.
--   - pathfinder.deals.owner_email (text, from migration 0050) continues
--     to be the live ownership signal until 13Y-B introduces owner_user_id.
--
-- The MULTI_REP_ENABLED env flag (read in app code, not in SQL) decides
-- whether the read paths join through these tables. When flag=0 the tables
-- exist but no production code path queries them.

create table if not exists pathfinder.customer_orgs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,                -- 'unicron-internal', 'zedcor', etc.
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists pathfinder.users (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique,
  name              text,
  customer_org_id   uuid not null references pathfinder.customer_orgs(id) on delete restrict,
  role              text not null check (role in ('admin','rep','viewer')),
  branches          text[] not null default '{}',  -- branch_id list (matches pathfinder.branches.id text shape)
  created_at        timestamptz not null default now(),
  last_active_at    timestamptz
);

create index if not exists users_org_idx on pathfinder.users(customer_org_id);
create index if not exists users_email_idx on pathfinder.users(lower(email));

create table if not exists pathfinder.deal_assignments (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references pathfinder.deals(id) on delete cascade,
  user_id       uuid not null references pathfinder.users(id) on delete cascade,
  assigned_at   timestamptz not null default now(),
  assigned_by   uuid references pathfinder.users(id) on delete set null,
  status        text not null check (status in ('active','transferred','revoked'))
);

create index if not exists deal_assignments_deal_idx on pathfinder.deal_assignments(deal_id, assigned_at desc);
create index if not exists deal_assignments_user_idx on pathfinder.deal_assignments(user_id, assigned_at desc);

-- Backfill: unicron-internal org + kyle@demystified.ai admin row.
-- Idempotent via ON CONFLICT DO NOTHING on natural keys.

insert into pathfinder.customer_orgs (slug, name)
values ('unicron-internal', 'Unicron Internal')
on conflict (slug) do nothing;

insert into pathfinder.users (email, name, customer_org_id, role)
select 'kyle@demystified.ai', 'Kyle Kesterson', co.id, 'admin'
from pathfinder.customer_orgs co
where co.slug = 'unicron-internal'
on conflict (email) do nothing;

-- RLS — match the deals/deal_activities pattern (anon read, service-role write).
alter table pathfinder.customer_orgs enable row level security;
alter table pathfinder.users enable row level security;
alter table pathfinder.deal_assignments enable row level security;

create policy customer_orgs_read on pathfinder.customer_orgs for select
  to anon, authenticated using (true);
create policy customer_orgs_write on pathfinder.customer_orgs for all
  to service_role using (true) with check (true);

create policy users_read on pathfinder.users for select
  to anon, authenticated using (true);
create policy users_write on pathfinder.users for all
  to service_role using (true) with check (true);

create policy deal_assignments_read on pathfinder.deal_assignments for select
  to anon, authenticated using (true);
create policy deal_assignments_write on pathfinder.deal_assignments for all
  to service_role using (true) with check (true);
```

**FK policy rationale (operator-confirmed):**
- `deal_assignments.deal_id ON DELETE CASCADE` — matches existing `deal_activities.deal_id` policy in 0050.
- `deal_assignments.user_id ON DELETE CASCADE` — assignment loses meaning if user is removed; no orphan signal.
- `deal_assignments.assigned_by ON DELETE SET NULL` — preserve audit-trail row when the assigning admin is deleted.
- `users.customer_org_id ON DELETE RESTRICT` — prevent accidentally deleting an org with users.
- 13Y-B will add `deals.owner_user_id ON DELETE SET NULL` (operator confirmed: don't lose deals when user removed).

**Idempotency proof (must be in test):**
- Run migration twice. Row counts unchanged on second run. No errors.
- Insert a duplicate `users.email` manually; migration's `ON CONFLICT (email) DO NOTHING` does not error.

## File scope

**New:**
- `Pathfinder/supabase/migrations/0119_users_teams.sql` — schema + backfill + RLS as above
- `Pathfinder/lib/auth/user-bootstrap.ts` — `resolveUserId(req): Promise<{ id: string; orgId: string; role: 'admin'|'rep'|'viewer' } | null>` and `lazyUpsertOperators()` — only path-active when flag on
- `Pathfinder/lib/feature-flags.ts` — extend with `multiRepEnabled(): boolean` (or new file if not present; check before write)
- `Pathfinder/tests/gate13y-user-schema.test.ts` — migration shape, idempotency, lazy-bootstrap upsert correctness

**Modified (additive only — flag-off behavior identical to today):**
- `Pathfinder/lib/types.ts` — add `User`, `CustomerOrg`, `DealAssignment` interfaces
- `Pathfinder/lib/connectors/auth.ts` — comment-only update on `getCurrentUserId()` noting the future-uuid replacement now exists. **No code change to `getCurrentUserId()` in 13Y-A.** That's 13Y-D's swap.

**Untouched:**
- `Pathfinder/middleware.ts` — basic-auth boundary stays exactly as today
- `Pathfinder/app/api/me/route.ts` — operator-allowlist check unchanged
- All existing settings + connectors UI

## Implementation tasks

1. Verify `lib/feature-flags.ts` exists or pick the right home (pattern likely already used by `LEAD_DETAIL_REDESIGN`); add `multiRepEnabled()`.
2. Write `0119_users_teams.sql`.
3. Add `User`, `CustomerOrg`, `DealAssignment` to `lib/types.ts`.
4. Implement `lib/auth/user-bootstrap.ts`:
   - `resolveUserId(req)` — flag-off → return null (callers fall back to `getCurrentUserId()`); flag-on → look up `users.email = getOperatorEmail(req)`, lazy-upsert (mapped to `unicron-internal` org with role `'admin'` for any address in `OPERATOR_EMAILS`) if absent, return `{ id, orgId, role }`
   - `lazyUpsertOperators()` — internal, called from `resolveUserId` on cache miss; uses service-role Supabase client
5. Tests (`tests/gate13y-user-schema.test.ts`):
   - Migration produces expected three tables with expected columns and constraints (introspect via information_schema)
   - Re-running migration leaves row counts unchanged (idempotency)
   - `resolveUserId` returns null when flag off
   - `resolveUserId` upserts a missing operator row when flag on, returns the bootstrapped row's id
   - Lazy upsert is idempotent — calling twice yields one row
   - Cross-tenant guard: querying `users` filtered by a non-`unicron-internal` org returns no rows after backfill
6. Verification commands:
   - `pnpm typecheck` → 0 errors
   - `pnpm lint` → 0 warnings
   - `pnpm test` → ≥ 1043 passed (live-status doc baseline; will be higher after recent gates land — re-floor to whatever `origin/main` currently shows when I rebase before running)
7. **Do NOT apply migration to live Supabase in 13Y-A.** Schema lands in the PR; live apply happens in a single coordinated apply at the start of 13Y-B (so 0119 + 0120 hit live in correct order). Wake operator before live apply.

## Hard constraints (operator-confirmed)

- Schema additive only. No DROP, no destructive ALTER.
- Auth boundary relaxation knowingly accepted for stream Y (this gate adds shape; existing basic-auth + middleware untouched).
- Houston flagship preserved.
- Cross-pollination 12-match render preserved.
- agent_runs writes untouched.
- Test baseline ≥ current `origin/main` floor (no regression).
- HubSpot scope unchanged.
- 13Y-specific:
  - **RLS verification matrix** — defined here, executed in 13Y-D: per-route × per-role (admin/rep/viewer) × per-org (≥2 orgs) × 4 filter pills (My/Team/Unassigned/All). User in org A must never see org B data.
  - **FK policies** — `deal_assignments.deal_id ON DELETE CASCADE`, `deal_assignments.user_id ON DELETE CASCADE`, `deal_assignments.assigned_by ON DELETE SET NULL`, `users.customer_org_id ON DELETE RESTRICT`. 13Y-B will add `deals.owner_user_id ON DELETE SET NULL`.
  - **Backfill idempotency** — re-running migration must not duplicate `customer_orgs` (`slug` unique), `users` (`email` unique), or assignments. Asserted in tests.

## Hard halts

- Migration fails idempotency test → block merge
- Lazy-bootstrap test fails to isolate orgs → block merge (re-test before 13Y-D)
- Test count regresses below `origin/main` floor → block merge
- Anything in `getCurrentUserId()` / `middleware.ts` / `app/api/me/route.ts` shows a flag-off behavior delta → block merge (flag-off path must be byte-identical to today)
- `MULTI_REP_ENABLED` env not yet documented in operator runbook → file todo before merge

## Coordination flags for operator

1. **Live migration apply timing** — defer `apply_migration` for 0119 until 13Y-B is merge-ready, so 0119 + 0120 apply together. Will surface again in the 13Y-B PR body.
2. **`MULTI_REP_ENABLED` Vercel env var** — needs to be added to Pathfinder Production with value `0` *before* the PR merges (otherwise the flag reader returns `false` from undefined, which is correct but undocumented). Will file an operator-todo card.
3. **Backfill scope for additional operators** — if `OPERATOR_EMAILS` env contains more than `kyle@demystified.ai` at the moment 13Y-B/C land, lazy-bootstrap will create rows on first authed request (flag-on). No second migration needed. Surface this in 13Y-E verification.

## PR body checklist (when ready)

- [ ] Migration 0119 lints (`supabase db lint`) clean — captured output
- [ ] All three tables exist with documented FK policies — `\d+` output captured
- [ ] Idempotency test green — second `apply_migration` is a no-op against live DB (will run in 13Y-B coordinated apply)
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` outputs captured in PR body
- [ ] Flag-off path screenshotted: `/pathfinder` and `/pathfinder/settings` render identically to current production (no Owner column, no team page, basic-auth header unchanged)
- [ ] Operator-todo card filed for `MULTI_REP_ENABLED=0` Vercel env addition
- [ ] Operator-todo card filed for coordinated 0119+0120 live apply at start of 13Y-B

## Open questions before code

None — all answers captured from operator's four-point response. Awaiting confirm on this plan before implementing.
