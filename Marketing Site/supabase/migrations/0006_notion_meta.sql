-- Notion DB ID cache for idempotent setup
create table if not exists public.notion_meta (
  key text primary key,
  database_id text not null,
  created_at timestamptz not null default now()
);

alter table public.notion_meta enable row level security;
-- No anon access; only service role reads/writes.
