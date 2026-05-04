-- Demo Polish UX Sprint — Gate 14A.
--
-- User-level Microsoft Teams connection schema. Spec: dispatch prompt
-- "Gate 14A — Schema + connection routes + Settings tile".
--
-- Multi-tenant Microsoft Entra OAuth: any user on a Zedcor team connects
-- their own Teams account from /pathfinder/settings/connectors; tokens
-- stored encrypted per user+tenant. Coexists with the org-level Teams
-- bot (PR #66/#69 — Bot Framework + Adaptive Cards) which writes to
-- pathfinder.connectors, not pathfinder.user_connections.
--
-- Coordination with Gate 9D (0113) and Gate 10B (0115):
--   0113 created user_connections with provider in ('gmail','outlook').
--   0115 widened to ('gmail','outlook','hubspot') + portal columns.
--   0123 widens to ('gmail','outlook','hubspot','teams') + tenant_id.
--
-- This migration must work whether 0113 + 0115 ran or not (idempotent).
--
-- NO DROP. NO destructive ALTER on data. Re-runnable.
-- Token encryption: re-uses pathfinder.encrypt_connector_token /
-- decrypt_connector_token from migration 0105 (same CONNECTOR_TOKEN_KEY).

-- ---------------------------------------------------------------------------
-- 1. Ensure base table exists. CREATE TABLE IF NOT EXISTS no-ops when
--    0113 / 0115 already created it; re-states the wider 4-provider check
--    for fresh-database paths.
-- ---------------------------------------------------------------------------
create table if not exists pathfinder.user_connections (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  text not null,
  provider                 text not null
    constraint user_connections_provider_check
    check (provider in ('gmail', 'outlook', 'hubspot', 'teams')),
  email                    text,
  portal_id                text,
  portal_name              text,
  tenant_id                text,
  oauth_token_enc          bytea,
  oauth_refresh_token_enc  bytea,
  scope                    text[],
  connected_at             timestamptz not null default now(),
  expires_at               timestamptz,
  status                   text not null default 'active'
    check (status in ('active', 'expired', 'revoked'))
);

-- ---------------------------------------------------------------------------
-- 2. Additive columns — handle the path where 0113 / 0115 ran first
--    without tenant_id (and any migration that didn't add portal_*).
-- ---------------------------------------------------------------------------
alter table pathfinder.user_connections
  add column if not exists tenant_id text;

alter table pathfinder.user_connections
  add column if not exists portal_id text;

alter table pathfinder.user_connections
  add column if not exists portal_name text;

-- ---------------------------------------------------------------------------
-- 3. Provider CHECK constraint — drop any narrower variant (one missing
--    'teams'), re-add the canonical 4-provider one.
--
--    Walks pg_constraint to find every CHECK constraint on user_connections
--    whose definition does NOT include 'teams'. Drops those, then re-adds
--    the wider check under a stable name.
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
      and pg_get_constraintdef(oid) not ilike '%teams%'
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
      check (provider in ('gmail', 'outlook', 'hubspot', 'teams'));
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 4. Indexes (idempotent). Tenant-scoped index supports the multi-tenant
--    isolation invariant: queries filter by (user_id, provider='teams',
--    tenant_id) so Microsoft Graph routing stays cheap.
-- ---------------------------------------------------------------------------
create index if not exists user_connections_tenant_id_idx
  on pathfinder.user_connections(tenant_id)
  where tenant_id is not null;

create index if not exists user_connections_user_provider_tenant_idx
  on pathfinder.user_connections(user_id, provider, tenant_id)
  where tenant_id is not null;

-- ---------------------------------------------------------------------------
-- 5. RLS — service-role only. Already enabled by 0115; this is a guard
--    in case 0123 runs before 0115 in some environment.
-- ---------------------------------------------------------------------------
alter table pathfinder.user_connections enable row level security;

revoke all on pathfinder.user_connections from public, anon, authenticated;
grant select, insert, update, delete on pathfinder.user_connections to service_role;
