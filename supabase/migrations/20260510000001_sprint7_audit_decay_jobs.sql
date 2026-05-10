-- Sprint 7 Stream C — Audit log viewer, decay heatmap, scheduled jobs UI
-- Idempotent: CREATE OR REPLACE functions, CREATE TABLE IF NOT EXISTS, INSERT ON CONFLICT DO NOTHING
-- Verified schemas before writing:
--   audit_log: id, table_name, action, actor_id (uuid), payload (jsonb), created_at
--   signals: id, created_at, source_agent (uuid), topic, signal_type, content,
--            evidence_ledger_ids (uuid[]), strength (float), ttl_days (int),
--            last_touched (timestamptz), status (text)

-- ─── 1. ns_list_audit_log ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_audit_log(
  p_actor_id   uuid    DEFAULT NULL,
  p_table_name text    DEFAULT NULL,
  p_action     text    DEFAULT NULL,
  p_since      timestamptz DEFAULT NULL,
  p_until      timestamptz DEFAULT NULL,
  p_limit      int     DEFAULT 100,
  p_offset     int     DEFAULT 0
)
RETURNS TABLE (
  id         uuid,
  table_name text,
  action     text,
  actor_id   uuid,
  payload    jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.id,
    al.table_name,
    al.action,
    al.actor_id,
    al.payload,
    al.created_at
  FROM nervous_system.audit_log al
  WHERE (p_actor_id   IS NULL OR al.actor_id   = p_actor_id)
    AND (p_table_name IS NULL OR al.table_name = p_table_name)
    AND (p_action     IS NULL OR al.action     = p_action)
    AND (p_since      IS NULL OR al.created_at >= p_since)
    AND (p_until      IS NULL OR al.created_at <= p_until)
  ORDER BY al.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ─── 2. ns_decay_heatmap ───────────────────────────────────────────────────────
-- Uses verified columns: topic, strength (float), last_touched (timestamptz),
-- ttl_days (int), status (text), id (uuid), signal_type (text)

CREATE OR REPLACE FUNCTION public.ns_decay_heatmap(p_limit int DEFAULT 50)
RETURNS TABLE (
  topic            text,
  signal_count     bigint,
  avg_strength     numeric,
  last_touched     timestamptz,
  stalest_ttl_days int
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.topic,
    count(*)              AS signal_count,
    avg(s.strength)       AS avg_strength,
    max(s.last_touched)   AS last_touched,
    min(s.ttl_days)       AS stalest_ttl_days
  FROM nervous_system.signals s
  WHERE s.status = 'active'
  GROUP BY s.topic
  ORDER BY avg(s.strength) DESC
  LIMIT p_limit;
END;
$$;

-- ─── 3. ns_get_signals_by_topic ────────────────────────────────────────────────
-- For clicking a topic cluster to see individual signals

CREATE OR REPLACE FUNCTION public.ns_get_signals_by_topic(p_topic text)
RETURNS TABLE (
  id              uuid,
  signal_type     text,
  content         text,
  strength        double precision,
  ttl_days        integer,
  last_touched    timestamptz,
  created_at      timestamptz,
  status          text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.signal_type,
    s.content,
    s.strength,
    s.ttl_days,
    s.last_touched,
    s.created_at,
    s.status
  FROM nervous_system.signals s
  WHERE s.topic = p_topic
    AND s.status = 'active'
  ORDER BY s.strength DESC, s.last_touched DESC;
END;
$$;

-- ─── 4. ns_archive_topic ───────────────────────────────────────────────────────
-- Archive all active signals for a topic; audit-logs the action

CREATE OR REPLACE FUNCTION public.ns_archive_topic(
  p_topic        text,
  p_triggered_by text DEFAULT 'operator'
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE nervous_system.signals
  SET status = 'archived'
  WHERE topic = p_topic AND status = 'active';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO nervous_system.audit_log (table_name, action, payload)
  VALUES (
    'signals',
    'topic.archive',
    jsonb_build_object(
      'topic', p_topic,
      'archived_count', v_count,
      'triggered_by', p_triggered_by
    )
  );

  RETURN json_build_object('ok', true, 'archived_count', v_count);
END;
$$;

-- ─── 5. scheduled_jobs table (if missing) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS nervous_system.scheduled_jobs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL UNIQUE,
  schedule_cron    text,
  owner_agent_id   uuid        REFERENCES nervous_system.agents(id),
  active           boolean     DEFAULT true,
  last_run_at      timestamptz,
  last_run_status  text,
  next_run_at      timestamptz,
  notes            text,
  created_at       timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE nervous_system.scheduled_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ns scheduled_jobs read" ON nervous_system.scheduled_jobs;
CREATE POLICY "ns scheduled_jobs read" ON nervous_system.scheduled_jobs
  FOR SELECT TO authenticated USING (true);

-- ─── 6. scheduled_jobs seeds ──────────────────────────────────────────────────

INSERT INTO nervous_system.scheduled_jobs (name, schedule_cron, active, notes) VALUES
  ('decay-tick',                '0 3 * * *',          true,  'Daily decay tick — weakens stale signals'),
  ('daily-digest',              '0 8 * * *',          true,  'Daily morning brief Slack DM to team'),
  ('weekly-memory-consolidation','0 2 * * 0',         true,  'Weekly memory consolidation — elder agent'),
  ('weekly-retro',              '0 9 * * 1',          true,  'Weekly retrospective generation'),
  ('monthly-continuity-audit',  '0 4 1 * *',          true,  'Monthly continuity log audit'),
  ('quarterly-taboo-review',    '0 4 1 1,4,7,10 *',   true,  'Quarterly taboo list review'),
  ('daily-slack-scan',          '*/30 * * * *',       true,  'Slack DM scan — orchestrator ingest'),
  ('daily-email-scan',          '0 7 * * *',          true,  'Daily email digest scan')
ON CONFLICT (name) DO NOTHING;

-- ─── 7. ns_list_scheduled_jobs ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_scheduled_jobs()
RETURNS TABLE (
  id              uuid,
  name            text,
  schedule_cron   text,
  owner_agent_id  uuid,
  active          boolean,
  last_run_at     timestamptz,
  last_run_status text,
  next_run_at     timestamptz,
  notes           text,
  created_at      timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.name,
    j.schedule_cron,
    j.owner_agent_id,
    j.active,
    j.last_run_at,
    j.last_run_status,
    j.next_run_at,
    j.notes,
    j.created_at
  FROM nervous_system.scheduled_jobs j
  ORDER BY j.name ASC;
END;
$$;

-- ─── 8. ns_toggle_scheduled_job ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_toggle_scheduled_job(
  p_id           uuid,
  p_active       boolean,
  p_triggered_by text DEFAULT 'operator'
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  v_name text;
BEGIN
  UPDATE nervous_system.scheduled_jobs
  SET active = p_active
  WHERE id = p_id
  RETURNING name INTO v_name;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'job not found');
  END IF;

  INSERT INTO nervous_system.audit_log (table_name, action, payload)
  VALUES (
    'scheduled_jobs',
    'job.toggle',
    jsonb_build_object(
      'job_id', p_id,
      'job_name', v_name,
      'active', p_active,
      'triggered_by', p_triggered_by
    )
  );

  RETURN json_build_object('ok', true, 'name', v_name, 'active', p_active);
END;
$$;

-- ─── 9. ns_trigger_scheduled_job ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_trigger_scheduled_job(
  p_id           uuid,
  p_triggered_by text DEFAULT 'operator'
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT name INTO v_name FROM nervous_system.scheduled_jobs WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'job not found');
  END IF;

  INSERT INTO nervous_system.audit_log (table_name, action, payload)
  VALUES (
    'scheduled_jobs',
    'job.manual_trigger',
    jsonb_build_object(
      'job_id', p_id,
      'job_name', v_name,
      'triggered_by', p_triggered_by
    )
  );

  RETURN json_build_object('ok', true, 'name', v_name, 'triggered_at', now());
END;
$$;
