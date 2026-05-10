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
--   CustomerHealthCard, Hiring, Revenue, AtriumLogin.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ns_list_audit_log_taboo
--    Used by: RefusalLog.tsx
--    Query: audit_log WHERE action = 'taboo_bounce' ORDER BY created_at DESC LIMIT p_limit
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
SET search_path = nervous_system, public
AS $$
  SELECT id, created_at, action, payload
  FROM nervous_system.audit_log
  WHERE action = 'taboo_bounce'
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_audit_log_taboo(int) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_audit_log_taboo(int) IS
  'Sprint 7 PGRST106 fix: Read-only view of nervous_system.audit_log filtered to taboo_bounce events.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ns_list_agents_active
--    Used by: Now.tsx (StatusPulse, usePulseData, Skills BudgetForecast)
--    Query: agents WHERE active = true, returns status + budget
--    Note: ns_list_agents() already exists but does not include status.
--    This function is additive — it includes status for the Now.tsx pulse.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_agents_active()
RETURNS TABLE (
  id     uuid,
  name   text,
  active boolean,
  status text,
  budget jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT id, name, active, status, budget
  FROM nervous_system.agents
  WHERE active = true
  ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_agents_active() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_agents_active() IS
  'Sprint 7 PGRST106 fix: Active agents with status + budget for StatusPulse and BudgetForecast.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ns_count_audit_log_escalations
--    Used by: Now.tsx (usePulseData) — count of escalation events in last 24h
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_count_audit_log_escalations(p_since timestamptz)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT COUNT(*)
  FROM nervous_system.audit_log
  WHERE action LIKE '%escalation%'
    AND created_at >= p_since;
$$;

GRANT EXECUTE ON FUNCTION public.ns_count_audit_log_escalations(timestamptz) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_count_audit_log_escalations(timestamptz) IS
  'Sprint 7 PGRST106 fix: Count of audit_log escalation events since a given timestamp.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ns_count_ledger_decay
--    Used by: Now.tsx (usePulseData) — count of decaying ledger rows
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_count_ledger_decay()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT COUNT(*)
  FROM nervous_system.ledger
  WHERE decay_at < now()
    AND status != 'archived';
$$;

GRANT EXECUTE ON FUNCTION public.ns_count_ledger_decay() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_count_ledger_decay() IS
  'Sprint 7 PGRST106 fix: Count of ledger rows past their decay_at date, not yet archived.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ns_list_audit_log_sprints
--    Used by: SprintsView.tsx
--    Query: audit_log WHERE action LIKE 'sprint_%' ORDER BY created_at DESC LIMIT 500
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_audit_log_sprints(p_limit int DEFAULT 500)
RETURNS TABLE (
  id         uuid,
  action     text,
  table_name text,
  record_id  text,
  actor      text,
  metadata   jsonb,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT id, action, table_name, record_id, actor, metadata, created_at
  FROM nervous_system.audit_log
  WHERE action LIKE 'sprint_%'
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_audit_log_sprints(int) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_audit_log_sprints(int) IS
  'Sprint 7 PGRST106 fix: audit_log rows for sprint tracking (action LIKE sprint_%).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ns_list_audit_log_sprint_events
--    Used by: AttentionScorer.ts (fetchActiveSprintEvents)
--    Query: audit_log WHERE action LIKE 'sprint_%' AND created_at >= since
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
SET search_path = nervous_system, public
AS $$
  SELECT id, action, table_name, created_at
  FROM nervous_system.audit_log
  WHERE action LIKE 'sprint_%'
    AND created_at >= p_since
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_audit_log_sprint_events(timestamptz, int) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_audit_log_sprint_events(timestamptz, int) IS
  'Sprint 7 PGRST106 fix: Recent sprint audit events for AttentionScorer.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ns_list_action_items_escalations
--    Used by: AttentionScorer.ts (fetchEscalations)
--    Query: action_items WHERE status IN ('open','in_progress')
--           AND (priority = 'irreversible' OR break_off_signal_id IS NOT NULL)
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
SET search_path = nervous_system, public
AS $$
  SELECT id, title, description, priority, due_at, break_off_signal_id
  FROM nervous_system.action_items
  WHERE status IN ('open', 'in_progress')
    AND (priority = 'irreversible' OR break_off_signal_id IS NOT NULL)
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_action_items_escalations(int) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_action_items_escalations(int) IS
  'Sprint 7 PGRST106 fix: Open/in-progress irreversible or break-off action items for AttentionScorer.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ns_list_action_items_health_alerts
--    Used by: AttentionScorer.ts (fetchHealthAlerts)
--    Query: action_items WHERE status IN ('open','in_progress')
--           AND priority IN ('high','irreversible') AND dri IS NULL
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
SET search_path = nervous_system, public
AS $$
  SELECT id, title, description, priority, due_at
  FROM nervous_system.action_items
  WHERE status IN ('open', 'in_progress')
    AND priority IN ('high', 'irreversible')
    AND dri IS NULL
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_action_items_health_alerts(int) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_action_items_health_alerts(int) IS
  'Sprint 7 PGRST106 fix: High-priority unassigned action items for AttentionScorer health alerts.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. ns_list_ledger_recent_calls
--    Used by: AttentionScorer.ts (fetchRecentIngestCalls)
--    Query: ledger WHERE source_type = 'call' AND created_at >= since
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_ledger_recent_calls(p_since timestamptz, p_limit int DEFAULT 5)
RETURNS TABLE (
  id              uuid,
  source_type     text,
  content_summary text,
  created_at      timestamptz,
  metadata        jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT id, source_type, content_summary, created_at, metadata
  FROM nervous_system.ledger
  WHERE source_type = 'call'
    AND created_at >= p_since
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_ledger_recent_calls(timestamptz, int) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_ledger_recent_calls(timestamptz, int) IS
  'Sprint 7 PGRST106 fix: Recent call ledger entries for AttentionScorer ingest scoring.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ns_list_action_items
--     Used by: ActionItems.tsx (full table with team_members join)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_action_items(p_limit int DEFAULT 200)
RETURNS TABLE (
  id                uuid,
  title             text,
  description       text,
  priority          text,
  status            text,
  dri               uuid,
  surface           text,
  source            text,
  source_type       text,
  due_at            timestamptz,
  ledger_id         uuid,
  kanban_card_id    text,
  kanban_workspace  text,
  evidence_quote    text,
  created_at        timestamptz,
  dri_name          text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT
    ai.id,
    ai.title,
    ai.description,
    ai.priority,
    ai.status,
    ai.dri,
    ai.surface,
    ai.source,
    ai.source_type,
    ai.due_at,
    ai.ledger_id,
    ai.kanban_card_id,
    ai.kanban_workspace,
    ai.evidence_quote,
    ai.created_at,
    tm.name AS dri_name
  FROM nervous_system.action_items ai
  LEFT JOIN nervous_system.team_members tm ON tm.id = ai.dri
  ORDER BY ai.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_action_items(int) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_action_items(int) IS
  'Sprint 7 PGRST106 fix: Full action items list with DRI name join for ActionItems.tsx.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. ns_list_action_items_kanban
--     Used by: KanbanEmbeds.tsx (items with kanban_workspace set)
--     Optional dri filter.
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
SET search_path = nervous_system, public
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

COMMENT ON FUNCTION public.ns_list_action_items_kanban(uuid, int) IS
  'Sprint 7 PGRST106 fix: Kanban-workspace-scoped action items for KanbanEmbeds.tsx.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. ns_list_team_members
--     Used by: ActionItems.tsx, KanbanEmbeds.tsx, TeamMyDay.tsx
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_team_members()
RETURNS TABLE (
  id         uuid,
  name       text,
  role       text,
  email      text,
  avatar_url text,
  active     boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT id, name, role, email, avatar_url, active
  FROM nervous_system.team_members
  ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_team_members() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_team_members() IS
  'Sprint 7 PGRST106 fix: Team members list for ActionItems, KanbanEmbeds, TeamMyDay.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. ns_list_team_members_active
--     Used by: TeamMyDay.tsx (active members only, ordered by name)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_team_members_active()
RETURNS TABLE (
  id         uuid,
  name       text,
  role       text,
  email      text,
  avatar_url text,
  active     boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT id, name, role, email, avatar_url, active
  FROM nervous_system.team_members
  WHERE active = true
  ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_team_members_active() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_team_members_active() IS
  'Sprint 7 PGRST106 fix: Active team members for TeamMyDay.tsx.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. ns_get_team_member_by_email
--     Used by: AtriumLogin.tsx (check existing), KanbanEmbeds.tsx (current user),
--              Now.tsx (team member id from auth email)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_get_team_member_by_email(p_email text)
RETURNS TABLE (
  id    uuid,
  name  text,
  email text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT id, name, email
  FROM nervous_system.team_members
  WHERE email = p_email
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.ns_get_team_member_by_email(text) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_get_team_member_by_email(text) IS
  'Sprint 7 PGRST106 fix: Look up a team member by email for login upsert and current-user resolution.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. ns_upsert_team_member
--     Used by: AtriumLogin.tsx (insert team member row on first login)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_upsert_team_member(
  p_email text,
  p_name  text,
  p_role  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM nervous_system.team_members WHERE email = p_email) THEN
    INSERT INTO nervous_system.team_members (email, name, role, active)
    VALUES (p_email, p_name, p_role, true);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ns_upsert_team_member(text, text, text) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_upsert_team_member(text, text, text) IS
  'Sprint 7 PGRST106 fix: Insert team member on first login if not already present.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. ns_count_action_items_by_assignee
--     Used by: TeamMyDay.tsx MemberCard (count open items by assigned_to)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_count_action_items_by_assignee(p_member_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT COUNT(*)
  FROM nervous_system.action_items
  WHERE assigned_to = p_member_id
    AND status = 'open';
$$;

GRANT EXECUTE ON FUNCTION public.ns_count_action_items_by_assignee(uuid) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_count_action_items_by_assignee(uuid) IS
  'Sprint 7 PGRST106 fix: Count of open action items assigned to a team member (TeamMyDay MemberCard).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. ns_list_action_items_by_assignee
--     Used by: TeamMyDay.tsx MemberDetail (open items for a specific member)
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
  customer_id uuid,
  notion_url  text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT id, title, status, priority, due_at, customer_id, notion_url
  FROM nervous_system.action_items
  WHERE assigned_to = p_member_id
    AND status = 'open'
  ORDER BY priority DESC, due_at ASC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_action_items_by_assignee(uuid, int) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_action_items_by_assignee(uuid, int) IS
  'Sprint 7 PGRST106 fix: Open action items assigned to a specific team member (TeamMyDay MemberDetail).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. ns_list_action_items_by_ledger
--     Used by: CallsLog.tsx (useCallDetail — action items linked to a call)
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
SET search_path = nervous_system, public
AS $$
  SELECT id, title, priority, status
  FROM nervous_system.action_items
  WHERE ledger_id = p_ledger_id;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_action_items_by_ledger(uuid) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_action_items_by_ledger(uuid) IS
  'Sprint 7 PGRST106 fix: Action items linked to a specific ledger entry (CallsLog detail panel).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. ns_list_ledger_decisions
--     Used by: DecisionsTimeline.tsx
--     Query: ledger WHERE source_type = 'elder_decision' ORDER BY created_at DESC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_ledger_decisions(p_limit int DEFAULT 100)
RETURNS TABLE (
  id              uuid,
  source_type     text,
  content_summary text,
  metadata        jsonb,
  created_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT id, source_type, content_summary, metadata, created_at
  FROM nervous_system.ledger
  WHERE source_type = 'elder_decision'
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_ledger_decisions(int) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_ledger_decisions(int) IS
  'Sprint 7 PGRST106 fix: Elder decision ledger entries for DecisionsTimeline.tsx.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 20. ns_list_ledger_calls
--     Used by: CallsLog.tsx (useCallsLog — calls and voice_memo entries)
--     Optional content_summary search filter.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_ledger_calls(
  p_search text DEFAULT NULL,
  p_limit  int  DEFAULT 100
)
RETURNS TABLE (
  id              uuid,
  source_type     text,
  content_summary text,
  raw_content     text,
  metadata        jsonb,
  created_at      timestamptz,
  customer        text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT id, source_type, content_summary, raw_content, metadata, created_at, customer
  FROM nervous_system.ledger
  WHERE source_type IN ('call', 'voice_memo')
    AND (p_search IS NULL OR content_summary ILIKE '%' || p_search || '%')
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_ledger_calls(text, int) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_ledger_calls(text, int) IS
  'Sprint 7 PGRST106 fix: Call and voice_memo ledger entries for CallsLog.tsx with optional search.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 21. ns_list_ledger_by_customer
--     Used by: CustomerHealthCard.tsx (last 30 days of interactions)
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
  sentiment_score numeric,
  customer_id     uuid,
  participants    jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT id, source_type, content_summary, created_at, sentiment_score, customer_id, participants
  FROM nervous_system.ledger
  WHERE customer_id = p_customer_id
    AND created_at >= p_since
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_ledger_by_customer(uuid, timestamptz, int) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_ledger_by_customer(uuid, timestamptz, int) IS
  'Sprint 7 PGRST106 fix: Ledger entries for a customer in a time window (CustomerHealthCard).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 22. ns_list_action_items_by_customer
--     Used by: CustomerHealthCard.tsx (open action items for a customer)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_list_action_items_by_customer(
  p_customer_id uuid,
  p_limit       int DEFAULT 10
)
RETURNS TABLE (
  id          uuid,
  title       text,
  status      text,
  priority    text,
  due_at      timestamptz,
  assigned_to uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT id, title, status, priority, due_at, assigned_to
  FROM nervous_system.action_items
  WHERE customer_id = p_customer_id
    AND status = 'open'
  ORDER BY due_at ASC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_action_items_by_customer(uuid, int) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_action_items_by_customer(uuid, int) IS
  'Sprint 7 PGRST106 fix: Open action items for a customer (CustomerHealthCard).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 23. ns_list_hiring_candidates
--     Used by: Hiring.tsx
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
SET search_path = nervous_system, public
AS $$
BEGIN
  -- Table may not exist yet; return empty result set gracefully
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

COMMENT ON FUNCTION public.ns_list_hiring_candidates() IS
  'Sprint 7 PGRST106 fix: Hiring candidates list with graceful absent-table handling.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 24. ns_list_customers_pipeline
--     Used by: Revenue.tsx (pipeline-weighted forecast)
--     Query: customers WHERE status IN ('Proposal','Contract','Active','Expansion')
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
SET search_path = nervous_system, public
AS $$
BEGIN
  -- Table may not exist yet (or columns may vary); degrade gracefully
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

COMMENT ON FUNCTION public.ns_list_customers_pipeline() IS
  'Sprint 7 PGRST106 fix: Pipeline-stage customers for Revenue.tsx weighted forecast.';
