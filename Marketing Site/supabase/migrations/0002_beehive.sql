-- Beehive: specialist pipeline
create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  input_url text not null,
  status text not null check (status in ('running','succeeded','failed')),
  final_output jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pipeline_runs(id) on delete cascade,
  stage_name text not null check (stage_name in ('research','strategy','copy','validate')),
  input_json jsonb,
  output_json jsonb,
  validation_status text check (validation_status in ('pass','fail','bounced')),
  retry_count int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists pipeline_stages_run on public.pipeline_stages (run_id, started_at);
create index if not exists pipeline_runs_created on public.pipeline_runs (created_at desc);

alter table public.pipeline_runs enable row level security;
alter table public.pipeline_stages enable row level security;
drop policy if exists "pipeline_runs anon select" on public.pipeline_runs;
drop policy if exists "pipeline_stages anon select" on public.pipeline_stages;
create policy "pipeline_runs anon select" on public.pipeline_runs for select to anon using (true);
create policy "pipeline_stages anon select" on public.pipeline_stages for select to anon using (true);
