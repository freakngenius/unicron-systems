-- 20260511_pathfinder_sync.sql
-- S4a: cross-project Pathfinder summary sync.
--
-- Pathfinder runs in a separate Supabase project (Futuro ref rjwtwdbdbcombtpuwcmf
-- per CLAUDE.md three-product layout). The Atrium-side `pathfinder.*` schema in
-- this nervous_system project (anfihcusvekpovcchpoh) is a partial mirror; the
-- live pipeline writes to Pathfinder's own database.
--
-- This migration creates the destination summary table on the nervous_system
-- side. The Inngest function `pathfinderSync` (lib/agents/inngest-fns.ts) polls
-- the Pathfinder project via service-role client and upserts a single summary
-- row per ISO day per metric_key. The Atrium Now / People surfaces read this
-- table for cross-project lead intelligence rollups.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE for the RPC.
-- Reversible: DROP TABLE nervous_system.pathfinder_sync;

CREATE TABLE IF NOT EXISTS nervous_system.pathfinder_sync (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key      text NOT NULL,
  metric_value    jsonb NOT NULL,
  observed_at     timestamptz NOT NULL DEFAULT now(),
  source_project  text NOT NULL DEFAULT 'pathfinder',
  sync_run_id     uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pathfinder_sync_metric_key_observed_at_idx
  ON nervous_system.pathfinder_sync (metric_key, observed_at DESC);

CREATE INDEX IF NOT EXISTS pathfinder_sync_observed_at_idx
  ON nervous_system.pathfinder_sync (observed_at DESC);

ALTER TABLE nervous_system.pathfinder_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pathfinder_sync_authenticated_read ON nervous_system.pathfinder_sync;
CREATE POLICY pathfinder_sync_authenticated_read
  ON nervous_system.pathfinder_sync
  FOR SELECT
  TO authenticated
  USING (true);

-- service_role writes only (no anon write).
DROP POLICY IF EXISTS pathfinder_sync_service_role_write ON nervous_system.pathfinder_sync;
CREATE POLICY pathfinder_sync_service_role_write
  ON nervous_system.pathfinder_sync
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Public-schema RPC for browser reads (PGRST106 workaround per
-- 20260510_ns_atrium_rpcs.sql).
CREATE OR REPLACE FUNCTION public.ns_pathfinder_sync_latest(p_limit int DEFAULT 50)
RETURNS TABLE (
  id             uuid,
  metric_key     text,
  metric_value   jsonb,
  observed_at    timestamptz,
  source_project text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, metric_key, metric_value, observed_at, source_project
  FROM nervous_system.pathfinder_sync
  ORDER BY observed_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_pathfinder_sync_latest(int) TO authenticated, anon, service_role;
