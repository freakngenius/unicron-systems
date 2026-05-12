-- 20260512_ns_now_today_metrics.sql
-- Now > Today editorial pass: three real sidebar metric cards backed by RPCs.
--
-- All functions are SECURITY DEFINER in public schema (PGRST106 pattern) and
-- read from nervous_system.* tables. Additive only — no DROP, no destructive ALTER.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ns_now_open_items_for_dri
--    Used by: Now.tsx sidebar "Open items · you DRI"
--    Returns total + priority breakdown for the signed-in DRI's open items.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_now_open_items_for_dri(p_dri uuid)
RETURNS TABLE (
  total         bigint,
  irreversible  bigint,
  high          bigint,
  medium        bigint,
  low           bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT
    COUNT(*)::bigint                                                        AS total,
    COUNT(*) FILTER (WHERE priority = 'irreversible')::bigint               AS irreversible,
    COUNT(*) FILTER (WHERE priority = 'high')::bigint                       AS high,
    COUNT(*) FILTER (WHERE priority = 'medium')::bigint                     AS medium,
    COUNT(*) FILTER (WHERE priority = 'low')::bigint                        AS low
  FROM nervous_system.action_items
  WHERE dri = p_dri
    AND status != 'done';
$$;

GRANT EXECUTE ON FUNCTION public.ns_now_open_items_for_dri(uuid) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ns_now_refusals_24h
--    Used by: Now.tsx sidebar "Refusals · 24h"
--    Returns total count of taboo_bounce audit_log rows in the last 24h plus
--    the count that have NOT been overridden (the actionable "need review"
--    subset — see notes in PR description re: payload tagging).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_now_refusals_24h()
RETURNS TABLE (
  total         bigint,
  needs_review  bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT
    COUNT(*)::bigint                                                                                   AS total,
    COUNT(*) FILTER (WHERE COALESCE(payload->>'override_status', '') <> 'overridden')::bigint          AS needs_review
  FROM nervous_system.audit_log
  WHERE action LIKE 'taboo_bounce%'
    AND created_at >= now() - interval '24 hours';
$$;

GRANT EXECUTE ON FUNCTION public.ns_now_refusals_24h() TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ns_now_decisions_7d
--    Used by: Now.tsx sidebar "Decisions · 7d"
--    Returns total decision-ledger rows in the last 7d + latest decision title.
--    source_type = 'elder_decision' matches ns_list_ledger_decisions convention.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_now_decisions_7d()
RETURNS TABLE (
  total          bigint,
  latest_title   text,
  latest_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  WITH window_rows AS (
    SELECT id, content_summary, created_at
    FROM nervous_system.ledger
    WHERE source_type = 'elder_decision'
      AND created_at >= now() - interval '7 days'
  ),
  latest AS (
    SELECT content_summary, created_at
    FROM window_rows
    ORDER BY created_at DESC
    LIMIT 1
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM window_rows)              AS total,
    (SELECT content_summary FROM latest)                    AS latest_title,
    (SELECT created_at      FROM latest)                    AS latest_at;
$$;

GRANT EXECUTE ON FUNCTION public.ns_now_decisions_7d() TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ns_now_llm_spend_current_period
--    Used by: Now.tsx sidebar "Agent LLM spend"
--    Aggregates nervous_system.agents.budget jsonb across active agents.
--    Cites budget jsonb shape: {limit_usd_per_period, current_spent_usd, period_days}.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ns_now_llm_spend_current_period()
RETURNS TABLE (
  spent_usd     numeric,
  limit_usd     numeric,
  period_days   int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT
    COALESCE(SUM((budget->>'current_spent_usd')::numeric), 0)            AS spent_usd,
    COALESCE(SUM((budget->>'limit_usd_per_period')::numeric), 0)         AS limit_usd,
    MAX((budget->>'period_days')::int)                                   AS period_days
  FROM nervous_system.agents
  WHERE active = true
    AND budget IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.ns_now_llm_spend_current_period() TO authenticated, anon, service_role;
