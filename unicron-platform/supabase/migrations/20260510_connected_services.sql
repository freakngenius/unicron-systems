-- 20260510_connected_services.sql
-- Sprint 5 Stream F — nervous_system.connected_services table
-- Tracks SaaS/infra services connected to the Unicron stack with cost and health.
--
-- Uses SECURITY DEFINER RPCs in public schema for PostgREST exposure (matching
-- the pattern established in 20260508_ns_list_agents.sql).
-- Direct schema access via service_role granted for server-side API routes.

CREATE TABLE IF NOT EXISTS nervous_system.connected_services (
  id                   uuid primary key default uuid_generate_v4(),
  name                 text not null,
  category             text,
  status               text default 'unknown' check (status in ('healthy','degraded','broken','unknown')),
  monthly_cost_usd     numeric,
  last_billed_at       date,
  last_health_check_at timestamptz,
  owner_team_member_id uuid references nervous_system.team_members(id),
  config_url           text,
  notes                text,
  acknowledged         boolean default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_connected_services_category
  ON nervous_system.connected_services(category);

-- Row-level security (match pattern from other nervous_system tables)
ALTER TABLE nervous_system.connected_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read connected_services"
  ON nervous_system.connected_services FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authenticated can insert connected_services"
  ON nervous_system.connected_services FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update connected_services"
  ON nervous_system.connected_services FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON nervous_system.connected_services TO authenticated;
GRANT SELECT, INSERT, UPDATE ON nervous_system.connected_services TO service_role;

-- ── Public-schema RPC for PostgREST access (anon role cannot reach nervous_system) ──

CREATE OR REPLACE FUNCTION public.ns_list_connected_services()
RETURNS TABLE (
  id                   uuid,
  name                 text,
  category             text,
  status               text,
  monthly_cost_usd     numeric,
  last_billed_at       date,
  last_health_check_at timestamptz,
  owner_team_member_id uuid,
  config_url           text,
  notes                text,
  acknowledged         boolean,
  created_at           timestamptz,
  updated_at           timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT
    id, name, category, status, monthly_cost_usd,
    last_billed_at, last_health_check_at, owner_team_member_id,
    config_url, notes, acknowledged, created_at, updated_at
  FROM nervous_system.connected_services
  ORDER BY category, name;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_connected_services() TO authenticated;

-- ── Updated_at trigger ──

CREATE OR REPLACE FUNCTION nervous_system.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_connected_services_updated_at
  BEFORE UPDATE ON nervous_system.connected_services
  FOR EACH ROW EXECUTE FUNCTION nervous_system.touch_updated_at();
