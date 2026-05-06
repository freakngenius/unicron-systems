-- Sprint 1 Stream B: Add customers table to nervous_system schema
-- Schema: nervous_system
-- Idempotent: CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, ON CONFLICT DO NOTHING

-- ─── nervous_system.customers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nervous_system.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'cold' check (status in ('cold','discovery','proposal','contract','onboarding','active','churned')),
  primary_contact_team_member_id uuid references nervous_system.team_members(id),
  notes text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  last_touched timestamptz default now(),
  ttl_days integer default 365
);

ALTER TABLE nervous_system.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ns customers read all" ON nervous_system.customers;
CREATE POLICY "ns customers read all" ON nervous_system.customers
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ns customers write" ON nervous_system.customers;
CREATE POLICY "ns customers write" ON nervous_system.customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add customer_id FK to ledger and action_items
ALTER TABLE nervous_system.ledger ADD COLUMN IF NOT EXISTS customer_id uuid references nervous_system.customers(id);
ALTER TABLE nervous_system.action_items ADD COLUMN IF NOT EXISTS customer_id uuid references nervous_system.customers(id);

-- Seed Zedcor (customer-zero for Pathfinder)
-- Kyle's team_member ID: 6f71b432-4e21-436b-ab02-b301d29e2c63
INSERT INTO nervous_system.customers (name, status, primary_contact_team_member_id, notes)
VALUES (
  'Zedcor',
  'active',
  '6f71b432-4e21-436b-ab02-b301d29e2c63',
  'Mobile solar surveillance towers; ~24 branches; construction security. Customer-zero for Pathfinder.'
) ON CONFLICT DO NOTHING;
