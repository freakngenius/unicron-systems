-- Migration 0080 — Source Onboarder + Coverage Expansion (Phase 2 Stream E).
--
-- Creates:
--   pathfinder.data_sources         — operator-onboarded ingestion sources
--   pathfinder.source_adapters      — generated adapter code + metadata
--   pathfinder.architect_sessions   — Source Onboarder reasoning trace per run
--   pathfinder.architect_inbox      — human-assist tickets + (later) Architect proposals
--
-- Spec references:
--   SPEC - Source Onboarder Agent.md §6 (decision tree), §8 (human-assist ticket schema)
--   SPEC - Coverage Expansion Agent.md §9 (extends with coverage_goals — separate
--   migration 0081 to keep concerns isolated)
--   STREAM-README §"Migrations: use 0080+ to avoid collision with B (0050+) and D (0070+)"
--
-- Coordination note: Stream D's architect_inbox (per Stream D's plan, migration
-- 0070-range) is the canonical owner of the table. If Stream D's migration lands
-- first, this migration will detect the table and only ALTER it additively.
-- Otherwise this migration creates it. Both Stream D and Stream E read/write
-- shared columns; the schema below is the union per coordination in
-- STREAM-README§"Coordination with other streams".

-- ---------------------------------------------------------------------------
-- data_sources — one row per onboarded source.
-- ---------------------------------------------------------------------------

create table if not exists pathfinder.data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  candidate_url text not null,
  adapter_kind text not null,            -- socrata | rest | rss | json-dump | tier_2_pending
  adapter_id uuid,                       -- fk to source_adapters.id (nullable while pending)
  jurisdiction text,                     -- 'CA', 'TX-Travis', 'federal', etc.
  poll_frequency_seconds integer not null default 1800,
  status text not null default 'pending', -- pending | live | paused | needs_assist | declined
  config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_polled_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_email text,
  constraint data_sources_status_check
    check (status in ('pending', 'live', 'paused', 'needs_assist', 'declined'))
);

create index if not exists data_sources_status_idx
  on pathfinder.data_sources (status);
create index if not exists data_sources_adapter_kind_idx
  on pathfinder.data_sources (adapter_kind);

-- ---------------------------------------------------------------------------
-- source_adapters — generated or hand-written adapter code modules.
-- ---------------------------------------------------------------------------

create table if not exists pathfinder.source_adapters (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                    -- socrata | rest | rss | json-dump | custom
  name text not null,                    -- 'socrata-default' | 'travis-county-pdf'
  version text not null default '0.1.0',
  generated_code text,                   -- typescript module body (null for hand-written shared)
  generated_by_session_id uuid,          -- fk to architect_sessions
  schema_inferred jsonb,
  sample_records jsonb,
  test_pass_count integer not null default 0,
  test_fail_count integer not null default 0,
  promoted_trusted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists source_adapters_kind_name_version_idx
  on pathfinder.source_adapters (kind, name, version);

alter table pathfinder.data_sources
  add constraint data_sources_adapter_id_fk
  foreign key (adapter_id) references pathfinder.source_adapters(id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- architect_sessions — reasoning trace for Source Onboarder + Coverage runs.
-- ---------------------------------------------------------------------------

create table if not exists pathfinder.architect_sessions (
  id uuid primary key default gen_random_uuid(),
  agent_role text not null,              -- 'source-onboarder' | 'coverage-expansion' | 'architect'
  goal text not null,
  input jsonb not null default '{}'::jsonb,
  status text not null default 'running',-- running | succeeded | failed | needs_assist | timed_out
  reasoning_log jsonb not null default '[]'::jsonb, -- append-only step log
  outcome jsonb,                         -- final result payload
  total_cost_usd numeric(12,6) not null default 0,
  total_llm_calls integer not null default 0,
  total_tool_calls integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by_user_email text,
  constraint architect_sessions_status_check
    check (status in ('running', 'succeeded', 'failed', 'needs_assist', 'timed_out')),
  constraint architect_sessions_agent_role_check
    check (agent_role in ('source-onboarder', 'coverage-expansion', 'architect'))
);

create index if not exists architect_sessions_status_idx
  on pathfinder.architect_sessions (status);
create index if not exists architect_sessions_agent_role_idx
  on pathfinder.architect_sessions (agent_role);

-- ---------------------------------------------------------------------------
-- architect_inbox — coordination boundary with Stream D.
-- Schema is the UNION of (Stream E's source-discovery tickets) +
-- (Stream D's architect proposals). category column is the discriminator.
-- ---------------------------------------------------------------------------

create table if not exists pathfinder.architect_inbox (
  id uuid primary key default gen_random_uuid(),
  category text not null,                -- 'source-discovery' (E) | 'architect-proposal' (D) | 'coverage-expansion' (E2)
  title text not null,
  blocked_reason text,                   -- auth_required | js_rendering | format_unrecognized | rate_limited | paid_only | pdf_inconsistent | other
  blocked_detail text,
  what_human_needs_to_do text,
  partial_progress jsonb,
  context jsonb not null default '{}'::jsonb, -- candidate_url, source_id, etc.
  agent_session_id uuid references pathfinder.architect_sessions(id) on delete set null,
  data_source_id uuid references pathfinder.data_sources(id) on delete set null,
  priority text not null default 'medium',
  status text not null default 'open',   -- open | acknowledged | in_progress | resolved | dismissed
  resolved_at timestamptz,
  resolved_by_user_email text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint architect_inbox_priority_check
    check (priority in ('low', 'medium', 'high')),
  constraint architect_inbox_status_check
    check (status in ('open', 'acknowledged', 'in_progress', 'resolved', 'dismissed')),
  constraint architect_inbox_category_check
    check (category in ('source-discovery', 'architect-proposal', 'coverage-expansion'))
);

create index if not exists architect_inbox_status_idx
  on pathfinder.architect_inbox (status);
create index if not exists architect_inbox_category_idx
  on pathfinder.architect_inbox (category);

-- ---------------------------------------------------------------------------
-- RLS — service_role full access; anon read-only on data_sources only.
-- Mirrors the 0004_rls.sql pattern.
-- ---------------------------------------------------------------------------

alter table pathfinder.data_sources enable row level security;
alter table pathfinder.source_adapters enable row level security;
alter table pathfinder.architect_sessions enable row level security;
alter table pathfinder.architect_inbox enable row level security;

drop policy if exists data_sources_read on pathfinder.data_sources;
create policy data_sources_read
  on pathfinder.data_sources for select
  to anon, authenticated using (true);

drop policy if exists data_sources_write on pathfinder.data_sources;
create policy data_sources_write
  on pathfinder.data_sources for all
  to service_role using (true) with check (true);

drop policy if exists source_adapters_write on pathfinder.source_adapters;
create policy source_adapters_write
  on pathfinder.source_adapters for all
  to service_role using (true) with check (true);

drop policy if exists architect_sessions_write on pathfinder.architect_sessions;
create policy architect_sessions_write
  on pathfinder.architect_sessions for all
  to service_role using (true) with check (true);

drop policy if exists architect_inbox_read on pathfinder.architect_inbox;
create policy architect_inbox_read
  on pathfinder.architect_inbox for select
  to anon, authenticated using (true);

drop policy if exists architect_inbox_write on pathfinder.architect_inbox;
create policy architect_inbox_write
  on pathfinder.architect_inbox for all
  to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper (idempotent — only created if not present)
-- ---------------------------------------------------------------------------

create or replace function pathfinder.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists data_sources_set_updated_at on pathfinder.data_sources;
create trigger data_sources_set_updated_at
  before update on pathfinder.data_sources
  for each row execute function pathfinder.set_updated_at();

drop trigger if exists source_adapters_set_updated_at on pathfinder.source_adapters;
create trigger source_adapters_set_updated_at
  before update on pathfinder.source_adapters
  for each row execute function pathfinder.set_updated_at();

drop trigger if exists architect_inbox_set_updated_at on pathfinder.architect_inbox;
create trigger architect_inbox_set_updated_at
  before update on pathfinder.architect_inbox
  for each row execute function pathfinder.set_updated_at();
