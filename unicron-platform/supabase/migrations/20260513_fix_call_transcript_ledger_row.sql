-- 20260513_fix_call_transcript_ledger_row.sql — Bug Fix: Call upload fan-out
--
-- Root cause (verbatim error captured 2026-05-13):
--   ERROR: 42804: column "participants" is of type uuid[] but expression
--   is of type text[]
--   HINT: You will need to rewrite or cast the expression.
--   CONTEXT: PL/pgSQL function
--   ns_create_call_transcript_ledger_row(text,text,text,text[],text,text,
--   text,date,text) line 17 at SQL statement
--
-- The prior C3 migration (20260512_ns_create_call_transcript_ledger_row.sql)
-- passes p_participants text[] directly into nervous_system.ledger.participants
-- which is uuid[]. Every Atrium call upload has been failing at this INSERT
-- since C3 shipped, returning HTTP 207 to the modal.
--
-- Secondary defect: the embedded audit_log INSERT targets columns
-- (target_id, actor, metadata) which do not exist on the live audit_log
-- schema (id, table_name, action, actor_id, payload, created_at).
--
-- This migration recreates the RPC to:
--   1. Resolve participant names to team_members.id via case-insensitive
--      name match. Unmatched names are dropped from the uuid[] column but
--      preserved verbatim in insights.participants so the UI keeps showing
--      external attendees.
--   2. Use the correct audit_log columns. actor_id is left NULL because the
--      caller passes an email string, not a uuid (there's no auth.users
--      lookup yet — that's a separate Bug Fix follow-up).
--
-- Additive only. No DROP. No destructive ALTER. The function signature
-- (parameter list) is unchanged, so callers (lib/calls-ingest.ts) need no
-- code change.

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
  v_id              uuid;
  v_resolved_uuids  uuid[] := ARRAY[]::uuid[];
  v_insights        jsonb;
BEGIN
  -- Resolve participant strings to team_members.id where the name matches
  -- case-insensitively. Unresolved entries are silently dropped from the
  -- uuid[] column; they remain available in insights.participants as
  -- free-text. This keeps ledger.participants compatible with downstream
  -- queries that join on team_members while still surfacing externals in
  -- the UI.
  IF p_participants IS NOT NULL AND array_length(p_participants, 1) IS NOT NULL THEN
    SELECT COALESCE(array_agg(tm.id), ARRAY[]::uuid[])
      INTO v_resolved_uuids
    FROM unnest(p_participants) AS p(name)
    JOIN nervous_system.team_members tm
      ON lower(tm.name) = lower(p.name);
  END IF;

  v_insights := jsonb_build_object(
    'title',                p_title,
    'participants',         COALESCE(p_participants, ARRAY[]::text[]),
    'participant_uuids',    v_resolved_uuids,
    'notion_page_id',       p_notion_page_id,
    'notion_url',           p_notion_url,
    'source',               COALESCE(p_source, 'manual_upload'),
    'call_date',            p_call_date,
    'uploaded_by',          p_uploaded_by,
    'via',                  'atrium_work_calls_upload'
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
    v_resolved_uuids,
    v_insights,
    CASE
      WHEN p_call_date IS NULL THEN now()
      WHEN p_call_date = CURRENT_DATE THEN now()
      ELSE (p_call_date::timestamp + (now()::time))::timestamptz
    END
  )
  RETURNING id INTO v_id;

  -- Audit hook. Uses the live audit_log schema:
  --   (id, table_name, action, actor_id, payload, created_at)
  -- actor_id is nullable; we leave it NULL because p_uploaded_by is an
  -- email string, not an auth.users uuid. The email is preserved inside
  -- payload.uploaded_by for traceability.
  INSERT INTO nervous_system.audit_log (
    table_name,
    action,
    actor_id,
    payload
  )
  VALUES (
    'ledger',
    'call_transcript_uploaded',
    NULL,
    jsonb_build_object(
      'ledger_id',       v_id,
      'notion_page_id',  p_notion_page_id,
      'notion_url',      p_notion_url,
      'source',          p_source,
      'participants',    p_participants,
      'uploaded_by',     p_uploaded_by
    )
  );

  RETURN v_id;
END;
$$;

-- Permissions are unchanged from the C3 migration — service_role only.
REVOKE EXECUTE ON FUNCTION public.ns_create_call_transcript_ledger_row(
  text, text, text, text[], text, text, text, date, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ns_create_call_transcript_ledger_row(
  text, text, text, text[], text, text, text, date, text
) TO service_role;
