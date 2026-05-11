-- 20260511_slack_daily_scan_rpcs.sql
--
-- SECURITY DEFINER RPC wrappers for slack-daily-scan writes. Required because
-- PostgREST only exposes the `public` schema by default — supabase-js calls
-- like `.schema('nervous_system').from('ledger').insert(...)` return PGRST106
-- at runtime, and the slack-daily-scan helpers swallowed those errors as
-- console.error. Repro: PR #352 + #354 deployed cleanly, Inngest run
-- 01KRC6DTEDTXK6K1YRPZV4WE6X reported channel_count=11, message_count=28,
-- top_theme synthesized — but zero rows landed in slack_daily_digest /
-- ledger / audit_log.
--
-- This migration adds four RPCs that wrap the writes so the function can keep
-- service-role bypassing RLS while staying inside PostgREST's public-schema
-- envelope. Mirrors the pattern used by ns_create_action_item_atrium,
-- ns_list_skills, ns_slack_daily_digest_for_date, etc.
--
-- All RPCs are idempotent and use the same column shapes the function was
-- writing previously.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Insert a per-channel scan ledger row
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ns_slack_daily_scan_insert_channel_ledger(
  p_channel_id     text,
  p_channel_name   text,
  p_content_summary text,
  p_content_full   text,
  p_action_items   jsonb default '[]'::jsonb,
  p_decisions      jsonb default '[]'::jsonb,
  p_insights       jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'nervous_system', 'public'
as $$
declare
  v_id uuid;
begin
  insert into nervous_system.ledger (
    source_type, source_id, source_url,
    content_summary, content_full,
    action_items, decisions, insights
  )
  values (
    'slack_channel_scan',
    p_channel_id,
    'slack://channel?id=' || p_channel_id,
    left(coalesce(p_content_summary, ''), 500),
    p_content_full,
    coalesce(p_action_items, '[]'::jsonb),
    coalesce(p_decisions, '[]'::jsonb),
    coalesce(p_insights, '[]'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.ns_slack_daily_scan_insert_channel_ledger(text, text, text, text, jsonb, jsonb, jsonb)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Insert an action item extracted by the scan
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ns_slack_daily_scan_insert_action_item(
  p_channel_id        text,
  p_channel_name      text,
  p_ledger_id         uuid,
  p_title             text,
  p_owner_hint        text default null,
  p_due_hint          text default null,
  p_source_message_ts text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'nervous_system', 'public'
as $$
declare
  v_id uuid;
  v_description text;
begin
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'ns_slack_daily_scan_insert_action_item: title required';
  end if;

  if p_owner_hint is not null and p_due_hint is not null then
    v_description := 'Hint: assigned to ' || p_owner_hint || ' · due ' || p_due_hint;
  elsif p_owner_hint is not null then
    v_description := 'Hint: assigned to ' || p_owner_hint;
  elsif p_due_hint is not null then
    v_description := 'Hint: due ' || p_due_hint;
  else
    v_description := null;
  end if;

  insert into nervous_system.action_items (
    title, description,
    requested_by, requested_of,
    ledger_id, status, priority, ttl_days
  )
  values (
    left(trim(p_title), 200),
    v_description,
    jsonb_build_object(
      'agent', 'slack-daily-scan',
      'channel_id', p_channel_id,
      'channel_name', p_channel_name,
      'source_message_ts', p_source_message_ts
    ),
    jsonb_build_object(
      'hint', coalesce(p_owner_hint, 'unassigned')
    ),
    p_ledger_id,
    'open',
    'medium',
    30
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.ns_slack_daily_scan_insert_action_item(text, text, uuid, text, text, text, text)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Insert a decision extracted by the scan
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ns_slack_daily_scan_insert_decision(
  p_channel_id        text,
  p_channel_name      text,
  p_decision          text,
  p_decided_by_hint   text default null,
  p_rationale         text default null,
  p_source_message_ts text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'nervous_system', 'public'
as $$
declare
  v_id uuid;
  v_source_id text;
  v_source_url text;
begin
  v_source_id := p_channel_id || ':' || coalesce(p_source_message_ts, 'unknown');
  if p_source_message_ts is not null then
    v_source_url := 'slack://channel?id=' || p_channel_id || '&message=' || p_source_message_ts;
  else
    v_source_url := 'slack://channel?id=' || p_channel_id;
  end if;

  insert into nervous_system.ledger (
    source_type, source_id, source_url, content_summary, content_full
  )
  values (
    'decision',
    v_source_id,
    v_source_url,
    left(p_decision, 500),
    jsonb_build_object(
      'channel_id', p_channel_id,
      'channel_name', p_channel_name,
      'decision', p_decision,
      'decided_by_hint', p_decided_by_hint,
      'rationale', p_rationale,
      'source_message_ts', p_source_message_ts
    )::text
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.ns_slack_daily_scan_insert_decision(text, text, text, text, text, text)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Upsert the daily digest rollup
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ns_slack_daily_scan_upsert_digest(
  p_digest_date              date,
  p_top_theme                text,
  p_channel_count            int,
  p_message_count            int,
  p_action_items_extracted   int,
  p_decisions_extracted      int
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
    action_items_extracted, decisions_extracted
  )
  values (
    p_digest_date, p_top_theme,
    coalesce(p_channel_count, 0),
    coalesce(p_message_count, 0),
    coalesce(p_action_items_extracted, 0),
    coalesce(p_decisions_extracted, 0)
  )
  on conflict (digest_date) do update set
    top_theme              = excluded.top_theme,
    channel_count          = excluded.channel_count,
    message_count          = excluded.message_count,
    action_items_extracted = excluded.action_items_extracted,
    decisions_extracted    = excluded.decisions_extracted
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.ns_slack_daily_scan_upsert_digest(date, text, int, int, int, int)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Append an audit_log entry (generic; reusable by other agents)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ns_audit_log_append(
  p_table_name text,
  p_action     text,
  p_payload    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'nervous_system', 'public'
as $$
declare
  v_id uuid;
begin
  insert into nervous_system.audit_log (table_name, action, payload)
  values (p_table_name, p_action, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.ns_audit_log_append(text, text, jsonb)
  to authenticated, service_role;
