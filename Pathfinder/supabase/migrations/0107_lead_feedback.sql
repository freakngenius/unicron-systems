-- Connector Sprint C-1B — lead_feedback table.
--
-- Reps capture feedback on lead surfaces in two ways:
--   1. Slash command `/pathfinder feedback <project_id> <up|down> [reason]`
--   2. +1 / -1 reaction on a bot-posted lead message
--
-- Both paths write a single row here. The Architect tuning loop reads
-- the table to bias future ranking. RLS lets only service_role write
-- (the only writers are connector route handlers); reads are scoped by
-- customer_org_id matching the JWT claim, same convention as the rest
-- of the connector framework (see migration 0105).
--
-- Idempotent: every change uses IF NOT EXISTS.

create table if not exists pathfinder.lead_feedback (
  id uuid primary key default gen_random_uuid(),
  customer_org_id text not null,
  project_id text not null,
  thumb text not null check (thumb in ('up', 'down')),
  reason text,
  source text not null check (source in ('slack_command', 'slack_reaction', 'teams_card', 'web_ui')),
  -- Source-specific identifiers (all nullable; only one is set per row):
  source_external_id text,        -- e.g. Slack message ts for slack_reaction
  user_external_id text,          -- e.g. Slack user_id who reacted/commented
  connector_id uuid references pathfinder.connectors(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_feedback_project_recent_idx
  on pathfinder.lead_feedback (project_id, created_at desc);

create index if not exists lead_feedback_org_recent_idx
  on pathfinder.lead_feedback (customer_org_id, created_at desc);

-- Reaction-feedback dedupe: same connector + ts + user + thumb should not
-- produce duplicate rows when Slack retries an event. Partial unique index
-- when source = 'slack_reaction' and source_external_id + user_external_id
-- are present.
create unique index if not exists lead_feedback_slack_reaction_unique
  on pathfinder.lead_feedback (connector_id, source_external_id, user_external_id, thumb)
  where source = 'slack_reaction'
    and connector_id is not null
    and source_external_id is not null
    and user_external_id is not null;

alter table pathfinder.lead_feedback enable row level security;

drop policy if exists lead_feedback_select_by_org on pathfinder.lead_feedback;
create policy lead_feedback_select_by_org on pathfinder.lead_feedback
  for select
  using (
    customer_org_id = coalesce(
      current_setting('request.jwt.claims', true)::jsonb->>'org_id',
      current_setting('request.jwt.claim.org_id', true),
      ''
    )
  );

grant select on pathfinder.lead_feedback to anon, authenticated;
grant select, insert, update, delete on pathfinder.lead_feedback to service_role;
