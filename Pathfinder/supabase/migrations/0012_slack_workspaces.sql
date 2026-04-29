-- 0012_slack_workspaces.sql — Pathfinder native Slack bot (P0-04).
-- Spec: Pathfinder/Pathfinder-Feature-Specs.md § "P0 Feature 4 — Slack bot
-- in customer workspaces". Plan: docs/PLAN-P0-04-SLACK.md.
--
-- Three structural changes:
--
--   1. Per-workspace install record (slack_workspaces) + per-branch
--      routing (slack_branch_routes) + per-message audit
--      (slack_messages). Service-role-only writes; no anon read because
--      bot_token is sensitive.
--
--   2. Add `slack_alert_sent_at` to pathfinder.projects so the
--      high-priority alerts cron can dedupe with a 7-day TTL.
--
--   3. Widen agent_log/agent_runs whitelists to admit 'slack-bot'.
--      Same pattern as 0005_agent_expansion_layer1.sql and
--      0011_hubspot_sync.sql; idempotent re-creation either way the
--      branch order resolves.

-- 1. Widen agent_name whitelist -------------------------------------------

alter table pathfinder.agent_log drop constraint agent_log_agent_name_check;
alter table pathfinder.agent_log add constraint agent_log_agent_name_check
  check (agent_name in (
    'ingestor','ranker','adjacent','verifier',
    'outreach','pulse','competitive','briefing','customer-intel','eval',
    'hubspot-sync','slack-bot'
  ));

alter table pathfinder.agent_runs drop constraint agent_runs_agent_name_check;
alter table pathfinder.agent_runs add constraint agent_runs_agent_name_check
  check (agent_name in (
    'ingestor','ranker','adjacent','verifier',
    'outreach','pulse','competitive','briefing','customer-intel','eval',
    'hubspot-sync','slack-bot'
  ));

-- 2. slack_workspaces — one row per customer install ---------------------
--
-- bot_token is sensitive; never exposed to anon. Re-installs upsert on
-- team_id, replacing the prior token (Slack rotates tokens on re-grant).
-- raw_oauth_payload retains the full v2.access response for audit/replay.

create table pathfinder.slack_workspaces (
  team_id                  text primary key,
  team_name                text not null,
  bot_user_id              text not null,
  bot_token                text not null,
  app_id                   text not null,
  scope                    text not null,
  installer_user_id        text,
  installer_email          text,
  default_alert_channel_id text,
  installed_at             timestamptz not null default now(),
  uninstalled_at           timestamptz,
  raw_oauth_payload        jsonb
);

create index slack_workspaces_active_idx
  on pathfinder.slack_workspaces(team_id)
  where uninstalled_at is null;

-- 3. slack_branch_routes — per-branch channel + (planned v2) per-rep DM --
--
-- One row per (workspace, branch) pair. channel_id is required;
-- rep_user_id and rep_email are nullable until per-rep onboarding ships
-- (planned v2 — see docs/SLACK-APP-SETUP.md § 10).

create table pathfinder.slack_branch_routes (
  team_id     text not null references pathfinder.slack_workspaces(team_id) on delete cascade,
  branch_id   text not null references pathfinder.branches(id) on delete cascade,
  channel_id  text not null,
  rep_user_id text,
  rep_email   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (team_id, branch_id)
);

create index slack_branch_routes_branch_idx
  on pathfinder.slack_branch_routes(branch_id);

-- 4. slack_messages — per-message audit + button-update lookup -----------
--
-- Identified by Slack's (channel_id, ts) tuple. resolved_* stamped when
-- a button is tapped so a re-tap or a parallel tap by another user is
-- a no-op.

create table pathfinder.slack_messages (
  id              bigserial primary key,
  team_id         text not null references pathfinder.slack_workspaces(team_id) on delete cascade,
  channel_id      text not null,
  ts              text not null,
  project_id      text not null references pathfinder.projects(id) on delete cascade,
  kind            text not null check (kind in (
    'digest_item',
    'high_priority_dm',
    'high_priority_post'
  )),
  posted_at       timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     text,
  resolved_action text check (resolved_action in ('accept','dismiss','snooze_24h','snooze_7d'))
);

create unique index slack_messages_ts_idx
  on pathfinder.slack_messages(team_id, channel_id, ts);

create index slack_messages_project_idx
  on pathfinder.slack_messages(project_id, posted_at desc);

-- 5. projects.slack_alert_sent_at — 7-day re-alert dedup -----------------

alter table pathfinder.projects
  add column slack_alert_sent_at timestamptz;

-- Partial index for the alerts cron's "stale or never sent" predicate.
create index projects_slack_alert_due_idx
  on pathfinder.projects(score desc, posted_date desc)
  where slack_alert_sent_at is null or slack_alert_sent_at < now() - interval '7 days';

-- 6. updated_at triggers --------------------------------------------------

create or replace function pathfinder.touch_slack_branch_routes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger slack_branch_routes_touch_updated_at
  before update on pathfinder.slack_branch_routes
  for each row
  execute function pathfinder.touch_slack_branch_routes_updated_at();

-- 7. RLS — service-role-only writes. No anon read on slack_workspaces  --
--    because bot_token is sensitive. The other two tables are audit /
--    routing metadata; we still keep them service-role-only since they
--    are not consumed by the dashboard's anon client.

alter table pathfinder.slack_workspaces      enable row level security;
alter table pathfinder.slack_branch_routes   enable row level security;
alter table pathfinder.slack_messages        enable row level security;

create policy slack_workspaces_admin
  on pathfinder.slack_workspaces for all
  to service_role using (true) with check (true);

create policy slack_branch_routes_admin
  on pathfinder.slack_branch_routes for all
  to service_role using (true) with check (true);

create policy slack_messages_admin
  on pathfinder.slack_messages for all
  to service_role using (true) with check (true);
