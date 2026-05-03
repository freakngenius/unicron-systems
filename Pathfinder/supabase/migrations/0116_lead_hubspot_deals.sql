-- Demo Polish UX Sprint — Gate 10C.
--
-- Lead ↔ HubSpot deal mapping. Spec: SPEC - HubSpot Bridge.md §Schema.
-- Two tables, both additive + idempotent:
--   pathfinder.lead_hubspot_deals    — one row per (project, user, portal)
--   pathfinder.lead_hubspot_contacts — one row per (lead_contact, user, portal)
--
-- These are DISTINCT from pathfinder.hubspot_deals_raw / hubspot_contacts_raw
-- (bulk-sync ingest targets shipped in 0108). Those store every deal the
-- bulk-sync pulled; these store the per-Pathfinder-lead push receipts.
--
-- project_id is text (matches pathfinder.projects.id which is text like
-- 'sam.gov:TXDOT-I45-2026-001'). Same divergence-from-spec as 0112.
-- user_id is text (matches user_connections.user_id, basic-auth email).
--
-- Idempotency anchor: unique (project_id, user_id, portal_id). The push
-- endpoint short-circuits when a row already exists.
--
-- NO DROP. NO destructive ALTER. Re-runnable.

create table if not exists pathfinder.lead_hubspot_deals (
  id                    uuid primary key default gen_random_uuid(),
  project_id            text not null references pathfinder.projects(id) on delete cascade,
  user_id               text not null,
  portal_id             text not null,
  hubspot_deal_id       text not null,
  hubspot_deal_url      text,
  hubspot_company_id    text,
  pushed_at             timestamptz not null default now(),
  last_synced_at        timestamptz,
  current_stage         text,
  current_stage_label   text,
  current_amount        numeric,
  current_owner_id      text,
  current_owner_name    text,
  last_activity_at      timestamptz,
  last_activity_type    text,
  status                text not null default 'active'
    check (status in ('active', 'archived', 'lost', 'won', 'error')),
  error_message         text,
  constraint lead_hubspot_deals_project_user_portal_unique
    unique (project_id, user_id, portal_id)
);

create index if not exists lead_hubspot_deals_project_id_idx
  on pathfinder.lead_hubspot_deals(project_id);

create index if not exists lead_hubspot_deals_user_id_idx
  on pathfinder.lead_hubspot_deals(user_id);

create index if not exists lead_hubspot_deals_portal_deal_idx
  on pathfinder.lead_hubspot_deals(portal_id, hubspot_deal_id);

create table if not exists pathfinder.lead_hubspot_contacts (
  id                    uuid primary key default gen_random_uuid(),
  lead_contact_id       uuid not null references pathfinder.lead_contacts(id) on delete cascade,
  user_id               text not null,
  portal_id             text not null,
  hubspot_contact_id    text not null,
  hubspot_contact_url   text,
  pushed_at             timestamptz not null default now(),
  constraint lead_hubspot_contacts_contact_user_portal_unique
    unique (lead_contact_id, user_id, portal_id)
);

create index if not exists lead_hubspot_contacts_lead_contact_idx
  on pathfinder.lead_hubspot_contacts(lead_contact_id);

create index if not exists lead_hubspot_contacts_user_idx
  on pathfinder.lead_hubspot_contacts(user_id);

-- RLS: service-role-only. The push + status routes go through the
-- supabaseAdmin() service-role client; anon/authenticated have zero
-- access (matches user_connections from migration 0115).
alter table pathfinder.lead_hubspot_deals    enable row level security;
alter table pathfinder.lead_hubspot_contacts enable row level security;

revoke all on pathfinder.lead_hubspot_deals    from public, anon, authenticated;
revoke all on pathfinder.lead_hubspot_contacts from public, anon, authenticated;

grant select, insert, update, delete on pathfinder.lead_hubspot_deals    to service_role;
grant select, insert, update, delete on pathfinder.lead_hubspot_contacts to service_role;
