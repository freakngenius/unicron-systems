-- 20260529_zedcor_z16_source_authority_z10_taxonomy.sql
--
-- Sprint Z16 — extend pathfinder.projects.source_authority CHECK constraint
-- to accept the five additional taxonomy values that the already-shipped Z10
-- multi-metro adapters emit. Purely additive: no existing values removed,
-- no rows rewritten by the migration. Pre-Z16 rows are unaffected.
--
-- Background: Sprint Z10 shipped 20 multi-metro adapters
-- (Pathfinder/lib/adapters/sources/{fort-worth-city,tarrant-county,
-- dallas-isd,...}.ts) that emit raw_payload.source_authority values not
-- present in the Z3 taxonomy: city_purchasing, airport_authority,
-- airport_procurement, state_university_system, port_authority. Because of
-- this mismatch, every Z10 candidate failed the projects_source_authority_check
-- on insert — which is the actual reason those adapters were dormant despite
-- being registered. This migration brings the constraint in line with what
-- the Z10 adapters were already producing so Z16 can wire those slugs into
-- ZEDCOR_HOUSTON_HUB_SOURCE_SLUGS and have them land rows in
-- pathfinder.projects via runSource().
--
-- Verbatim repro of the rejection (Z16 dry run, agent_run id=6703,
-- 2026-05-29T09:50Z):
--   "new row for relation \"projects\" violates check constraint
--    \"projects_source_authority_check\""
-- on every insert from fort-worth-city, austin-eresponse, san-antonio-city,
-- and port-corpus-christi.
--
-- Order-of-operations on a fresh database:
--   1. Drop the Z3 CHECK.
--   2. Re-add the CHECK with the Z3 taxonomy plus the five Z10 values.
--
-- Spec: Claude/Unicron/Specs/SPEC-zedcor-Z16.md §"Per-source procedure"
--       step 4 (additive migration in real migrations directory).

ALTER TABLE pathfinder.projects
  DROP CONSTRAINT IF EXISTS projects_source_authority_check;

ALTER TABLE pathfinder.projects
  ADD CONSTRAINT projects_source_authority_check CHECK (
    source_authority IS NULL OR source_authority = ANY (ARRAY[
      -- Legacy values preserved for back-compat with pre-Z3 rows.
      'portal'::text,
      'agency_direct'::text,
      'ariba_developer_api'::text,
      -- Sprint Z3 bid-lifecycle taxonomy.
      'public_construction'::text,
      'federal_contract'::text,
      'federal_spending'::text,
      'state_dot'::text,
      'county_purchasing'::text,
      'school_district'::text,
      'news_report'::text,
      'other'::text,
      -- Sprint Z16 — Z10 multi-metro taxonomy. Each is emitted by at least one
      -- shipped Z10 adapter (Pathfinder/lib/adapters/sources/*.ts):
      --   city_purchasing         : fort-worth-city, arlington-city, plano-city,
      --                             garland-city, irving-city, austin-eresponse,
      --                             san-antonio-city, corpus-christi-city,
      --                             laredo-city
      --   airport_authority       : dfw-airport, san-antonio-airport
      --   airport_procurement     : austin-bergstrom
      --   state_university_system : ut-system
      --   port_authority          : port-corpus-christi
      'city_purchasing'::text,
      'airport_authority'::text,
      'airport_procurement'::text,
      'state_university_system'::text,
      'port_authority'::text
    ])
  );
