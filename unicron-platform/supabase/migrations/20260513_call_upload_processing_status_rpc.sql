-- 20260513_call_upload_processing_status_rpc.sql
--
-- Goal "Fix Atrium call upload end-to-end" — Condition 1: the bottom status
-- bar in Atrium Work > Calls polls this RPC after a successful upload to
-- transition "Call uploading..." → "Processing transcript..." → "Done: N
-- to-dos, M decisions, K mentions" + audit_log id.
--
-- The pipeline (calls-action-item-flow.ts) writes an audit_log row with
-- action='call_upload_fixed_complete' on success. This RPC counts the rows
-- created for the call's ledger_id and returns the most recent matching
-- audit_log id (or NULL if still processing).
--
-- Additive only.

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
        AND (insights ->> 'call_id')::uuid = p_call_id
    ),
    mens AS (
      SELECT count(*)::int AS n
      FROM nervous_system.ledger
      WHERE source_type = 'customer_mention'
        AND (insights ->> 'call_id')::uuid = p_call_id
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
    coalesce((SELECT n FROM ai), 0)                       AS action_items_count,
    coalesce((SELECT n FROM decs), 0)                     AS decisions_count,
    coalesce((SELECT n FROM mens), 0)                     AS mentions_count,
    (SELECT id FROM aud)                                  AS audit_log_id,
    (SELECT created_at FROM aud)                          AS audit_log_created_at;
$$;

GRANT EXECUTE ON FUNCTION public.ns_call_processing_status(uuid) TO authenticated, anon, service_role;
