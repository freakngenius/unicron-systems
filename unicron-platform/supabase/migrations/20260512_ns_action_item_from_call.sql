-- 20260512_ns_action_item_from_call.sql — Calls Ingestion Sprint Stream C6
--
-- ns_create_action_item_from_call: insert an action_item row extracted from
-- a call transcript. Links back to the call (related_call_id) and the call's
-- Notion page (related_call_notion_url) so the bidirectional Kanban sync can
-- pick it up on the next pull and stitch the trio (Atrium row ↔ Notion task
-- ↔ Call transcript page) together.
--
-- Promotes the transcript skill from status='scaffolded' to status='active'
-- now that the full pipeline (C2 + C3 + C6) is wired.
--
-- Additive only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Schema additions — defensive (skip when already present from C4).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'nervous_system'
      AND table_name = 'action_items'
      AND column_name = 'related_call_id'
  ) THEN
    EXECUTE 'ALTER TABLE nervous_system.action_items
             ADD COLUMN related_call_id uuid
             REFERENCES nervous_system.calls(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS action_items_related_call_id_idx
             ON nervous_system.action_items(related_call_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'nervous_system'
      AND table_name = 'action_items'
      AND column_name = 'related_call_notion_url'
  ) THEN
    EXECUTE 'ALTER TABLE nervous_system.action_items
             ADD COLUMN related_call_notion_url text';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'nervous_system'
      AND table_name = 'action_items'
      AND column_name = 'notion_page_id'
  ) THEN
    EXECUTE 'ALTER TABLE nervous_system.action_items
             ADD COLUMN notion_page_id text';
    EXECUTE 'CREATE INDEX IF NOT EXISTS action_items_notion_page_id_idx
             ON nervous_system.action_items(notion_page_id)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ns_create_action_item_from_call
--
--    Inserts the action_item, returns the new id. The caller (C6 flow code in
--    lib/calls-action-item-flow.ts) then pushes the row to the Internal Org
--    Kanban via the Notion API and updates notion_page_id via
--    ns_set_action_item_notion_page_id.
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- Best-effort DRI resolution by case-insensitive name match.
  SELECT id INTO v_dri
  FROM nervous_system.team_members
  WHERE lower(name) = lower(p_owner_name)
  LIMIT 1;

  INSERT INTO nervous_system.action_items (
    title, description, priority, status, dri, due_at, kanban_workspace,
    related_call_id, related_call_notion_url
  )
  VALUES (
    p_title,
    p_description,
    COALESCE(NULLIF(p_priority, ''), 'medium'),
    'open',
    v_dri,
    p_due_at,
    COALESCE(NULLIF(p_kanban_workspace, ''), 'internal'),
    p_call_id,
    p_call_notion_url
  )
  RETURNING id INTO v_id;

  -- Audit row for the refusal layer.
  INSERT INTO nervous_system.audit_log (
    table_name, action, target_id, actor, metadata
  )
  VALUES (
    'action_items',
    'action_item_create_from_call',
    v_id,
    COALESCE(p_owner_name, 'unknown'),
    jsonb_build_object(
      'call_id',           p_call_id,
      'call_notion_url',   p_call_notion_url,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ns_set_action_item_notion_page_id
--    Called after the Notion Kanban card is created so the action_item row
--    knows its corresponding Notion page (for bidirectional sync alignment).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_set_action_item_notion_page_id(
  p_action_item_id uuid,
  p_notion_page_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  UPDATE nervous_system.action_items
  SET notion_page_id = p_notion_page_id
  WHERE id = p_action_item_id;
$$;

REVOKE EXECUTE ON FUNCTION public.ns_set_action_item_notion_page_id(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_set_action_item_notion_page_id(uuid, text)
  TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Promote transcript skill from scaffolded → active.
--    The full pipeline (C2 + C3 + C6) is now wired end-to-end. Until this
--    migration applies the skill row stays scaffolded and /api/atrium/skills/
--    run returns 202; after this migration the skill registers as active.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE nervous_system.skills
SET status = 'active',
    updated_at = now()
WHERE name = 'transcript' AND status = 'scaffolded';
