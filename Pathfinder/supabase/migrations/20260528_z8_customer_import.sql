-- 20260528_z8_customer_import.sql — Sprint Z8: customer import + branch tag
--
-- Additive only. Adds:
--   1. nearest_branch_id (uuid) on pathfinder.zedcor_customer_sites
--      → satisfies spec acceptance criterion §2 (≥80% branch-tagged)
--   2. distance_to_branch_miles (numeric) on same
--   3. Indexes for the Z8 import + Z4 cross-pollination read paths
--
-- Schema-reconciliation note: SPEC-zedcor-z8-customer-import-cross-poll.md
-- references pathfinder.customers (organization_id, normalized_company_name).
-- Actual schema uses pathfinder.zedcor_customer_sites with customer_org_id
-- (string slug). See lib/adapters/zedcor/cross-pollination.ts header for the
-- same reconciliation in Z4. This migration honors the spec's intent against
-- the real table.

begin;

-- 1. nearest_branch_id + distance_to_branch_miles ------------------------

alter table pathfinder.zedcor_customer_sites
  add column if not exists nearest_branch_id uuid
    references pathfinder.zedcor_branches(id) on delete set null;

alter table pathfinder.zedcor_customer_sites
  add column if not exists distance_to_branch_miles numeric(7, 1);

-- 2. Indexes for Z8 import + Z4 cross-pollination ------------------------
-- idx_zcs_normalized (customer_org_id, customer_name_normalized) already
-- exists from 0100_zedcor_data_foundation.sql — spec's "indexes on
-- (organization_id, normalized_company_name)" is therefore satisfied. The
-- additions below cover the Z8 import + backfill read paths.

create index if not exists idx_zcs_branch
  on pathfinder.zedcor_customer_sites(customer_org_id, nearest_branch_id)
  where nearest_branch_id is not null;

create index if not exists idx_zcs_geo
  on pathfinder.zedcor_customer_sites(customer_org_id, lat, lon)
  where lat is not null and lon is not null;

-- 3. parent_company_canonical lookup -------------------------------------
-- idx_zcs_parent already exists from 0100; no-op confirmation.

commit;
