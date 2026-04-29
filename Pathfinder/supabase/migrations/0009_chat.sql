-- Intelligence Chat — persistent threads + messages for the embedded
-- Perplexity-powered assistant in the dashboard. Spec:
-- Pathfinder/Pathfinder-Feature-Specs.md § "P0 Feature 1 — Intelligence Chat".
--
-- Threading model (Q3 decision in PLAN-P0-01-INTELLIGENCE-CHAT.md § 0):
-- per-user with view-aware sub-threads. context_key is a stable string
-- describing the dashboard view ("project:<id>", "branch:<id>", or
-- "dashboard:default") so users get clean continuity per conversation
-- context. Unique (user_email, context_key) prevents duplicates.
--
-- Action audit (Q1 decision): the four deferred-action types
-- (accept_lead_to_hubspot, push_to_pipeline, schedule_followup, add_note)
-- write rows here with kind='action_result' and payload.status='deferred'
-- until P0-02 (Outreach Drafter) and P0-03 (HubSpot Sync) create the real
-- outreach_drafts / lead_actions tables. A backfill job can replay these
-- rows once those tables exist.

create table pathfinder.chat_threads (
  id               uuid primary key default gen_random_uuid(),
  user_email       text not null,
  context_key      text not null,
  context_label    text not null,
  context_snapshot jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  unique (user_email, context_key)
);

create index chat_threads_user_idx
  on pathfinder.chat_threads(user_email, last_message_at desc);

create type pathfinder.chat_message_role as enum ('user', 'assistant', 'system');

create type pathfinder.chat_message_kind as enum (
  'text',
  'outreach_draft',
  'action_result',
  'error'
);

create table pathfinder.chat_messages (
  id          bigserial primary key,
  thread_id   uuid not null references pathfinder.chat_threads(id) on delete cascade,
  role        pathfinder.chat_message_role not null,
  kind        pathfinder.chat_message_kind not null default 'text',
  content     text not null,
  payload     jsonb not null default '{}'::jsonb,
  model_used  text,
  latency_ms  integer,
  created_at  timestamptz not null default now()
);

create index chat_messages_thread_idx
  on pathfinder.chat_messages(thread_id, created_at);

-- Touch last_message_at on the parent thread whenever a message is appended.
create or replace function pathfinder.touch_chat_thread()
returns trigger
language plpgsql
as $$
begin
  update pathfinder.chat_threads
    set last_message_at = new.created_at
    where id = new.thread_id;
  return new;
end;
$$;

create trigger chat_messages_touch_thread
  after insert on pathfinder.chat_messages
  for each row
  execute function pathfinder.touch_chat_thread();
