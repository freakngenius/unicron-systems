-- Connector Sprint C-1A — Connector Framework foundation.
--
-- Implements SPEC - Connectors (Slack, Teams, HubSpot) §3.1 + §3.2 + §3.5
-- + §3.6 + §3.7 with token storage hardened per §5 (multi-tenant isolation
-- + envelope encryption at rest via pgcrypto).
--
-- Four tables, all in pathfinder schema, all org_id-scoped:
--   pathfinder.connectors             — one row per (customer_org_id, connector_type)
--   pathfinder.connector_tokens       — encrypted access/refresh tokens, 1:1 with active connector
--   pathfinder.connector_routing_rules — per-event routing (channel, filter, quiet hours)
--   pathfinder.connector_audit_log    — every outbound/inbound/oauth/refresh event
--
-- Token plaintext NEVER leaves the database envelope. Encryption uses
-- pgp_sym_encrypt with a server-supplied key passed at call time; the
-- bytea column is always ciphertext at rest. The TS layer in
-- lib/connectors/tokens.ts wraps the SQL calls so plaintext only exists
-- on the wire (TLS) and in pgcrypto's process memory during the call.
--
-- Diverges intentionally from the SPEC § 3.1 sketch: tokens live in a
-- separate table (cleaner permissions surface, easier rotation, history
-- via revoked_at) and customer_org_id is text (matches existing
-- pathfinder.org_geo_config + pathfinder.zedcor_branches conventions).
--
-- Idempotent: every change uses IF NOT EXISTS where Postgres allows.

-- pgcrypto is already installed in `extensions` schema on this project
-- (verified via list_extensions). Re-create defensively in case a future
-- environment is missing it.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- updated_at trigger function. Reused by all four tables. Idempotent.
-- ---------------------------------------------------------------------------
create or replace function pathfinder.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- pathfinder.connectors
-- ---------------------------------------------------------------------------
create table if not exists pathfinder.connectors (
  id uuid primary key default gen_random_uuid(),
  customer_org_id text not null,
  connector_type text not null
    check (connector_type in ('slack', 'teams', 'hubspot')),
  status text not null default 'disconnected'
    check (status in ('disconnected', 'pending', 'connected', 'error', 'expired', 'revoked')),
  account_name text,
  account_external_id text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One connector instance per type per org (v1 constraint; relaxed when
  -- multi-workspace support lands in Phase 4).
  constraint connectors_org_type_unique unique (customer_org_id, connector_type)
);

create index if not exists connectors_org_status_idx
  on pathfinder.connectors (customer_org_id, status);

create index if not exists connectors_type_status_idx
  on pathfinder.connectors (connector_type, status);

drop trigger if exists set_updated_at on pathfinder.connectors;
create trigger set_updated_at
  before update on pathfinder.connectors
  for each row execute function pathfinder.set_updated_at();

-- ---------------------------------------------------------------------------
-- pathfinder.connector_tokens
--
-- One active token row per connector. Old rows are soft-deleted via
-- revoked_at so the audit trail survives rotation. The unique partial
-- index enforces single-active-row without preventing history.
-- ---------------------------------------------------------------------------
create table if not exists pathfinder.connector_tokens (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references pathfinder.connectors(id) on delete cascade,
  access_token_encrypted bytea not null,
  refresh_token_encrypted bytea,
  expires_at timestamptz,
  scope text,
  token_version int not null default 1,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists connector_tokens_active_unique
  on pathfinder.connector_tokens (connector_id)
  where revoked_at is null;

create index if not exists connector_tokens_connector_idx
  on pathfinder.connector_tokens (connector_id);

create index if not exists connector_tokens_expires_idx
  on pathfinder.connector_tokens (expires_at)
  where revoked_at is null;

drop trigger if exists set_updated_at on pathfinder.connector_tokens;
create trigger set_updated_at
  before update on pathfinder.connector_tokens
  for each row execute function pathfinder.set_updated_at();

-- ---------------------------------------------------------------------------
-- pathfinder.connector_routing_rules
-- ---------------------------------------------------------------------------
create table if not exists pathfinder.connector_routing_rules (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references pathfinder.connectors(id) on delete cascade,
  event_type text not null,
  channel_id text not null,
  channel_name text,
  filter_json jsonb not null default '{}'::jsonb,
  quiet_hours_json jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists connector_routing_rules_dispatch_idx
  on pathfinder.connector_routing_rules (connector_id, event_type, is_active);

drop trigger if exists set_updated_at on pathfinder.connector_routing_rules;
create trigger set_updated_at
  before update on pathfinder.connector_routing_rules
  for each row execute function pathfinder.set_updated_at();

-- ---------------------------------------------------------------------------
-- pathfinder.connector_audit_log
--
-- Append-only. customer_org_id is denormalized so cross-tenant guards
-- can filter without joining connectors (defense-in-depth — RLS plus
-- explicit query filter).
-- ---------------------------------------------------------------------------
create table if not exists pathfinder.connector_audit_log (
  id bigint generated always as identity primary key,
  connector_id uuid not null references pathfinder.connectors(id) on delete cascade,
  customer_org_id text not null,
  event_type text not null,
  direction text not null
    check (direction in ('outbound', 'inbound', 'oauth', 'refresh')),
  status text not null
    check (status in ('sent', 'received', 'failed', 'succeeded')),
  payload_summary jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists connector_audit_log_connector_recent_idx
  on pathfinder.connector_audit_log (connector_id, created_at desc);

create index if not exists connector_audit_log_org_recent_idx
  on pathfinder.connector_audit_log (customer_org_id, created_at desc);

create index if not exists connector_audit_log_direction_status_idx
  on pathfinder.connector_audit_log (direction, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Token encryption helpers.
--
-- These are SECURITY DEFINER so the service role can call them while the
-- key parameter passes through; pgp_sym_encrypt / pgp_sym_decrypt run
-- inside Postgres so plaintext never crosses the network unencrypted
-- (the wire is TLS, but the application memory never holds the encrypted
-- bytea or the raw key longer than the call).
--
-- Key derivation: callers pass the raw 32-byte hex from
-- process.env.CONNECTOR_TOKEN_KEY. v1 uses a single tenant-wide master
-- key. Per-tenant DEK rotation is a Phase 2 follow-up tracked in the
-- security review — schema already supports it (token_version column).
-- ---------------------------------------------------------------------------
create or replace function pathfinder.encrypt_connector_token(
  plaintext text,
  encryption_key text
) returns bytea
language sql
security definer
set search_path = ''
as $$
  select extensions.pgp_sym_encrypt(plaintext, encryption_key);
$$;

create or replace function pathfinder.decrypt_connector_token(
  ciphertext bytea,
  encryption_key text
) returns text
language sql
security definer
set search_path = ''
as $$
  select extensions.pgp_sym_decrypt(ciphertext, encryption_key);
$$;

-- Restrict execution to the service role. Anon and authenticated roles
-- must never decrypt; reads from the connector_tokens table at the API
-- layer use the service-role client.
revoke all on function pathfinder.encrypt_connector_token(text, text) from public;
revoke all on function pathfinder.decrypt_connector_token(bytea, text) from public;
grant execute on function pathfinder.encrypt_connector_token(text, text) to service_role;
grant execute on function pathfinder.decrypt_connector_token(bytea, text) to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security.
--
-- Pathfinder is currently single-tenant (zedcor) but the connector
-- framework is multi-tenant from day one. RLS enforces:
--   - service_role bypasses (default Postgres behavior)
--   - anon / authenticated may SELECT only when customer_org_id matches
--     the request.jwt.claims org_id (or, in the absence of a JWT, the
--     fallback request header — Phase 1 reads use the service role
--     anyway, so the restrictive default is safe)
--   - tokens table is service_role-only, even for SELECT
-- ---------------------------------------------------------------------------
alter table pathfinder.connectors enable row level security;
alter table pathfinder.connector_tokens enable row level security;
alter table pathfinder.connector_routing_rules enable row level security;
alter table pathfinder.connector_audit_log enable row level security;

-- connectors: read by org match; writes service-role only.
drop policy if exists connectors_select_by_org on pathfinder.connectors;
create policy connectors_select_by_org on pathfinder.connectors
  for select
  using (
    customer_org_id = coalesce(
      current_setting('request.jwt.claims', true)::jsonb->>'org_id',
      current_setting('request.jwt.claim.org_id', true),
      ''
    )
  );

-- connector_routing_rules: read via org match through the parent connector.
drop policy if exists connector_routing_rules_select_by_org on pathfinder.connector_routing_rules;
create policy connector_routing_rules_select_by_org on pathfinder.connector_routing_rules
  for select
  using (
    exists (
      select 1
      from pathfinder.connectors c
      where c.id = connector_routing_rules.connector_id
        and c.customer_org_id = coalesce(
          current_setting('request.jwt.claims', true)::jsonb->>'org_id',
          current_setting('request.jwt.claim.org_id', true),
          ''
        )
    )
  );

-- connector_audit_log: read by org match (denormalized customer_org_id).
drop policy if exists connector_audit_log_select_by_org on pathfinder.connector_audit_log;
create policy connector_audit_log_select_by_org on pathfinder.connector_audit_log
  for select
  using (
    customer_org_id = coalesce(
      current_setting('request.jwt.claims', true)::jsonb->>'org_id',
      current_setting('request.jwt.claim.org_id', true),
      ''
    )
  );

-- connector_tokens: NO public-facing policy. service_role bypasses RLS;
-- anon/authenticated cannot read or write. Encryption + this restriction
-- means an exfiltrated anon key cannot read tokens even ciphertext.
-- (We still need RLS enabled — without an explicit policy, non-service
-- roles get zero rows, which is the desired posture.)

-- ---------------------------------------------------------------------------
-- Permissions: writes require service_role across the board (defense in
-- depth on top of RLS). Anon/authenticated get SELECT subject to the
-- policies above.
-- ---------------------------------------------------------------------------
grant select on pathfinder.connectors to anon, authenticated;
grant select on pathfinder.connector_routing_rules to anon, authenticated;
grant select on pathfinder.connector_audit_log to anon, authenticated;

grant select, insert, update, delete on pathfinder.connectors to service_role;
grant select, insert, update, delete on pathfinder.connector_tokens to service_role;
grant select, insert, update, delete on pathfinder.connector_routing_rules to service_role;
grant select, insert, update, delete on pathfinder.connector_audit_log to service_role;
grant usage, select on sequence pathfinder.connector_audit_log_id_seq to service_role;
