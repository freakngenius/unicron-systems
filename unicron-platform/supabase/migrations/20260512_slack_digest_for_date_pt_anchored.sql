-- 20260512_slack_digest_for_date_pt_anchored.sql
--
-- Bug: ns_slack_daily_digest_for_date(p_date) joined on `created_at::date`,
-- which evaluates in the database session's timezone (UTC by default in
-- Supabase). digest_date itself is PT-anchored (written by the cron at 06:00
-- PT or by manual run via slack-daily-scan.ts's digestDateForToday()). Late-
-- evening PT scans land their ledger / action_items rows with UTC dates one
-- day ahead of digest_date, so the joins returned zero rows even though the
-- digest header counts said 11 channels, 4 decisions, 10 action items.
--
-- Repro: scan ran at 04:35 UTC = 21:35 PT on 2026-05-11. digest_date stored
-- as 2026-05-11. Ledger created_at::date = 2026-05-12 in UTC. UI requested
-- p_date='2026-05-11', RPC matched the digest row but the joins missed.
--
-- Fix: anchor the join keys to PT via `(created_at at time zone
-- 'America/Los_Angeles')::date = p_date`. This matches the same TZ the cron
-- uses to compute digest_date, so the two always line up regardless of the
-- moment-of-day the scan runs.
--
-- Applied directly via Supabase MCP at 2026-05-12 04:50 UTC. This file
-- commits the change to the migration history.

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
      'digest_date',  p_date,
      'exists',       false,
      'channels',     '[]'::jsonb,
      'decisions',    '[]'::jsonb,
      'action_items', '[]'::jsonb
    );
  end if;

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
    and (l.created_at at time zone 'America/Los_Angeles')::date = p_date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ledger_id',       l.id,
    'source_id',       l.source_id,
    'content_summary', l.content_summary,
    'content_full',    l.content_full,
    'created_at',      l.created_at
  ) order by l.created_at desc), '[]'::jsonb) into v_decisions
  from nervous_system.ledger l
  where l.source_type = 'decision'
    and (l.created_at at time zone 'America/Los_Angeles')::date = p_date
    and l.source_id like '%:%';

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
  where (ai.created_at at time zone 'America/Los_Angeles')::date = p_date
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
