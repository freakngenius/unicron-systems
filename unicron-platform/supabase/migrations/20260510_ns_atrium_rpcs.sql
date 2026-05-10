-- 20260510_ns_atrium_rpcs.sql
-- Sprint 7 bugfix: PGRST106 — replace all .schema('nervous_system') browser calls
-- with SECURITY DEFINER RPCs in the public schema.
--
-- Problem: nervous_system is not listed in PostgREST's db-schemas config
-- (only public, graphql_public, pathfinder, unicron are exposed).
-- Every .schema('nervous_system').from(...) call from the browser returns
-- PGRST106 "The schema must be one of the following: ...".
--
-- Pattern: all nervous_system reads/writes go through public-schema SECURITY
-- DEFINER functions callable via supabase.rpc('ns_*').
--
-- This migration is additive only — no DROP, no destructive ALTER.
-- All functions use CREATE OR REPLACE for idempotency.
-- Affected surfaces: RefusalLog, Now, Skills, AttentionScorer, ActionItems,
--   KanbanEmbeds, SprintsView, DecisionsTimeline, CallsLog, TeamMyDay,
--   CustomerHealthCard, Hiring, Revenue, AtriumLogin, Notifications.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ns_list_audit_log_taboo
--    Used by: RefusalLog.tsx
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_audit_log_taboo(p_limit int DEFAULT 50)
RETURNS TABLE (
  id         uuid,
  created_at timestamptz,
  action     text,
  payload    jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, created_at, action, payload
  FROM nervous_system.audit_log
  WHERE action = 'taboo_bounce'
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_audit_log_taboo(int) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ns_list_agents_active
--    Used by: Now.tsx (StatusPulse, usePulseData), Skills.tsx (BudgetForecast)
--    agents has archetype + specialty, not status
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_agents_active()
RETURNS TABLE (
  id        uuid,
  name      text,
  active    boolean,
  archetype text,
  specialty text,
  budget    jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, name, active, archetype, specialty, budget
  FROM nervous_system.agents
  WHERE active = true
  ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_agents_active() TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ns_count_audit_log_escalations
--    Used by: Now.tsx (usePulseData)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_count_audit_log_escalations(p_since timestamptz)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT COUNT(*)
  FROM nervous_system.audit_log
  WHERE action LIKE '%escalation%'
    AND created_at >= p_since;
$$;

GRANT EXECUTE ON FUNCTION public.ns_count_audit_log_escalations(timestamptz) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ns_count_ledger_decay
--    Used by: Now.tsx (usePulseData)
--    decay_at is computed: last_touched + ttl_days * interval '1 day'
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_count_ledger_decay()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT COUNT(*)
  FROM nervous_system.ledger
  WHERE ttl_days IS NOT NULL
    AND last_touched IS NOT NULL
    AND (last_touched + (ttl_days * interval '1 day')) < now()
    AND status != 'archived';
$$;

GRANT EXECUTE ON FUNCTION public.ns_count_ledger_decay() TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ns_list_audit_log_sprints
--    Used by: SprintsView.tsx
--    audit_log has actor_id (uuid) + payload (jsonb), not record_id/actor/metadata
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_audit_log_sprints(p_limit int DEFAULT 500)
RETURNS TABLE (
  id         uuid,
  action     text,
  table_name text,
  actor_id   uuid,
  payload    jsonb,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, action, table_name, actor_id, payload, created_at
  FROM nervous_system.audit_log
  WHERE action LIKE 'sprint_%'
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_audit_log_sprints(int) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ns_list_audit_log_sprint_events
--    Used by: AttentionScorer.ts (fetchActiveSprintEvents)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_audit_log_sprint_events(p_since timestamptz, p_limit int DEFAULT 5)
RETURNS TABLE (
  id         uuid,
  action     text,
  table_name text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, action, table_name, created_at
  FROM nervous_system.audit_log
  WHERE action LIKE 'sprint_%'
    AND created_at >= p_since
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_audit_log_sprint_events(timestamptz, int) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ns_list_action_items_escalations
--    Used by: AttentionScorer.ts (fetchEscalations)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_action_items_escalations(p_limit int DEFAULT 10)
RETURNS TABLE (
  id                  uuid,
  title               text,
  description         text,
  priority            text,
  due_at              timestamptz,
  break_off_signal_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, title, description, priority, due_at, break_off_signal_id
  FROM nervous_system.action_items
  WHERE status IN ('open', 'in_progress')
    AND (priority = 'irreversible' OR break_off_signal_id IS NOT NULL)
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_action_items_escalations(int) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ns_list_action_items_health_alerts
--    Used by: AttentionScorer.ts (fetchHealthAlerts)
--    dri IS NULL = no assignee
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_action_items_health_alerts(p_limit int DEFAULT 5)
RETURNS TABLE (
  id          uuid,
  title       text,
  description text,
  priority    text,
  due_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, title, description, priority, due_at
  FROM nervous_system.action_items
  WHERE status IN ('open', 'in_progress')
    AND priority IN ('high', 'irreversible')
    AND dri IS NULL
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_action_items_health_alerts(int) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. ns_list_ledger_recent_calls
--    Used by: AttentionScorer.ts (fetchRecentIngestCalls)
--    ledger has insights (not metadata)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_ledger_recent_calls(p_since timestamptz, p_limit int DEFAULT 5)
RETURNS TABLE (
  id              uuid,
  source_type     text,
  content_summary text,
  created_at      timestamptz,
  insights        jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, source_type, content_summary, created_at, insights
  FROM nervous_system.ledger
  WHERE source_type = 'call'
    AND created_at >= p_since
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_ledger_recent_calls(timestamptz, int) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ns_list_action_items
--     Used by: ActionItems.tsx (filterable list with DRI join)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_action_items(
  p_dri_id uuid    DEFAULT NULL,
  p_status text[]  DEFAULT ARRAY['open', 'in_progress'],
  p_limit  int     DEFAULT 20
)
RETURNS TABLE (
  id               uuid,
  title            text,
  description      text,
  status           text,
  priority         text,
  due_at           timestamptz,
  dri_name         text,
  kanban_workspace text,
  created_at       timestamptz,
  customer_id      uuid
)
STABLE SECURITY DEFINER
LANGUAGE sql
AS $$
  SELECT
    ai.id, ai.title, ai.description, ai.status, ai.priority,
    ai.due_at, tm.name AS dri_name, ai.kanban_workspace, ai.created_at, ai.customer_id
  FROM nervous_system.action_items ai
  LEFT JOIN nervous_system.team_members tm ON tm.id = ai.dri
  WHERE (p_dri_id IS NULL OR ai.dri = p_dri_id)
    AND ai.status = ANY(p_status)
  ORDER BY
    CASE ai.priority WHEN 'irreversible' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    ai.due_at ASC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_action_items(uuid, text[], int) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. ns_list_action_items_kanban
--     Used by: KanbanEmbeds.tsx
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_action_items_kanban(
  p_dri_filter uuid DEFAULT NULL,
  p_limit      int  DEFAULT 500
)
RETURNS TABLE (
  id               uuid,
  title            text,
  priority         text,
  status           text,
  dri              uuid,
  kanban_workspace text,
  kanban_card_id   text,
  dri_id           uuid,
  dri_name         text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT
    ai.id,
    ai.title,
    ai.priority,
    ai.status,
    ai.dri,
    ai.kanban_workspace,
    ai.kanban_card_id,
    tm.id   AS dri_id,
    tm.name AS dri_name
  FROM nervous_system.action_items ai
  LEFT JOIN nervous_system.team_members tm ON tm.id = ai.dri
  WHERE ai.kanban_workspace IS NOT NULL
    AND (p_dri_filter IS NULL OR ai.dri = p_dri_filter)
  ORDER BY ai.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_action_items_kanban(uuid, int) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. ns_list_team_members
--     Used by: ActionItems.tsx, KanbanEmbeds.tsx, TeamMyDay.tsx
--     team_members has no avatar_url column
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_team_members()
RETURNS TABLE (
  id     uuid,
  name   text,
  role   text,
  email  text,
  active boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, name, role, email, active
  FROM nervous_system.team_members
  ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_team_members() TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. ns_list_team_members_active
--     Used by: TeamMyDay.tsx
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_team_members_active()
RETURNS TABLE (
  id     uuid,
  name   text,
  role   text,
  email  text,
  active boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, name, role, email, active
  FROM nervous_system.team_members
  WHERE active = true
  ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_team_members_active() TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. ns_get_team_member_by_email
--     Used by: AtriumLogin.tsx, KanbanEmbeds.tsx, Now.tsx
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_get_team_member_by_email(p_email text)
RETURNS TABLE (
  id    uuid,
  name  text,
  email text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, name, email
  FROM nervous_system.team_members
  WHERE email = p_email
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.ns_get_team_member_by_email(text) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. ns_upsert_team_member
--     Used by: AtriumLogin.tsx (insert on first login)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_upsert_team_member(
  p_email text,
  p_name  text,
  p_role  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM nervous_system.team_members WHERE email = p_email) THEN
    INSERT INTO nervous_system.team_members (email, name, role, active)
    VALUES (p_email, p_name, p_role, true);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_upsert_team_member(text, text, text) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. ns_count_action_items_by_assignee
--     Used by: TeamMyDay.tsx MemberCard
--     action_items has dri (not assigned_to)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_count_action_items_by_assignee(p_member_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT COUNT(*)
  FROM nervous_system.action_items
  WHERE dri = p_member_id
    AND status = 'open';
$$;

GRANT EXECUTE ON FUNCTION public.ns_count_action_items_by_assignee(uuid) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. ns_list_action_items_by_assignee
--     Used by: TeamMyDay.tsx MemberDetail
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_action_items_by_assignee(
  p_member_id uuid,
  p_limit     int DEFAULT 20
)
RETURNS TABLE (
  id          uuid,
  title       text,
  status      text,
  priority    text,
  due_at      timestamptz,
  customer_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, title, status, priority, due_at, customer_id
  FROM nervous_system.action_items
  WHERE dri = p_member_id
    AND status = 'open'
  ORDER BY priority DESC, due_at ASC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_action_items_by_assignee(uuid, int) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. ns_list_action_items_by_ledger
--     Used by: CallsLog.tsx (useCallDetail)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_action_items_by_ledger(p_ledger_id uuid)
RETURNS TABLE (
  id       uuid,
  title    text,
  priority text,
  status   text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, title, priority, status
  FROM nervous_system.action_items
  WHERE ledger_id = p_ledger_id;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_action_items_by_ledger(uuid) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. ns_list_ledger_decisions
--     Used by: DecisionsTimeline.tsx
--     ledger has insights (not metadata)
-- ─────────────────────────────────────────────────────────────────────────────

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
  WHERE source_type = 'elder_decision'
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_ledger_decisions(int) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 20. ns_list_ledger_calls
--     Used by: CallsLog.tsx (useCallsLog)
--     ledger has content_full (not raw_content), insights (not metadata),
--     customer_id uuid (not customer text)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_ledger_calls(
  p_search text DEFAULT NULL,
  p_limit  int  DEFAULT 100
)
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
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, source_type, content_summary, content_full, insights, created_at, customer_id
  FROM nervous_system.ledger
  WHERE source_type IN ('call', 'voice_memo')
    AND (p_search IS NULL OR content_summary ILIKE '%' || p_search || '%')
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_ledger_calls(text, int) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 21. ns_list_ledger_by_customer
--     Used by: CustomerHealthCard.tsx
--     participants is text[] in live schema
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_ledger_by_customer(
  p_customer_id uuid,
  p_since       timestamptz,
  p_limit       int DEFAULT 50
)
RETURNS TABLE (
  id              uuid,
  source_type     text,
  content_summary text,
  created_at      timestamptz,
  customer_id     uuid,
  participants    text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, source_type, content_summary, created_at, customer_id, participants
  FROM nervous_system.ledger
  WHERE customer_id = p_customer_id
    AND created_at >= p_since
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_ledger_by_customer(uuid, timestamptz, int) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 22. ns_list_action_items_by_customer
--     Used by: CustomerHealthCard.tsx
--     action_items has dri (not assigned_to)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_action_items_by_customer(
  p_customer_id uuid,
  p_limit       int DEFAULT 10
)
RETURNS TABLE (
  id       uuid,
  title    text,
  status   text,
  priority text,
  due_at   timestamptz,
  dri      uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, title, status, priority, due_at, dri
  FROM nervous_system.action_items
  WHERE customer_id = p_customer_id
    AND status = 'open'
  ORDER BY due_at ASC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_action_items_by_customer(uuid, int) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 23. ns_list_hiring_candidates
--     Used by: Hiring.tsx
--     Gracefully absent if hiring_candidates table doesn't exist yet
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_hiring_candidates()
RETURNS TABLE (
  id         uuid,
  name       text,
  stage      text,
  role       text,
  source     text,
  notes      text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'nervous_system'
      AND table_name = 'hiring_candidates'
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT id, name, stage, role, source, notes, created_at
    FROM nervous_system.hiring_candidates
    ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_hiring_candidates() TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 24. ns_list_customers_pipeline
--     Used by: Revenue.tsx (pipeline-weighted forecast)
--     Gracefully absent if customers table doesn't exist yet
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_customers_pipeline()
RETURNS TABLE (
  id           uuid,
  name         text,
  status       text,
  deal_value   numeric,
  arr          numeric,
  mrr          numeric,
  health_score numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'nervous_system'
      AND table_name = 'customers'
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT id, name, status, deal_value, arr, mrr, health_score
    FROM nervous_system.customers
    WHERE status IN ('Proposal', 'Contract', 'Active', 'Expansion');
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_customers_pipeline() TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 25. ns_get_member_notifications
--     Used by: Notifications.tsx (Stream B)
--     Reads config->'notifications' from team_members
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_get_member_notifications(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  v_notifications jsonb;
BEGIN
  SELECT COALESCE(config->'notifications', '{}'::jsonb)
  INTO v_notifications
  FROM nervous_system.team_members
  WHERE id = p_member_id;

  RETURN COALESCE(v_notifications, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_get_member_notifications(uuid) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 26. ns_update_member_notifications
--     Used by: Notifications.tsx PATCH handler (Stream B)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_update_member_notifications(p_member_id uuid, p_notifications jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
BEGIN
  UPDATE nervous_system.team_members
  SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('notifications', p_notifications)
  WHERE id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_member not found: %', p_member_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_update_member_notifications(uuid, jsonb) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 27. ns_list_skill_runs
--     Used by: Skills.tsx (useRecentRuns)
--     ledger has insights (not metadata); cost_usd absent from schema
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_skill_runs(p_limit int DEFAULT 10)
RETURNS TABLE (
  id              uuid,
  content_summary text,
  created_at      timestamptz,
  insights        jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, content_summary, created_at, insights
  FROM nervous_system.ledger
  WHERE source_type = 'skill_run'
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_skill_runs(int) TO authenticated, anon, service_role;
