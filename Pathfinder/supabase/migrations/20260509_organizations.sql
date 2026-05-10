-- Migration: pathfinder.organizations
-- Spec: MEMORY/operator-todos/2026-05-04-pathfinder-needs-organizations-schema.md
-- Purpose: Durable org store for multi-tenant Pathfinder. Absorbs peer-owned
-- work per conductor authorization 2026-05-09 (unblocks Metacron Phase 2A-2E).

CREATE TABLE IF NOT EXISTS pathfinder.organizations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  slug            text        NOT NULL UNIQUE,
  architecture    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  customer_org_id text        NOT NULL UNIQUE,
  created_by_user_id uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organizations_slug_idx          ON pathfinder.organizations (slug);
CREATE INDEX IF NOT EXISTS organizations_customer_org_id_idx ON pathfinder.organizations (customer_org_id);

-- RLS: service_role bypasses automatically; anon + authenticated denied by default.
ALTER TABLE pathfinder.organizations ENABLE ROW LEVEL SECURITY;

-- Seed Zedcor as the canonical first org.
INSERT INTO pathfinder.organizations (name, slug, customer_org_id, architecture)
VALUES ('Zedcor', 'zedcor', 'zedcor', '{}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
