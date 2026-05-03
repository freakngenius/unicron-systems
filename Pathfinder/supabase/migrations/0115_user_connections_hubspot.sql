-- Demo Polish UX Sprint — Gate 10B.
--
-- HubSpot multi-tenant connection schema. Spec: SPEC - HubSpot Bridge.md
-- §Schema. Per-user OAuth: any rep on a Zedcor team connects their own
-- HubSpot from /pathfinder/settings/connectors; tokens stored encrypted
-- per user.
--
-- Coordination with Gate 9D (`demo-polish-ux/gate9d-connection-send`):
--   9D's 0113_user_connections.sql creates the table for ('gmail','outlook')
--   only, no portal_id/portal_name. This migration must work BOTH paths:
--     a) 9D ships first → 0115 extends provider check + adds portal columns.
--     b) 9D ships after → 9D's CREATE TABLE IF NOT EXISTS no-ops; 0115's
--        constraint already covers all 3 providers.
--   Done via:
--     1. CREATE TABLE IF NOT EXISTS with the wider 3-provider check + new
--        portal columns (idempotent if 9D already created the table).
--     2. ALTER … ADD COLUMN IF NOT EXISTS portal_id/portal_name (handles
--        the 9D-first path where the table exists without those columns).
--     3. DO block walks pg_constraint to drop any CHECK constraint on
--        provider that omits 'hubspot', then re-adds the wider one with a
--        canonical name. Survives Postgres's auto-generated constraint
--        naming as well as 9D's inline-named one.
--
-- user_id type: matches 9D's text (basic-auth email). Spec said uuid,
-- but real auth tables don't exist yet; coercing to uuid would break
-- 9D's already-shipped flow. text accepts both email-as-id and uuid-as-id.
--
-- NO DROP. NO destructive ALTER on data. Re-runnable.
-- Token encryption: re-uses pathfinder.encrypt_connector_token /
-- decrypt_connector_token from migration 0105.

-- ---------------------------------------------------------------------------
-- 1. Create table (no-op if 9D's 0113 already created it).
-- ---------------------------------------------------------------------------
create table if not exists pathfinder.user_connections (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  text not null,
  provider                 text not null
    constraint user_connections_provider_check
    check (provider in ('gmail', 'outlook', 'hubspot')),
  email                    text,
  portal_id                text,
  portal_name              text,
  oauth_token_enc          bytea,
  oauth_refresh_token_enc  bytea,
  scope                    text[],
  connected_at             timestamptz not null default now(),
  expires_at               timestamptz,
  status                   text not null default 'active'
    check (status in ('active', 'expired', 'revoked'))
);

-- ---------------------------------------------------------------------------
-- 2. Additive columns — handle the path where 9D ran first without them.
-- ---------------------------------------------------------------------------
alter table pathfinder.user_connections
  add column if not exists portal_id text;

alter table pathfinder.user_connections
  add column if not exists portal_name text;

-- 9D's migration declared `email text not null`, but multi-provider
-- semantics need it nullable for HubSpot rows where the OAuth grant
-- doesn't return an email. Drop the NOT NULL if 9D set it.
do $$
declare
  is_not_null boolean;
begin
  select attnotnull into is_not_null
  from pg_attribute
  where attrelid = 'pathfinder.user_connections'::regclass
    and attname  = 'email'
    and not attisdropped;
  if is_not_null then
    alter table pathfinder.user_connections alter column email drop not null;
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 3. Provider CHECK constraint — drop any 2-provider variant, ensure the
--    canonical 3-provider one is in place.
--
--    Walks pg_constraint to find every CHECK constraint on user_connections
--    whose definition does NOT include 'hubspot' (i.e. the 9D one), then
--    drops them. Re-adds the wider check under a stable name.
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'pathfinder.user_connections'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%provider%'
      and pg_get_constraintdef(oid) not ilike '%hubspot%'
  loop
    execute format(
      'alter table pathfinder.user_connections drop constraint %I',
      c.conname
    );
  end loop;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'pathfinder.user_connections'::regclass
      and conname = 'user_connections_provider_check'
  ) then
    alter table pathfinder.user_connections
      add constraint user_connections_provider_check
      check (provider in ('gmail', 'outlook', 'hubspot'));
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 4. Indexes (idempotent).
-- ---------------------------------------------------------------------------
create index if not exists user_connections_user_id_idx
  on pathfinder.user_connections(user_id);

create index if not exists user_connections_provider_email_idx
  on pathfinder.user_connections(provider, email);

create index if not exists user_connections_portal_id_idx
  on pathfinder.user_connections(portal_id)
  where portal_id is not null;

create index if not exists user_connections_user_provider_idx
  on pathfinder.user_connections(user_id, provider);

-- ---------------------------------------------------------------------------
-- 5. RLS — service-role only (token columns hold encrypted secrets).
--    Aligned with how connector_tokens is gated in 0105: no public-facing
--    policy, RLS enabled so anon/authenticated get zero rows.
-- ---------------------------------------------------------------------------
alter table pathfinder.user_connections enable row level security;

revoke all on pathfinder.user_connections from public, anon, authenticated;
grant select, insert, update, delete on pathfinder.user_connections to service_role;
