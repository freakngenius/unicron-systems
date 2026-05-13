-- Round 2 of the PR #380 anon-read fallout fix.
--
-- PR #392 restored anon-SELECT on the three tables read directly from the
-- browser by lib/realtime.ts (agent_log, agent_runs, projects). After that
-- merged, the dashboard's three real-time data sources lit up — but the
-- BranchDock + project filter + customer markers + outreach modal section
-- + cost summary were still dark.
--
-- Root cause: several /app/api/* routes use the **anon** Supabase client
-- (`import { supabase } from '@/lib/supabase'`) rather than `supabaseAdmin()`.
-- Even though those routes run on the Next.js server, the anon JWT they
-- present makes RLS apply — and PR #380 left those tables with no anon
-- visibility.
--
-- Anon-keyed API routes audit (today's main):
--   /api/branches              → pathfinder.branches              (BroKEN → fixed here)
--   /api/customers             → pathfinder.customers             (broken → fixed)
--   /api/outreach-drafts       → pathfinder.outreach_drafts       (broken → fixed)
--   /api/cost-summary          → pathfinder.llm_calls             (broken → fixed)
--   /api/leads/.../draft       → pathfinder.lead_contacts         (broken → fixed)
--                              + pathfinder.lead_cross_pollination(broken → fixed)
--                              + pathfinder.zedcor_branches       (broken → fixed)
--   /api/projects, /api/agents, /api/activity, /api/stats, /api/leads draft  → projects /
--     agent_runs / agent_log — already covered by PR #392.
--
-- Same security framing as PR #392: /pathfinder is gated by basic auth
-- (middleware.ts BASIC_AUTH_USER/PASS). Anonymous Supabase reads are
-- reachable only after passing that gate. RLS is not the security
-- boundary for these tables today.
--
-- Long-term: switch every /app/api/* route from `supabase` (anon) to
-- `supabaseAdmin()` (service-role, bypasses RLS), then drop these
-- restore policies. That converts basic-auth + service-role into the
-- only gates, the way the routes were meant to be when they were written.
-- Tracked as the "dashboard-server-fetch" sprint.

CREATE POLICY "anon_select_branches"
  ON pathfinder.branches
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_select_customers"
  ON pathfinder.customers
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_select_outreach_drafts"
  ON pathfinder.outreach_drafts
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_select_llm_calls"
  ON pathfinder.llm_calls
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_select_lead_contacts"
  ON pathfinder.lead_contacts
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_select_lead_cross_pollination"
  ON pathfinder.lead_cross_pollination
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_select_zedcor_branches"
  ON pathfinder.zedcor_branches
  FOR SELECT
  TO anon
  USING (true);
