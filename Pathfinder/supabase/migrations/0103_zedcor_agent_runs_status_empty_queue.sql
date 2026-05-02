-- Z-D Wave 3 (#26) — empty-queue heartbeat status.
--
-- Widen pathfinder.agent_runs.status to include 'empty_queue' so the
-- empty-queue heartbeat from ranker / outreach / slack-alerts / cost-alert /
-- briefing crons can be persisted without violating the CHECK constraint.
--
-- The producer crons (ranker, outreach) write a heartbeat row with
-- status='empty_queue' BEFORE their early-return path so dashboards never
-- look dead even when the queue is empty. The notification crons
-- (slack-alerts, cost-alert, briefing) widen their status surface so a
-- "ran-but-no-work" cycle is distinguishable from a "ran-and-did-work" one.

alter table pathfinder.agent_runs
  drop constraint if exists agent_runs_status_check;

alter table pathfinder.agent_runs
  add constraint agent_runs_status_check
  check (status = any (array['running'::text, 'success'::text, 'failed'::text, 'empty_queue'::text]));
