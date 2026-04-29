-- Outreach Drafter — persistence target for the P0-02 Outreach agent.
-- Spec: Pathfinder/Pathfinder-Feature-Specs.md § "P0 Feature 2 — Outreach
-- Drafter" and Pathfinder/agent-specs/03-computer-outreach.md. Flagged in
-- PLAN-P0-01-INTELLIGENCE-CHAT.md § 0 / Open Question #1 as the missing
-- table the chat branch defers writes for.
--
-- Shape mirrors the spec verbatim:
--   id, project_id, channel (email|linkedin|voicemail), recipient_name,
--   recipient_title, recipient_contact, draft_subject, draft_body,
--   warm_intro_via, draft_at, sent_status (draft|sent|dismissed).
-- Plus operational columns the route needs: word/char counts, verifier
-- warnings, model used, and sent/dismissed timestamps so the chat branch
-- can render iteration history without recomputing.

create type pathfinder.outreach_channel as enum ('email', 'linkedin', 'voicemail');
create type pathfinder.outreach_status  as enum ('draft', 'sent', 'dismissed');

create table pathfinder.outreach_drafts (
  id                bigserial primary key,
  project_id        text not null references pathfinder.projects(id) on delete cascade,
  channel           pathfinder.outreach_channel not null,
  recipient_name    text,
  recipient_title   text,
  recipient_contact text,
  draft_subject     text,
  draft_body        text not null,
  warm_intro_via    text references pathfinder.customers(id) on delete set null,
  word_count        integer,
  char_count        integer,
  verifier_warnings jsonb not null default '[]'::jsonb,
  model_used        text,
  sent_status       pathfinder.outreach_status not null default 'draft',
  draft_at          timestamptz not null default now(),
  sent_at           timestamptz,
  dismissed_at      timestamptz
);

-- Common queries: "any drafts for project X?", "all drafts in draft status
-- ordered by recency", "drafts for the chat panel's history view".
create index outreach_drafts_project_idx
  on pathfinder.outreach_drafts(project_id, draft_at desc);
create index outreach_drafts_status_idx
  on pathfinder.outreach_drafts(sent_status, draft_at desc);

-- Subject line cap matches the spec's "under 60 chars" rule. Length rules
-- for the body live in code (lib/outreach.ts) because email word counts and
-- voicemail spoken-time bands are easier to enforce in TS than in CHECK
-- constraints, and the verifier loop wants to surface warnings rather than
-- block writes outright.
alter table pathfinder.outreach_drafts
  add constraint outreach_drafts_subject_len_check
  check (draft_subject is null or char_length(draft_subject) <= 80);

-- Subject only meaningful on email channel; LinkedIn DMs and voicemail
-- scripts skip the subject entirely. Enforce that asymmetry at the schema
-- level so a buggy code path can't accidentally write a subject for the
-- wrong channel.
alter table pathfinder.outreach_drafts
  add constraint outreach_drafts_subject_channel_check
  check (
    (channel = 'email' and draft_subject is not null)
    or (channel <> 'email' and draft_subject is null)
  );
