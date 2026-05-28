-- 20260528_zedcor_z3_source_authority.sql
--
-- Sprint Z3 — expand pathfinder.projects.source_authority CHECK constraint to
-- accept the new bid-lifecycle taxonomy alongside the legacy values. Purely
-- additive: no existing values are removed, no rows are rewritten by the
-- migration (rewrites are handled by scripts/backfill-notion-source-authority.ts
-- and the inline backfill that ran 2026-05-28 via supabase MCP).
--
-- Why this is in a tracked file even though the constraint was first dropped
-- + recreated live on 2026-05-28 via the Supabase MCP: every schema change
-- needs to be replayable from a fresh database. Without this file, a future
-- `supabase db reset` would lose the Z3 taxonomy.
--
-- Order-of-operations on a fresh database:
--   1. Drop the legacy CHECK (which only allowed 'portal' / 'agency_direct'
--      / 'ariba_developer_api').
--   2. Re-add the CHECK with the full Z3 taxonomy union.
--
-- Spec: Specs/SPEC-zedcor-z3-parser-phase-fix.md §"Wave 0: Foundation".

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
      'other'::text
    ])
  );
