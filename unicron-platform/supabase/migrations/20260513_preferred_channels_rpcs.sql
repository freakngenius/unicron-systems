-- Sprint 8 F6 — preferred Slack channel filter RPCs
--
-- Persists per-team-member channel filter selection in
-- nervous_system.team_members.config->preferred_channels (jsonb array of
-- Slack channel IDs). Pattern mirrors PR #379's ns_set_my_slack_user_id /
-- ns_get_my_connections — operator-driven, member_id comes from the client.
-- These RPCs are SECURITY DEFINER so the anon Atrium key can call them
-- without requiring a full auth.uid mapping yet.

CREATE OR REPLACE FUNCTION public.ns_set_my_preferred_channels(
  p_member_id uuid,
  p_channel_ids text[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  UPDATE nervous_system.team_members
     SET config = COALESCE(config, '{}'::jsonb)
                  || jsonb_build_object('preferred_channels', to_jsonb(p_channel_ids))
   WHERE id = p_member_id;
$$;

GRANT EXECUTE ON FUNCTION public.ns_set_my_preferred_channels(uuid, text[])
  TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.ns_get_my_preferred_channels(p_member_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT jsonb_array_elements_text(tm.config -> 'preferred_channels')
      FROM nervous_system.team_members tm
      WHERE tm.id = p_member_id
    ),
    ARRAY[]::text[]
  );
$$;

GRANT EXECUTE ON FUNCTION public.ns_get_my_preferred_channels(uuid)
  TO authenticated, anon, service_role;
