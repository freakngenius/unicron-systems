-- 20260511_audit_log_table_name_hotfix.sql
-- Hotfix for the Overnight Sweep V2 (S4a/b/c, S5a/b, S5c migrations).
--
-- nervous_system.audit_log.table_name is NOT NULL. The original
-- ns_money_cash_set RPC (PR #338) inserted without table_name and would
-- fail on every call:
--   ERROR: 23502: null value in column "table_name" of relation "audit_log"
--
-- Live database fixed via Supabase MCP; this migration mirrors the fix
-- into source control. The same NOT NULL trap affects the Inngest
-- functions in lib/agents/{pathfinder-sync,vault-ingest,vault-embeddings}.ts;
-- those are patched in this PR's TypeScript changes.

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

  INSERT INTO nervous_system.audit_log (table_name, action, payload, actor_id)
  VALUES (
    'nervous_system.cash_balance',
    'cash_balance_set',
    jsonb_build_object('balance_usd', p_balance_usd, 'note', p_note),
    auth.uid()
  );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ns_money_cash_set(numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ns_money_cash_set(numeric, text) TO authenticated, service_role;

-- Secondary fix: the original sweep migrations REVOKE'd from PUBLIC but
-- Supabase platform appears to re-grant anon EXECUTE on functions in
-- public schema in some cases. Verified via information_schema.routine_privileges
-- that anon had EXECUTE on ns_money_cash_latest, ns_money_cash_set, and
-- ns_vault_search_by_vector despite the REVOKE FROM PUBLIC in the original
-- migrations. Explicitly revoke from anon here too. Idempotent.

REVOKE EXECUTE ON FUNCTION public.ns_money_cash_latest() FROM anon;
REVOKE EXECUTE ON FUNCTION public.ns_money_cash_set(numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ns_vault_search_by_vector(public.vector(1536), int) FROM anon;
