-- 20260513_ns_create_decision_from_call.sql — Bug Fix: Call upload fan-out
--
-- Goal #4 requires writes to nervous_system.decisions. The architecture
-- stores decisions as nervous_system.ledger rows with source_type='decision'
-- (see ns_slack_daily_scan_insert_decision precedent + ns_list_ledger_decisions
-- which the Atrium DecisionsTimeline reads from). This migration adds the
-- call-flavor of that pattern: each decision extracted from a transcript
-- becomes its own ledger row, linked back to the parent call's ledger row
-- via insights.parent_call_ledger_id so the call detail panel can surface
-- "Decisions from this call".
--
-- Additive only.

CREATE OR REPLACE FUNCTION public.ns_create_decision_from_call(
  p_parent_call_ledger_id   uuid,
  p_parent_call_notion_url  text,
  p_parent_call_title       text,
  p_decision_text           text,
  p_rationale               text,
  p_decided_by              text,           -- free-text speaker label, e.g. "Kyle" or "Customer X"
  p_uploaded_by             text             -- operator email
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  v_id        uuid;
  v_insights  jsonb;
BEGIN
  v_insights := jsonb_build_object(
    'decision_type',          'call_decision',
    'parent_call_ledger_id',  p_parent_call_ledger_id,
    'parent_call_notion_url', p_parent_call_notion_url,
    'parent_call_title',      p_parent_call_title,
    'decided_by',             p_decided_by,
    'rationale',              p_rationale,
    'uploaded_by',            p_uploaded_by,
    'via',                    'atrium_work_calls_upload'
  );

  INSERT INTO nervous_system.ledger (
    source_type,
    source_url,
    content_summary,
    content_full,
    insights
  )
  VALUES (
    'decision',
    p_parent_call_notion_url,
    left(COALESCE(NULLIF(trim(p_decision_text), ''), '(empty decision)'), 500),
    p_decision_text,
    v_insights
  )
  RETURNING id INTO v_id;

  INSERT INTO nervous_system.audit_log (
    table_name, action, actor_id, payload
  )
  VALUES (
    'ledger',
    'decision_created_from_call',
    NULL,
    jsonb_build_object(
      'decision_ledger_id',     v_id,
      'parent_call_ledger_id',  p_parent_call_ledger_id,
      'parent_call_notion_url', p_parent_call_notion_url,
      'decided_by',             p_decided_by,
      'uploaded_by',            p_uploaded_by
    )
  );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ns_create_decision_from_call(
  uuid, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_create_decision_from_call(
  uuid, text, text, text, text, text, text
) TO service_role;
