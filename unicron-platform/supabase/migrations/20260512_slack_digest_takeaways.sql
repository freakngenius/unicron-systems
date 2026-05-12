-- 20260512_slack_digest_takeaways.sql
--
-- Adds top_3_takeaways jsonb to nervous_system.slack_daily_digest for the
-- editorial "Top 3 takeaways" panel that replaces the old single-line top_theme
-- on the Atrium Now > Digest sub-tab. The takeaways are picked cross-channel
-- by impact (mix of milestones, agreements, customer info, new threads) and
-- each carries author + channel + Slack permalink for one-click drill-down.
--
-- top_theme is preserved for the Slack post-back card in S4 and as the single
-- editorial sentence in the digest header.
--
-- Also:
--   - ns_slack_daily_scan_upsert_digest gains a p_top_3_takeaways jsonb param.
--   - ns_slack_daily_digest_for_date returns top_3_takeaways inside the
--     'digest' jsonb.
--
-- Each takeaway has the shape:
--   { takeaway: text, primary_author: text|null, channel_name: text,
--     channel_id: text, source_message_ts: text|null, permalink: text|null }

alter table nervous_system.slack_daily_digest
  add column if not exists top_3_takeaways jsonb not null default '[]'::jsonb;

-- Drop + recreate the upsert RPC with the new param.
drop function if exists public.ns_slack_daily_scan_upsert_digest(date, text, int, int, int, int);

create or replace function public.ns_slack_daily_scan_upsert_digest(
  p_digest_date              date,
  p_top_theme                text,
  p_channel_count            int,
  p_message_count            int,
  p_action_items_extracted   int,
  p_decisions_extracted      int,
  p_top_3_takeaways          jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'nervous_system', 'public'
as $$
declare
  v_id uuid;
begin
  insert into nervous_system.slack_daily_digest (
    digest_date, top_theme,
    channel_count, message_count,
    action_items_extracted, decisions_extracted,
    top_3_takeaways
  )
  values (
    p_digest_date, p_top_theme,
    coalesce(p_channel_count, 0),
    coalesce(p_message_count, 0),
    coalesce(p_action_items_extracted, 0),
    coalesce(p_decisions_extracted, 0),
    coalesce(p_top_3_takeaways, '[]'::jsonb)
  )
  on conflict (digest_date) do update set
    top_theme              = excluded.top_theme,
    channel_count          = excluded.channel_count,
    message_count          = excluded.message_count,
    action_items_extracted = excluded.action_items_extracted,
    decisions_extracted    = excluded.decisions_extracted,
    top_3_takeaways        = excluded.top_3_takeaways
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.ns_slack_daily_scan_upsert_digest(date, text, int, int, int, int, jsonb)
  to authenticated, service_role;

-- Update the for_date RPC to surface top_3_takeaways inside the 'digest' object
-- so the SlackDigest.tsx component reads it from a single source.
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

  -- Decision rows.
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
    and l.source_id like '%:%';

  -- Action items extracted by this scan agent.
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
