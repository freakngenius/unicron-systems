-- Slime Mold: prune-and-converge selector
create table if not exists public.selection_runs (
  id uuid primary key default gen_random_uuid(),
  criteria jsonb not null,
  cycles_planned int not null default 3,
  current_cycle int not null default 0,
  status text not null check (status in ('running','succeeded','failed')),
  notion_page_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.selection_runs(id) on delete cascade,
  hypothesis text not null,
  context jsonb not null,
  current_score numeric,
  resource_share numeric not null default 1.0,
  alive boolean not null default true,
  eliminated_at_cycle int,
  created_at timestamptz not null default now()
);
create table if not exists public.score_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  cycle int not null,
  score numeric not null,
  reasoning text not null,
  criteria_breakdown jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists candidates_run on public.candidates (run_id, alive);
create index if not exists score_events_candidate on public.score_events (candidate_id, cycle);
create index if not exists selection_runs_created on public.selection_runs (created_at desc);

alter table public.selection_runs enable row level security;
alter table public.candidates enable row level security;
alter table public.score_events enable row level security;
drop policy if exists "selection_runs anon select" on public.selection_runs;
drop policy if exists "candidates anon select" on public.candidates;
drop policy if exists "score_events anon select" on public.score_events;
create policy "selection_runs anon select" on public.selection_runs for select to anon using (true);
create policy "candidates anon select" on public.candidates for select to anon using (true);
create policy "score_events anon select" on public.score_events for select to anon using (true);
