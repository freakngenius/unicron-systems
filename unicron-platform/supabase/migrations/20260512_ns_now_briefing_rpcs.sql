-- 20260512_ns_now_briefing_rpcs.sql
-- Morning-briefing redesign of Now > Today. Adds RPCs backing:
--   * "Since last night" overnight summary block (Slack scan + ingest)
--   * "Customer signals · 7d" sidebar card
--   * "Agent throughput · 24h" sidebar card with per-agent breakdown

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ns_now_overnight_summary
--    Slack scan: count of nervous_system.ledger source_type='slack_channel_scan'
--      rows in the last 24h, plus channel_count + message_count +
--      action_items_extracted + decisions_extracted aggregated from
--      nervous_system.slack_daily_digest for the same window.
--    Ingest: count of ledger source_type IN ('voice_memo','apple_note','manual')
--      rows in the last 24h.
--    Agent runs intentionally omitted — `ledger.created_by_agent` is NULL on
--    every recent row, so there is no real source today. The card and the
--    overnight line both honour the "real or cut" rule.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_now_overnight_summary()
RETURNS TABLE (
  slack_scans              bigint,
  slack_channels_scanned   bigint,
  slack_messages_scanned   bigint,
  slack_action_items       bigint,
  slack_decisions          bigint,
  ingest_captures          bigint,
  ingest_voice_memo        bigint,
  ingest_apple_note        bigint,
  ingest_manual            bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  WITH window_ledger AS (
    SELECT source_type
    FROM nervous_system.ledger
    WHERE created_at >= now() - interval '24 hours'
  ),
  window_digests AS (
    SELECT
      COALESCE(SUM(channel_count),          0)::bigint AS channels,
      COALESCE(SUM(message_count),          0)::bigint AS messages,
      COALESCE(SUM(action_items_extracted), 0)::bigint AS action_items,
      COALESCE(SUM(decisions_extracted),    0)::bigint AS decisions
    FROM nervous_system.slack_daily_digest
    WHERE created_at >= now() - interval '24 hours'
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM window_ledger WHERE source_type = 'slack_channel_scan') AS slack_scans,
    (SELECT channels     FROM window_digests)                                              AS slack_channels_scanned,
    (SELECT messages     FROM window_digests)                                              AS slack_messages_scanned,
    (SELECT action_items FROM window_digests)                                              AS slack_action_items,
    (SELECT decisions    FROM window_digests)                                              AS slack_decisions,
    (SELECT COUNT(*)::bigint FROM window_ledger WHERE source_type IN ('voice_memo','apple_note','manual')) AS ingest_captures,
    (SELECT COUNT(*)::bigint FROM window_ledger WHERE source_type = 'voice_memo')          AS ingest_voice_memo,
    (SELECT COUNT(*)::bigint FROM window_ledger WHERE source_type = 'apple_note')          AS ingest_apple_note,
    (SELECT COUNT(*)::bigint FROM window_ledger WHERE source_type = 'manual')              AS ingest_manual;
$$;

GRANT EXECUTE ON FUNCTION public.ns_now_overnight_summary() TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ns_now_customer_signals_7d
--    Counts nervous_system.ledger rows in the last 7d where either:
--      * customer_id IS NOT NULL, OR
--      * content_summary / content_full mentions a known customer name
--        (case-insensitive ILIKE match against nervous_system.customers).
--    Returns total signal count + distinct customers touched.
--    Restricts source_type to known signal-bearing surfaces.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_now_customer_signals_7d()
RETURNS TABLE (
  total              bigint,
  customers_touched  bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  WITH candidates AS (
    SELECT l.id, l.customer_id, l.content_summary, l.content_full
    FROM nervous_system.ledger l
    WHERE l.created_at >= now() - interval '7 days'
      AND l.source_type IN ('call', 'email_ingest', 'slack_channel_scan', 'voice_memo', 'apple_note', 'manual')
  ),
  named_customers AS (
    SELECT DISTINCT name FROM nervous_system.customers WHERE COALESCE(name, '') <> ''
  ),
  matched AS (
    SELECT c.id, COALESCE(c.customer_id::text, nc.name) AS customer_key
    FROM candidates c
    LEFT JOIN named_customers nc
      ON c.content_summary ILIKE '%' || nc.name || '%'
      OR c.content_full    ILIKE '%' || nc.name || '%'
    WHERE c.customer_id IS NOT NULL
       OR nc.name IS NOT NULL
  )
  SELECT
    COUNT(DISTINCT id)::bigint            AS total,
    COUNT(DISTINCT customer_key)::bigint  AS customers_touched
  FROM matched;
$$;

GRANT EXECUTE ON FUNCTION public.ns_now_customer_signals_7d() TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ns_now_agent_throughput_24h
--    Per-agent action counts in the last 24h drawn from nervous_system.audit_log
--    with a curated allow-list of agent-run actions. Excludes noisy
--    notion_kanban_* sync events (which are continuous pulls, not runs).
--    Falls into four buckets matched on prefix/exact action names; anything
--    else in the allow-list rolls into "Other".
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_now_agent_throughput_24h()
RETURNS TABLE (
  total            bigint,
  orchestrator     bigint,
  analyst          bigint,
  elder            bigint,
  taboo_keeper     bigint,
  other            bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  WITH actions AS (
    SELECT action
    FROM nervous_system.audit_log
    WHERE created_at >= now() - interval '24 hours'
      AND (
        action IN (
          'skill_e2e_verified',
          'action_item_create',
          'verification_sweep_complete',
          'slack_daily_scan_complete',
          'daily_digest_posted',
          'decay_tick_complete',
          'elder_advise_complete',
          'taboo_block',
          'taboo_bounce',
          'refusal_layer_bootstrap',
          'skills_audit_kickoff',
          'skills_audit_bugfixes_shipped',
          'skills_audit_post_hoc_bugs'
        )
        OR action LIKE 'elder_%'
        OR action LIKE 'taboo_%'
      )
  )
  SELECT
    COUNT(*)::bigint                                                                                     AS total,
    COUNT(*) FILTER (WHERE action IN ('skill_e2e_verified','action_item_create','verification_sweep_complete'))::bigint AS orchestrator,
    COUNT(*) FILTER (WHERE action IN ('slack_daily_scan_complete','daily_digest_posted','decay_tick_complete'))::bigint AS analyst,
    COUNT(*) FILTER (WHERE action LIKE 'elder_%')::bigint                                                AS elder,
    COUNT(*) FILTER (WHERE action LIKE 'taboo_%')::bigint                                                AS taboo_keeper,
    COUNT(*) FILTER (WHERE action IN ('refusal_layer_bootstrap','skills_audit_kickoff','skills_audit_bugfixes_shipped','skills_audit_post_hoc_bugs'))::bigint AS other
  FROM actions;
$$;

GRANT EXECUTE ON FUNCTION public.ns_now_agent_throughput_24h() TO authenticated, anon, service_role;
