-- Migration: ns_list_agents RPC
-- Sprint 3 Stream D — exposes nervous_system.agents to the browser via PostgREST.
-- The nervous_system schema is not directly accessible to the anon/authenticated
-- roles via PostgREST (it's a private schema), so we expose a SECURITY DEFINER
-- function in the public schema that can be called via supabase.rpc('ns_list_agents').

CREATE OR REPLACE FUNCTION public.ns_list_agents()
RETURNS TABLE (
  id         uuid,
  name       text,
  archetype  text,
  specialty  text,
  active     boolean,
  budget     jsonb,
  config     jsonb,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT
    id,
    name,
    archetype,
    specialty,
    active,
    budget,
    config,
    created_at
  FROM nervous_system.agents
  ORDER BY archetype, name;
$$;

GRANT EXECUTE ON FUNCTION public.ns_list_agents() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.ns_list_agents() IS
  'Sprint 3: Read-only view of nervous_system.agents for the Atrium System tab.';
