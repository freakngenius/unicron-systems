-- 20260521_ns_create_campaign.sql
-- Atrium audit fix item #1: ship the missing `public.ns_create_campaign()` RPC
-- referenced by `api/atrium/campaigns/index.ts:54`. The list-side RPC ships in
-- `20260510_campaigns.sql`; this migration adds the matching create-side RPC so
-- the Marketing > New Campaign form can persist.
--
-- Mirrors `ns_list_campaigns` shape (public schema, SECURITY DEFINER) so
-- PostgREST can call it without exposing nervous_system in the schema list.
--
-- Idempotent. No destructive operations.

CREATE OR REPLACE FUNCTION public.ns_create_campaign(
  p_name                 text,
  p_status               text DEFAULT 'draft',
  p_goal                 text DEFAULT NULL,
  p_channels             text[] DEFAULT NULL,
  p_start_date           date DEFAULT NULL,
  p_end_date             date DEFAULT NULL,
  p_target_metric        text DEFAULT NULL,
  p_owner_team_member_id uuid DEFAULT NULL,
  p_notes                text DEFAULT NULL,
  p_ttl_days             integer DEFAULT 90
)
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'campaign name required';
  END IF;

  IF p_status NOT IN ('draft', 'active', 'paused', 'complete') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  INSERT INTO nervous_system.campaigns (
    name, status, goal, channels, start_date, end_date,
    target_metric, owner_team_member_id, notes, ttl_days
  ) VALUES (
    p_name, p_status, p_goal, p_channels, p_start_date, p_end_date,
    p_target_metric, p_owner_team_member_id, p_notes, p_ttl_days
  )
  RETURNING nervous_system.campaigns.id INTO v_id;

  -- Audit-log the create. Matches the pattern used by other ns_create_* RPCs.
  -- Use a best-effort INSERT; if audit_log is unavailable for any reason we
  -- still surface the new campaign rather than failing the create.
  BEGIN
    INSERT INTO nervous_system.audit_log (table_name, action, payload)
    VALUES (
      'campaigns',
      'campaign_create',
      jsonb_build_object(
        'campaign_id', v_id,
        'name', p_name,
        'status', p_status,
        'source', 'atrium_audit_fix_pass'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- swallow; create still returned the row above
    NULL;
  END;

  RETURN QUERY
    SELECT
      c.id, c.name, c.status, c.goal, c.channels,
      c.start_date, c.end_date, c.target_metric,
      c.owner_team_member_id, c.notes, c.ttl_days,
      c.created_at, c.updated_at
    FROM nervous_system.campaigns c
    WHERE c.id = v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_create_campaign(
  text, text, text, text[], date, date, text, uuid, text, integer
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.ns_create_campaign(
  text, text, text, text[], date, date, text, uuid, text, integer
) TO service_role;
