-- 0050_deals.sql — Stream B Gate B1: Pipeline Kanban (deals + deal_activities).
--
-- Phase 2 spawn: STREAM B reserves migration range 0050-0069. See
-- MEMORY/progress.md "Phase 2 spawned" entry and Phase2-worktrees/
-- unicron-stream-b-pathfinder/STREAM-README.md.
--
-- Two tables:
--   1. pathfinder.deals — one row per project that has progressed past raw
--      lead. Distinct from lead_actions (which mirrors HubSpot stages from
--      P0-03); deals is the in-Pathfinder pipeline-Kanban surface that
--      Stream B owns. Both can coexist: lead_actions is the HubSpot mirror,
--      deals is the operator-visible Kanban; the post-Phase-2 reinforcement
--      loop will reconcile them.
--   2. pathfinder.deal_activities — append-only event log per deal. Drag-
--      to-move writes a 'stage_change' row; B2 send-from-Pathfinder writes
--      'email_sent'; B3 reply-detection writes 'reply_received'.
--
-- Stage enum follows STREAM-README §"Gate B1": NEW / CONTACTED / REPLIED /
-- MEETING / PROPOSAL / WON / LOST. Distinct from lead_actions.status which
-- mirrors HubSpot pipeline stages.

create type pathfinder.deal_pipeline_stage as enum (
  'NEW',
  'CONTACTED',
  'REPLIED',
  'MEETING',
  'PROPOSAL',
  'WON',
  'LOST'
);

create type pathfinder.deal_activity_type as enum (
  'stage_change',
  'email_sent',
  'reply_received',
  'meeting_booked',
  'manual_note'
);

-- 1. deals -----------------------------------------------------------------

create table pathfinder.deals (
  id              uuid primary key default gen_random_uuid(),
  project_id      text not null references pathfinder.projects(id) on delete cascade,

  -- The owner_email is the operator who claimed this deal (sales rep). Null
  -- before assignment; B2 send-from-Pathfinder stamps the operator who sent
  -- first contact.
  owner_email     text,

  pipeline_stage  pathfinder.deal_pipeline_stage not null default 'NEW',

  -- Estimated deal value in USD. Defaults to projects.project_value when
  -- the deal is seeded from a project; the operator can override.
  value_usd       numeric(14,2),

  -- Free-form rep-attested context. UI surfaces this in the Kanban card.
  notes           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One deal per (project, owner). A project can be worked by multiple
  -- reps in parallel (different branches); a single rep can only have
  -- one deal per project. Pre-claim deals (owner null) are unique on
  -- project alone — we enforce that with a partial unique index below.
  unique (project_id, owner_email)
);

-- Pre-claim deals (owner_email is null) — only one per project allowed.
create unique index deals_unclaimed_project_idx
  on pathfinder.deals(project_id)
  where owner_email is null;

create index deals_stage_updated_idx
  on pathfinder.deals(pipeline_stage, updated_at desc);

create index deals_owner_idx
  on pathfinder.deals(owner_email, updated_at desc)
  where owner_email is not null;

-- 2. deal_activities -------------------------------------------------------

create table pathfinder.deal_activities (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references pathfinder.deals(id) on delete cascade,
  activity_type pathfinder.deal_activity_type not null,

  -- For stage_change rows: from/to stage. Both null for non-stage events.
  from_stage    pathfinder.deal_pipeline_stage,
  to_stage      pathfinder.deal_pipeline_stage,

  -- Free-form structured payload. e.g. for 'email_sent': { provider_message_id,
  -- thread_id, subject, recipient }. For 'reply_received': { thread_id,
  -- snippet }. JSONB so B2 / B3 can extend without re-migrating.
  payload       jsonb not null default '{}'::jsonb,

  -- The user / agent that generated the activity. 'system' for automated
  -- transitions (e.g., reply-detection auto-flip to REPLIED).
  actor_email   text,

  created_at    timestamptz not null default now()
);

create index deal_activities_deal_idx
  on pathfinder.deal_activities(deal_id, created_at desc);

create index deal_activities_type_idx
  on pathfinder.deal_activities(activity_type, created_at desc);

-- 3. updated_at trigger on deals -------------------------------------------

create or replace function pathfinder.touch_deals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger deals_touch_updated_at
  before update on pathfinder.deals
  for each row
  execute function pathfinder.touch_deals_updated_at();

-- 4. RLS — anon read, service-role write (matches 0004_rls.sql pattern) ----

alter table pathfinder.deals enable row level security;

create policy deals_read
  on pathfinder.deals for select
  to anon, authenticated
  using (true);

create policy deals_write
  on pathfinder.deals for all
  to service_role
  using (true)
  with check (true);

alter table pathfinder.deal_activities enable row level security;

create policy deal_activities_read
  on pathfinder.deal_activities for select
  to anon, authenticated
  using (true);

create policy deal_activities_write
  on pathfinder.deal_activities for all
  to service_role
  using (true)
  with check (true);
