-- 0070_architect_sessions.sql — Phase 2 Stream D Gate D1.
-- Spec: SPEC - Architect Agent.md §3 (decomposition), §6 (tools), §7 (Inbox UI),
--        SPEC - Backend Architecture.md §3 (data model — architect_sessions, architect_proposals).
--
-- Two tables:
--   architect_sessions  — one row per agent runtime session (decomposition / tuning / discovery).
--   architect_proposals — one row per output proposal (source_discovery | agent_proposal | tuning_suggestion | vertical_configuration).
--
-- Drift from SPEC - Backend Architecture.md §3:
--   Spec: vertical_id uuid references vertical_configurations(id).
--   Reality (D3 in MEMORY/decisions.md): Pathfinder uses additive schema; no
--   vertical_configurations table exists. Stream D adopts `vertical_id text`
--   with default 'pathfinder-default' so the Architect is single-vertical-ready
--   today and trivially promotes to FK in a Phase 2.5 schema-migration stream
--   when vertical_configurations lands.
--
--   Spec: customer_org_id uuid references users(id).
--   Reality: no users table in Pathfinder schema. Drop the FK; keep as text.
--
-- Architect_inbox is a logical filter over architect_proposals, not its own
-- table. Stream C's Architect Inbox UI reads:
--   select * from architect_proposals where status = 'pending' order by created_at desc;
-- with optional filter on `type`. No view object created — view definitions
-- compose poorly with RLS in our setup; the query is straightforward.

create table pathfinder.architect_sessions (
  id              uuid primary key default gen_random_uuid(),
  vertical_id     text not null default 'pathfinder-default',
  session_type    text not null check (session_type in (
    'decomposition','tuning','discovery'
  )),
  trigger         text not null check (trigger in (
    'manual','cron','adjacency_threshold','operator_action','periodic'
  )),
  input_payload   jsonb not null,
  -- streamed reasoning_log: one entry per turn ({role, content, tool_calls, tool_results, ts}).
  reasoning_log   jsonb not null default '[]'::jsonb,
  output_payload  jsonb,                        -- the final structured proposal; null until completed
  status          text not null default 'in_progress' check (status in (
    'in_progress','completed','failed','timed_out'
  )),
  failure_reason  text,                         -- non-null when status='failed'
  duration_ms     integer,                      -- wall-clock from start to terminal status
  cost_usd        numeric(10,4) not null default 0,  -- aggregated from llm_calls.session_id matches
  turns           integer not null default 0,   -- number of agent turns (api round-trips)
  -- denormalized for fast filter queries; joined via session_id when needed.
  customer_org_id text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index architect_sessions_status_idx     on pathfinder.architect_sessions(status);
create index architect_sessions_type_idx       on pathfinder.architect_sessions(session_type);
create index architect_sessions_vertical_idx   on pathfinder.architect_sessions(vertical_id);
create index architect_sessions_created_at_idx on pathfinder.architect_sessions(created_at desc);

alter table pathfinder.architect_sessions enable row level security;

create policy architect_sessions_read
  on pathfinder.architect_sessions for select
  to anon, authenticated
  using (true);

create policy architect_sessions_write
  on pathfinder.architect_sessions for all
  to service_role
  using (true) with check (true);


create table pathfinder.architect_proposals (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid references pathfinder.architect_sessions(id) on delete cascade,
  vertical_id           text not null default 'pathfinder-default',
  type                  text not null check (type in (
    'vertical_configuration','source_discovery','agent_proposal','tuning_suggestion'
  )),
  headline              text not null,
  body                  text,
  details               jsonb not null default '{}'::jsonb,
  confidence            numeric(3,2) not null check (confidence >= 0 and confidence <= 1),
  status                text not null default 'pending' check (status in (
    'pending','approved','dismissed','auto_accepted','expired'
  )),
  resolved_at           timestamptz,
  resolved_by_user_email text,
  resolution_notes      text,
  -- decomposition-only: which buyer pain spawned the proposal (echoed for inbox display).
  source_input_summary  text,
  created_at            timestamptz not null default now()
);

create index architect_proposals_status_idx     on pathfinder.architect_proposals(status);
create index architect_proposals_type_idx       on pathfinder.architect_proposals(type);
create index architect_proposals_vertical_idx   on pathfinder.architect_proposals(vertical_id);
create index architect_proposals_session_idx    on pathfinder.architect_proposals(session_id);
create index architect_proposals_inbox_idx      on pathfinder.architect_proposals(status, created_at desc)
  where status = 'pending';

alter table pathfinder.architect_proposals enable row level security;

create policy architect_proposals_read
  on pathfinder.architect_proposals for select
  to anon, authenticated
  using (true);

create policy architect_proposals_write
  on pathfinder.architect_proposals for all
  to service_role
  using (true) with check (true);
