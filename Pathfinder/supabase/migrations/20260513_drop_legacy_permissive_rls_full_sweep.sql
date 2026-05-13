-- Full sweep: drop every remaining qual=true permissive RLS policy in pathfinder.*
-- and replace with operator_allowlist policies.
--
-- Spec: same canonical card as 20260512_drop_legacy_permissive_rls.sql
--       (Metacron kanban 35d785c67e7281d69588d1d0b281982e). After the 10-table
--       migration applied, a wider pg_policies probe surfaced 27 additional
--       tables carrying the same legacy qual=true pattern. Kyle authorized
--       expanded scope: ship full sweep in this PR.
--
-- Two pattern groups handled:
--   A. Legacy "<table>_read" + "<table>_write" pair (qual=true). 14 tables.
--   B. Single permissive ALL/SELECT policy named *_admin / *_service_role_all /
--      *_service_only / *_all (qual=true). 13 tables.
--
-- For group B, the policy names suggest service-role-only intent. They are not
-- load-bearing: in Supabase the service_role JWT bypasses RLS entirely (role
-- has bypassrls=true), so Inngest, cron, and agent-dispatch writes continue to
-- work after these are dropped. The qual=true grant was the bug — it gave anon
-- and any authenticated caller the same access as service role.
--
-- After this migration: zero tables in pathfinder.* have a qual=true permissive
-- policy. Every customer-data and operator-internal table is gated through
-- pathfinder.operator_allowlist (with service role bypass intact).
--
-- agent_verifications keeps its existing "service role all" policy with
-- qual = (auth.jwt() ->> 'role') = 'service_role' (correctly scoped, not qual=true).

-- =============================================================================
-- STEP 1 — drop legacy <table>_read / <table>_write qual=true policies
-- =============================================================================
DROP POLICY IF EXISTS "adjacent_targets_read"             ON pathfinder.adjacent_targets;
DROP POLICY IF EXISTS "adjacent_targets_write"            ON pathfinder.adjacent_targets;
DROP POLICY IF EXISTS "architect_inbox_read"              ON pathfinder.architect_inbox;
DROP POLICY IF EXISTS "architect_inbox_write"             ON pathfinder.architect_inbox;
DROP POLICY IF EXISTS "coverage_goal_candidates_read"     ON pathfinder.coverage_goal_candidates;
DROP POLICY IF EXISTS "coverage_goal_candidates_write"    ON pathfinder.coverage_goal_candidates;
DROP POLICY IF EXISTS "coverage_goals_read"               ON pathfinder.coverage_goals;
DROP POLICY IF EXISTS "coverage_goals_write"              ON pathfinder.coverage_goals;
DROP POLICY IF EXISTS "deal_activities_read"              ON pathfinder.deal_activities;
DROP POLICY IF EXISTS "deal_activities_write"             ON pathfinder.deal_activities;
DROP POLICY IF EXISTS "deals_read"                        ON pathfinder.deals;
DROP POLICY IF EXISTS "deals_write"                       ON pathfinder.deals;
DROP POLICY IF EXISTS "email_threads_read"                ON pathfinder.email_threads;
DROP POLICY IF EXISTS "email_threads_write"               ON pathfinder.email_threads;
DROP POLICY IF EXISTS "lead_actions_read"                 ON pathfinder.lead_actions;
DROP POLICY IF EXISTS "lead_actions_write"                ON pathfinder.lead_actions;
DROP POLICY IF EXISTS "lead_contacts_read"                ON pathfinder.lead_contacts;
DROP POLICY IF EXISTS "lead_contacts_write"               ON pathfinder.lead_contacts;
DROP POLICY IF EXISTS "lead_cross_pollination_read"       ON pathfinder.lead_cross_pollination;
DROP POLICY IF EXISTS "lead_cross_pollination_write"      ON pathfinder.lead_cross_pollination;
DROP POLICY IF EXISTS "national_accounts_read"            ON pathfinder.national_accounts;
DROP POLICY IF EXISTS "national_accounts_write"           ON pathfinder.national_accounts;
DROP POLICY IF EXISTS "outreach_edits_read"               ON pathfinder.outreach_edits;
DROP POLICY IF EXISTS "outreach_edits_write"              ON pathfinder.outreach_edits;
DROP POLICY IF EXISTS "zedcor_branches_read"              ON pathfinder.zedcor_branches;
DROP POLICY IF EXISTS "zedcor_branches_write"             ON pathfinder.zedcor_branches;
DROP POLICY IF EXISTS "zedcor_customer_sites_read"        ON pathfinder.zedcor_customer_sites;
DROP POLICY IF EXISTS "zedcor_customer_sites_write"       ON pathfinder.zedcor_customer_sites;

-- =============================================================================
-- STEP 2 — drop misleadingly-named single-permissive qual=true policies
-- =============================================================================
DROP POLICY IF EXISTS "apv_service_role_all"              ON pathfinder.agent_prompt_versions;
DROP POLICY IF EXISTS "cna_service_role_all"              ON pathfinder.call_next_actions;
DROP POLICY IF EXISTS "cqs_service_role_all"              ON pathfinder.call_quality_scores;
DROP POLICY IF EXISTS "ccmp_service_role_all"             ON pathfinder.customer_call_memory_packs;
DROP POLICY IF EXISTS "email_integrations_service_only"   ON pathfinder.email_integrations;
DROP POLICY IF EXISTS "proc_configs_all"                  ON pathfinder.procurement_pull_configs;
DROP POLICY IF EXISTS "signals_service_role_all"          ON pathfinder.signals;
DROP POLICY IF EXISTS "slack_branch_routes_admin"         ON pathfinder.slack_branch_routes;
DROP POLICY IF EXISTS "slack_messages_admin"              ON pathfinder.slack_messages;
DROP POLICY IF EXISTS "slack_workspaces_admin"            ON pathfinder.slack_workspaces;
DROP POLICY IF EXISTS "source_adapters_write"             ON pathfinder.source_adapters;
DROP POLICY IF EXISTS "vas_read_all"                      ON pathfinder.voice_agent_sources;
DROP POLICY IF EXISTS "voice_attempts_all"                ON pathfinder.voice_call_attempts;

-- =============================================================================
-- STEP 3 — operator_allowlist policies on all 27 tables (idempotent)
-- Pattern matches 20260511_rls_completion_remaining_5_tables.sql and
-- 20260512_drop_legacy_permissive_rls.sql.
-- =============================================================================

-- adjacent_targets
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.adjacent_targets;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.adjacent_targets;
CREATE POLICY "operators_read_all"  ON pathfinder.adjacent_targets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.adjacent_targets FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- agent_prompt_versions
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.agent_prompt_versions;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.agent_prompt_versions;
CREATE POLICY "operators_read_all"  ON pathfinder.agent_prompt_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.agent_prompt_versions FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- architect_inbox
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.architect_inbox;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.architect_inbox;
CREATE POLICY "operators_read_all"  ON pathfinder.architect_inbox FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.architect_inbox FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- call_next_actions
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.call_next_actions;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.call_next_actions;
CREATE POLICY "operators_read_all"  ON pathfinder.call_next_actions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.call_next_actions FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- call_quality_scores
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.call_quality_scores;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.call_quality_scores;
CREATE POLICY "operators_read_all"  ON pathfinder.call_quality_scores FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.call_quality_scores FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- coverage_goal_candidates
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.coverage_goal_candidates;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.coverage_goal_candidates;
CREATE POLICY "operators_read_all"  ON pathfinder.coverage_goal_candidates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.coverage_goal_candidates FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- coverage_goals
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.coverage_goals;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.coverage_goals;
CREATE POLICY "operators_read_all"  ON pathfinder.coverage_goals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.coverage_goals FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- customer_call_memory_packs
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.customer_call_memory_packs;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.customer_call_memory_packs;
CREATE POLICY "operators_read_all"  ON pathfinder.customer_call_memory_packs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.customer_call_memory_packs FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- deal_activities
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.deal_activities;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.deal_activities;
CREATE POLICY "operators_read_all"  ON pathfinder.deal_activities FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.deal_activities FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- deals
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.deals;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.deals;
CREATE POLICY "operators_read_all"  ON pathfinder.deals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.deals FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- email_integrations
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.email_integrations;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.email_integrations;
CREATE POLICY "operators_read_all"  ON pathfinder.email_integrations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.email_integrations FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- email_threads
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.email_threads;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.email_threads;
CREATE POLICY "operators_read_all"  ON pathfinder.email_threads FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.email_threads FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- lead_actions
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.lead_actions;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.lead_actions;
CREATE POLICY "operators_read_all"  ON pathfinder.lead_actions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.lead_actions FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- lead_contacts
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.lead_contacts;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.lead_contacts;
CREATE POLICY "operators_read_all"  ON pathfinder.lead_contacts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.lead_contacts FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- lead_cross_pollination
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.lead_cross_pollination;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.lead_cross_pollination;
CREATE POLICY "operators_read_all"  ON pathfinder.lead_cross_pollination FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.lead_cross_pollination FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- national_accounts
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.national_accounts;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.national_accounts;
CREATE POLICY "operators_read_all"  ON pathfinder.national_accounts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.national_accounts FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- outreach_edits
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.outreach_edits;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.outreach_edits;
CREATE POLICY "operators_read_all"  ON pathfinder.outreach_edits FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.outreach_edits FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- procurement_pull_configs
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.procurement_pull_configs;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.procurement_pull_configs;
CREATE POLICY "operators_read_all"  ON pathfinder.procurement_pull_configs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.procurement_pull_configs FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- signals
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.signals;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.signals;
CREATE POLICY "operators_read_all"  ON pathfinder.signals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.signals FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- slack_branch_routes
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.slack_branch_routes;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.slack_branch_routes;
CREATE POLICY "operators_read_all"  ON pathfinder.slack_branch_routes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.slack_branch_routes FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- slack_messages
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.slack_messages;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.slack_messages;
CREATE POLICY "operators_read_all"  ON pathfinder.slack_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.slack_messages FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- slack_workspaces
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.slack_workspaces;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.slack_workspaces;
CREATE POLICY "operators_read_all"  ON pathfinder.slack_workspaces FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.slack_workspaces FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- source_adapters
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.source_adapters;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.source_adapters;
CREATE POLICY "operators_read_all"  ON pathfinder.source_adapters FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.source_adapters FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- voice_agent_sources
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.voice_agent_sources;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.voice_agent_sources;
CREATE POLICY "operators_read_all"  ON pathfinder.voice_agent_sources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.voice_agent_sources FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- voice_call_attempts
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.voice_call_attempts;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.voice_call_attempts;
CREATE POLICY "operators_read_all"  ON pathfinder.voice_call_attempts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.voice_call_attempts FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- zedcor_branches
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.zedcor_branches;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.zedcor_branches;
CREATE POLICY "operators_read_all"  ON pathfinder.zedcor_branches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.zedcor_branches FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- zedcor_customer_sites
DROP POLICY IF EXISTS "operators_read_all"  ON pathfinder.zedcor_customer_sites;
DROP POLICY IF EXISTS "operators_write_all" ON pathfinder.zedcor_customer_sites;
CREATE POLICY "operators_read_all"  ON pathfinder.zedcor_customer_sites FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));
CREATE POLICY "operators_write_all" ON pathfinder.zedcor_customer_sites FOR ALL TO authenticated
  USING       (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK  (EXISTS (SELECT 1 FROM pathfinder.operator_allowlist WHERE email = auth.jwt() ->> 'email'));

-- =============================================================================
-- POST-APPLY VERIFICATION
-- =============================================================================
-- Combined with 20260512_drop_legacy_permissive_rls.sql, after this migration:
--   SELECT count(*) FROM pg_policies WHERE schemaname='pathfinder' AND qual::text='true';
--   Expect: 0
