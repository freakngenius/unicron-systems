-- 20260513_fix_action_item_from_call_audit_log.sql — Bug Fix: Call upload fan-out
--
-- The C6 migration (20260512_ns_action_item_from_call.sql) wrote an embedded
-- audit_log INSERT targeting columns (target_id, actor, metadata) which do
-- not exist on the live audit_log schema. Once the C3 RPC is patched and
-- ledger inserts start succeeding, the action_item fan-out will fail next
-- at this audit_log INSERT.
--
-- This migration recreates the RPC with the correct audit_log columns
-- (table_name, action, actor_id, payload). actor_id is NULL because the
-- caller passes an owner name string, not a uuid.
--
-- Additive only. Signature unchanged so lib/calls-action-item-flow.ts needs
-- no change.

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
  v_id        uuid;
  v_dri       uuid;
BEGIN
  SELECT id INTO v_dri
  FROM nervous_system.team_members
  WHERE lower(name) = lower(p_owner_name)
  LIMIT 1;

  INSERT INTO nervous_system.action_items (
    title, description, priority, status, dri, due_at, kanban_workspace,
    related_call_id, related_call_notion_url, ledger_id
  )
  VALUES (
    p_title,
    p_description,
    COALESCE(NULLIF(p_priority, ''), 'medium'),
    'open',
    v_dri,
    p_due_at,
    COALESCE(NULLIF(p_kanban_workspace, ''), 'internal'),
    NULL,                              -- nervous_system.calls.id is C4 mirror — not yet populated for fresh uploads
    p_call_notion_url,
    p_call_id                          -- p_call_id is the ledger row id from C3; FK action_items.ledger_id -> ledger.id
  )
  RETURNING id INTO v_id;

  INSERT INTO nervous_system.audit_log (
    table_name, action, actor_id, payload
  )
  VALUES (
    'action_items',
    'action_item_create_from_call',
    NULL,
    jsonb_build_object(
      'action_item_id',    v_id,
      'call_ledger_id',    p_call_id,
      'call_notion_url',   p_call_notion_url,
      'owner_name',        p_owner_name,
      'dri_resolved',      v_dri,
      'priority',          p_priority
    )
  );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ns_create_action_item_from_call(
  uuid, text, text, text, text, text, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_create_action_item_from_call(
  uuid, text, text, text, text, text, timestamptz, text
) TO service_role;
