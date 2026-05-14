-- 20260513_call_expanded_view_rpcs_v2.sql
--
-- Corrects 20260513_call_expanded_view_rpcs.sql + 20260513_call_upload_processing_status_rpc.sql:
--
--   * ns_create_decision_from_call stores decisions as ledger rows with
--     insights.parent_call_ledger_id (NOT insights.call_id).
--   * ns_link_call_customer_mentions does NOT create separate ledger rows; it
--     appends mentions to the CALL's own ledger row insights.mentioned_customers
--     and insights.mentioned_customers_unresolved.
--
-- This migration rewrites the three reader RPCs and the polling RPC so the
-- counts + lists pull from the correct columns. Re-apply is idempotent.

-- ─── Decisions reader ────────────────────────────────────────────────────────
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
    coalesce(content_full, content_summary, '')                              AS decision,
    insights ->> 'rationale'                                                  AS rationale,
    coalesce(insights ->> 'decided_by', insights ->> 'decided_by_name')       AS decided_by,
    created_at
  FROM nervous_system.ledger
  WHERE source_type = 'decision'
    AND (insights ->> 'parent_call_ledger_id')::uuid = p_call_id
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_call_decisions_for(uuid)
  TO authenticated, anon, service_role;

-- ─── Customer mentions reader ─────────────────────────────────────────────────
-- Mentions live as an array inside the call's own ledger row insights.
-- Expand them into rows so the UI can render a list.
-- DROP first: return type changed from the v1 migration.
DROP FUNCTION IF EXISTS public.ns_list_call_customer_mentions_for(uuid);

CREATE OR REPLACE FUNCTION public.ns_list_call_customer_mentions_for(p_call_id uuid)
RETURNS TABLE (
  ordinal       int,
  customer_name text,
  sentiment     text,
  snippet       text,
  customer_id   uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  WITH call_row AS (
    SELECT insights FROM nervous_system.ledger WHERE id = p_call_id LIMIT 1
  ),
  combined AS (
    SELECT
      m.ord::int                                              AS ordinal,
      coalesce(m.m ->> 'customer_name', m.m ->> 'name', '')   AS customer_name,
      coalesce(m.m ->> 'sentiment', 'neutral')                AS sentiment,
      coalesce(m.m ->> 'snippet', m.m ->> 'quote', '')        AS snippet,
      NULLIF(m.m ->> 'customer_id', '')::uuid                 AS customer_id
    FROM call_row, jsonb_array_elements(coalesce(call_row.insights -> 'mentioned_customers', '[]'::jsonb))
         WITH ORDINALITY AS m(m, ord)
    UNION ALL
    SELECT
      1000 + m.ord::int                                       AS ordinal,
      coalesce(m.m ->> 'customer_name', m.m ->> 'name', '')   AS customer_name,
      coalesce(m.m ->> 'sentiment', 'neutral')                AS sentiment,
      coalesce(m.m ->> 'snippet', m.m ->> 'quote', '')        AS snippet,
      NULL::uuid                                              AS customer_id
    FROM call_row, jsonb_array_elements(coalesce(call_row.insights -> 'mentioned_customers_unresolved', '[]'::jsonb))
         WITH ORDINALITY AS m(m, ord)
  )
  SELECT ordinal, customer_name, sentiment, snippet, customer_id
  FROM combined
  WHERE customer_name <> ''
  ORDER BY ordinal;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_call_customer_mentions_for(uuid)
  TO authenticated, anon, service_role;

-- ─── Processing status (polling) ─────────────────────────────────────────────
-- Re-write counts to look in the right places.
CREATE OR REPLACE FUNCTION public.ns_call_processing_status(p_call_id uuid)
RETURNS TABLE (
  state                text,
  action_items_count   int,
  decisions_count      int,
  mentions_count       int,
  audit_log_id         uuid,
  audit_log_created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  WITH
    ai AS (
      SELECT count(*)::int AS n
      FROM nervous_system.action_items
      WHERE ledger_id = p_call_id
    ),
    decs AS (
      SELECT count(*)::int AS n
      FROM nervous_system.ledger
      WHERE source_type = 'decision'
        AND (insights ->> 'parent_call_ledger_id')::uuid = p_call_id
    ),
    mens AS (
      SELECT
        coalesce(jsonb_array_length(insights -> 'mentioned_customers'), 0)
        + coalesce(jsonb_array_length(insights -> 'mentioned_customers_unresolved'), 0) AS n
      FROM nervous_system.ledger
      WHERE id = p_call_id
    ),
    aud AS (
      SELECT id, created_at
      FROM nervous_system.audit_log
      WHERE action = 'call_upload_fixed_complete'
        AND (payload ->> 'call_id')::uuid = p_call_id
      ORDER BY created_at DESC
      LIMIT 1
    )
  SELECT
    CASE
      WHEN (SELECT id FROM aud) IS NOT NULL THEN 'done'
      ELSE 'processing'
    END                                                  AS state,
    coalesce((SELECT n FROM ai),   0)                     AS action_items_count,
    coalesce((SELECT n FROM decs), 0)                     AS decisions_count,
    coalesce((SELECT n FROM mens), 0)                     AS mentions_count,
    (SELECT id FROM aud)                                  AS audit_log_id,
    (SELECT created_at FROM aud)                          AS audit_log_created_at;
$$;

GRANT EXECUTE ON FUNCTION public.ns_call_processing_status(uuid)
  TO authenticated, anon, service_role;
