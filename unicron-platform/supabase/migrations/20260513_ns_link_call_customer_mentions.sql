-- 20260513_ns_link_call_customer_mentions.sql — Bug Fix: Call upload fan-out
--
-- Goal #4 requires writes to nervous_system.customer_mentions. No such table
-- exists. Per architectural precedent (ledger.customer_id FK + ledger.insights
-- JSONB), this migration adds an RPC that:
--   1. Receives a JSONB array of extracted mentions: [{name, quote, confidence}]
--   2. Resolves each name case-insensitively against nervous_system.customers.
--   3. Updates the parent call's ledger row: insights.mentioned_customers gets
--      the resolved-mention array; ledger.customer_id is set to the dominant
--      matched customer (the one with the most mentions; ties broken by first
--      occurrence).
--   4. Writes an audit_log row capturing the link.
--
-- Returns a JSONB object the caller can render in the upload modal:
--   { resolved: [...], unresolved: [...], dominant_customer_id: uuid|null,
--     dominant_customer_name: text|null, count_resolved: int, count_unresolved: int }
--
-- Additive only.

CREATE OR REPLACE FUNCTION public.ns_link_call_customer_mentions(
  p_call_ledger_id  uuid,
  p_mentions        jsonb,           -- [{name, quote, confidence}]
  p_uploaded_by     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  v_resolved          jsonb := '[]'::jsonb;
  v_unresolved        jsonb := '[]'::jsonb;
  v_dominant_id       uuid;
  v_dominant_name     text;
  v_existing_insights jsonb;
BEGIN
  IF p_mentions IS NULL OR jsonb_typeof(p_mentions) <> 'array' OR jsonb_array_length(p_mentions) = 0 THEN
    RETURN jsonb_build_object(
      'resolved',               '[]'::jsonb,
      'unresolved',             '[]'::jsonb,
      'dominant_customer_id',   NULL,
      'dominant_customer_name', NULL,
      'count_resolved',         0,
      'count_unresolved',       0
    );
  END IF;

  -- Resolve mentions to customer rows.
  WITH input AS (
    SELECT
      ord,
      lower(trim(m->>'name'))      AS lname,
      trim(m->>'name')             AS raw_name,
      m->>'quote'                  AS quote,
      (m->>'confidence')::float    AS confidence
    FROM jsonb_array_elements(p_mentions) WITH ORDINALITY AS m(m, ord)
    WHERE m ? 'name' AND length(trim(m->>'name')) > 0
  ),
  matched AS (
    SELECT
      i.ord, i.raw_name, i.lname, i.quote, i.confidence,
      c.id   AS customer_id,
      c.name AS customer_name
    FROM input i
    LEFT JOIN nervous_system.customers c
      ON lower(c.name) = i.lname
  ),
  agg AS (
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'name',          raw_name,
            'customer_id',   customer_id,
            'customer_name', customer_name,
            'quote',         quote,
            'confidence',    confidence
          )
          ORDER BY ord
        ) FILTER (WHERE customer_id IS NOT NULL),
        '[]'::jsonb
      ) AS resolved,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'name',       raw_name,
            'quote',      quote,
            'confidence', confidence
          )
          ORDER BY ord
        ) FILTER (WHERE customer_id IS NULL),
        '[]'::jsonb
      ) AS unresolved
    FROM matched
  )
  SELECT resolved, unresolved INTO v_resolved, v_unresolved FROM agg;

  -- Pick the dominant resolved customer (most mentions; ties → first by ord).
  SELECT customer_id, customer_name
    INTO v_dominant_id, v_dominant_name
  FROM (
    SELECT
      lower(trim(m->>'name')) AS lname,
      MIN(ord)                AS first_ord,
      COUNT(*)                AS n
    FROM jsonb_array_elements(p_mentions) WITH ORDINALITY AS m(m, ord)
    WHERE m ? 'name' AND length(trim(m->>'name')) > 0
    GROUP BY lower(trim(m->>'name'))
  ) freq
  JOIN nervous_system.customers c ON lower(c.name) = freq.lname
  ORDER BY freq.n DESC, freq.first_ord ASC
  LIMIT 1;

  -- Patch the parent call's ledger row: append mentioned_customers + set customer_id.
  SELECT insights INTO v_existing_insights
  FROM nervous_system.ledger
  WHERE id = p_call_ledger_id;

  UPDATE nervous_system.ledger
  SET insights    = COALESCE(v_existing_insights, '{}'::jsonb)
                 || jsonb_build_object(
                      'mentioned_customers',         v_resolved,
                      'mentioned_customers_unresolved', v_unresolved
                    ),
      customer_id = COALESCE(customer_id, v_dominant_id)
  WHERE id = p_call_ledger_id;

  INSERT INTO nervous_system.audit_log (
    table_name, action, actor_id, payload
  )
  VALUES (
    'ledger',
    'call_customer_mentions_linked',
    NULL,
    jsonb_build_object(
      'call_ledger_id',         p_call_ledger_id,
      'dominant_customer_id',   v_dominant_id,
      'dominant_customer_name', v_dominant_name,
      'count_resolved',         jsonb_array_length(v_resolved),
      'count_unresolved',       jsonb_array_length(v_unresolved),
      'uploaded_by',            p_uploaded_by
    )
  );

  RETURN jsonb_build_object(
    'resolved',               v_resolved,
    'unresolved',             v_unresolved,
    'dominant_customer_id',   v_dominant_id,
    'dominant_customer_name', v_dominant_name,
    'count_resolved',         jsonb_array_length(v_resolved),
    'count_unresolved',       jsonb_array_length(v_unresolved)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ns_link_call_customer_mentions(uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_link_call_customer_mentions(uuid, jsonb, text)
  TO service_role;
