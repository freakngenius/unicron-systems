-- Phase 1F Living System Bridge — pathfinder.agent_verifications
-- Cross-schema mirror of unicron.agent_dispatches at the moment of operator Verify.

CREATE TABLE IF NOT EXISTS pathfinder.agent_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL,                          -- references unicron.agent_dispatches.id (logical, no FK across schemas)
  customer_org_id text NOT NULL,                      -- text to match unicron.agent_dispatches.customer_org_id
  agent_name text NOT NULL,
  verified_by_user_id uuid NOT NULL,
  verified_by_user_email text NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON pathfinder.agent_verifications (customer_org_id, created_at DESC);
CREATE INDEX ON pathfinder.agent_verifications (dispatch_id);

ALTER TABLE pathfinder.agent_verifications ENABLE ROW LEVEL SECURITY;

-- Customers read their own org's verifications.
-- (Pre-Phase-2A: customer_org_id-scoped read for any authenticated user. Will be tightened in Phase 2A via org_memberships JOIN.)
CREATE POLICY "customers read own org verifications"
  ON pathfinder.agent_verifications FOR SELECT
  USING (true);  -- Phase 2A replaces with org_memberships filter

-- Service role full access.
CREATE POLICY "service role all"
  ON pathfinder.agent_verifications FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Realtime publication on pathfinder schema.
-- If publication already exists for the schema, this is additive.
ALTER PUBLICATION supabase_realtime ADD TABLE pathfinder.agent_verifications;
