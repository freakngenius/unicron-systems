-- Demo Polish UX Sprint — Gate 9D.
--
-- Outreach send-history table powering the v2 Outreach Composer's
-- "Sent history" sub-section. Spec: SPEC - Lead Detail Page v2.md §
-- "Connected-account Send model".
--
-- This table is parallel to the existing pathfinder.outreach_edits
-- (which captures draft → sent diffs for the reinforcement loop) and
-- is keyed by project + user. The new connection-routed Send endpoint
-- writes both rows for the demo window so neither surface regresses.
-- A consolidation pass post-demo (Gate 9.5) decides whether to fold
-- outreach_edits into outreach_sends or keep them complementary.
--
-- project_id is text to match pathfinder.projects.id (e.g.
-- `sam.gov:TXDOT-I45-2026-001`). contact_id is uuid referencing
-- lead_contacts (8B's enricher). NO destructive ALTER. Re-runnable.

create table if not exists pathfinder.outreach_sends (
  id                  uuid primary key default gen_random_uuid(),
  project_id          text not null references pathfinder.projects(id) on delete cascade,
  user_id             text not null,
  contact_id          uuid references pathfinder.lead_contacts(id) on delete set null,
  to_email            text not null,
  subject             text not null,
  body                text not null,
  provider            text not null,
  message_id          text,
  sent_at             timestamptz not null default now(),
  status              text not null default 'sent'
    check (status in ('sent', 'failed', 'queued')),
  error_message       text,
  reply_received_at   timestamptz,
  reply_message_id    text
);

create index if not exists outreach_sends_project_id_idx
  on pathfinder.outreach_sends(project_id);

create index if not exists outreach_sends_user_id_idx
  on pathfinder.outreach_sends(user_id);

create index if not exists outreach_sends_sent_at_idx
  on pathfinder.outreach_sends(sent_at desc);
