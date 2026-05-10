-- Phase 2A: Operator auth tables
-- Spec: Company Docs/Metacron/SPEC - Phase 2A Multi-tenant Routing & Auth.md
--
-- org_memberships: per-operator org access (future per-org routing; for now all operators see all orgs)
-- operator_allowlist: definitive list of operator emails allowed to authenticate

CREATE TABLE IF NOT EXISTS pathfinder.org_memberships (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES pathfinder.organizations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL,
  email           text        NOT NULL,
  role            text        NOT NULL DEFAULT 'operator' CHECK (role IN ('operator', 'admin')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS org_memberships_org_idx  ON pathfinder.org_memberships (organization_id);
CREATE INDEX IF NOT EXISTS org_memberships_user_idx ON pathfinder.org_memberships (user_id);
ALTER TABLE pathfinder.org_memberships ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pathfinder.operator_allowlist (
  email      text        PRIMARY KEY,
  role       text        NOT NULL DEFAULT 'operator' CHECK (role IN ('operator', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pathfinder.operator_allowlist ENABLE ROW LEVEL SECURITY;

INSERT INTO pathfinder.operator_allowlist (email, role) VALUES
  ('kyle@unicron.systems',  'admin'),
  ('keenan@unicron.systems', 'admin'),
  ('curtis@unicron.systems', 'admin'),
  ('team@unicron.systems',   'operator')
ON CONFLICT (email) DO NOTHING;
