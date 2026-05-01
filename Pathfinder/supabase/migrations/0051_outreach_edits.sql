-- 0051_outreach_edits.sql — Stream B Gate B2: send-from-Pathfinder.
--
-- Two tables:
--   1. pathfinder.email_integrations — per-operator OAuth connection to
--      Gmail or Microsoft Graph. One row per (actor_email, provider). Stores
--      access_token + refresh_token + expiry + connected mailbox address.
--      Service-role-only access to the token columns (RLS); anon may read
--      a "connected?" status flag via a view in a future migration.
--   2. pathfinder.outreach_edits — per-send capture of (what the model
--      drafted) vs (what the rep actually sent). This is the seed of the
--      reinforcement loop; the post-Phase-2 Pulse agent will train on this
--      to improve the OutreachDrafter prompt.
--
-- Provider field is an enum: 'gmail' (Gmail API) or 'outlook' (Microsoft
-- Graph). Other providers (Apple Mail, etc.) defer to the post-Phase-2
-- stretch list; the enum widens cleanly when added.

create type pathfinder.email_provider as enum (
  'gmail',
  'outlook'
);

-- 1. email_integrations ---------------------------------------------------

create table pathfinder.email_integrations (
  id                  uuid primary key default gen_random_uuid(),
  actor_email         text not null,
  provider            pathfinder.email_provider not null,

  -- Mailbox address connected (the OAuth grant subject). Often equal to
  -- actor_email but may differ when an operator connects an alias.
  account_email       text not null,

  -- OAuth tokens. Sensitive. RLS denies anon reads on the entire row;
  -- only service_role can SELECT or write. The frontend gets a
  -- redacted "is_connected" flag from /api/email/status.
  access_token        text,
  refresh_token       text,
  token_expires_at    timestamptz,
  scope               text,

  -- Provider-specific metadata. JSONB so each provider can store extra
  -- bookkeeping (e.g. Microsoft Graph 'tenantId', Gmail 'historyId').
  provider_meta       jsonb not null default '{}'::jsonb,

  connected_at        timestamptz not null default now(),
  disconnected_at     timestamptz,

  -- One active connection per (operator, provider, account). A rep that
  -- reconnects the same Gmail mailbox upserts onto this row; switching
  -- provider creates a parallel row.
  unique (actor_email, provider, account_email)
);

create index email_integrations_operator_idx
  on pathfinder.email_integrations(actor_email, provider);

-- 2. outreach_edits -------------------------------------------------------

create table pathfinder.outreach_edits (
  id                  uuid primary key default gen_random_uuid(),

  -- Optional FK to outreach_drafts (null when the rep composed from
  -- scratch without using the model draft). Cascade null on draft delete
  -- so we don't lose the edit history for analytics.
  outreach_draft_id   bigint references pathfinder.outreach_drafts(id) on delete set null,

  project_id          text not null references pathfinder.projects(id) on delete cascade,
  actor_email         text not null,
  provider            pathfinder.email_provider not null,

  -- The draft (what the model wrote) at the moment of send. Captured
  -- here verbatim — outreach_drafts may evolve later but this row is
  -- frozen.
  draft_subject       text,
  draft_body          text not null,

  -- The sent text (what the rep actually sent).
  sent_subject        text,
  sent_body           text not null,

  -- Recipient address(es), comma-joined for multi-recipient. Captured
  -- for analytics (which contacts saw which drafts).
  recipient_email     text not null,

  -- Provider-issued IDs after a successful send. Both nullable so we
  -- can record the row even when a send fails (with sent_at stamped
  -- only on success).
  provider_message_id text,
  provider_thread_id  text,
  send_error          text,

  -- Cheap edit metric: levenshtein-similar character distance between
  -- draft_body and sent_body. Computed by lib/outreach-edits.ts at
  -- record time. Provides a fast "how much did the rep edit?" signal.
  edit_distance       integer,

  -- Structured summary of what changed. Free-form jsonb (e.g. {
  --   "added_phrases": ["specific time slot"], "removed_phrases": [],
  --   "tone_shift": "less_salesy" }). Populated lazily by the Pulse agent
  -- in a Phase-3 batch job; null at write time.
  edit_summary        jsonb,

  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index outreach_edits_draft_idx
  on pathfinder.outreach_edits(outreach_draft_id, created_at desc)
  where outreach_draft_id is not null;

create index outreach_edits_project_idx
  on pathfinder.outreach_edits(project_id, created_at desc);

create index outreach_edits_actor_idx
  on pathfinder.outreach_edits(actor_email, created_at desc);

-- 3. RLS — anon read outreach_edits (analytics) but NOT email_integrations -

alter table pathfinder.email_integrations enable row level security;

-- service_role-only on email_integrations (tokens are sensitive).
create policy email_integrations_service_only
  on pathfinder.email_integrations for all
  to service_role
  using (true)
  with check (true);

alter table pathfinder.outreach_edits enable row level security;

-- Anon may read outreach_edits (no tokens here); writes service-role only.
create policy outreach_edits_read
  on pathfinder.outreach_edits for select
  to anon, authenticated
  using (true);

create policy outreach_edits_write
  on pathfinder.outreach_edits for all
  to service_role
  using (true)
  with check (true);
