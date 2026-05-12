-- 20260512_ns_create_call_transcript_ledger_row.sql — Calls Ingestion Sprint Stream C3
--
-- RPC that inserts a row into nervous_system.ledger when a transcript has
-- just been stored in the Notion Call Transcripts DB. Called by the upload
-- handler at api/atrium/calls/upload.ts after createCallTranscriptPage()
-- returns.
--
-- The Atrium Work > Calls tab reads nervous_system.ledger via ns_list_ledger_calls,
-- so writing a ledger row here makes the uploaded call appear in the list
-- without waiting for the C4 mirror table to sync.
--
-- SECURITY DEFINER: the upload handler authenticates the caller against
-- ATRIUM_EMAIL_ALLOWLIST first, then uses the service role to invoke this
-- RPC. The RPC itself does not re-check email allowlist — the handler is
-- the trust boundary.
--
-- Additive only. No DROP, no destructive ALTER.

CREATE OR REPLACE FUNCTION public.ns_create_call_transcript_ledger_row(
  p_title           text,
  p_summary         text,
  p_content_full    text,
  p_participants    text[],
  p_notion_page_id  text,
  p_notion_url      text,
  p_source          text,           -- 'manual_upload' | 'plaud' | 'fathom' | 'zoom'
  p_call_date       date,
  p_uploaded_by     text             -- email of the operator who uploaded
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
    'title',           p_title,
    'participants',    COALESCE(p_participants, ARRAY[]::text[]),
    'notion_page_id',  p_notion_page_id,
    'notion_url',      p_notion_url,
    'source',          COALESCE(p_source, 'manual_upload'),
    'call_date',       p_call_date,
    'uploaded_by',     p_uploaded_by,
    'via',             'atrium_work_calls_upload'
  );

  INSERT INTO nervous_system.ledger (
    source_type,
    content_summary,
    content_full,
    participants,
    insights,
    created_at
  )
  VALUES (
    'call',
    COALESCE(NULLIF(trim(p_summary), ''), p_title),
    p_content_full,
    COALESCE(p_participants, ARRAY[]::text[]),
    v_insights,
    -- Anchor the ledger row's created_at to the call date when provided so
    -- the timeline view stays chronologically accurate. Default to now() if
    -- caller passes today's date or NULL.
    CASE
      WHEN p_call_date IS NULL THEN now()
      WHEN p_call_date = CURRENT_DATE THEN now()
      ELSE (p_call_date::timestamp + (now()::time))::timestamptz
    END
  )
  RETURNING id INTO v_id;

  -- Audit hook: record the upload event for refusal-layer observability.
  INSERT INTO nervous_system.audit_log (
    table_name,
    action,
    target_id,
    actor,
    metadata
  )
  VALUES (
    'ledger',
    'call_transcript_uploaded',
    v_id,
    COALESCE(p_uploaded_by, 'unknown'),
    jsonb_build_object(
      'notion_page_id', p_notion_page_id,
      'notion_url',     p_notion_url,
      'source',         p_source,
      'participants',   p_participants
    )
  );

  RETURN v_id;
END;
$$;

-- Revoke broad access — service_role only. The upload handler holds the
-- service role key; browsers never call this RPC directly.
REVOKE EXECUTE ON FUNCTION public.ns_create_call_transcript_ledger_row(
  text, text, text, text[], text, text, text, date, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ns_create_call_transcript_ledger_row(
  text, text, text, text[], text, text, text, date, text
) TO service_role;
