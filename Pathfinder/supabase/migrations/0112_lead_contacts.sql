-- Demo Polish UX Sprint — Gate 8A.
--
-- Contact Enrichment Engine schema. Spec: `Company Docs/Specs/SPEC - Contact
-- Enrichment.md`. This migration is the data layer; providers + cron + UI
-- land in 8B / 8C.
--
-- Two changes, both additive + idempotent:
--   1. New table `pathfinder.lead_contacts` — 1-5 decision-makers per lead,
--      with name / role / email + verification status / phone / linkedin /
--      source attribution / decision-authority classification.
--   2. New column `pathfinder.llm_calls.provider` — `text null` so the
--      Clay / Apollo / Hunter calls in 8B can attribute cost. Legacy LLM
--      rows keep `provider = null` (correct — they are not provider calls).
--
-- Spec deviation: `lead_contacts.project_id` is `text`, not `uuid`. The
-- spec migration template assumed uuid, but `pathfinder.projects.id` is
-- text in the live schema (e.g. `sam.gov:TXDOT-I45-2026-001`). FK target
-- dictates shape. Same pattern as 0014 / 0050 etc.
--
-- NO DROP. NO destructive ALTER. Re-runnable.

create table if not exists pathfinder.lead_contacts (
  id                   uuid primary key default gen_random_uuid(),
  project_id           text not null references pathfinder.projects(id) on delete cascade,
  owner_organization   text not null,
  contact_name         text not null,
  role                 text,
  seniority            text check (seniority in (
    'c_suite', 'vp', 'director', 'manager', 'individual_contributor', 'unknown'
  )),
  email                text,
  email_status         text check (email_status in (
    'verified', 'guessed', 'invalid', 'unknown'
  )),
  phone                text,
  phone_type           text check (phone_type in (
    'direct', 'mobile', 'switchboard', 'unknown'
  )),
  linkedin_url         text,
  source               text not null,
  source_confidence    numeric(3,2) check (source_confidence between 0 and 1),
  decision_authority   text check (decision_authority in (
    'signer', 'influencer', 'gatekeeper', 'champion', 'unknown'
  )),
  enriched_at          timestamptz not null default now(),
  last_verified_at     timestamptz,
  notes                text
);

create index if not exists lead_contacts_project_id_idx
  on pathfinder.lead_contacts(project_id);
create index if not exists lead_contacts_seniority_idx
  on pathfinder.lead_contacts(seniority);

comment on table pathfinder.lead_contacts is
  'Decision-maker contacts enriched per top-50 lead. Spec: SPEC - Contact Enrichment.md. Cap of 5 contacts per project enforced in services/contact-enricher.';
comment on column pathfinder.lead_contacts.project_id is
  'FK to pathfinder.projects(id). Text, not uuid (matches projects.id shape).';
comment on column pathfinder.lead_contacts.owner_organization is
  'The organization the contact works for. Snapshotted at enrichment time so re-classifying owner_name on the parent project does not orphan the rationale.';
comment on column pathfinder.lead_contacts.email_status is
  'verified = third-party email verifier accepted (Hunter / Clay built-in). guessed = pattern-inferred (e.g. firstname.lastname@domain). invalid = verifier rejected. unknown = no verification attempted.';
comment on column pathfinder.lead_contacts.decision_authority is
  'Deterministic classification from role + owner_type. Mapping in lib/contacts/role-classification.ts.';
comment on column pathfinder.lead_contacts.source is
  'Provider attribution: clay | apollo | hunter | manual. Used for citation chip in ContactsCard UI.';
comment on column pathfinder.lead_contacts.source_confidence is
  'Provider-reported confidence 0..1. UI hides rows < 0.5 by default.';

alter table pathfinder.lead_contacts enable row level security;

create policy lead_contacts_read
  on pathfinder.lead_contacts for select
  to anon, authenticated
  using (true);

create policy lead_contacts_write
  on pathfinder.lead_contacts for all
  to service_role
  using (true)
  with check (true);

-- Cost telemetry attribution. Lets the contact-enricher tag llm_calls rows
-- with `provider='clay'` / `'apollo'` / `'hunter'` so the cost guardrail
-- (5x baseline halt) can sum across providers.
alter table pathfinder.llm_calls
  add column if not exists provider text;

create index if not exists llm_calls_provider_idx
  on pathfinder.llm_calls(provider) where provider is not null;

comment on column pathfinder.llm_calls.provider is
  'Non-LLM provider attribution: clay | apollo | hunter | null (null = LLM call, attribute via model column). Added in 0112 for contact-enricher cost telemetry.';
