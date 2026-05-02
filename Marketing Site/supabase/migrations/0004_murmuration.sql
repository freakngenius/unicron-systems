-- Murmuration: local-peer variant engine
create table if not exists public.flock_runs (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  peer_n int not null default 3,
  cycles int not null default 5,
  agent_count int not null default 7,
  status text not null check (status in ('running','succeeded','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists public.flock_outputs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.flock_runs(id) on delete cascade,
  agent_idx int not null,
  cycle int not null,
  content text not null,
  peer_refs jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, agent_idx, cycle)
);
create index if not exists flock_outputs_run on public.flock_outputs (run_id, cycle, agent_idx);
create index if not exists flock_runs_created on public.flock_runs (created_at desc);

alter table public.flock_runs enable row level security;
alter table public.flock_outputs enable row level security;
drop policy if exists "flock_runs anon select" on public.flock_runs;
drop policy if exists "flock_outputs anon select" on public.flock_outputs;
create policy "flock_runs anon select" on public.flock_runs for select to anon using (true);
create policy "flock_outputs anon select" on public.flock_outputs for select to anon using (true);
