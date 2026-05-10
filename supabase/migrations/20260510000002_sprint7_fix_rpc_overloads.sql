-- Sprint 7 Stream C — Fix RPC overload conflicts
-- Rule 3 auto-fix: two overloads of ns_list_audit_log + stale ns_decay_heatmap
-- block execution. Drop old signatures before recreating with unified interface.
-- This is a FUNCTION drop only — no data or table changes.

-- ─── Drop old ns_list_audit_log overload (no p_actor_id, no p_offset) ─────────
DROP FUNCTION IF EXISTS public.ns_list_audit_log(
  p_table_name text,
  p_action     text,
  p_since      timestamptz,
  p_until      timestamptz,
  p_limit      int
);

-- ─── Drop old ns_decay_heatmap if return type is mismatched ───────────────────
DROP FUNCTION IF EXISTS public.ns_decay_heatmap(int);

-- ─── Recreate ns_list_audit_log (unified, with p_actor_id + p_offset) ─────────
-- audit_log verified columns: id, table_name, action, actor_id (uuid), payload (jsonb), created_at

CREATE OR REPLACE FUNCTION public.ns_list_audit_log(
  p_actor_id   uuid    DEFAULT NULL,
  p_table_name text    DEFAULT NULL,
  p_action     text    DEFAULT NULL,
  p_since      timestamptz DEFAULT NULL,
  p_until      timestamptz DEFAULT NULL,
  p_limit      int     DEFAULT 100,
  p_offset     int     DEFAULT 0
)
RETURNS TABLE (
  id         uuid,
  table_name text,
  action     text,
  actor_id   uuid,
  payload    jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.id,
    al.table_name,
    al.action,
    al.actor_id,
    al.payload,
    al.created_at
  FROM nervous_system.audit_log al
  WHERE (p_actor_id   IS NULL OR al.actor_id   = p_actor_id)
    AND (p_table_name IS NULL OR al.table_name = p_table_name)
    AND (p_action     IS NULL OR al.action     = p_action)
    AND (p_since      IS NULL OR al.created_at >= p_since)
    AND (p_until      IS NULL OR al.created_at <= p_until)
  ORDER BY al.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ─── Recreate ns_decay_heatmap with correct return type ───────────────────────
-- signals verified columns: topic (text), strength (float8/double precision),
--   last_touched (timestamptz), ttl_days (int), status (text)

CREATE OR REPLACE FUNCTION public.ns_decay_heatmap(p_limit int DEFAULT 50)
RETURNS TABLE (
  topic            text,
  signal_count     bigint,
  avg_strength     double precision,
  last_touched     timestamptz,
  stalest_ttl_days int
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.topic,
    count(*)::bigint                 AS signal_count,
    avg(s.strength)::double precision AS avg_strength,
    max(s.last_touched)              AS last_touched,
    min(s.ttl_days)                  AS stalest_ttl_days
  FROM nervous_system.signals s
  WHERE s.status = 'active'
  GROUP BY s.topic
  ORDER BY avg(s.strength) DESC
  LIMIT p_limit;
END;
$$;
