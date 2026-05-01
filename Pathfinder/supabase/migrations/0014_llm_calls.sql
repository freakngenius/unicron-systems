-- 0014_llm_calls.sql — LLM gateway cost tracking (Phase 1 G1, Task A1).
-- Spec: SPEC - Backend Architecture.md §3 (data model), §5 (LLM gateway).
-- Plan: PROMPT - Phase 1 G1 Launch.md Task A.
--
-- Per-call cost telemetry. Replaces (over time) the rolled-up
-- agent_runs.model_calls JSONB pattern with a normalized table.
-- /api/cost-summary reads from this and the legacy JSONB for one cycle;
-- legacy read is removed in G2.
--
-- FK shape adjusted from spec: spec calls for agent_id uuid references
-- agents(id), but Pathfinder has no agents table. Pathfinder uses
-- agent_runs as the canonical run record; agent_runs.id is bigint
-- (bigserial). agent_run_id is nullable because chat-panel calls,
-- ad-hoc tooling, and future Architect sessions don't belong to a
-- cron-driven agent_run.

create table pathfinder.llm_calls (
  id                  uuid primary key default gen_random_uuid(),
  agent_run_id        bigint references pathfinder.agent_runs(id) on delete set null,
  agent_name          text,
  session_id          uuid,
  surface             text not null check (surface in (
    'cron','chat','architect','manual','test'
  )),
  model               text not null,
  input_tokens        integer,
  output_tokens       integer,
  cached_input_tokens integer default 0,
  cost_usd            numeric(10,4),
  latency_ms          integer,
  cache_hit           boolean not null default false,
  created_at          timestamptz not null default now()
);

create index llm_calls_created_at_idx on pathfinder.llm_calls(created_at desc);
create index llm_calls_agent_run_idx  on pathfinder.llm_calls(agent_run_id) where agent_run_id is not null;
create index llm_calls_agent_name_idx on pathfinder.llm_calls(agent_name) where agent_name is not null;
create index llm_calls_model_idx      on pathfinder.llm_calls(model);

alter table pathfinder.llm_calls enable row level security;

create policy llm_calls_read
  on pathfinder.llm_calls for select
  to anon, authenticated
  using (true);

create policy llm_calls_write
  on pathfinder.llm_calls for all
  to service_role
  using (true)
  with check (true);
