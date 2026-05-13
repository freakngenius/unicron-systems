# PLAN — drop legacy permissive RLS policies (full sweep, 37 tables)

## Card

Metacron kanban canonical: "BUG: lingering qual=true RLS policies on projects / agent_log / data_sources (anon-readable)" (page id `35d785c67e7281d69588d1d0b281982e`).

Original card named 3 tables. Two scope expansions during execution, both Kyle-authorized in real time:

1. First re-probe found **10 tables** with the legacy `<table>_read`/`<table>_write` qual=true pattern. Migration `20260512_drop_legacy_permissive_rls.sql` shipped to cover all 10. Applied to prod 2026-05-12.
2. Post-apply wider sweep across `pathfinder.*` found **27 more tables** with the same pattern OR with misleadingly-named single permissive policies (`*_admin`, `*_service_only`, `*_service_role_all`, etc.) that also carried `qual=true`. Migration `20260513_drop_legacy_permissive_rls_full_sweep.sql` ships in this same PR to close them.

End state target: **zero `pathfinder.*` tables with any `qual=true` permissive policy.** Verified.

## Total tables touched (37)

**Group A — `<table>_read` + `<table>_write` legacy pattern (24 tables):**
projects, agent_log, data_sources, agent_runs, llm_calls, customers, branches, architect_sessions, architect_proposals, agent_verifications, adjacent_targets, architect_inbox, coverage_goal_candidates, coverage_goals, deal_activities, deals, email_threads, lead_actions, lead_contacts, lead_cross_pollination, national_accounts, outreach_edits, zedcor_branches, zedcor_customer_sites

**Group B — misleadingly-named single permissive qual=true policies (13 tables):**
agent_prompt_versions (`apv_service_role_all`), call_next_actions (`cna_service_role_all`), call_quality_scores (`cqs_service_role_all`), customer_call_memory_packs (`ccmp_service_role_all`), email_integrations (`email_integrations_service_only`), procurement_pull_configs (`proc_configs_all`), signals (`signals_service_role_all`), slack_branch_routes (`slack_branch_routes_admin`), slack_messages (`slack_messages_admin`), slack_workspaces (`slack_workspaces_admin`), source_adapters (`source_adapters_write`), voice_agent_sources (`vas_read_all`), voice_call_attempts (`voice_attempts_all`)

`outreach_drafts`, `briefings`, `chat_threads`, `chat_messages`, `project_contacts`, `org_geo_config`, `user_connections`, `organizations`, `org_memberships`, `operator_allowlist`, `slack_daily_digest`, `lead_feedback`, `lead_hubspot_deals`, `lead_hubspot_contacts`, `voice_call_transcripts`, `customer_call_extractions` — already clean (or operator-only) per pre-flight pg_policies sweep.

## Why dropping group B is non-breaking

The policy names suggest service-role-only intent, but their `qual=true` was a bug — it granted SELECT/ALL to anon and any authenticated caller, not just service role. In Supabase the `service_role` JWT has `bypassrls = true` on the Postgres role, so Inngest jobs, Vercel crons, and agent dispatch continue to read/write these tables after the qual=true policy drops. The operator-gated `operators_read_all` / `operators_write_all` policies added in their place are what was needed for the operator UI.

`agent_verifications` keeps its existing `service role all` policy (qual is `(auth.jwt() ->> 'role') = 'service_role'` — correctly scoped, not qual=true) untouched.

## Migrations (both applied to prod, both checked in)

- `Pathfinder/supabase/migrations/20260512_drop_legacy_permissive_rls.sql` — first 10 tables. Applied 2026-05-12.
- `Pathfinder/supabase/migrations/20260513_drop_legacy_permissive_rls_full_sweep.sql` — remaining 27 tables. Applied 2026-05-13.

## Verification (probed against live db post-apply)

```sql
SELECT count(*) FROM pg_policies
WHERE schemaname='pathfinder' AND permissive='PERMISSIVE' AND qual::text='true';
-- Returns: 0
```

Per-table read+write policy count probe returns 2 for each fixed table (3 for `agent_verifications` due to retained `service role all`).

## Standing rule (Kyle directive, 2026-05-13)

RLS leak findings during an active RLS-fix card do NOT count as hard halt. Expand scope automatically. Halt only if a leak is found AFTER a fix migration applied — that would mean the fix didn't work. This card honors the rule: every probe finding during the active card was expanded into the same PR.

## Out of scope (deferred to follow-up cards)

- `nervous_system.*` qual=true policies (separate schema, separate card if needed)
- The 4 RLS-disabled tables (`artifact_templates`, `voice_call_artifacts`, `nervous_system.taboo_rules`, `nervous_system.calendar_events`) — separate Bug Fix card already filed
- The two duplicate kanban cards on the same RLS-gap topic — archive after merge

## Auto-merge

Pre-auth window. On CI green + multi-Vercel green + /codex pass:
- `gh pr merge --squash` (keep branch)
- Post SHA + ISO timestamp to overnight thread
- Move kanban card to Deployed
