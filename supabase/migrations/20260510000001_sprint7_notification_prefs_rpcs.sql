-- Sprint 7 Stream B: Notification preferences RPCs
-- Applied: 2026-05-10
--
-- Verified nervous_system.team_members columns (via information_schema.columns query):
--   id(uuid NOT NULL), name(text NOT NULL), email(text), slack_user_id(text),
--   github_username(text), role(text), active(bool), joined_at(timestamptz),
--   default_kanban_surface(text), reciprocity_hooks(jsonb), config(jsonb)
-- NOTE: no updated_at column on team_members — not referenced here.
--
-- These RPCs allow the Atrium Settings UI to read/write notification preferences
-- stored in team_members.config->'notifications' without exposing the
-- nervous_system schema through PostgREST (PGRST106 restriction).

-- ── PATCH: store notification prefs in team_members.config->{'notifications'} ──
CREATE OR REPLACE FUNCTION public.ns_update_member_notifications(
  p_member_id uuid,
  p_notifications jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
BEGIN
  UPDATE nervous_system.team_members
  SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('notifications', p_notifications)
  WHERE id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_member not found: %', p_member_id;
  END IF;
END;
$$;

-- ── GET: retrieve notification prefs from team_members.config->{'notifications'} ──
CREATE OR REPLACE FUNCTION public.ns_get_member_notifications(
  p_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  v_notifications jsonb;
BEGIN
  SELECT COALESCE(config->'notifications', '{}'::jsonb)
  INTO v_notifications
  FROM nervous_system.team_members
  WHERE id = p_member_id;

  RETURN COALESCE(v_notifications, '{}'::jsonb);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.ns_update_member_notifications(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ns_update_member_notifications(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ns_get_member_notifications(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ns_get_member_notifications(uuid) TO service_role;
