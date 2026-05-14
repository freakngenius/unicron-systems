-- 20260513_call_expanded_view_rpcs.sql
--
-- Goal "Fix Atrium call upload end-to-end" — Condition 5 needs three read
-- RPCs powering the expanded call view in unicron-platform/src/atrium/work/
-- ExpandedCallView.tsx:
--
--   ns_list_call_action_items_for(p_call_id)     — action_items + notion_page_id
--   ns_list_call_decisions_for(p_call_id)        — decision rows linked via insights.call_id
--   ns_list_call_customer_mentions_for(p_call_id) — customer_mention rows linked via insights.call_id
--
-- Additive — does not touch the existing ns_list_action_items_by_ledger
-- (which is consumed by older surfaces with a narrower column set).

CREATE OR REPLACE FUNCTION public.ns_list_call_action_items_for(p_call_id uuid)
RETURNS TABLE (
  id              uuid,
  title           text,
  priority        text,
  status          text,
  notion_page_id  text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, title, priority, status, notion_page_id
  FROM nervous_system.action_items
  WHERE ledger_id = p_call_id
  ORDER BY
    CASE priority
      WHEN 'irreversible' THEN 0
      WHEN 'high'         THEN 1
      WHEN 'medium'       THEN 2
      WHEN 'low'          THEN 3
      ELSE 4
    END,
    created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_call_action_items_for(uuid)
  TO authenticated, anon, service_role;


CREATE OR REPLACE FUNCTION public.ns_list_call_decisions_for(p_call_id uuid)
RETURNS TABLE (
  id          uuid,
  decision    text,
  rationale   text,
  decided_by  text,
  created_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT
    id,
    coalesce(insights ->> 'decision_text', content_summary, '')                   AS decision,
    insights ->> 'rationale'                                                       AS rationale,
    coalesce(insights ->> 'decided_by', insights ->> 'decided_by_name')            AS decided_by,
    created_at
  FROM nervous_system.ledger
  WHERE source_type = 'decision'
    AND (insights ->> 'call_id')::uuid = p_call_id
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_call_decisions_for(uuid)
  TO authenticated, anon, service_role;


CREATE OR REPLACE FUNCTION public.ns_list_call_customer_mentions_for(p_call_id uuid)
RETURNS TABLE (
  id            uuid,
  customer_name text,
  sentiment     text,
  snippet       text,
  customer_id   uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT
    id,
    coalesce(insights ->> 'customer_name', '')         AS customer_name,
    coalesce(insights ->> 'sentiment', 'neutral')      AS sentiment,
    coalesce(insights ->> 'snippet', content_summary)  AS snippet,
    customer_id
  FROM nervous_system.ledger
  WHERE source_type = 'customer_mention'
    AND (insights ->> 'call_id')::uuid = p_call_id
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_call_customer_mentions_for(uuid)
  TO authenticated, anon, service_role;
