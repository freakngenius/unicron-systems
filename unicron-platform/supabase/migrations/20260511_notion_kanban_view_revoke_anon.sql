-- 20260511_notion_kanban_view_revoke_anon.sql
-- Hotfix flagged by Codex review of PR #349:
--   public.ns_notion_kanban_view is SECURITY DEFINER and returns internal
--   fields (verify_criteria, implementation_notes, linked_pr_url). The
--   original migration granted EXECUTE to anon, which lets a browser holding
--   only the public anon key dump the mirror without an Atrium session.
--
-- Lock down to authenticated + service_role. Atrium auth gates the surface.

REVOKE EXECUTE ON FUNCTION public.ns_notion_kanban_view(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_notion_kanban_view(text) FROM anon;
