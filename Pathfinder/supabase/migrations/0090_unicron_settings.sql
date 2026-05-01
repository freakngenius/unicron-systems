-- 0090_unicron_settings.sql — Stream C: operator UI settings.
--
-- Per Phase 2 Stream C STREAM-README: "Settings drawer wires to real Settings
-- table (create one in `unicron.*` schema if it doesn't exist; don't pollute
-- `pathfinder.*`)."
--
-- This is the first migration that introduces the `unicron` schema in the
-- shared Supabase project. Stream C reserves migration range 0090-0099 for
-- operator-UI tables (per 00 - PARALLEL BUILD MAP.md migration coordination
-- — A unclaimed, B 0050-0069, D 0070-0079, E 0080+; Stream C picks 0090+ to
-- stay clear of E's range).
--
-- The `unicron.settings` table stores per-operator client-side preferences
-- mirrored from the Settings drawer. We key by Supabase auth user_id when
-- present; for anonymous local-dev sessions a sentinel email is used.

create schema if not exists unicron;

create table unicron.settings (
  -- Either the Supabase auth user_id (when VITE_AUTH_REQUIRED=true) or the
  -- sentinel string 'anon-operator' for local dev. Stored as text rather than
  -- uuid so the same row shape works for both modes without a migration.
  operator_key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index settings_updated_idx on unicron.settings(updated_at desc);

-- Trigger to keep updated_at honest on UPDATE.
create or replace function unicron.set_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger settings_updated_at_tg
  before update on unicron.settings
  for each row execute function unicron.set_settings_updated_at();

-- RLS: an authenticated operator may read+write their own row only.
-- For anon-mode local dev the app uses the anon role and the sentinel key;
-- we permit anon SELECT+UPSERT on the sentinel row only.
alter table unicron.settings enable row level security;

create policy settings_self_read on unicron.settings
  for select to authenticated
  using (operator_key = (auth.uid())::text);

create policy settings_self_write on unicron.settings
  for all to authenticated
  using (operator_key = (auth.uid())::text)
  with check (operator_key = (auth.uid())::text);

create policy settings_anon_dev_read on unicron.settings
  for select to anon
  using (operator_key = 'anon-operator');

create policy settings_anon_dev_write on unicron.settings
  for all to anon
  using (operator_key = 'anon-operator')
  with check (operator_key = 'anon-operator');

-- service_role bypasses RLS by default; explicit policy makes intent explicit.
create policy settings_service_write on unicron.settings
  for all to service_role
  using (true) with check (true);

-- Expose the `unicron` schema to PostgREST so the JS client can query it via
-- `supabase.schema('unicron').from('settings')`. Supabase requires the schema
-- be added to the `db.schemas` exposed list, OR the underlying role be
-- granted USAGE explicitly. We do the latter so this migration is portable.
grant usage on schema unicron to anon, authenticated, service_role;
grant select, insert, update, delete on unicron.settings
  to anon, authenticated, service_role;
