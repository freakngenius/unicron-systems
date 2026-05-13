-- 20260513_fix_action_item_from_call_requested_columns.sql — Bug Fix: Call upload fan-out
--
-- Tertiary defect found during prod smoke test (2026-05-13):
--   ERROR: 23502: null value in column "requested_by" of relation "action_items"
--   violates not-null constraint
--   CONTEXT: PL/pgSQL function ns_create_action_item_from_call(...) line 11
--
-- The action_items table has requested_by jsonb NOT NULL and requested_of
-- jsonb NOT NULL (no defaults). The C6 migration's RPC never populated
-- these. So even after the audit_log column fix, action-item inserts from
-- calls would fail at the action_items INSERT.
--
-- This migration recreates the RPC to populate both columns:
--   requested_by = jsonb_build_object('source','call_upload', call_ledger_id,
--                                     call_notion_url)
--   requested_of = jsonb_build_object('name', owner_name, 'hint', owner_name,
--                                     'dri_uuid', resolved_dri_uuid)
--
-- Mirrors the slack-daily-scan precedent (requested_by carries source agent
-- metadata, requested_of carries the assignee hint).
--
-- Additive only. Signature unchanged.

CREATE OR REPLACE FUNCTION public.ns_create_action_item_from_call(
  p_call_id              uuid,
  p_call_notion_url      text,
  p_title                text,
  p_description          text,
  p_owner_name           text,
  p_priority             text,
  p_due_at               timestamptz,
  p_kanban_workspace     text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  v_id            uuid;
  v_dri           uuid;
  v_requested_by  jsonb;
  v_requested_of  jsonb;
BEGIN
  SELECT id INTO v_dri
  FROM nervous_system.team_members
  WHERE lower(name) = lower(p_owner_name)
  LIMIT 1;

  v_requested_by := jsonb_build_object(
    'source',           'call_upload',
    'call_ledger_id',   p_call_id,
    'call_notion_url',  p_call_notion_url
  );

  v_requested_of := jsonb_build_object(
    'name',     p_owner_name,
    'hint',     p_owner_name,
    'dri_uuid', v_dri
  );

  INSERT INTO nervous_system.action_items (
    title, description, priority, status, dri, due_at, kanban_workspace,
    related_call_id, related_call_notion_url, ledger_id,
    requested_by, requested_of
  )
  VALUES (
    p_title,
    p_description,
    COALESCE(NULLIF(p_priority, ''), 'medium'),
    'open',
    v_dri,
    p_due_at,
    COALESCE(NULLIF(p_kanban_workspace, ''), 'internal'),
    NULL,
    p_call_notion_url,
    p_call_id,
    v_requested_by,
    v_requested_of
  )
  RETURNING id INTO v_id;

  INSERT INTO nervous_system.audit_log (table_name, action, actor_id, payload)
  VALUES (
    'action_items',
    'action_item_create_from_call',
    NULL,
    jsonb_build_object(
      'action_item_id',  v_id,
      'call_ledger_id',  p_call_id,
      'call_notion_url', p_call_notion_url,
      'owner_name',      p_owner_name,
      'dri_resolved',    v_dri,
      'priority',        p_priority
    )
  );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ns_create_action_item_from_call(uuid, text, text, text, text, text, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_create_action_item_from_call(uuid, text, text, text, text, text, timestamptz, text)
  TO service_role;
