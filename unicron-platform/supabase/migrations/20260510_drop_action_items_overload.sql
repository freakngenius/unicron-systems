-- Drop old single-param overload of ns_list_action_items that causes PGRST203.
--
-- When PR #268 added the v3 signature (p_dri_id, p_status, p_limit), the old
-- (p_limit integer) overload was never dropped. PostgREST returned PGRST203
-- ("Could not find a unique function") for any call with only p_limit because
-- both signatures matched, making ActionItems.tsx fail at load time.
--
-- Applied directly to DB at version 20260510170607 via Supabase MCP.
DROP FUNCTION IF EXISTS public.ns_list_action_items(integer);

NOTIFY pgrst, 'reload schema';
