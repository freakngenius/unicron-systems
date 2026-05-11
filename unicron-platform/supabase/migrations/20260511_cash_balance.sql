-- 20260511_cash_balance.sql
-- S5b: manual cash-on-hand tracking for the Money tab.
--
-- Append-only log. Each entry records the balance at a point in time
-- (manual entry by an operator, or written by the future Plaid sync).
-- nervous_system.cash_balance keeps the full history; ns_money_cash_latest
-- returns the most recent row.

CREATE TABLE IF NOT EXISTS nervous_system.cash_balance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  balance_usd  numeric(14, 2) NOT NULL,
  source       text NOT NULL DEFAULT 'manual',
  recorded_by  uuid REFERENCES auth.users(id),
  note         text,
  observed_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cash_balance_observed_at_idx
  ON nervous_system.cash_balance (observed_at DESC);

ALTER TABLE nervous_system.cash_balance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_balance_authenticated_read ON nervous_system.cash_balance;
CREATE POLICY cash_balance_authenticated_read
  ON nervous_system.cash_balance
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS cash_balance_service_role_write ON nervous_system.cash_balance;
CREATE POLICY cash_balance_service_role_write
  ON nervous_system.cash_balance
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.ns_money_cash_latest()
RETURNS TABLE (
  balance_usd numeric,
  source      text,
  note        text,
  observed_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT balance_usd, source, note, observed_at
  FROM nervous_system.cash_balance
  ORDER BY observed_at DESC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.ns_money_cash_latest() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ns_money_cash_latest() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ns_money_cash_set(
  p_balance_usd numeric,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_balance_usd IS NULL OR p_balance_usd < 0 THEN
    RAISE EXCEPTION 'balance must be non-null and non-negative';
  END IF;

  INSERT INTO nervous_system.cash_balance (balance_usd, source, recorded_by, note)
  VALUES (p_balance_usd, 'manual', auth.uid(), p_note)
  RETURNING id INTO v_id;

  INSERT INTO nervous_system.audit_log (action, payload, actor_id)
  VALUES (
    'cash_balance_set',
    jsonb_build_object('balance_usd', p_balance_usd, 'note', p_note),
    auth.uid()
  );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ns_money_cash_set(numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ns_money_cash_set(numeric, text) TO authenticated, service_role;
