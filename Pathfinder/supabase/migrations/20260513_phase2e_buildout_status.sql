-- Build-Out Pass Slices 3+5 — extend org status state machine for verification.
-- Spec: Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md §3 + §5.
--
-- Adds two new terminal states to pathfinder.organizations.status:
--   build_out_complete — verifyBuildOut Inngest function confirmed the
--                        /[slug] route renders KPI strip, ≥3 lead cards
--                        (or data-empty-state), ≥1 chart, no data-error.
--   build_out_failed   — verification failed; build_out_diagnostic jsonb
--                        captures the failure reason for operator surfacing.
--
-- Also adds the diagnostic column itself, jsonb null. Shape:
--   { reason: 'missing_kpi_strip' | 'too_few_lead_cards' | 'http_401'
--           | 'http_5xx' | 'no_charts' | 'data_error_marker',
--     html_snippet?: string,  -- truncated to first 500 chars
--     http_status?: number }
--
-- Pure additive. CHECK constraint is dropped + re-created with the
-- expanded value set (existing rows are unaffected). Pre-auth migration
-- window confirmed open at apply time (pre-7am Pacific 2026-05-13).

-- 1. Extend the status CHECK constraint.
--    Drop + re-add is the repo convention; ALTER CONSTRAINT cannot
--    extend an IN-list in Postgres.

ALTER TABLE pathfinder.organizations
  DROP CONSTRAINT IF EXISTS organizations_status_check;

ALTER TABLE pathfinder.organizations
  ADD CONSTRAINT organizations_status_check
    CHECK (status IN (
      'setting_up',
      'first_run',
      'ranking',
      'awaiting_threshold',
      'ready_to_view',
      'operator_viewed',
      'build_out_complete',
      'build_out_failed'
    ));

-- 2. Diagnostic jsonb column — null until verifyBuildOut runs and fails.
--    On pass, verifyBuildOut leaves this null and flips status to
--    build_out_complete. On fail, writes { reason, ... } and flips status
--    to build_out_failed.

ALTER TABLE pathfinder.organizations
  ADD COLUMN IF NOT EXISTS build_out_diagnostic jsonb NULL;

-- Audit row — log the application event for the conductor's evidence
-- chain. actor_id NULL because the migration is applied via Supabase MCP
-- rather than an operator-authed session.

INSERT INTO nervous_system.audit_log
  (table_name, action, actor_id, payload)
VALUES (
  'pathfinder.organizations',
  'migration_applied',
  NULL,
  jsonb_build_object(
    'migration', '20260513_phase2e_buildout_status.sql',
    'change', 'extend status CHECK with build_out_complete + build_out_failed; add build_out_diagnostic jsonb',
    'spec', 'SPEC - Pathfinder Build-Out Pass.md'
  )
);
