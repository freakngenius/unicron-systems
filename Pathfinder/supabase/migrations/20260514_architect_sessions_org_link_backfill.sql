-- SPEC: Company Docs/Metacron/SPEC - Customer Profile Architect History.md
--
-- Backfill pathfinder.architect_sessions.customer_org_id by matching each
-- completed decomposition's business_summary.lead_type to organizations.
-- The customer_org_id column has existed for some time but was never written
-- by the approve/deploy flow, so the 26 historical sessions are orphaned.
-- This migration links what is matchable; going forward the approve flow
-- writes customer_org_id at deploy time.
--
-- Already applied via MCP on 2026-05-14. This file is the canonical record.

UPDATE pathfinder.architect_sessions s
SET customer_org_id = o.customer_org_id
FROM pathfinder.organizations o
WHERE s.customer_org_id IS NULL
  AND s.session_type = 'decomposition'
  AND s.status = 'completed'
  AND s.output_payload IS NOT NULL
  AND s.output_payload->'business_summary'->>'lead_type' IS NOT NULL
  AND s.output_payload->'business_summary'->>'lead_type'
      = o.architecture->'business_summary'->>'lead_type';

CREATE INDEX IF NOT EXISTS architect_sessions_customer_org_created_idx
  ON pathfinder.architect_sessions (customer_org_id, created_at DESC)
  WHERE customer_org_id IS NOT NULL;
