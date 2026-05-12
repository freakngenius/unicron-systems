-- 20260512_nervous_system_calls_mirror.sql — Calls Ingestion Sprint Stream C4
--
-- Mirror table for the Notion Call Transcripts DB. The Inngest cron
-- notion-calls-sync-pull (every 10 min) UPSERTs into this table keyed by
-- notion_page_id. Atrium Work > Calls reads from public.ns_list_calls()
-- without ever touching the Notion API directly — same architecture as
-- nervous_system.notion_kanban_mirror (PR #349).
--
-- Schema lines up with the data source 624b6032-4418-49c2-a97c-b62a3532ea19:
--   Title (title) / Date (date) / Participants (multi_select fixed options) /
--   Key Takeaways (rich_text) / Insights (rich_text) / Transcript Files (file)
-- Plus body-derived fields the upload handler stores:
--   transcript_body — full transcript text from the page body (extracted on pull)
--   external_participants — names not in the canonical multi_select option list
--
-- HARD CONSTRAINT 1 — additive only. No DROP, no destructive ALTER.

CREATE TABLE IF NOT EXISTS nervous_system.calls (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_page_id       text UNIQUE NOT NULL,
  notion_url           text,
  title                text,
  call_date            date,
  participants         text[]      NOT NULL DEFAULT ARRAY[]::text[],   -- canonical multi_select names
  external_participants text[]     NOT NULL DEFAULT ARRAY[]::text[],   -- free-text externals
  key_takeaways        text,
  insights             text,
  transcript_body      text,                                            -- truncated to first 50k chars
  source               text,                                            -- manual_upload | plaud | fathom | zoom
  ledger_id            uuid REFERENCES nervous_system.ledger(id) ON DELETE SET NULL,
  notion_last_edited   timestamptz,
  pulled_at            timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  raw                  jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS calls_call_date_idx ON nervous_system.calls(call_date DESC);
CREATE INDEX IF NOT EXISTS calls_participants_gin_idx ON nervous_system.calls USING gin(participants);
CREATE INDEX IF NOT EXISTS calls_pulled_at_idx ON nervous_system.calls(pulled_at DESC);

ALTER TABLE nervous_system.calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calls_service_role_all ON nervous_system.calls;
CREATE POLICY calls_service_role_all
  ON nervous_system.calls
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- ns_upsert_call — UPSERT helper for the Inngest pull job.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_upsert_call(
  p_notion_page_id        text,
  p_notion_url            text,
  p_title                 text,
  p_call_date             date,
  p_participants          text[],
  p_external_participants text[],
  p_key_takeaways         text,
  p_insights              text,
  p_transcript_body       text,
  p_source                text,
  p_notion_last_edited    timestamptz,
  p_raw                   jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO nervous_system.calls AS c (
    notion_page_id, notion_url, title, call_date,
    participants, external_participants,
    key_takeaways, insights, transcript_body, source,
    notion_last_edited, pulled_at, raw
  )
  VALUES (
    p_notion_page_id, p_notion_url, p_title, p_call_date,
    COALESCE(p_participants, ARRAY[]::text[]),
    COALESCE(p_external_participants, ARRAY[]::text[]),
    p_key_takeaways, p_insights, p_transcript_body, p_source,
    p_notion_last_edited, now(), COALESCE(p_raw, '{}'::jsonb)
  )
  ON CONFLICT (notion_page_id) DO UPDATE SET
    notion_url             = EXCLUDED.notion_url,
    title                  = EXCLUDED.title,
    call_date              = EXCLUDED.call_date,
    participants           = EXCLUDED.participants,
    external_participants  = EXCLUDED.external_participants,
    key_takeaways          = EXCLUDED.key_takeaways,
    insights               = EXCLUDED.insights,
    transcript_body        = EXCLUDED.transcript_body,
    source                 = EXCLUDED.source,
    notion_last_edited     = EXCLUDED.notion_last_edited,
    pulled_at              = now(),
    raw                    = EXCLUDED.raw
  RETURNING c.id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ns_upsert_call(text, text, text, date, text[], text[], text, text, text, text, timestamptz, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_upsert_call(text, text, text, date, text[], text[], text, text, text, text, timestamptz, jsonb)
  TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- ns_list_calls — read RPC for the Atrium UI.
-- Optional filter by participant name. Returns the action item count per call
-- (joined on action_items.related_call_id which lands in C6).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_calls(
  p_participant text DEFAULT NULL,
  p_limit       int  DEFAULT 100
)
RETURNS TABLE (
  id                   uuid,
  notion_page_id       text,
  notion_url           text,
  title                text,
  call_date            date,
  participants         text[],
  external_participants text[],
  key_takeaways        text,
  insights             text,
  source               text,
  action_item_count    bigint,
  notion_last_edited   timestamptz,
  pulled_at            timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT
    c.id, c.notion_page_id, c.notion_url, c.title, c.call_date,
    c.participants, c.external_participants,
    c.key_takeaways, c.insights, c.source,
    -- action_item_count is 0 until C6 wires the link column.
    -- COALESCE the count subquery so calls without action items return 0
    -- rather than NULL.
    COALESCE((
      SELECT count(*)::bigint
      FROM nervous_system.action_items ai
      WHERE ai.related_call_id = c.id
    ), 0) AS action_item_count,
    c.notion_last_edited, c.pulled_at
  FROM nervous_system.calls c
  WHERE p_participant IS NULL
     OR p_participant = ANY(c.participants)
     OR p_participant = ANY(c.external_participants)
  ORDER BY c.call_date DESC NULLS LAST, c.pulled_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_calls(text, int)
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Forward-compat: action_items.related_call_id
--
-- C6 will wire action item creation to point at nervous_system.calls.id. The
-- column is added here so ns_list_calls can join from day one (count returns
-- 0 until C6 starts populating it). If the action_items table already has the
-- column (parallel branches), this is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'nervous_system' AND table_name = 'action_items'
  ) AND NOT EXISTS (
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
END $$;
