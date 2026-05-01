-- Migration 0081 — Coverage Expansion Agent (Phase 2 Stream E, Gate E2).
--
-- Spec: SPEC - Coverage Expansion Agent.md §9 (data model).
--
-- Adds coverage_goals + coverage_goal_candidates. The spec mentions
-- `vertical_id uuid references vertical_configurations(id)` — Pathfinder
-- has no `vertical_configurations` table per D3 ("additive evolution"),
-- so vertical_id is stored as text (free-form vertical slug). When/if
-- D3's spec data model lands in Phase 3+, the column promotes to a real
-- FK without a data migration (text → uuid is non-trivial, so we punt
-- the cleanup).

create table if not exists pathfinder.coverage_goals (
  id uuid primary key default gen_random_uuid(),
  vertical_id text,                             -- text per D3; promotes later
  goal_text text not null,
  scope_constraints jsonb not null default '{}'::jsonb,
  budget_usd numeric(10,2) not null default 50,
  timeout_hours integer not null default 24,
  status text not null default 'draft',
  -- draft | estimating | running | paused | completed
  estimate jsonb,                               -- pre-flight result
  total_cost_usd numeric(10,4) not null default 0,
  total_sources_onboarded integer not null default 0,
  total_sources_assist_queued integer not null default 0,
  total_sources_declined integer not null default 0,
  total_estimated_lift numeric(10,2) not null default 0,
  agent_session_id uuid references pathfinder.architect_sessions(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_email text,
  constraint coverage_goals_status_check
    check (status in ('draft', 'estimating', 'running', 'paused', 'completed', 'failed'))
);

create index if not exists coverage_goals_status_idx on pathfinder.coverage_goals (status);

create table if not exists pathfinder.coverage_goal_candidates (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references pathfinder.coverage_goals(id) on delete cascade,
  candidate_url text not null,
  candidate_type text,                          -- socrata | rest | rss | json-dump | tier_2 | tier_3
  estimated_impact numeric(10,2),               -- expected qualified leads/day
  estimated_tier integer,                       -- 1 | 2 | 3
  status text not null default 'pending',
  -- pending | dispatched | onboarded | assist_queued | declined | failed
  source_onboarder_session_id uuid references pathfinder.architect_sessions(id) on delete set null,
  data_source_id uuid references pathfinder.data_sources(id) on delete set null,
  result_payload jsonb,
  dispatched_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint coverage_goal_candidates_status_check
    check (status in ('pending', 'dispatched', 'onboarded', 'assist_queued', 'declined', 'failed'))
);

create index if not exists coverage_goal_candidates_goal_id_idx on pathfinder.coverage_goal_candidates (goal_id);
create index if not exists coverage_goal_candidates_status_idx on pathfinder.coverage_goal_candidates (status);
create unique index if not exists coverage_goal_candidates_goal_url_idx on pathfinder.coverage_goal_candidates (goal_id, candidate_url);

-- RLS — service_role full access; anon read-only.
alter table pathfinder.coverage_goals enable row level security;
alter table pathfinder.coverage_goal_candidates enable row level security;

drop policy if exists coverage_goals_read on pathfinder.coverage_goals;
create policy coverage_goals_read on pathfinder.coverage_goals for select to anon, authenticated using (true);

drop policy if exists coverage_goals_write on pathfinder.coverage_goals;
create policy coverage_goals_write on pathfinder.coverage_goals for all to service_role using (true) with check (true);

drop policy if exists coverage_goal_candidates_read on pathfinder.coverage_goal_candidates;
create policy coverage_goal_candidates_read on pathfinder.coverage_goal_candidates for select to anon, authenticated using (true);

drop policy if exists coverage_goal_candidates_write on pathfinder.coverage_goal_candidates;
create policy coverage_goal_candidates_write on pathfinder.coverage_goal_candidates for all to service_role using (true) with check (true);

-- updated_at trigger reuses pathfinder.set_updated_at() defined in 0080.
drop trigger if exists coverage_goals_set_updated_at on pathfinder.coverage_goals;
create trigger coverage_goals_set_updated_at
  before update on pathfinder.coverage_goals
  for each row execute function pathfinder.set_updated_at();
