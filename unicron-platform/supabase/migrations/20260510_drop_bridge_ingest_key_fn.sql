-- 20260510_drop_bridge_ingest_key_fn.sql
--
-- Counter-migration: removes the Path B fallback bridge function created
-- during Sprint 4 close-out (2026-05-09). Path A (Supabase Exposed schemas
-- + project restart) was chosen; this function is dead code with no callers.

DROP FUNCTION IF EXISTS public.lookup_team_member_by_ingest_key(text);
