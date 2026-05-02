-- Connector Sprint C-3A — HubSpot bulk-sync state + raw object tables.
--
-- Implements SPEC § 4.3 (HubSpot bidirectional sync) — read-only side.
-- C-3A scope is OAuth + bulk read sync only. Real-time webhooks +
-- outbound push (deal stage updates, note creation) ship in C-3B.
-- Stage→pipeline mapping ships in C-3C.
--
-- Three raw landing tables for HubSpot CRM objects:
--   pathfinder.hubspot_deals_raw       — one row per (connector_id, hs_object_id)
--   pathfinder.hubspot_contacts_raw    — same shape
--   pathfinder.hubspot_engagements_raw — optional, gated on scope
--
-- Plus one sync-state row per HubSpot connector tracking pagination,
-- counts, and the running flag so concurrent syncs short-circuit.
--
-- Multi-tenant: every row carries customer_org_id (denormalized — the
-- connector_id alone is sufficient via join, but cheap denormalization
-- here keeps RLS policies simple and matches the audit-log pattern from
-- 0105). RLS read-by-org-match for anon/authenticated; service-role
-- writes only.
--
-- Idempotent: every change uses IF NOT EXISTS where Postgres allows.
-- Additive — no existing tables touched.

-- ---------------------------------------------------------------------------
-- pathfinder.hubspot_deals_raw
-- ---------------------------------------------------------------------------
create table if not exists pathfinder.hubspot_deals_raw (
  connector_id uuid not null references pathfinder.connectors(id) on delete cascade,
  hs_object_id text not null,
  customer_org_id text not null,
  properties jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  modified_at timestamptz,
  primary key (connector_id, hs_object_id)
);

create index if not exists hubspot_deals_raw_org_modified_idx
  on pathfinder.hubspot_deals_raw (customer_org_id, modified_at desc);

create index if not exists hubspot_deals_raw_connector_fetched_idx
  on pathfinder.hubspot_deals_raw (connector_id, fetched_at desc);

-- ---------------------------------------------------------------------------
-- pathfinder.hubspot_contacts_raw
-- ---------------------------------------------------------------------------
create table if not exists pathfinder.hubspot_contacts_raw (
  connector_id uuid not null references pathfinder.connectors(id) on delete cascade,
  hs_object_id text not null,
  customer_org_id text not null,
  properties jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  modified_at timestamptz,
  primary key (connector_id, hs_object_id)
);

create index if not exists hubspot_contacts_raw_org_modified_idx
  on pathfinder.hubspot_contacts_raw (customer_org_id, modified_at desc);

create index if not exists hubspot_contacts_raw_connector_fetched_idx
  on pathfinder.hubspot_contacts_raw (connector_id, fetched_at desc);

-- ---------------------------------------------------------------------------
-- pathfinder.hubspot_engagements_raw
--
-- Optional table — populated only when the engagements scope is granted.
-- Engagement type (note, call, email, meeting, task) lives in properties.
-- ---------------------------------------------------------------------------
create table if not exists pathfinder.hubspot_engagements_raw (
  connector_id uuid not null references pathfinder.connectors(id) on delete cascade,
  hs_object_id text not null,
  customer_org_id text not null,
  properties jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  modified_at timestamptz,
  primary key (connector_id, hs_object_id)
);

create index if not exists hubspot_engagements_raw_org_modified_idx
  on pathfinder.hubspot_engagements_raw (customer_org_id, modified_at desc);

create index if not exists hubspot_engagements_raw_connector_fetched_idx
  on pathfinder.hubspot_engagements_raw (connector_id, fetched_at desc);

-- ---------------------------------------------------------------------------
-- pathfinder.hubspot_sync_state
--
-- One row per HubSpot connector tracking the most recent full and
-- incremental sync, per-object-type counts, and a running-flag so the
-- bulk-sync API endpoint can short-circuit a concurrent invocation.
-- ---------------------------------------------------------------------------
create table if not exists pathfinder.hubspot_sync_state (
  connector_id uuid primary key references pathfinder.connectors(id) on delete cascade,
  customer_org_id text not null,
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  deals_imported int not null default 0,
  contacts_imported int not null default 0,
  engagements_imported int not null default 0,
  sync_running boolean not null default false,
  sync_started_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hubspot_sync_state_org_idx
  on pathfinder.hubspot_sync_state (customer_org_id);

drop trigger if exists set_updated_at on pathfinder.hubspot_sync_state;
create trigger set_updated_at
  before update on pathfinder.hubspot_sync_state
  for each row execute function pathfinder.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security.
--
-- Mirror the 0105 connectors policy: anon/authenticated may SELECT only
-- when customer_org_id matches the request's JWT claim; service_role
-- bypasses RLS so the bulk-sync writer (server-side service-role client)
-- can insert + update freely.
-- ---------------------------------------------------------------------------
alter table pathfinder.hubspot_deals_raw       enable row level security;
alter table pathfinder.hubspot_contacts_raw    enable row level security;
alter table pathfinder.hubspot_engagements_raw enable row level security;
alter table pathfinder.hubspot_sync_state      enable row level security;

drop policy if exists hubspot_deals_raw_select_by_org on pathfinder.hubspot_deals_raw;
create policy hubspot_deals_raw_select_by_org on pathfinder.hubspot_deals_raw
  for select
  using (
    customer_org_id = coalesce(
      current_setting('request.jwt.claims', true)::jsonb->>'org_id',
      current_setting('request.jwt.claim.org_id', true),
      ''
    )
  );

drop policy if exists hubspot_contacts_raw_select_by_org on pathfinder.hubspot_contacts_raw;
create policy hubspot_contacts_raw_select_by_org on pathfinder.hubspot_contacts_raw
  for select
  using (
    customer_org_id = coalesce(
      current_setting('request.jwt.claims', true)::jsonb->>'org_id',
      current_setting('request.jwt.claim.org_id', true),
      ''
    )
  );

drop policy if exists hubspot_engagements_raw_select_by_org on pathfinder.hubspot_engagements_raw;
create policy hubspot_engagements_raw_select_by_org on pathfinder.hubspot_engagements_raw
  for select
  using (
    customer_org_id = coalesce(
      current_setting('request.jwt.claims', true)::jsonb->>'org_id',
      current_setting('request.jwt.claim.org_id', true),
      ''
    )
  );

drop policy if exists hubspot_sync_state_select_by_org on pathfinder.hubspot_sync_state;
create policy hubspot_sync_state_select_by_org on pathfinder.hubspot_sync_state
  for select
  using (
    customer_org_id = coalesce(
      current_setting('request.jwt.claims', true)::jsonb->>'org_id',
      current_setting('request.jwt.claim.org_id', true),
      ''
    )
  );

-- ---------------------------------------------------------------------------
-- Permissions: writes are service-role-only across the board.
-- ---------------------------------------------------------------------------
grant select on pathfinder.hubspot_deals_raw       to anon, authenticated;
grant select on pathfinder.hubspot_contacts_raw    to anon, authenticated;
grant select on pathfinder.hubspot_engagements_raw to anon, authenticated;
grant select on pathfinder.hubspot_sync_state      to anon, authenticated;

grant select, insert, update, delete on pathfinder.hubspot_deals_raw       to service_role;
grant select, insert, update, delete on pathfinder.hubspot_contacts_raw    to service_role;
grant select, insert, update, delete on pathfinder.hubspot_engagements_raw to service_role;
grant select, insert, update, delete on pathfinder.hubspot_sync_state      to service_role;
