-- 20260511_ns_create_action_item_atrium.sql
-- Atrium Work > +New Item modal.
--
-- Adds ns_create_action_item_atrium() — a bounded insert against
-- nervous_system.action_items that records a refusal-layer audit_log entry
-- on every create (action='action_item_create'). The existing
-- ns_create_action_item() RPC used by the Orchestrator is left untouched.
--
-- Also adds a verify_criteria column to nervous_system.action_items so the
-- modal can capture the operator-supplied verify text.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ensure verify_criteria column exists
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE nervous_system.action_items
  ADD COLUMN IF NOT EXISTS verify_criteria text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ns_create_action_item_atrium
--    Returns the inserted row shaped like ns_list_action_items so the modal
--    can splice it into the table without an extra refetch.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_create_action_item_atrium(
  p_title            text,
  p_priority         text DEFAULT 'medium',
  p_dri_id           uuid DEFAULT NULL,
  p_kanban_workspace text DEFAULT NULL,
  p_verify_criteria  text DEFAULT NULL,
  p_due_at           timestamptz DEFAULT NULL,
  p_description      text DEFAULT NULL
)
RETURNS TABLE (
  id               uuid,
  title            text,
  description      text,
  priority         text,
  status           text,
  dri              uuid,
  due_at           timestamptz,
  kanban_workspace text,
  verify_criteria  text,
  created_at       timestamptz,
  dri_name         text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  v_new_id uuid;
  v_clean_title text;
BEGIN
  v_clean_title := trim(coalesce(p_title, ''));
  IF length(v_clean_title) = 0 THEN
    RAISE EXCEPTION 'ns_create_action_item_atrium: title required';
  END IF;
  IF p_priority NOT IN ('irreversible', 'high', 'medium', 'low') THEN
    RAISE EXCEPTION 'ns_create_action_item_atrium: invalid priority %', p_priority;
  END IF;
  IF p_kanban_workspace IS NOT NULL
     AND p_kanban_workspace NOT IN ('pathfinder', 'metacron', 'internal', 'sales') THEN
    RAISE EXCEPTION 'ns_create_action_item_atrium: invalid kanban_workspace %', p_kanban_workspace;
  END IF;

  INSERT INTO nervous_system.action_items (
    title,
    description,
    priority,
    status,
    dri,
    due_at,
    kanban_workspace,
    verify_criteria,
    requested_by,
    requested_of,
    last_touched
  ) VALUES (
    v_clean_title,
    nullif(p_description, ''),
    p_priority,
    'open',
    p_dri_id,
    p_due_at,
    p_kanban_workspace,
    nullif(p_verify_criteria, ''),
    jsonb_build_object('origin', 'atrium_work_new_item_modal'),
    CASE
      WHEN p_dri_id IS NOT NULL THEN jsonb_build_object('team_member_id', p_dri_id)
      ELSE '{}'::jsonb
    END,
    now()
  )
  RETURNING nervous_system.action_items.id INTO v_new_id;

  -- Refusal-gate audit hook — bounded write, append-only.
  INSERT INTO nervous_system.audit_log (
    table_name, action, actor_id, payload
  ) VALUES (
    'action_items',
    'action_item_create',
    p_dri_id,
    jsonb_build_object(
      'action_item_id',   v_new_id,
      'title',            v_clean_title,
      'priority',         p_priority,
      'source',           'manual',
      'kanban_workspace', p_kanban_workspace,
      'origin',           'atrium_work_new_item_modal'
    )
  );

  RETURN QUERY
  SELECT
    ai.id,
    ai.title,
    ai.description,
    ai.priority,
    ai.status,
    ai.dri,
    ai.due_at,
    ai.kanban_workspace,
    ai.verify_criteria,
    ai.created_at,
    tm.name AS dri_name
  FROM nervous_system.action_items ai
  LEFT JOIN nervous_system.team_members tm ON tm.id = ai.dri
  WHERE ai.id = v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_create_action_item_atrium(
  text, text, uuid, text, text, timestamptz, text
) TO authenticated, service_role;
