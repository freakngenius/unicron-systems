-- 0101_zedcor_cross_pollination.sql — Z-B: cross-pollination engine tables
--
-- Spec: SPEC - Cross-Pollination Engine.md sections 3.4 + 4.1.
-- Two tables, both customer-org-scoped via customer_org_id (default 'zedcor'):
--
--   pathfinder.lead_cross_pollination — per-lead, per-matched-customer match
--     records emitted by the engine (lib/cross-pollination/engine.ts).
--   pathfinder.national_accounts — operator-managed registry of customers
--     present in N+ branches; populated by feature #20 (follow-up PR), but
--     the table ships now so the engine can lazily check it.
--
-- DEVIATION FROM SPEC § 4.1: spec declares lead_id uuid; the existing
-- pathfinder.projects table uses text primary keys (see 0002_tables.sql
-- line 28). lead_id is therefore text here, with a FK to projects(id).
-- Recorded in PR description for review.

-- 1. lead_cross_pollination -----------------------------------------------

create table pathfinder.lead_cross_pollination (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references pathfinder.projects(id) on delete cascade,
  customer_org_id text not null default 'zedcor',
  customer_canonical text not null,
  match_layer text not null check (match_layer in ('exact', 'fuzzy', 'parent_company')),
  match_confidence numeric(3, 2) not null,
  primary_branch_id uuid references pathfinder.zedcor_branches(id),
  primary_branch_name text,
  branch_count integer not null,
  active_site_count integer not null,
  most_recent_site_date date,
  national_account boolean not null default false,
  matched_at timestamptz not null default now(),
  matched_field text not null check (matched_field in ('project_owner', 'prime_contractor', 'key_sub', 'parent_company')),
  matched_value_raw text not null
);

create index idx_xpoll_lead on pathfinder.lead_cross_pollination(lead_id);
create index idx_xpoll_customer
  on pathfinder.lead_cross_pollination(customer_canonical, customer_org_id);

-- 2. national_accounts ----------------------------------------------------
--    Empty until feature #20 ships. Engine reads this lazily; absence of a
--    row simply means "compute national_account flag from live aggregation"
--    (which the engine does today).

create table pathfinder.national_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_org_id text not null,
  customer_canonical text not null,
  hq_contact_name text,
  hq_contact_email text,
  branch_count integer not null,
  last_calculated_at timestamptz not null default now(),
  override_status text check (override_status in ('forced_national', 'forced_branch_ok')),
  unique (customer_org_id, customer_canonical)
);

create index idx_na_org on pathfinder.national_accounts(customer_org_id);

-- 3. RLS — read open to anon/authenticated, write service-role only.
--    Mirrors pathfinder.zedcor_branches policy from 0100.

alter table pathfinder.lead_cross_pollination enable row level security;
alter table pathfinder.national_accounts enable row level security;

create policy lead_cross_pollination_read
  on pathfinder.lead_cross_pollination for select to anon, authenticated using (true);
create policy lead_cross_pollination_write
  on pathfinder.lead_cross_pollination for all to service_role using (true) with check (true);

create policy national_accounts_read
  on pathfinder.national_accounts for select to anon, authenticated using (true);
create policy national_accounts_write
  on pathfinder.national_accounts for all to service_role using (true) with check (true);
