-- Round 3 of the PR #380 anon-read fallout fix.
--
-- PR #392 fixed lib/realtime.ts (3 tables).
-- PR #393 fixed anon-keyed /api/* routes (7 tables).
-- This round fixes the remaining anon-read surfaces:
--   * app/page.tsx (Server Component, anon supabase) calls fetchCrossPollMatches
--     which joins lead_cross_pollination ✓ with **zedcor_customer_sites** (1,855
--     rows). Without anon visibility on zedcor_customer_sites, the cross-poll
--     polylines + warm-intro markers vanish — that's what the operator hit.
--   * app/leads/[projectId]/page.tsx (full lead-detail page) and the parallel
--     @modal/(.) route call lib/lead-detail-data.ts which reads project_contacts,
--     outreach_edits beyond the already-fixed projects/lead_contacts/outreach_drafts.
--   * app/api/projects/[id]/timeline calls lib/timeline.ts which reads
--     outreach_edits, email_threads, deals.
--   * Other dashboard surfaces (briefings, adjacent_targets, lead_actions,
--     chat_threads, chat_messages, lead_hubspot_deals, organizations,
--     org_geo_config, ranking_config, architect_inbox) all sit behind anon
--     code paths and are needed for the customer-facing display.
--
-- DELIBERATELY EXCLUDED from this round (token-bearing — must be converted
-- to supabaseAdmin() instead of anon-exposed):
--   * pathfinder.connector_tokens
--   * pathfinder.email_integrations
--   * pathfinder.connectors
--   * pathfinder.user_connections
--
-- Routes that touch those (e.g. /api/leads/[id]/outreach/connection) will
-- return null/empty until they're converted to admin. UI degrades by one
-- pill ("Connect personal email" stays in default state); no data corruption.
-- The dashboard-server-fetch sprint will fold those route conversions in
-- and drop ALL anon-restore policies (#392 + #393 + this one) when complete.
--
-- Same security framing as before: /pathfinder is gated by basic auth at the
-- Next.js middleware layer; RLS is not the security boundary for these tables
-- today. All write paths still go through service-role.

CREATE POLICY "anon_select_zedcor_customer_sites"
  ON pathfinder.zedcor_customer_sites
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_project_contacts"
  ON pathfinder.project_contacts
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_outreach_edits"
  ON pathfinder.outreach_edits
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_email_threads"
  ON pathfinder.email_threads
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_deals"
  ON pathfinder.deals
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_adjacent_targets"
  ON pathfinder.adjacent_targets
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_briefings"
  ON pathfinder.briefings
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_lead_actions"
  ON pathfinder.lead_actions
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_chat_threads"
  ON pathfinder.chat_threads
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_chat_messages"
  ON pathfinder.chat_messages
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_lead_hubspot_deals"
  ON pathfinder.lead_hubspot_deals
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_organizations"
  ON pathfinder.organizations
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_org_geo_config"
  ON pathfinder.org_geo_config
  FOR SELECT TO anon USING (true);

-- NOTE: pathfinder.ranking_config does not exist in prod (referenced in
-- lib/scoring-config-server.ts but never migrated in). Settings page
-- read for ranking thresholds will continue returning whatever the
-- existing fallback is; tracked separately.

CREATE POLICY "anon_select_architect_inbox"
  ON pathfinder.architect_inbox
  FOR SELECT TO anon USING (true);
