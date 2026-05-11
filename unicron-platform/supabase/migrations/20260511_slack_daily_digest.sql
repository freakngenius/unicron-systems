-- 20260511_slack_daily_digest.sql
-- Stream S2 of Slack Daily Scan + Atrium Digest end-to-end build.
--
-- Adds nervous_system.slack_daily_digest — one row per calendar day, written
-- by the slack-daily-scan Inngest cron (06:00 PT). Each row carries the
-- day-level rollup; per-channel raw summaries land in nervous_system.ledger
-- with source_type='slack_channel_scan', and extracted action items / decisions
-- land in nervous_system.action_items + nervous_system.ledger (source_type=
-- 'decision') respectively.
--
-- digest_date is unique so the cron is idempotent — re-running upserts.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists nervous_system.slack_daily_digest (
  id                       uuid primary key default gen_random_uuid(),
  digest_date              date not null unique,
  top_theme                text,
  theme_confidence         numeric,
  channel_count            int not null default 0,
  message_count            int not null default 0,
  action_items_extracted   int not null default 0,
  decisions_extracted      int not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists slack_daily_digest_date_desc
  on nervous_system.slack_daily_digest (digest_date desc);

-- updated_at trigger so upserts surface as actual edits.
create or replace function nervous_system.slack_daily_digest_touch_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists slack_daily_digest_touch_updated_t on nervous_system.slack_daily_digest;
create trigger slack_daily_digest_touch_updated_t
  before update on nervous_system.slack_daily_digest
  for each row
  execute function nervous_system.slack_daily_digest_touch_updated();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- Read policy: open to authenticated + service role (matches the audit_log
-- pattern in this schema — internal nervous-system tables are readable by any
-- signed-in operator; writes always go through the service role).

alter table nervous_system.slack_daily_digest enable row level security;

drop policy if exists "ns slack_daily_digest read" on nervous_system.slack_daily_digest;
create policy "ns slack_daily_digest read"
  on nervous_system.slack_daily_digest
  for select
  using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC — recent digests for Atrium Now > Digest sub-tab (Stream S3)
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns the last N days of digest rollups joined with linked counts. Stream
-- S3 will lean on this RPC to render the digest list + date picker.

create or replace function public.ns_slack_daily_digest_recent(p_days int default 7)
returns table (
  id                      uuid,
  digest_date             date,
  top_theme               text,
  theme_confidence        numeric,
  channel_count           int,
  message_count           int,
  action_items_extracted  int,
  decisions_extracted     int,
  created_at              timestamptz,
  updated_at              timestamptz
)
language sql
security definer
set search_path to 'nervous_system', 'public'
as $$
  select
    d.id, d.digest_date, d.top_theme, d.theme_confidence,
    d.channel_count, d.message_count,
    d.action_items_extracted, d.decisions_extracted,
    d.created_at, d.updated_at
  from nervous_system.slack_daily_digest d
  where d.digest_date >= (current_date - greatest(p_days, 1))
  order by d.digest_date desc;
$$;

grant execute on function public.ns_slack_daily_digest_recent(int)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC — single date detail (Stream S3)
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns the digest row plus joined per-channel ledger rows (source_type=
-- 'slack_channel_scan' from the same UTC day) and decision rows that were
-- written during the same scan run. Decisions are matched by source_id prefix
-- (channel_id:ts) and created_at within the same digest_date.

create or replace function public.ns_slack_daily_digest_for_date(p_date date)
returns jsonb
language plpgsql
security definer
set search_path to 'nervous_system', 'public'
as $$
declare
  v_digest jsonb;
  v_channels jsonb;
  v_decisions jsonb;
  v_action_items jsonb;
begin
  select to_jsonb(d.*) into v_digest
  from nervous_system.slack_daily_digest d
  where d.digest_date = p_date;

  if v_digest is null then
    return jsonb_build_object(
      'digest_date', p_date,
      'exists', false,
      'channels', '[]'::jsonb,
      'decisions', '[]'::jsonb,
      'action_items', '[]'::jsonb
    );
  end if;

  -- Per-channel raw summaries (one ledger row per channel scan).
  select coalesce(jsonb_agg(jsonb_build_object(
    'ledger_id',       l.id,
    'channel_id',      l.source_id,
    'content_summary', l.content_summary,
    'action_items',    coalesce(l.action_items, '[]'::jsonb),
    'decisions',       coalesce(l.decisions, '[]'::jsonb),
    'insights',        coalesce(l.insights, '[]'::jsonb),
    'created_at',      l.created_at
  ) order by l.created_at desc), '[]'::jsonb) into v_channels
  from nervous_system.ledger l
  where l.source_type = 'slack_channel_scan'
    and l.created_at::date = p_date;

  -- Decision rows written during the scan (Elder-style ledger rows where
  -- source_id is "channel_id:ts" — matched on the same calendar date).
  select coalesce(jsonb_agg(jsonb_build_object(
    'ledger_id',       l.id,
    'source_id',       l.source_id,
    'content_summary', l.content_summary,
    'content_full',    l.content_full,
    'created_at',      l.created_at
  ) order by l.created_at desc), '[]'::jsonb) into v_decisions
  from nervous_system.ledger l
  where l.source_type = 'decision'
    and l.created_at::date = p_date
    and l.source_id like '%:%';  -- our convention: 'channel_id:ts'

  -- Action items the scan extracted, identified by requested_by->>'agent'.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',           ai.id,
    'title',        ai.title,
    'description',  ai.description,
    'status',       ai.status,
    'priority',     ai.priority,
    'requested_by', ai.requested_by,
    'requested_of', ai.requested_of,
    'ledger_id',    ai.ledger_id,
    'created_at',   ai.created_at
  ) order by ai.created_at desc), '[]'::jsonb) into v_action_items
  from nervous_system.action_items ai
  where ai.created_at::date = p_date
    and ai.requested_by->>'agent' = 'slack-daily-scan';

  return jsonb_build_object(
    'digest_date',  p_date,
    'exists',       true,
    'digest',       v_digest,
    'channels',     v_channels,
    'decisions',    v_decisions,
    'action_items', v_action_items
  );
end;
$$;

grant execute on function public.ns_slack_daily_digest_for_date(date)
  to authenticated, service_role;
