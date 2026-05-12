-- =============================================================================
-- 20260512_voice_allowlist_rpc.sql
--
-- Hotfix for Prompt 02 cutover. voiceAuth.ts called
-- `supabase.schema('metacron').from('operator_allowlist')`, which fails with
-- "allowlist lookup failed" because PostgREST does not expose the metacron
-- schema (only schemas listed in Supabase API → Exposed schemas are reachable
-- via the JS client's `.schema()` selector).
--
-- Matching Atrium's existing pattern (every nervous_system.* read goes through
-- a public.ns_* SECURITY DEFINER RPC), we expose the allowlist check as a
-- public RPC keyed on email. The function runs with the table-owner's
-- privileges, so RLS on metacron.operator_allowlist stays anon-impervious.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_voice_operator(p_email text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, metacron
AS $$
  SELECT role
  FROM metacron.operator_allowlist
  WHERE lower(email) = lower(p_email)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.check_voice_operator(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_voice_operator(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.check_voice_operator(text) IS
  'Returns the role (founder/advisor/team) of the email on metacron.operator_allowlist, or NULL if not present. SECURITY DEFINER so voiceAuth.ts can check the allowlist without metacron being a PostgREST-exposed schema. Called from api/_lib/voiceAuth.ts after Bearer JWT verification.';
