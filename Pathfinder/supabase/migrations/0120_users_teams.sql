-- 0120_users_teams.sql — Gate 13Y-A: multi-rep team foundation.
--
-- Three additive tables (customer_orgs, users, deal_assignments) plus
-- a single backfill row for kyle@demystified.ai under a 'unicron-internal'
-- org. Every statement is idempotent: re-running this migration leaves
-- row counts unchanged.
--
-- Coexistence with the existing identity model:
--   - middleware.ts basic-auth + the OPERATOR_EMAILS env list remain the
--     authoritative auth boundary. This migration adds shape, not gating.
--   - unicron.settings.operator_key (text, migration 0090) continues to
--     identify the current operator session for /settings.
--   - pathfinder.deals.owner_email (text, migration 0050) continues to be
--     the live ownership signal until 13Y-B introduces owner_user_id.
--
-- The MULTI_REP_ENABLED env flag (read in app code, not in SQL) decides
-- whether read paths join through these tables. When the flag is off the
-- tables exist but no production code path queries them.
--
-- Numbering: 0120 is the contiguous gap above 0119_outreach_replies. 0121
-- is reserved for 13Y-B's deals.owner_user_id additive ALTER. See
-- docs/PLAN-gate13y-user-schema.md for the broader sub-gate sequence.

-- 1. customer_orgs --------------------------------------------------------

create table if not exists pathfinder.customer_orgs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- 2. users ----------------------------------------------------------------

create table if not exists pathfinder.users (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique,
  name              text,
  customer_org_id   uuid not null references pathfinder.customer_orgs(id) on delete restrict,
  role              text not null check (role in ('admin','rep','viewer')),
  branches          text[] not null default '{}',
  created_at        timestamptz not null default now(),
  last_active_at    timestamptz
);

create index if not exists users_org_idx
  on pathfinder.users(customer_org_id);

create index if not exists users_email_lower_idx
  on pathfinder.users((lower(email)));

-- 3. deal_assignments -----------------------------------------------------
--
-- FK policy:
--   - deal_id   ON DELETE CASCADE — assignment loses meaning if the deal
--                is deleted; mirrors deal_activities.deal_id (0050).
--   - user_id   ON DELETE CASCADE — assignment loses meaning if the user
--                is deleted; the audit trail moves up to deals.owner_user_id
--                history (13Y-B) for cross-user lineage.
--   - assigned_by ON DELETE SET NULL — preserve the assignment row when
--                the assigning admin is removed.

create table if not exists pathfinder.deal_assignments (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references pathfinder.deals(id) on delete cascade,
  user_id       uuid not null references pathfinder.users(id) on delete cascade,
  assigned_at   timestamptz not null default now(),
  assigned_by   uuid references pathfinder.users(id) on delete set null,
  status        text not null check (status in ('active','transferred','revoked'))
);

create index if not exists deal_assignments_deal_idx
  on pathfinder.deal_assignments(deal_id, assigned_at desc);

create index if not exists deal_assignments_user_idx
  on pathfinder.deal_assignments(user_id, assigned_at desc);

-- 4. Backfill -------------------------------------------------------------
--
-- Single org + single admin row for the existing single-operator setup.
-- ON CONFLICT DO NOTHING on natural keys (slug, email) makes both inserts
-- safe to re-run. Additional operators are bootstrapped lazily by
-- lib/auth/user-bootstrap.ts on first authed request when MULTI_REP_ENABLED=1.

insert into pathfinder.customer_orgs (slug, name)
values ('unicron-internal', 'Unicron Internal')
on conflict (slug) do nothing;

insert into pathfinder.users (email, name, customer_org_id, role)
select 'kyle@demystified.ai', 'Kyle Kesterson', co.id, 'admin'
from pathfinder.customer_orgs co
where co.slug = 'unicron-internal'
on conflict (email) do nothing;

-- 5. RLS — anon read, service-role write (matches 0050_deals.sql pattern) -

alter table pathfinder.customer_orgs enable row level security;
alter table pathfinder.users enable row level security;
alter table pathfinder.deal_assignments enable row level security;

drop policy if exists customer_orgs_read on pathfinder.customer_orgs;
drop policy if exists customer_orgs_write on pathfinder.customer_orgs;
drop policy if exists users_read on pathfinder.users;
drop policy if exists users_write on pathfinder.users;
drop policy if exists deal_assignments_read on pathfinder.deal_assignments;
drop policy if exists deal_assignments_write on pathfinder.deal_assignments;

create policy customer_orgs_read
  on pathfinder.customer_orgs for select
  to anon, authenticated
  using (true);

create policy customer_orgs_write
  on pathfinder.customer_orgs for all
  to service_role
  using (true)
  with check (true);

create policy users_read
  on pathfinder.users for select
  to anon, authenticated
  using (true);

create policy users_write
  on pathfinder.users for all
  to service_role
  using (true)
  with check (true);

create policy deal_assignments_read
  on pathfinder.deal_assignments for select
  to anon, authenticated
  using (true);

create policy deal_assignments_write
  on pathfinder.deal_assignments for all
  to service_role
  using (true)
  with check (true);
