-- Six tables that mirror the Build Brief §State & Data definition.
-- All foreign keys stay inside `pathfinder` so the schema is fully self-contained.

create table pathfinder.branches (
  id text primary key,
  name text not null,
  code text not null,
  lat double precision not null,
  lon double precision not null,
  coverage_radius_miles integer not null default 300,
  opened_date date,
  region text,
  created_at timestamptz not null default now()
);

create table pathfinder.customers (
  id text primary key,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  served_by_branch_id text references pathfinder.branches(id) on delete set null,
  customer_since date,
  monthly_value numeric(12,2),
  created_at timestamptz not null default now()
);

create table pathfinder.projects (
  id text primary key,
  source text not null,
  source_id text not null,
  title text not null,
  summary text,
  lat double precision,
  lon double precision,
  project_value numeric(14,2),
  project_stage text,
  posted_date date,
  raw_payload jsonb,
  rationale text,
  rationale_streamed_at timestamptz,
  score integer,
  nearest_branch_id text references pathfinder.branches(id) on delete set null,
  distance_miles numeric(8,2),
  outreach_hook text,
  warm_for_customer_id text references pathfinder.customers(id) on delete set null,
  ingested_at timestamptz not null default now(),
  ranked_at timestamptz,
  unique (source, source_id)
);

create index projects_nearest_branch_idx on pathfinder.projects(nearest_branch_id);
create index projects_score_idx on pathfinder.projects(score desc);
create index projects_ingested_idx on pathfinder.projects(ingested_at desc);

create table pathfinder.agent_log (
  id bigserial primary key,
  agent_name text not null check (agent_name in ('ingestor','ranker','adjacent')),
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  latency_ms integer,
  model_used text,
  ts timestamptz not null default now()
);

create index agent_log_ts_idx on pathfinder.agent_log(ts desc);
create index agent_log_agent_idx on pathfinder.agent_log(agent_name, ts desc);

create table pathfinder.agent_runs (
  id bigserial primary key,
  agent_name text not null check (agent_name in ('ingestor','ranker','adjacent')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_processed integer default 0,
  records_new integer default 0,
  status text not null default 'running' check (status in ('running','success','failed')),
  error_message text
);

create index agent_runs_started_idx on pathfinder.agent_runs(started_at desc);

create table pathfinder.adjacent_targets (
  id bigserial primary key,
  company_name text not null,
  geography text,
  branch_count_estimate integer,
  shape_match_reason text,
  outreach_draft text,
  surfaced_at timestamptz not null default now()
);

create index adjacent_targets_surfaced_idx on pathfinder.adjacent_targets(surfaced_at desc);
