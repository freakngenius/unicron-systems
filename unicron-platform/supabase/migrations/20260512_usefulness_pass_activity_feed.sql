-- 20260512_usefulness_pass_activity_feed.sql
-- Item 8 of the Atrium usefulness pass (2026-05-12).
--
-- Backfill RPC for the Now > Activity feed. Previously the feed only rendered
-- live INSERTs over the Supabase Realtime channel, which meant the feed sat
-- empty for operators who opened the tab at a quiet moment. This RPC returns
-- the most recent N nervous_system.ledger rows so the feed pre-populates on
-- mount; new INSERTs continue to prepend via the existing Realtime channel.

CREATE OR REPLACE FUNCTION public.ns_list_ledger_recent(p_limit int DEFAULT 50)
RETURNS TABLE (
  id              uuid,
  source_type     text,
  content_summary text,
  insights        jsonb,
  created_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, source_type, content_summary, insights, created_at
  FROM nervous_system.ledger
  ORDER BY created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_ledger_recent(int) TO authenticated, anon, service_role;
