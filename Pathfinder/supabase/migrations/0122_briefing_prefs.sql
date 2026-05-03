-- 0122_briefing_prefs.sql — Demo Polish UX Gate 13W-A.
--
-- Daily Intelligence Loop. Per-user preferences for the auto-generated
-- daily brief that lands in the operator's inbox. The composer in
-- services/briefer/agent.ts reads this row (or the table default when
-- no row exists yet) to decide which sections to render.
--
-- Two changes:
--   1. New table pathfinder.briefing_prefs.
--   2. Additive type column on pathfinder.outreach_sends so 13W-B can
--      log brief sends with type='briefing' alongside outreach sends.
--
-- Additive only. Idempotent. No destructive ALTER.

-- 1. briefing_prefs --------------------------------------------------------

create table if not exists pathfinder.briefing_prefs (
  -- user_id is text (not uuid) to mirror the actor identity scheme used
  -- across outreach_sends.user_id and user_connections.user_id (operator
  -- email-as-id). See 0113_user_connections.sql:19-23.
  user_id     text primary key,

  frequency   text not null default 'daily'
              check (frequency in ('daily', 'weekly', 'paused')),

  -- 0-23, operator-local clock. Cron in 13W-B converts to UTC using
  -- the timezone column.
  send_hour   int not null default 7
              check (send_hour between 0 and 23),

  -- IANA tz string. Default matches Kyle's home timezone; new operators
  -- set their own from /pathfinder/settings/briefing in 13W-C.
  timezone    text not null default 'America/Los_Angeles',

  -- Section toggles. jsonb so 13W-C can grow new sections without a
  -- second migration. Composer treats missing keys as `true` (additive
  -- new sections opt every existing user in by default).
  sections    jsonb not null default
              jsonb_build_object(
                'new_leads',        true,
                'follow_ups',       true,
                'stage_changes',    true,
                'replies',          true,
                'contacts_pending', true
              ),

  -- Soft pause flag in addition to frequency='paused' so an operator
  -- can resume to their prior frequency without losing the value. The
  -- cron treats `paused = true OR frequency = 'paused'` as a skip.
  paused      bool not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- updated_at trigger mirrors 0050_deals.sql:90-103.
create or replace function pathfinder.touch_briefing_prefs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists briefing_prefs_touch_updated_at on pathfinder.briefing_prefs;
create trigger briefing_prefs_touch_updated_at
  before update on pathfinder.briefing_prefs
  for each row
  execute function pathfinder.touch_briefing_prefs_updated_at();

-- RLS — anon read, service-role write (matches 0114_outreach_sends.sql).
alter table pathfinder.briefing_prefs enable row level security;

drop policy if exists briefing_prefs_read on pathfinder.briefing_prefs;
create policy briefing_prefs_read
  on pathfinder.briefing_prefs for select
  to anon, authenticated
  using (true);

drop policy if exists briefing_prefs_write on pathfinder.briefing_prefs;
create policy briefing_prefs_write
  on pathfinder.briefing_prefs for all
  to service_role
  using (true)
  with check (true);

-- 2. outreach_sends.type ---------------------------------------------------
--
-- 13W-B will write rows with type='briefing'. Default 'outreach' so
-- existing rows keep their semantics. Briefing rows have project_id
-- null (a brief covers many projects), so we drop the not-null and
-- replace it with a CHECK that preserves the existing requirement
-- for outreach rows.

alter table pathfinder.outreach_sends
  add column if not exists type text not null default 'outreach';

-- Add the CHECK if not already present. Doing it as a DO block so the
-- migration is re-runnable.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'outreach_sends_type_check'
      and conrelid = 'pathfinder.outreach_sends'::regclass
  ) then
    alter table pathfinder.outreach_sends
      add constraint outreach_sends_type_check
      check (type in ('outreach', 'briefing'));
  end if;
end $$;

-- Drop NOT NULL on project_id (briefings have no single project).
alter table pathfinder.outreach_sends
  alter column project_id drop not null;

-- Replace the lost not-null with a CHECK that enforces it for outreach
-- rows. Briefings can omit project_id; outreach rows still require it.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'outreach_sends_project_id_required_for_outreach'
      and conrelid = 'pathfinder.outreach_sends'::regclass
  ) then
    alter table pathfinder.outreach_sends
      add constraint outreach_sends_project_id_required_for_outreach
      check (type = 'briefing' or project_id is not null);
  end if;
end $$;

create index if not exists outreach_sends_type_sent_at_idx
  on pathfinder.outreach_sends(type, sent_at desc);
