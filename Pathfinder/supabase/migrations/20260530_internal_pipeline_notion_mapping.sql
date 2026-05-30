-- 20260530_internal_pipeline_notion_mapping.sql, Stream G.
-- Additive: new table for the Internal Pipeline Notion two-way sync.
-- Maps a pathfinder.deals row to its mirror Notion page so the webhook
-- receiver can find the deal for a given Notion page edit and the
-- app-side updater can find the Notion page for a given deal move.
--
-- No existing schema is altered. No other org is touched.

CREATE TABLE IF NOT EXISTS pathfinder.notion_pipeline_pages (
  deal_id uuid PRIMARY KEY REFERENCES pathfinder.deals(id) ON DELETE CASCADE,
  notion_page_id text NOT NULL UNIQUE,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  synced_from text NOT NULL CHECK (synced_from IN ('app', 'notion', 'seed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notion_pipeline_pages_notion_page_id_idx
  ON pathfinder.notion_pipeline_pages (notion_page_id);

ALTER TABLE pathfinder.notion_pipeline_pages ENABLE ROW LEVEL SECURITY;

-- Server-only writes; no anon read. Mirrors the pathfinder.deals RLS
-- posture from migration 0050. Service-role bypasses RLS (used by the
-- seed script and the webhook receiver).
DROP POLICY IF EXISTS notion_pipeline_pages_block_anon ON pathfinder.notion_pipeline_pages;
CREATE POLICY notion_pipeline_pages_block_anon ON pathfinder.notion_pipeline_pages
  FOR ALL TO anon
  USING (false) WITH CHECK (false);
