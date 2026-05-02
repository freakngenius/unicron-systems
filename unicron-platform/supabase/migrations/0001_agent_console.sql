-- 0001_agent_console.sql — Phase 0.5: Agent Console foundation.
-- Spec: Company Docs/Specs/SPEC - Agent Console (Metacron).md §8.
--
-- First migration in the unicron-platform/supabase/migrations/ pipeline.
-- Numbering restarts at 0001 (separate from Pathfinder/supabase/migrations/);
-- the prior unicron.settings table was authored at
-- Pathfinder/supabase/migrations/0090_unicron_settings.sql but the unicron
-- schema is currently absent from production (verified 2026-05-02 via
-- information_schema.schemata) — this migration creates it fresh. Settings-
-- drawer breakage from that absence is a pre-existing concern outside Phase
-- 0.5 scope.
--
-- This migration is additive only — no DROP, no destructive ALTER.
--
-- Tables:
--   unicron.agent_dispatches       — one row per dispatched agent run with
--                                    verification lifecycle (status,
--                                    rejection_reason, verified_by_user_id,
--                                    verified_at).
--   unicron.agent_dispatch_events  — streaming events (reasoning, tool_call,
--                                    tool_result, partial_output, decision,
--                                    error) per dispatch. Subscribed to via
--                                    Supabase Realtime by AgentLiveExecution.
--
-- Cross-schema FK: agent_run_id references pathfinder.agent_runs(id).
-- pathfinder.agent_runs has existed since Pathfinder/supabase/migrations/
-- 0002_tables.sql so this FK is safe.
--
-- SPEC drift: SPEC §8 declares agent_run_id as uuid, but production
-- pathfinder.agent_runs.id is bigint (verified 2026-05-02 via
-- information_schema.columns). FK target type must match; using bigint here.
-- Spec should be updated to reflect reality in a follow-up doc PR.
--
-- pathfinder.agent_verifications is intentionally NOT created here — that
-- table belongs to the Pathfinder chat (Phase 1F: Living System bridge).
-- See MEMORY/operator-todos/2026-05-02-pathfinder-needs-verification-bridge.md
-- for the coordination request.

create schema if not exists unicron;

-- ---------------------------------------------------------------------------
-- unicron.agent_dispatches
-- ---------------------------------------------------------------------------

create table unicron.agent_dispatches (
  id                     uuid primary key default gen_random_uuid(),
  agent_name             text not null,
  customer_org_id        text not null,
  dispatched_by_user_id  uuid references auth.users(id)             on delete set null,
  input_payload          jsonb not null,
  status                 text not null check (status in (
    'queued','running','awaiting_review','verified','rejected','failed'
  )),
  result_payload         jsonb,
  rejection_reason       text,
  verified_by_user_id    uuid references auth.users(id)             on delete set null,
  verified_at            timestamptz,
  cost_usd               numeric(10,6),
  duration_ms            integer,
  agent_run_id           bigint references pathfinder.agent_runs(id) on delete set null,
  -- parent_dispatch_id intentionally lacks ON DELETE SET NULL — the NO ACTION
  -- default protects nested-chain integrity (child dispatches shouldn't
  -- auto-orphan when a parent is deleted).
  parent_dispatch_id     uuid references unicron.agent_dispatches(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Per SPEC §8 — two compound indexes optimised for the actual operator query
-- shapes (per-org agent timeline; in-flight + awaiting-review tail). Plus one
-- additive single-col index on agent_run_id justified for cross-pollination
-- and Phase 1 lookups joining pathfinder.agent_runs.
create index idx_agent_dispatches_org
  on unicron.agent_dispatches(customer_org_id, agent_name, created_at desc);

create index idx_agent_dispatches_status
  on unicron.agent_dispatches(status, created_at desc)
  where status in ('running', 'awaiting_review');

create index idx_agent_dispatches_run
  on unicron.agent_dispatches(agent_run_id);

-- updated_at trigger — mirrors pattern from 0090_unicron_settings.sql.
create or replace function unicron.set_dispatches_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger agent_dispatches_updated_at_tg
  before update on unicron.agent_dispatches
  for each row execute function unicron.set_dispatches_updated_at();

-- ---------------------------------------------------------------------------
-- unicron.agent_dispatch_events
-- ---------------------------------------------------------------------------

create table unicron.agent_dispatch_events (
  id           uuid primary key default gen_random_uuid(),
  dispatch_id  uuid references unicron.agent_dispatches(id) on delete cascade,
  event_type   text not null check (event_type in (
    'reasoning','tool_call','tool_result','partial_output','decision','error'
  )),
  payload      jsonb not null,
  created_at   timestamptz not null default now()
);

-- Per SPEC §8 — single composite index covers every streaming-log query
-- (always filters by dispatch_id, sorted by created_at).
create index idx_agent_dispatch_events_dispatch
  on unicron.agent_dispatch_events(dispatch_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS — operator-team-only (gated by SignInGate + Supabase Auth allowlist).
-- Mirrors the pattern from Pathfinder/supabase/migrations/0090_unicron_settings.sql,
-- relaxed to allow team-wide read/write since dispatches are operator-shared
-- (any operator can verify/reject any dispatch). service_role retains full
-- access for backend dispatchers.
-- ---------------------------------------------------------------------------

alter table unicron.agent_dispatches enable row level security;

create policy agent_dispatches_authenticated on unicron.agent_dispatches
  for all to authenticated
  using (true) with check (true);

create policy agent_dispatches_service on unicron.agent_dispatches
  for all to service_role
  using (true) with check (true);

alter table unicron.agent_dispatch_events enable row level security;

create policy agent_dispatch_events_authenticated on unicron.agent_dispatch_events
  for all to authenticated
  using (true) with check (true);

create policy agent_dispatch_events_service on unicron.agent_dispatch_events
  for all to service_role
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Schema/table grants for PostgREST exposure (so the JS client can issue
-- supabase.schema('unicron').from('agent_dispatches').select(...)).
-- Mirror the grant pattern in 0090_unicron_settings.sql; intentionally NO
-- grants to anon (operator UI requires auth in production).
-- ---------------------------------------------------------------------------

grant usage on schema unicron to authenticated, service_role;
grant select, insert, update, delete on unicron.agent_dispatches
  to authenticated, service_role;
grant select, insert, update, delete on unicron.agent_dispatch_events
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Realtime publication — AgentLiveExecution subscribes via
-- supabase.channel().on('postgres_changes', { schema: 'unicron',
-- table: 'agent_dispatch_events', filter: 'dispatch_id=eq.<id>' }, ...).
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table unicron.agent_dispatches;
alter publication supabase_realtime add table unicron.agent_dispatch_events;
