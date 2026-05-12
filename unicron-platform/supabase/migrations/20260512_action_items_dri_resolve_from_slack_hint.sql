-- 20260512_action_items_dri_resolve_from_slack_hint.sql
-- Fix: nervous_system.action_items.dri was always NULL because the
-- slack-daily-scan writer (ns_slack_daily_scan_insert_action_item) stuffed
-- the Slack user ID into requested_of.hint without ever resolving it to a
-- team_members.id. This left every signed-in user with 0 open items even
-- when they were the named owner.
--
-- Two changes here, both additive:
--   1. Replace the writer RPC so it resolves the first comma-separated Slack
--      hint via team_members.config->'ingest_accounts'->>'slack_user_id'
--      (the canonical mapping path used by resolve_team_member_by_slack).
--   2. Backfill existing rows in nervous_system.action_items with the same
--      resolution rule. Multi-hint values: take the first U-prefixed token.
--
-- Conservative: rows where the hint is 'unassigned', NULL, or unmapped stay
-- with dri = NULL so unknown owners are never attributed to a specific
-- person.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Writer: resolve owner_hint (Slack user ID) → team_members.id and set dri
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_slack_daily_scan_insert_action_item(
  p_channel_id        text,
  p_channel_name      text,
  p_ledger_id         uuid,
  p_title             text,
  p_owner_hint        text DEFAULT NULL,
  p_due_hint          text DEFAULT NULL,
  p_source_message_ts text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  v_id           uuid;
  v_description  text;
  v_first_hint   text;
  v_dri          uuid;
BEGIN
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'ns_slack_daily_scan_insert_action_item: title required';
  END IF;

  IF p_owner_hint IS NOT NULL AND p_due_hint IS NOT NULL THEN
    v_description := 'Hint: assigned to ' || p_owner_hint || ' · due ' || p_due_hint;
  ELSIF p_owner_hint IS NOT NULL THEN
    v_description := 'Hint: assigned to ' || p_owner_hint;
  ELSIF p_due_hint IS NOT NULL THEN
    v_description := 'Hint: due ' || p_due_hint;
  ELSE
    v_description := NULL;
  END IF;

  -- Resolve dri from owner_hint when it looks like a Slack user ID.
  -- Hints may be comma-separated (multi-mention); take the first U-prefixed
  -- token. If no match is found in team_members.config, leave dri NULL.
  IF p_owner_hint IS NOT NULL THEN
    v_first_hint := trim(split_part(p_owner_hint, ',', 1));
    IF v_first_hint ~ '^U[A-Z0-9]+$' THEN
      SELECT tm.id INTO v_dri
      FROM nervous_system.team_members tm
      WHERE tm.config->'ingest_accounts'->>'slack_user_id' = v_first_hint
      LIMIT 1;
    END IF;
  END IF;

  INSERT INTO nervous_system.action_items (
    title, description,
    requested_by, requested_of,
    dri,
    ledger_id, status, priority, ttl_days
  )
  VALUES (
    left(trim(p_title), 200),
    v_description,
    jsonb_build_object(
      'agent', 'slack-daily-scan',
      'channel_id', p_channel_id,
      'channel_name', p_channel_name,
      'source_message_ts', p_source_message_ts
    ),
    jsonb_build_object(
      'hint', coalesce(p_owner_hint, 'unassigned')
    ),
    v_dri,
    p_ledger_id,
    'open',
    'medium',
    30
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_slack_daily_scan_insert_action_item(
  text, text, uuid, text, text, text, text
) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill: resolve dri on existing action_items where requested_of.hint
--    is a Slack user ID and a team_members mapping exists. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE nervous_system.action_items AS ai
SET dri = tm.id
FROM nervous_system.team_members AS tm
WHERE ai.dri IS NULL
  AND ai.requested_of ? 'hint'
  AND ai.requested_of->>'hint' IS NOT NULL
  AND ai.requested_of->>'hint' <> 'unassigned'
  AND trim(split_part(ai.requested_of->>'hint', ',', 1)) ~ '^U[A-Z0-9]+$'
  AND tm.config->'ingest_accounts'->>'slack_user_id'
        = trim(split_part(ai.requested_of->>'hint', ',', 1));
