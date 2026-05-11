-- 20260511_rls_gap_residual_tables.sql
-- Close residual RLS gaps surfaced by the Supabase security advisor.
--
-- The advisor flagged 6 tables in nervous_system + pathfinder with
-- rls_disabled_in_public. PR #333 closed the gap on 5 pathfinder tables
-- earlier in the day; these 6 are a fresh batch not covered there.
--
-- Strategy: enable RLS on every flagged table with a service_role-only
-- ALL policy. The tables are operational/log/agent-internal — no
-- authenticated UI surfaces read them directly today, so this is the
-- minimum-surface-area lockdown. Loosen later if a UI needs SELECT.

-- nervous_system tables
ALTER TABLE nervous_system.sprint_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sprint_runs_service_role_all ON nervous_system.sprint_runs;
CREATE POLICY sprint_runs_service_role_all ON nervous_system.sprint_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE nervous_system.ingest_processed ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ingest_processed_service_role_all ON nervous_system.ingest_processed;
CREATE POLICY ingest_processed_service_role_all ON nervous_system.ingest_processed
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE nervous_system.customer_state_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_state_history_service_role_all ON nervous_system.customer_state_history;
CREATE POLICY customer_state_history_service_role_all ON nervous_system.customer_state_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- pathfinder tables (advisor batch 2)
ALTER TABLE pathfinder.customer_call_memory_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ccmp_service_role_all ON pathfinder.customer_call_memory_packs;
CREATE POLICY ccmp_service_role_all ON pathfinder.customer_call_memory_packs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE pathfinder.signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signals_service_role_all ON pathfinder.signals;
CREATE POLICY signals_service_role_all ON pathfinder.signals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE pathfinder.call_quality_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cqs_service_role_all ON pathfinder.call_quality_scores;
CREATE POLICY cqs_service_role_all ON pathfinder.call_quality_scores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE pathfinder.agent_prompt_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS apv_service_role_all ON pathfinder.agent_prompt_versions;
CREATE POLICY apv_service_role_all ON pathfinder.agent_prompt_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE pathfinder.call_next_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cna_service_role_all ON pathfinder.call_next_actions;
CREATE POLICY cna_service_role_all ON pathfinder.call_next_actions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
