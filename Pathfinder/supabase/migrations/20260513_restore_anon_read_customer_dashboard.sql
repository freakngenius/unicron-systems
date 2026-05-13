-- Restore anon-SELECT on the three tables the Pathfinder customer dashboard
-- reads directly via the browser's Supabase JS client.
--
-- Context
-- -------
-- PR #380 (commit 28537d8, 2026-05-13) dropped every qual=true permissive
-- policy across 37 pathfinder.* tables — a correct posture for surfaces
-- only touched by service-role (Inngest, Vercel cron, supabaseAdmin() in
-- API routes), all of which bypass RLS.
--
-- That sweep also broke the customer-facing dashboard at /pathfinder.
-- lib/realtime.ts runs in 'use client' components and reads three tables
-- from the browser using the anon key:
--   - pathfinder.agent_log    (model-routing strip + live agent activity)
--   - pathfinder.agent_runs   (agent fleet cells + last-run timestamps)
--   - pathfinder.projects     (map markers + project list + modal)
--
-- After PR #380, those queries returned zero rows because no RLS policy
-- granted the anon role any visibility — including the `branches` table
-- which is fetched server-side via /api/branches (supabaseAdmin) and
-- therefore unaffected.
--
-- /pathfinder is gated by basic auth at the Next.js middleware layer
-- (middleware.ts BASIC_AUTH_USER / BASIC_AUTH_PASS). Anonymous reads
-- through Supabase are reachable only after passing that gate, so the
-- anon-SELECT here is not a public-internet exposure — the basic-auth
-- middleware is the actual security boundary for these three tables.
--
-- Policies are additive: they grant anon-only SELECT and do not affect
-- the operators_read_all / operators_write_all policies on the same
-- tables (which target the `authenticated` role). All write paths for
-- these tables continue to go through service-role (cron + Inngest +
-- API routes calling supabaseAdmin()).
--
-- Long-term remediation
-- ---------------------
-- The proper fix is to route lib/realtime.ts subscriptions through Next.js
-- API routes that use supabaseAdmin(), then drop these three anon-read
-- policies. Tracked separately as a "dashboard-server-fetch" sprint.

CREATE POLICY "anon_select_agent_log"
  ON pathfinder.agent_log
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_select_agent_runs"
  ON pathfinder.agent_runs
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_select_projects"
  ON pathfinder.projects
  FOR SELECT
  TO anon
  USING (true);
