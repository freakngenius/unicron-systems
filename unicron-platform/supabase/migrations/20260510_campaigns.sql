-- 20260510_campaigns.sql
-- Sprint 6 Stream A — nervous_system.campaigns table
-- Tracks marketing campaigns with status lifecycle, channels, dates, and owner.
--
-- No destructive operations. Safe to apply on any Sprint 5+ database state.

CREATE TABLE IF NOT EXISTS nervous_system.campaigns (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  status               text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'active', 'paused', 'complete')),
  goal                 text,
  channels             text[],
  start_date           date,
  end_date             date,
  target_metric        text,
  owner_team_member_id uuid REFERENCES nervous_system.team_members(id),
  notes                text,
  ttl_days             integer DEFAULT 90,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status
  ON nervous_system.campaigns(status);

CREATE INDEX IF NOT EXISTS idx_campaigns_start_date
  ON nervous_system.campaigns(start_date);

-- Row-level security (match pattern from other nervous_system tables)
ALTER TABLE nervous_system.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_read_campaigns"
  ON nervous_system.campaigns FOR SELECT
  USING (true);

CREATE POLICY "team_write_campaigns"
  ON nervous_system.campaigns FOR ALL
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON nervous_system.campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON nervous_system.campaigns TO service_role;

-- ── Updated_at trigger ────────────────────────────────────────────────────────
-- nervous_system.touch_updated_at() was created in 20260510_connected_services.sql;
-- guard with IF NOT EXISTS via DO block to stay idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_campaigns_updated_at'
  ) THEN
    CREATE TRIGGER trg_campaigns_updated_at
      BEFORE UPDATE ON nervous_system.campaigns
      FOR EACH ROW EXECUTE FUNCTION nervous_system.touch_updated_at();
  END IF;
END;
$$;

-- ── Public-schema RPC for PostgREST access ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_campaigns()
RETURNS TABLE (
  id                   uuid,
  name                 text,
  status               text,
  goal                 text,
  channels             text[],
  start_date           date,
  end_date             date,
  target_metric        text,
  owner_team_member_id uuid,
  notes                text,
  ttl_days             integer,
  created_at           timestamptz,
  updated_at           timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT
    id, name, status, goal, channels,
    start_date, end_date, target_metric,
    owner_team_member_id, notes, ttl_days,
    created_at, updated_at
  FROM nervous_system.campaigns
  ORDER BY
    CASE status
      WHEN 'active'   THEN 0
      WHEN 'draft'    THEN 1
      WHEN 'paused'   THEN 2
      WHEN 'complete' THEN 3
    END,
    created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_campaigns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ns_list_campaigns() TO service_role;
