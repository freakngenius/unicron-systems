-- 20260521_ns_count_network_hiring.sql
-- Atrium audit fix item #21: canonicalize `public.ns_count_network_contacts()`
-- and `public.ns_count_hiring_candidates()` as repo migrations. Both RPCs
-- already exist in the live DB (verified 2026-05-21) returning integer; this
-- migration only re-declares them with CREATE OR REPLACE so the schema is
-- reproducible from migrations/ alone. No data changes, no destructive ops.
--
-- People.tsx:46-47 has been calling these for some time; the audit flagged
-- them SYNTHETIC because People.tsx had a stale comment claiming the RPCs
-- "ship later" and the migration file was missing.

CREATE OR REPLACE FUNCTION public.ns_count_network_contacts()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT COUNT(*)::integer FROM nervous_system.network_contacts;
$$;

GRANT EXECUTE ON FUNCTION public.ns_count_network_contacts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ns_count_network_contacts() TO service_role;

CREATE OR REPLACE FUNCTION public.ns_count_hiring_candidates()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT COUNT(*)::integer FROM nervous_system.hiring_candidates;
$$;

GRANT EXECUTE ON FUNCTION public.ns_count_hiring_candidates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ns_count_hiring_candidates() TO service_role;
