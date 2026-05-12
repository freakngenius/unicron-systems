-- 20260512_usefulness_pass_unify_decisions.sql
-- Item 2 of the Atrium usefulness pass (2026-05-12).
--
-- Work > Decisions and Now > Digest > Decisions previously read from different
-- ledger source_types. The Digest path (source_type='decision') is where the
-- Slack daily scan writes real rows; the Work path (source_type='elder_decision')
-- pointed at an Elder-only column that has been empty since shipping.
--
-- Unify both views on source_type IN ('decision','elder_decision'). The
-- 'elder_decision' path is kept for backward-compat — it can be dropped once
-- the empty table is removed (separate Bug Fix card).

CREATE OR REPLACE FUNCTION public.ns_list_ledger_decisions(p_limit int DEFAULT 100)
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
  WHERE source_type IN ('decision', 'elder_decision')
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_ledger_decisions(int) TO authenticated, anon, service_role;
