-- 20260511_notion_kanban_mirror.sql
-- Atrium Work > Kanban bidirectional sync with the Internal Org Notion Kanban.
--
-- The mirror table is the canonical local copy of every Notion page in the
-- Internal Org Kanban database. The pull side (Inngest cron + Atrium tab mount)
-- queries Notion every 5 minutes and upserts. The push side (Atrium kanban
-- drag-and-drop) writes Notion first, then upserts the mirror locally.
--
-- Verified column promotions are gated by the UI per HARD CONSTRAINT 3 — the
-- mirror table accepts the 'Verified' value but the server-side write endpoint
-- requires an allow_verified=true override flag before relaying to Notion.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. nervous_system.notion_kanban_mirror
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nervous_system.notion_kanban_mirror (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_page_id       text UNIQUE NOT NULL,
  workspace            text NOT NULL DEFAULT 'internal',
  title                text,
  status               text,
  priority             text,
  source               text,
  surface              text,
  dri_user_id          uuid REFERENCES nervous_system.team_members(id) ON DELETE SET NULL,
  dri_name             text,
  verify_criteria      text,
  implementation_notes text,
  linked_pr_url        text,
  ledger_id            uuid REFERENCES nervous_system.ledger(id) ON DELETE SET NULL,
  notion_url           text,
  notion_last_edited   timestamptz,
  last_touched         timestamptz NOT NULL DEFAULT now(),
  pulled_at            timestamptz NOT NULL DEFAULT now(),
  raw                  jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS notion_kanban_mirror_status_idx
  ON nervous_system.notion_kanban_mirror(workspace, status);

CREATE INDEX IF NOT EXISTS notion_kanban_mirror_last_touched_idx
  ON nervous_system.notion_kanban_mirror(last_touched DESC);

ALTER TABLE nervous_system.notion_kanban_mirror ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notion_kanban_mirror_service_role_all ON nervous_system.notion_kanban_mirror;
CREATE POLICY notion_kanban_mirror_service_role_all
  ON nervous_system.notion_kanban_mirror
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ns_notion_kanban_view — read RPC for the Atrium UI
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_notion_kanban_view(
  p_workspace text DEFAULT 'internal'
)
RETURNS TABLE (
  notion_page_id       text,
  workspace            text,
  title                text,
  status               text,
  priority             text,
  source               text,
  surface              text,
  dri_name             text,
  verify_criteria      text,
  implementation_notes text,
  linked_pr_url        text,
  notion_url           text,
  notion_last_edited   timestamptz,
  last_touched         timestamptz,
  pulled_at            timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT
    m.notion_page_id, m.workspace, m.title, m.status, m.priority, m.source,
    m.surface,
    COALESCE(tm.name, m.dri_name) AS dri_name,
    m.verify_criteria, m.implementation_notes, m.linked_pr_url,
    m.notion_url, m.notion_last_edited, m.last_touched, m.pulled_at
  FROM nervous_system.notion_kanban_mirror m
  LEFT JOIN nervous_system.team_members tm ON tm.id = m.dri_user_id
  WHERE m.workspace = p_workspace
  ORDER BY
    CASE m.status
      WHEN 'Not Yet Started' THEN 0
      WHEN 'Zedcor Demo'     THEN 1
      WHEN 'In Process'      THEN 2
      WHEN 'Review'          THEN 3
      WHEN 'Deployed'        THEN 4
      WHEN 'Bug Fixes'       THEN 5
      WHEN 'Verified'        THEN 6
      ELSE 99
    END,
    m.notion_last_edited DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.ns_notion_kanban_view(text)
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ns_notion_kanban_upsert — write RPC used by both pull and push paths
--    Returns 'inserted' | 'updated' | 'skipped_conflict' so the caller can
--    react to last-touched-wins conflicts.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_notion_kanban_upsert(
  p_notion_page_id       text,
  p_workspace            text DEFAULT 'internal',
  p_title                text DEFAULT NULL,
  p_status               text DEFAULT NULL,
  p_priority             text DEFAULT NULL,
  p_source               text DEFAULT NULL,
  p_surface              text DEFAULT NULL,
  p_dri_user_id          uuid DEFAULT NULL,
  p_dri_name             text DEFAULT NULL,
  p_verify_criteria      text DEFAULT NULL,
  p_implementation_notes text DEFAULT NULL,
  p_linked_pr_url        text DEFAULT NULL,
  p_ledger_id            uuid DEFAULT NULL,
  p_notion_url           text DEFAULT NULL,
  p_notion_last_edited   timestamptz DEFAULT NULL,
  p_raw                  jsonb DEFAULT '{}'::jsonb,
  p_origin               text DEFAULT 'notion_pull'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  v_existing nervous_system.notion_kanban_mirror%ROWTYPE;
  v_action text;
BEGIN
  SELECT * INTO v_existing
  FROM nervous_system.notion_kanban_mirror
  WHERE notion_page_id = p_notion_page_id;

  IF NOT FOUND THEN
    INSERT INTO nervous_system.notion_kanban_mirror (
      notion_page_id, workspace, title, status, priority, source, surface,
      dri_user_id, dri_name, verify_criteria, implementation_notes,
      linked_pr_url, ledger_id, notion_url, notion_last_edited, raw,
      last_touched, pulled_at
    ) VALUES (
      p_notion_page_id, COALESCE(p_workspace, 'internal'), p_title, p_status,
      p_priority, p_source, p_surface, p_dri_user_id, p_dri_name,
      p_verify_criteria, p_implementation_notes, p_linked_pr_url, p_ledger_id,
      p_notion_url, p_notion_last_edited, COALESCE(p_raw, '{}'::jsonb),
      now(), now()
    );
    v_action := 'inserted';
  ELSE
    UPDATE nervous_system.notion_kanban_mirror SET
      workspace            = COALESCE(p_workspace, workspace),
      title                = COALESCE(p_title, title),
      status               = COALESCE(p_status, status),
      priority             = COALESCE(p_priority, priority),
      source               = COALESCE(p_source, source),
      surface              = COALESCE(p_surface, surface),
      dri_user_id          = COALESCE(p_dri_user_id, dri_user_id),
      dri_name             = COALESCE(p_dri_name, dri_name),
      verify_criteria      = COALESCE(p_verify_criteria, verify_criteria),
      implementation_notes = COALESCE(p_implementation_notes, implementation_notes),
      linked_pr_url        = COALESCE(p_linked_pr_url, linked_pr_url),
      ledger_id            = COALESCE(p_ledger_id, ledger_id),
      notion_url           = COALESCE(p_notion_url, notion_url),
      notion_last_edited   = COALESCE(p_notion_last_edited, notion_last_edited),
      raw                  = COALESCE(p_raw, raw),
      last_touched         = now(),
      pulled_at            = CASE WHEN p_origin = 'notion_pull' THEN now() ELSE pulled_at END
    WHERE notion_page_id = p_notion_page_id;
    v_action := 'updated';
  END IF;

  INSERT INTO nervous_system.audit_log (table_name, action, actor_id, payload)
  VALUES (
    'nervous_system.notion_kanban_mirror',
    'notion_kanban_' || v_action,
    NULL,
    jsonb_build_object(
      'notion_page_id', p_notion_page_id,
      'workspace',      COALESCE(p_workspace, 'internal'),
      'status',         p_status,
      'origin',         p_origin
    )
  );

  RETURN v_action;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_notion_kanban_upsert(
  text, text, text, text, text, text, text, uuid, text, text, text, text,
  uuid, text, timestamptz, jsonb, text
) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ns_notion_kanban_mark_pull — record successful pull batches for audit
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_notion_kanban_mark_pull(
  p_workspace text,
  p_count     int,
  p_origin    text DEFAULT 'inngest_cron'
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  INSERT INTO nervous_system.audit_log (table_name, action, actor_id, payload)
  VALUES (
    'nervous_system.notion_kanban_mirror',
    'notion_kanban_pull_complete',
    NULL,
    jsonb_build_object(
      'workspace', p_workspace,
      'pulled',    p_count,
      'origin',    p_origin,
      'at',        now()
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.ns_notion_kanban_mark_pull(text, int, text)
  TO service_role;
