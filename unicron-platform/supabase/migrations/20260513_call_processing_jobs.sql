-- 20260513_call_processing_jobs.sql
--
-- Goal "Atrium blockers — call processing timeout + route slugs" Bug 1:
-- the upload handler must return < 5s and the long-running extraction
-- runs in Inngest. The UI needs an explicit job record to poll so it can
-- distinguish queued/processing/complete/failed (previously inferred
-- 'done' from an audit_log row; failures never wrote one, so polling
-- hit the wall-clock cap forever).
--
-- Additive only — does NOT drop the existing ns_call_processing_status
-- RPC (still used elsewhere).

CREATE TABLE IF NOT EXISTS nervous_system.call_processing_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id         uuid NOT NULL REFERENCES nervous_system.ledger(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','processing','complete','failed')),
  error_message   text,
  action_items_count      int NOT NULL DEFAULT 0,
  decisions_count         int NOT NULL DEFAULT 0,
  mentions_count          int NOT NULL DEFAULT 0,
  key_takeaways_count     int NOT NULL DEFAULT 0,
  insights_count          int NOT NULL DEFAULT 0,
  audit_log_id    uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_processing_jobs_call_id_idx
  ON nervous_system.call_processing_jobs (call_id, created_at DESC);

-- Create a new job in 'queued' state. Returns the job id.
CREATE OR REPLACE FUNCTION public.ns_create_call_processing_job(p_call_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system','public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO nervous_system.call_processing_jobs (call_id, status)
  VALUES (p_call_id, 'queued')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_create_call_processing_job(uuid)
  TO authenticated, anon, service_role;

-- Update an existing job. Any nullable arg leaves the column unchanged.
CREATE OR REPLACE FUNCTION public.ns_update_call_processing_job(
  p_job_id              uuid,
  p_status              text,
  p_error_message       text DEFAULT NULL,
  p_action_items_count  int  DEFAULT NULL,
  p_decisions_count     int  DEFAULT NULL,
  p_mentions_count      int  DEFAULT NULL,
  p_key_takeaways_count int  DEFAULT NULL,
  p_insights_count      int  DEFAULT NULL,
  p_audit_log_id        uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system','public'
AS $$
BEGIN
  UPDATE nervous_system.call_processing_jobs SET
    status        = COALESCE(p_status, status),
    error_message = COALESCE(p_error_message, error_message),
    action_items_count  = COALESCE(p_action_items_count, action_items_count),
    decisions_count     = COALESCE(p_decisions_count, decisions_count),
    mentions_count      = COALESCE(p_mentions_count, mentions_count),
    key_takeaways_count = COALESCE(p_key_takeaways_count, key_takeaways_count),
    insights_count      = COALESCE(p_insights_count, insights_count),
    audit_log_id  = COALESCE(p_audit_log_id, audit_log_id),
    started_at    = CASE WHEN p_status = 'processing' AND started_at IS NULL
                         THEN now() ELSE started_at END,
    completed_at  = CASE WHEN p_status IN ('complete','failed') AND completed_at IS NULL
                         THEN now() ELSE completed_at END,
    updated_at    = now()
  WHERE id = p_job_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_update_call_processing_job(
  uuid, text, text, int, int, int, int, int, uuid
) TO authenticated, anon, service_role;

-- Return the latest job for a given call_id. Returns a single row.
CREATE OR REPLACE FUNCTION public.ns_get_call_processing_job(p_call_id uuid)
RETURNS TABLE (
  job_id                uuid,
  status                text,
  error_message         text,
  action_items_count    int,
  decisions_count       int,
  mentions_count        int,
  key_takeaways_count   int,
  insights_count        int,
  audit_log_id          uuid,
  created_at            timestamptz,
  started_at            timestamptz,
  completed_at          timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system','public'
AS $$
  SELECT
    id, status, error_message,
    action_items_count, decisions_count, mentions_count,
    key_takeaways_count, insights_count,
    audit_log_id, created_at, started_at, completed_at
  FROM nervous_system.call_processing_jobs
  WHERE call_id = p_call_id
  ORDER BY created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.ns_get_call_processing_job(uuid)
  TO authenticated, anon, service_role;
