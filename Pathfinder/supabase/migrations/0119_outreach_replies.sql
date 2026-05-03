-- Gate 13X-A — reply detection schema. Additive + idempotent.
--
-- Adds reply-tracking columns to pathfinder.outreach_sends (note:
-- migration 0114 already established `reply_received_at` and
-- `reply_message_id`; the `add column if not exists` calls below are
-- safe no-ops in that case and codify the canonical column set so
-- future Supabase environments converge on the same shape). The new
-- column is `reply_thread_id`, which Gate 13X-B (Gmail inbound) and
-- Gate 13X-C (Outlook inbound) use to thread incoming replies back
-- to the originating send when message_id correlation is unavailable.
--
-- Also creates pathfinder.outreach_replies — the per-reply detail
-- table (full headers, body parts, processed-at marker). The B/C
-- inbound webhooks insert here; D (Reply UI) reads from here. This
-- migration is schema-only — no callers are wired up in this gate.

alter table pathfinder.outreach_sends
  add column if not exists reply_received_at timestamptz;

alter table pathfinder.outreach_sends
  add column if not exists reply_message_id text;

alter table pathfinder.outreach_sends
  add column if not exists reply_thread_id text;

create table if not exists pathfinder.outreach_replies (
  id                 uuid primary key default gen_random_uuid(),
  outreach_send_id   uuid not null references pathfinder.outreach_sends(id),
  received_at        timestamptz not null default now(),
  from_email         text not null,
  subject            text,
  body_text          text,
  body_html          text,
  message_id         text,
  thread_id          text,
  raw_headers        jsonb,
  processed_at       timestamptz
);

create index if not exists outreach_replies_outreach_send_id_idx
  on pathfinder.outreach_replies(outreach_send_id);

create index if not exists outreach_replies_message_id_idx
  on pathfinder.outreach_replies(message_id)
  where message_id is not null;

create index if not exists outreach_replies_thread_id_idx
  on pathfinder.outreach_replies(thread_id)
  where thread_id is not null;
