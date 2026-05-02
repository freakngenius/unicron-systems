-- Mycelium: signal memory substrate
create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  type text not null check (type in ('FACT','QUESTION','PATTERN','RISK')),
  source_agent text not null,
  body text not null,
  strength numeric not null default 1.0 check (strength >= 0),
  last_touched timestamptz not null default now(),
  ttl_days int not null default 14,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  archived boolean not null default false
);
create index if not exists signals_topic_strength on public.signals (topic, strength desc) where archived = false;
create index if not exists signals_last_touched on public.signals (last_touched);

alter table public.signals enable row level security;
-- Service-role bypasses RLS; anon reads allowed for meta/demo.
drop policy if exists "signals anon select" on public.signals;
create policy "signals anon select" on public.signals for select to anon using (archived = false);
