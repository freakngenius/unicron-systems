-- 20260511_atrium_rpc_revoke_public_exec_hotfix.sql
-- Hotfix flagged by Codex review of PR #347:
--   The SECURITY DEFINER write RPCs introduced by
--   20260511_ns_create_action_item_atrium.sql and 20260511_notion_kanban_mirror.sql
--   were granted to specific roles (authenticated, service_role) but PUBLIC
--   EXECUTE was not explicitly revoked. On Supabase deployments where anon
--   inherits the default PUBLIC EXECUTE on new public functions, this allows
--   unauthenticated callers to invoke security-definer writes against
--   nervous_system tables.
--
-- This hotfix mirrors the explicit REVOKE pattern used by the cash_balance
-- and vault migrations (see 20260511_cash_balance.sql lines 56 and 90 for
-- the canonical example).

REVOKE EXECUTE ON FUNCTION public.ns_create_action_item_atrium(
  text, text, uuid, text, text, timestamptz, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_create_action_item_atrium(
  text, text, uuid, text, text, timestamptz, text
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.ns_notion_kanban_upsert(
  text, text, text, text, text, text, text, uuid, text, text, text, text,
  uuid, text, timestamptz, jsonb, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_notion_kanban_upsert(
  text, text, text, text, text, text, text, uuid, text, text, text, text,
  uuid, text, timestamptz, jsonb, text
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ns_notion_kanban_upsert(
  text, text, text, text, text, text, text, uuid, text, text, text, text,
  uuid, text, timestamptz, jsonb, text
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.ns_notion_kanban_mark_pull(text, int, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_notion_kanban_mark_pull(text, int, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ns_notion_kanban_mark_pull(text, int, text) FROM authenticated;
