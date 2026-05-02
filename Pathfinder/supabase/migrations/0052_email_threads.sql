-- 0052_email_threads.sql — Stream B Gate B3.
--
-- Email thread tracking with provider-specific IDs. One row per
-- (provider, provider_thread_id). Seeded on outbound send (B2's
-- outreach-send orchestrator stamps the thread immediately after a
-- successful send) and updated when an inbound reply matches the
-- thread (B3's webhook handlers).
--
-- Reply detection flow: Gmail Pub/Sub or Microsoft Graph subscription
-- delivers a webhook → handler decodes the payload → if a tracked
-- thread matches, write replied_at + bump last_inbound_at + flip
-- deals.pipeline_stage to 'REPLIED' (when not already past) + write
-- a deal_activities row.

create table pathfinder.email_threads (
  id                    uuid primary key default gen_random_uuid(),

  provider              pathfinder.email_provider not null,
  provider_thread_id    text not null,

  project_id            text not null references pathfinder.projects(id) on delete cascade,
  -- Optional FK to the deal that owns this thread. Many threads exist
  -- before a deal is created (NEW stage); some never become deals (the
  -- rep dismisses the lead). Cascade null on deal delete so the audit
  -- record survives.
  deal_id               uuid references pathfinder.deals(id) on delete set null,

  -- Operator who initiated the thread (the rep on B2's send path).
  actor_email           text not null,

  -- Subject of the FIRST outbound message — useful for UI grouping
  -- when a single rep ends up with several threads on one project.
  subject               text,

  -- Counterparty (recipient of the outbound; sender of any reply).
  recipient_email       text not null,

  -- Stamp the most recent message in either direction. last_outbound_at
  -- is set on send; last_inbound_at + replied_at flip on first reply.
  last_outbound_at      timestamptz,
  last_inbound_at       timestamptz,
  replied_at            timestamptz,

  -- Number of inbound + outbound messages observed in this thread.
  -- Bumped by both the send orchestrator and the inbound webhook.
  message_count         integer not null default 0,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (provider, provider_thread_id)
);

create index email_threads_project_idx
  on pathfinder.email_threads(project_id, updated_at desc);

create index email_threads_deal_idx
  on pathfinder.email_threads(deal_id, updated_at desc)
  where deal_id is not null;

create index email_threads_replied_idx
  on pathfinder.email_threads(replied_at desc)
  where replied_at is not null;

-- updated_at trigger ------------------------------------------------------

create or replace function pathfinder.touch_email_threads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger email_threads_touch_updated_at
  before update on pathfinder.email_threads
  for each row
  execute function pathfinder.touch_email_threads_updated_at();

-- RLS — anon read, service-role write (matches 0004 pattern) --------------

alter table pathfinder.email_threads enable row level security;

create policy email_threads_read
  on pathfinder.email_threads for select
  to anon, authenticated
  using (true);

create policy email_threads_write
  on pathfinder.email_threads for all
  to service_role
  using (true)
  with check (true);
