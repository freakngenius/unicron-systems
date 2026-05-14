-- 20260513_ns_get_call_ledger_row.sql
--
-- Bug 1 of the Atrium blockers goal (2026-05-13): the call detail view
-- re-fetches the parent ledger row when processing completes so freshly
-- extracted `key_takeaways` / `extracted_insights` show up without a
-- manual refresh. Single-row companion to ns_list_ledger_calls.

CREATE OR REPLACE FUNCTION public.ns_get_call_ledger_row(p_call_id uuid)
RETURNS TABLE (
  id              uuid,
  source_type     text,
  content_summary text,
  content_full    text,
  insights        jsonb,
  created_at      timestamptz,
  customer_id     uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system','public'
AS $$
  SELECT l.id, l.source_type, l.content_summary, l.content_full, l.insights, l.created_at, l.customer_id
  FROM nervous_system.ledger l
  WHERE l.id = p_call_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.ns_get_call_ledger_row(uuid)
  TO authenticated, anon, service_role;
