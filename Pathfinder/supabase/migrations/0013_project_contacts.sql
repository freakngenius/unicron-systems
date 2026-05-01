-- Contact Resolver (P0-02c) — persistence target for source-side and (in v2)
-- enriched contacts per project. v1 only writes source='raw_payload' rows from
-- the Phase 1 extractor; the source CHECK and the confidence/inferred columns
-- already cover the v2 surface (apollo, hunter, sonar) so the follow-up PR
-- adds Phase 2/3 logic without a schema change.
--
-- Spec (canonical full vision): Pathfinder/agent-specs/11-computer-contact-resolver.md
-- Plan (v1 scope cut):           Pathfinder/docs/PLAN-P0-02C-CONTACT-RESOLVER.md
--
-- Read by: Outreach Drafter (P0-02) in a follow-up PR — currently outreach
-- pulls a single contact from raw_payload via lib/outreach.ts:
-- extractContactFromRawPayload. Once this table is live and populated, that
-- function gets replaced by a SELECT against project_contacts.

create table pathfinder.project_contacts (
  id           uuid primary key default gen_random_uuid(),
  project_id   text not null references pathfinder.projects(id) on delete cascade,
  contact_role text not null check (contact_role in (
    'owner','gc','site_super','contracting_officer','decision_maker','other'
  )),
  full_name    text not null,
  email        text,
  phone        text,
  linkedin_url text,
  company      text,
  title        text,
  source       text not null check (source in (
    'raw_payload','apollo','hunter','sonar','manual'
  )),
  confidence   integer not null check (confidence between 0 and 100),
  inferred     boolean not null default false,
  surfaced_at  timestamptz not null default now(),

  -- Spec rule: never write a contact without at least one channel. Code-side
  -- validation in lib/contacts/extractor.ts is the first line of defense; this
  -- CHECK catches any future code path that bypasses it (including the v2
  -- enrichment writers).
  constraint project_contacts_has_channel check (
    email is not null or phone is not null or linkedin_url is not null
  )
);

-- Common queries: "all contacts for project X" (modal section render), "all
-- contacts of role Y" (future role-targeted outreach selection).
create index project_contacts_project_idx on pathfinder.project_contacts(project_id);
create index project_contacts_role_idx    on pathfinder.project_contacts(contact_role);
