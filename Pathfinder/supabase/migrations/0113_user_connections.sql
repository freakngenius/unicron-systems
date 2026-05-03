-- Demo Polish UX Sprint — Gate 9D.
--
-- Connected-account Send model. Spec: SPEC - Lead Detail Page v2.md §
-- "Connected-account Send model".
--
-- A row per (user, provider) OAuth grant. The v2 lead detail Outreach
-- composer's "From" field reads the most recent active connection;
-- the Send endpoint dispatches via Gmail / Microsoft Graph based on
-- the row's provider field. The encrypted columns mirror the existing
-- email_integrations encryption convention so the same encryption
-- helper can hydrate either store while we migrate. NO destructive
-- ALTER. Re-runnable.

create table if not exists pathfinder.user_connections (
  id                       uuid primary key default gen_random_uuid(),
  -- user_id is text (not uuid) to mirror Pathfinder's existing actor
  -- identity scheme (basic-auth keyed by operator email). Real Auth
  -- tables in a later milestone will tighten this to uuid; until then,
  -- text accepts both an email-as-id and a uuid-as-id without coercion.
  user_id                  text not null,
  provider                 text not null check (provider in ('gmail', 'outlook')),
  email                    text not null,
  oauth_token_enc          bytea,
  oauth_refresh_token_enc  bytea,
  scope                    text[],
  connected_at             timestamptz not null default now(),
  expires_at               timestamptz,
  status                   text not null default 'active'
    check (status in ('active', 'expired', 'revoked'))
);

create index if not exists user_connections_user_id_idx
  on pathfinder.user_connections(user_id);

create index if not exists user_connections_provider_email_idx
  on pathfinder.user_connections(provider, email);
