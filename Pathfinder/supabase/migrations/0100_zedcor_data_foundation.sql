-- 0100_zedcor_data_foundation.sql — Z-A: Zedcor data foundation
--
-- Spec: SPEC - Zedcor Data Ingestion.md sections 3.1 + 3.2.
-- Powers Z-B (cross-pollination engine), Z-C (GeoMapper proximity scoring on
-- 200mi radius around each branch), and Tuesday demo's national-account /
-- warm-intro flagging.
--
-- Two tables, both customer-org-scoped via customer_org_id (default 'zedcor').
-- This is the first migration that introduces explicit customer-org-scoped
-- data alongside the existing generic pathfinder.branches (which remains
-- the multi-tenant registry referenced by slack_branch_routes, customers,
-- projects, briefings). Zedcor-specific data lives in zedcor_branches and
-- zedcor_customer_sites; cross-pollination keys off zedcor_customer_sites.

-- 1. zedcor_branches -----------------------------------------------------

create table pathfinder.zedcor_branches (
  id uuid primary key default gen_random_uuid(),
  customer_org_id text not null default 'zedcor',
  branch_name text not null,
  country text not null,
  state text not null,
  city text,
  lat numeric(9, 6),
  lon numeric(9, 6),
  radius_miles integer not null default 200,
  is_active boolean not null default true,
  geocode_source text,
  notes text,
  source_row_index integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pathfinder.zedcor_branches add constraint zedcor_branches_country_check
  check (country in ('USA', 'Canada', 'CA', 'US'));

alter table pathfinder.zedcor_branches add constraint zedcor_branches_geocode_source_check
  check (geocode_source is null or geocode_source in ('google_geocoding', 'city_centroid', 'manual_override'));

create index idx_zb_org on pathfinder.zedcor_branches(customer_org_id);
create index idx_zb_active on pathfinder.zedcor_branches(customer_org_id, is_active);
create unique index idx_zb_org_branch on pathfinder.zedcor_branches(customer_org_id, branch_name, state);

-- 2. zedcor_customer_sites -----------------------------------------------

create table pathfinder.zedcor_customer_sites (
  id uuid primary key default gen_random_uuid(),
  customer_org_id text not null default 'zedcor',
  customer_name_raw text,
  customer_name_normalized text not null,
  parent_company_canonical text,
  site_name text,
  address text,
  city text,
  state text,
  lat numeric(9, 6),
  lon numeric(9, 6),
  is_active boolean not null default true,
  source_row_index integer,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_zcs_normalized on pathfinder.zedcor_customer_sites(customer_org_id, customer_name_normalized);
create index idx_zcs_parent on pathfinder.zedcor_customer_sites(customer_org_id, parent_company_canonical) where parent_company_canonical is not null;

-- Idempotency for re-runs (per SPEC - Zedcor Data Ingestion.md 4.3).
-- NULLS NOT DISTINCT (PG 15+) treats NULL == NULL for uniqueness so rows
-- with missing address/site_name still dedupe cleanly. Plain-column index
-- (no COALESCE expression) so INSERT ... ON CONFLICT can reference it
-- directly from the Supabase upsert helper.
create unique index idx_zcs_dedupe
  on pathfinder.zedcor_customer_sites(
    customer_org_id,
    customer_name_raw,
    address,
    site_name
  ) nulls not distinct;

-- 3. RLS — read open to anon/authenticated, write service-role only
--    Same pattern as pathfinder.branches (see 0004_rls.sql) and
--    pathfinder.slack_workspaces (0012).

alter table pathfinder.zedcor_branches enable row level security;
alter table pathfinder.zedcor_customer_sites enable row level security;

create policy zedcor_branches_read
  on pathfinder.zedcor_branches for select to anon, authenticated using (true);
create policy zedcor_branches_write
  on pathfinder.zedcor_branches for all to service_role using (true) with check (true);

create policy zedcor_customer_sites_read
  on pathfinder.zedcor_customer_sites for select to anon, authenticated using (true);
create policy zedcor_customer_sites_write
  on pathfinder.zedcor_customer_sites for all to service_role using (true) with check (true);

-- 4. updated_at trigger (lightweight; mirrors pattern from 0050+ migrations)

create or replace function pathfinder.zedcor_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger zedcor_branches_updated_at
  before update on pathfinder.zedcor_branches
  for each row execute function pathfinder.zedcor_set_updated_at();

create trigger zedcor_customer_sites_updated_at
  before update on pathfinder.zedcor_customer_sites
  for each row execute function pathfinder.zedcor_set_updated_at();
