-- Connector Sprint C-1A — widen agent_runs.agent_name + agent_log.agent_name
-- to include the new 'connector-refresh' name used by the nightly token
-- refresh cron at /api/cron/connector-token-refresh.
--
-- Mirrors the pattern in 0011_hubspot_sync.sql + 0012_slack_workspaces.sql:
-- drop the CHECK constraint, re-add with the wider whitelist. The current
-- DB whitelist is whatever 0012 left in place (verified at apply time).

alter table pathfinder.agent_runs drop constraint if exists agent_runs_agent_name_check;
alter table pathfinder.agent_runs add constraint agent_runs_agent_name_check
  check (agent_name in (
    'ingestor','ranker','adjacent','verifier',
    'outreach','pulse','competitive','briefing','customer-intel','eval',
    'hubspot-sync','slack-bot','connector-refresh'
  ));

alter table pathfinder.agent_log drop constraint if exists agent_log_agent_name_check;
alter table pathfinder.agent_log add constraint agent_log_agent_name_check
  check (agent_name in (
    'ingestor','ranker','adjacent','verifier',
    'outreach','pulse','competitive','briefing','customer-intel','eval',
    'hubspot-sync','slack-bot','connector-refresh'
  ));
