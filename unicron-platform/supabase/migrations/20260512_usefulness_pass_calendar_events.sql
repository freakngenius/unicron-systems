-- 20260512_usefulness_pass_calendar_events.sql
-- Item 4 of the Atrium usefulness pass (2026-05-12).
--
-- Adds nervous_system.calendar_events + RPCs that the hourly Inngest pull and
-- the Now > Today panel will use. Also adds a small RPC to persist + read
-- the connection state for a team member (calendar config jsonb +
-- slack_user_id), invoked by the Settings page.

-- ─── calendar_events table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nervous_system.calendar_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid NOT NULL REFERENCES nervous_system.team_members(id) ON DELETE CASCADE,
  source            text NOT NULL DEFAULT 'google',
  external_event_id text NOT NULL,
  title             text,
  start_at          timestamptz NOT NULL,
  end_at            timestamptz,
  attendees         jsonb DEFAULT '[]'::jsonb,
  location          text,
  raw               jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_owner_external_uniq
  ON nervous_system.calendar_events (owner_id, source, external_event_id);

CREATE INDEX IF NOT EXISTS calendar_events_start_at_idx
  ON nervous_system.calendar_events (owner_id, start_at);

-- Touch updated_at on update
CREATE OR REPLACE FUNCTION nervous_system.calendar_events_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calendar_events_touch_updated_at ON nervous_system.calendar_events;
CREATE TRIGGER calendar_events_touch_updated_at
  BEFORE UPDATE ON nervous_system.calendar_events
  FOR EACH ROW EXECUTE FUNCTION nervous_system.calendar_events_touch_updated_at();

-- ─── ns_get_my_connections — reads calendar config + slack_user_id ───────────
CREATE OR REPLACE FUNCTION public.ns_get_my_connections(p_member_id uuid)
RETURNS TABLE (
  slack_user_id     text,
  google_connected  boolean,
  google_connected_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT
    tm.slack_user_id,
    (tm.config -> 'calendar' ->> 'provider') = 'google' AS google_connected,
    NULLIF(tm.config -> 'calendar' ->> 'connected_at', '')::timestamptz AS google_connected_at
  FROM nervous_system.team_members tm
  WHERE tm.id = p_member_id;
$$;

GRANT EXECUTE ON FUNCTION public.ns_get_my_connections(uuid) TO authenticated, anon, service_role;

-- ─── ns_set_my_slack_user_id ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ns_set_my_slack_user_id(p_member_id uuid, p_slack_user_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  UPDATE nervous_system.team_members
  SET slack_user_id = NULLIF(p_slack_user_id, '')
  WHERE id = p_member_id;
$$;

GRANT EXECUTE ON FUNCTION public.ns_set_my_slack_user_id(uuid, text) TO authenticated, service_role;

-- ─── ns_set_google_calendar_tokens — persisted by /api/auth/google/callback ──
-- refresh_token is Sensitive; this RPC is service-role only.
CREATE OR REPLACE FUNCTION public.ns_set_google_calendar_tokens(
  p_member_id     uuid,
  p_refresh_token text,
  p_calendar_id   text DEFAULT 'primary'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  existing jsonb;
BEGIN
  SELECT coalesce(config, '{}'::jsonb) INTO existing
  FROM nervous_system.team_members WHERE id = p_member_id;

  UPDATE nervous_system.team_members
  SET config = jsonb_set(
    existing,
    '{calendar}',
    jsonb_build_object(
      'provider',     'google',
      'refresh_token', p_refresh_token,
      'calendar_id',  coalesce(p_calendar_id, 'primary'),
      'connected_at', now()
    ),
    true
  )
  WHERE id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_set_google_calendar_tokens(uuid, text, text) TO service_role;

-- ─── ns_upsert_calendar_event — invoked by the hourly Inngest pull ──────────
CREATE OR REPLACE FUNCTION public.ns_upsert_calendar_event(
  p_owner_id          uuid,
  p_external_event_id text,
  p_title             text,
  p_start_at          timestamptz,
  p_end_at            timestamptz,
  p_attendees         jsonb,
  p_location          text,
  p_raw               jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  inserted_id uuid;
BEGIN
  INSERT INTO nervous_system.calendar_events
    (owner_id, source, external_event_id, title, start_at, end_at, attendees, location, raw)
  VALUES
    (p_owner_id, 'google', p_external_event_id, p_title, p_start_at, p_end_at,
     coalesce(p_attendees, '[]'::jsonb), p_location, coalesce(p_raw, '{}'::jsonb))
  ON CONFLICT (owner_id, source, external_event_id)
  DO UPDATE SET
    title     = excluded.title,
    start_at  = excluded.start_at,
    end_at    = excluded.end_at,
    attendees = excluded.attendees,
    location  = excluded.location,
    raw       = excluded.raw
  RETURNING id INTO inserted_id;
  RETURN inserted_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_upsert_calendar_event(uuid, text, text, timestamptz, timestamptz, jsonb, text, jsonb) TO service_role;

-- ─── ns_list_calendar_today — for the Now > Today panel ─────────────────────
CREATE OR REPLACE FUNCTION public.ns_list_calendar_today(p_owner_id uuid)
RETURNS TABLE (
  id                uuid,
  title             text,
  start_at          timestamptz,
  end_at            timestamptz,
  attendees         jsonb,
  location          text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, title, start_at, end_at, attendees, location
  FROM nervous_system.calendar_events
  WHERE owner_id = p_owner_id
    AND (start_at AT TIME ZONE 'America/Los_Angeles')::date = (now() AT TIME ZONE 'America/Los_Angeles')::date
  ORDER BY start_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_calendar_today(uuid) TO authenticated, anon, service_role;

-- ─── ns_list_calendar_owners — for the cron to iterate connected users ──────
CREATE OR REPLACE FUNCTION public.ns_list_calendar_owners()
RETURNS TABLE (
  member_id      uuid,
  email          text,
  refresh_token  text,
  calendar_id    text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT
    tm.id,
    tm.email,
    tm.config -> 'calendar' ->> 'refresh_token',
    coalesce(tm.config -> 'calendar' ->> 'calendar_id', 'primary')
  FROM nervous_system.team_members tm
  WHERE tm.active = true
    AND (tm.config -> 'calendar' ->> 'provider') = 'google'
    AND (tm.config -> 'calendar' ->> 'refresh_token') IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_calendar_owners() TO service_role;
