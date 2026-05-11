-- Phase 2E foundation — pathfinder.organizations status state machine
-- Spec: Company Docs/Metacron/SPEC - Phase 2E Onboarding Completion Loop.md
--
-- Adds the status column the Onboarding-to-Live state machine needs:
--   setting_up         → org row written by Approve & Deploy, no run yet
--   first_run          → ingestOrgFunction running adapters
--   ranking            → rankAndVerifyOrgFunction in flight
--   awaiting_threshold → first run completed but verified_count < 3
--   ready_to_view      → verified_count >= 3; Open Pathfinder button hot
--   operator_viewed    → first operator render of /[slug] in Pathfinder
--
-- Pre-Phase-2E reality: 2 orgs persisted (Zedcor, Realberry). Both have
-- already been operated against, so they get backfilled to
-- operator_viewed — they did not pass through the state machine but they
-- are not in any of the earlier transient states either. New orgs created
-- via Architect Approve & Deploy will start at setting_up via the
-- DEFAULT.
--
-- Pure additive. No drops. Safe to re-run (IF NOT EXISTS + WHERE guards).
-- Pre-auth migration window confirmed open at apply time.

-- 1. status enum-as-text with CHECK constraint
--    (text + check is the repo's convention; avoids enum migration pain
--    when the state set evolves)

ALTER TABLE pathfinder.organizations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'setting_up';

-- Drop a possible prior partial constraint first (re-runnable).
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
      'operator_viewed'
    ));

-- 2. status_changed_at — last transition timestamp. Lets the UI badge
--    surface "Setting up sources (3m)" / "Below threshold for 2h" copy
--    without a separate state-history table for Phase 2E.

ALTER TABLE pathfinder.organizations
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL
    DEFAULT now();

-- 3. Backfill the two existing production orgs to operator_viewed.
--    They predate the state machine and have already been operated.
--    Guard with WHERE so re-runs after partial application stay idempotent.

UPDATE pathfinder.organizations
  SET status = 'operator_viewed',
      status_changed_at = now()
  WHERE status = 'setting_up'
    AND id IN (
      '6cd87740-7c72-4337-ac79-316a54242eef',  -- Zedcor
      'e1c72f70-0ce6-4e08-af8b-893186b3c546'   -- Realberry
    );

-- 4. Index on status for the Customers tab kanban + Inngest "list orgs
--    in state X" queries.

CREATE INDEX IF NOT EXISTS idx_organizations_status
  ON pathfinder.organizations (status);

CREATE INDEX IF NOT EXISTS idx_organizations_status_changed_at
  ON pathfinder.organizations (status_changed_at DESC);

-- Audit row — log the application event for the conductor's evidence
-- chain. Writes to nervous_system.audit_log (table_name / action /
-- actor_id / payload / created_at). actor_id NULL because the migration
-- is applied via dashboard rather than an operator-authed session.

INSERT INTO nervous_system.audit_log
  (table_name, action, actor_id, payload)
VALUES (
  'pathfinder.organizations',
  'migration_applied',
  NULL,
  jsonb_build_object(
    'migration', '20260511_phase2e_organizations_status.sql',
    'change', 'add status column + state-machine CHECK + status_changed_at + indexes',
    'backfilled_orgs', jsonb_build_array('zedcor', 'realberry-is-a-3-6b')
  )
);
