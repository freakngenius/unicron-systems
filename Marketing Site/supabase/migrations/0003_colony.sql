-- Ant Colony: parallel discovery swarm
create table if not exists public.swarm_jobs (
  id uuid primary key default gen_random_uuid(),
  market_query text not null,
  target_count int not null,
  completed_count int not null default 0,
  status text not null check (status in ('running','succeeded','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists public.swarm_workers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.swarm_jobs(id) on delete cascade,
  target_ref text not null,
  output_json jsonb,
  status text not null check (status in ('pending','running','done','errored')),
  runtime_ms int,
  created_at timestamptz not null default now()
);
create table if not exists public.swarm_clusters (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.swarm_jobs(id) on delete cascade,
  theme text not null,
  size int not null,
  examples jsonb not null
);
create index if not exists swarm_workers_job on public.swarm_workers (job_id, status);
create index if not exists swarm_jobs_created on public.swarm_jobs (created_at desc);

alter table public.swarm_jobs enable row level security;
alter table public.swarm_workers enable row level security;
alter table public.swarm_clusters enable row level security;
drop policy if exists "swarm_jobs anon select" on public.swarm_jobs;
drop policy if exists "swarm_workers anon select" on public.swarm_workers;
drop policy if exists "swarm_clusters anon select" on public.swarm_clusters;
create policy "swarm_jobs anon select" on public.swarm_jobs for select to anon using (true);
create policy "swarm_workers anon select" on public.swarm_workers for select to anon using (true);
create policy "swarm_clusters anon select" on public.swarm_clusters for select to anon using (true);
