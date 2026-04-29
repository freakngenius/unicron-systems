-- 0011_hubspot_sync.sql — Pathfinder ↔ HubSpot bidirectional sync (P0-03).
-- Spec: Pathfinder/Pathfinder-Feature-Specs.md § "P0 Feature 3 — HubSpot
-- bidirectional sync". Plan: docs/PLAN-P0-03-HUBSPOT.md.
--
-- Two structural changes:
--
--   1. Bootstrap pathfinder.lead_actions — the action audit + sync target
--      that P0-04 (Slack bot) and P0-01 (chat panel) consume via
--      lib/lead-actions.ts. Per the chat branch's PLAN-P0-01 § Open
--      Questions #1, this branch owns the table because HubSpot sync IS
--      the integration that turns "accepted" into a real CRM record.
--
--   2. Widen the agent_name CHECK on agent_log + agent_runs to admit
--      'hubspot-sync'. Same pattern as 0005_agent_expansion_layer1.sql.
--      Done in one statement so future agents don't have to re-touch the
--      constraint.

-- 1. Widen agent_name whitelist -------------------------------------------

alter table pathfinder.agent_log drop constraint agent_log_agent_name_check;
alter table pathfinder.agent_log add constraint agent_log_agent_name_check
  check (agent_name in (
    'ingestor','ranker','adjacent','verifier',
    'outreach','pulse','competitive','briefing','customer-intel','eval',
    'hubspot-sync'
  ));

alter table pathfinder.agent_runs drop constraint agent_runs_agent_name_check;
alter table pathfinder.agent_runs add constraint agent_runs_agent_name_check
  check (agent_name in (
    'ingestor','ranker','adjacent','verifier',
    'outreach','pulse','competitive','briefing','customer-intel','eval',
    'hubspot-sync'
  ));

-- 2. lead_actions table ---------------------------------------------------
--
-- Status enum follows the seven-status map in docs/HUBSPOT-STAGE-MAP.md.
-- Five mirror HubSpot stages; two are local-only.
--
--   accepted        — rep tapped accept; HubSpot push pending or in-flight
--   meeting_booked  — HubSpot reports first-meeting-booked
--   proposal_sent   — HubSpot reports proposal-sent
--   closed_won      — HubSpot reports closed-won; closed_won_amount stamped
--   closed_lost     — HubSpot reports closed-lost; closed_lost_reason set
--   dismissed       — rep dismissed (local-only, no HubSpot mirror)
--   snoozed         — rep snoozed (local-only, no HubSpot mirror)

create type pathfinder.lead_action_status as enum (
  'accepted',
  'meeting_booked',
  'proposal_sent',
  'closed_won',
  'closed_lost',
  'dismissed',
  'snoozed'
);

create table pathfinder.lead_actions (
  id                       bigserial primary key,
  project_id               text not null references pathfinder.projects(id) on delete cascade,
  actor_email              text not null,
  status                   pathfinder.lead_action_status not null default 'accepted',

  -- Rep-attested context captured at accept time. Populated by the
  -- Slack-bot accept modal (P0-04) and by the chat panel's accept action
  -- (P0-01). attribution math reads attested_pipeline_value when the
  -- HubSpot deal closes without an amount echoed back.
  attested_pipeline_value  numeric(14,2),
  first_action_date        date,
  note                     text,

  -- HubSpot sync columns. hubspot_deal_id is null until the push
  -- succeeds; hubspot_last_event_id provides idempotency on webhook
  -- replay.
  hubspot_deal_id          text,
  hubspot_pipeline_id      text,
  hubspot_stage_id         text,
  hubspot_pushed_at        timestamptz,
  hubspot_last_event_at    timestamptz,
  hubspot_last_event_id    text,

  -- Stamped on closed_won / closed_lost transitions. closed_won_amount
  -- prefers HubSpot's reported amount, falls back to attested value.
  closed_won_amount        numeric(14,2),
  closed_won_at            timestamptz,
  closed_lost_reason       text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- One accept row per (project, rep). A second accept by the same rep
  -- becomes an upsert; a different rep accepting creates a parallel row
  -- (Pathfinder treats credit per-rep at the branch level).
  unique (project_id, actor_email)
);

create index lead_actions_project_idx
  on pathfinder.lead_actions(project_id, updated_at desc);

create index lead_actions_status_idx
  on pathfinder.lead_actions(status, updated_at desc);

-- Webhook lookup is hubspot_deal_id → row; partial index because most
-- pre-push rows have null deal_id and we don't need them in this index.
create unique index lead_actions_hubspot_deal_idx
  on pathfinder.lead_actions(hubspot_deal_id)
  where hubspot_deal_id is not null;

-- 3. updated_at trigger ---------------------------------------------------

create or replace function pathfinder.touch_lead_actions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger lead_actions_touch_updated_at
  before update on pathfinder.lead_actions
  for each row
  execute function pathfinder.touch_lead_actions_updated_at();

-- 4. RLS — anon read, service-role write (matches 0004_rls.sql pattern) ---

alter table pathfinder.lead_actions enable row level security;

create policy lead_actions_read
  on pathfinder.lead_actions for select
  to anon, authenticated
  using (true);

create policy lead_actions_write
  on pathfinder.lead_actions for all
  to service_role
  using (true)
  with check (true);
