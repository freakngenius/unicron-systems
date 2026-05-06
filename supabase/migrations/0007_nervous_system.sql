-- Sprint 0: Unicron Nervous System substrate
-- Schema: nervous_system (isolated from existing public.* Pathfinder tables)
-- Reference: SPEC - Unicron Nervous System sections 4.1, 4.2, 5.1-5.5, 18.2, 18.3
-- Idempotent: CREATE ... IF NOT EXISTS throughout; seeding uses ON CONFLICT guards.

-- ─── Schema & extensions ──────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS nervous_system;
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── 4.1 team_members ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nervous_system.team_members (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL,
  email                  text UNIQUE,
  slack_user_id          text,
  github_username        text,
  role                   text CHECK (role IN ('founder', 'cofounder', 'advisor', 'contractor')),
  active                 boolean DEFAULT true,
  joined_at              timestamptz DEFAULT now(),
  default_kanban_surface text CHECK (default_kanban_surface IN ('pathfinder', 'metacron', 'internal', 'sales', 'discovery')),
  reciprocity_hooks      jsonb DEFAULT '{}'::jsonb
);

-- ─── 4.2 agents ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nervous_system.agents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL UNIQUE,
  archetype         text NOT NULL CHECK (archetype IN ('orchestrator', 'analyst', 'elder', 'taboo_keeper', 'specialist')),
  specialty         text,
  config            jsonb,
  active            boolean DEFAULT true,
  budget            jsonb,
  reciprocity_hooks jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz DEFAULT now()
);

-- ─── 5.1 ledger ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nervous_system.ledger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz DEFAULT now(),
  created_by_human uuid REFERENCES nervous_system.team_members(id),
  created_by_agent uuid REFERENCES nervous_system.agents(id),
  source_type      text NOT NULL CHECK (source_type IN (
                     'call', 'slack', 'email', 'voice_memo', 'apple_note',
                     'cowork_session', 'agent_run', 'manual'
                   )),
  source_id        text,
  source_url       text,
  participants     uuid[],
  content_summary  text,
  content_full     text,
  embedding        vector(1536),
  decisions        jsonb DEFAULT '[]'::jsonb,
  action_items     jsonb DEFAULT '[]'::jsonb,
  insights         jsonb DEFAULT '[]'::jsonb,
  strength         float DEFAULT 1.0,
  ttl_days         integer DEFAULT 30,
  last_touched     timestamptz DEFAULT now(),
  status           text DEFAULT 'active' CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS ledger_embedding_idx
  ON nervous_system.ledger USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS ledger_status_idx     ON nervous_system.ledger (status);
CREATE INDEX IF NOT EXISTS ledger_created_at_idx ON nervous_system.ledger (created_at DESC);

-- ─── 5.3 break_off_signals ────────────────────────────────────────────────────
-- Created before action_items; circular FK (source_action_item_id) added after.
CREATE TABLE IF NOT EXISTS nervous_system.break_off_signals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz DEFAULT now(),
  emitted_by            jsonb NOT NULL,
  source_action_item_id uuid,  -- FK wired below after action_items exists
  reason                text NOT NULL,
  proposed_resolution   text,
  routed_to             jsonb,
  status                text DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'reassigned', 'resolved'))
);

-- ─── 5.2 action_items ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nervous_system.action_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz DEFAULT now(),
  ledger_id           uuid REFERENCES nervous_system.ledger(id),
  title               text NOT NULL,
  description         text,
  requested_by        jsonb NOT NULL,
  requested_of        jsonb NOT NULL,
  dri                 uuid REFERENCES nervous_system.team_members(id),
  due_at              timestamptz,
  kanban_card_id      text,
  kanban_workspace    text CHECK (kanban_workspace IN ('pathfinder', 'metacron', 'internal', 'sales')),
  status              text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'blocked', 'broken_off')),
  break_off_reason    text,
  break_off_signal_id uuid REFERENCES nervous_system.break_off_signals(id),
  priority            text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'irreversible')),
  strength            float DEFAULT 1.0,
  ttl_days            integer DEFAULT 90,
  last_touched        timestamptz DEFAULT now()
);

-- Wire circular FK from break_off_signals → action_items (safe; table now exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'nervous_system'
      AND table_name = 'break_off_signals'
      AND constraint_name = 'break_off_signals_source_action_item_id_fkey'
  ) THEN
    ALTER TABLE nervous_system.break_off_signals
      ADD CONSTRAINT break_off_signals_source_action_item_id_fkey
      FOREIGN KEY (source_action_item_id) REFERENCES nervous_system.action_items(id);
  END IF;
END $$;

-- ─── 5.4 signals ──────────────────────────────────────────────────────────────
-- Separate from existing public.signals (Pathfinder pipeline table).
CREATE TABLE IF NOT EXISTS nervous_system.signals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz DEFAULT now(),
  source_agent        uuid REFERENCES nervous_system.agents(id),
  topic               text NOT NULL,
  signal_type         text NOT NULL CHECK (signal_type IN ('FACT', 'QUESTION', 'PATTERN', 'RISK')),
  content             text NOT NULL,
  evidence_ledger_ids uuid[],
  strength            float DEFAULT 1.0,
  ttl_days            integer DEFAULT 30,
  last_touched        timestamptz DEFAULT now(),
  status              text DEFAULT 'active' CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS ns_signals_topic_idx
  ON nervous_system.signals (topic, strength DESC) WHERE status = 'active';

-- ─── 18.3 audit_log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nervous_system.audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  action     text NOT NULL,
  actor_id   uuid,
  payload    jsonb,
  created_at timestamptz DEFAULT now()
);

-- ─── 18.2 Row-level security ──────────────────────────────────────────────────
ALTER TABLE nervous_system.team_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE nervous_system.agents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE nervous_system.ledger            ENABLE ROW LEVEL SECURITY;
ALTER TABLE nervous_system.action_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE nervous_system.signals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE nervous_system.break_off_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE nervous_system.audit_log         ENABLE ROW LEVEL SECURITY;

-- team_members: authenticated read-all; service role writes
DROP POLICY IF EXISTS "ns team_members read all" ON nervous_system.team_members;
CREATE POLICY "ns team_members read all" ON nervous_system.team_members
  FOR SELECT TO authenticated USING (true);

-- agents: authenticated read-all; service role writes
DROP POLICY IF EXISTS "ns agents read all" ON nervous_system.agents;
CREATE POLICY "ns agents read all" ON nervous_system.agents
  FOR SELECT TO authenticated USING (true);

-- ledger: read-all; write own rows (or service role for agent-created rows)
DROP POLICY IF EXISTS "ns ledger read all" ON nervous_system.ledger;
CREATE POLICY "ns ledger read all" ON nervous_system.ledger
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ns ledger insert own" ON nervous_system.ledger;
CREATE POLICY "ns ledger insert own" ON nervous_system.ledger
  FOR INSERT TO authenticated
  WITH CHECK (created_by_human = auth.uid()::uuid OR created_by_human IS NULL);

-- action_items: read-all; write all (DRI assignment handled in app layer)
DROP POLICY IF EXISTS "ns action_items read all" ON nervous_system.action_items;
CREATE POLICY "ns action_items read all" ON nervous_system.action_items
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ns action_items write" ON nervous_system.action_items;
CREATE POLICY "ns action_items write" ON nervous_system.action_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- signals: read-all; write all
DROP POLICY IF EXISTS "ns signals read all" ON nervous_system.signals;
CREATE POLICY "ns signals read all" ON nervous_system.signals
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ns signals write" ON nervous_system.signals;
CREATE POLICY "ns signals write" ON nervous_system.signals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- break_off_signals: read-all; write all
DROP POLICY IF EXISTS "ns break_off_signals read all" ON nervous_system.break_off_signals;
CREATE POLICY "ns break_off_signals read all" ON nervous_system.break_off_signals
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ns break_off_signals write" ON nervous_system.break_off_signals;
CREATE POLICY "ns break_off_signals write" ON nervous_system.break_off_signals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- audit_log: read for authenticated; service role writes
DROP POLICY IF EXISTS "ns audit_log read" ON nervous_system.audit_log;
CREATE POLICY "ns audit_log read" ON nervous_system.audit_log
  FOR SELECT TO authenticated USING (true);

-- ─── 5.5 semantic_search RPC ──────────────────────────────────────────────────
-- Accepts a pre-computed embedding vector. Sprint 1 adds an embedding trigger
-- so callers can pass query_text; this Sprint 0 stub is callable with a vector.
CREATE OR REPLACE FUNCTION nervous_system.semantic_search(
  query_embedding vector(1536),
  result_limit    integer DEFAULT 10
)
RETURNS TABLE (
  id              uuid,
  created_at      timestamptz,
  source_type     text,
  content_summary text,
  content_full    text,
  strength        float,
  similarity      float
)
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT
    l.id,
    l.created_at,
    l.source_type,
    l.content_summary,
    l.content_full,
    l.strength,
    1 - (l.embedding <=> query_embedding) AS similarity
  FROM nervous_system.ledger l
  WHERE l.status = 'active' AND l.embedding IS NOT NULL
  ORDER BY l.embedding <=> query_embedding
  LIMIT result_limit;
$$;

-- ─── Task 9: Seed team_members ─────────────────────────────────────────────────
INSERT INTO nervous_system.team_members (name, email, role, default_kanban_surface, active, reciprocity_hooks)
VALUES
  (
    'Kyle Kesterson',
    'kyle@freakngenius.com',
    'founder',
    'pathfinder',
    true,
    '{"contributor_share_pct": 0, "share_target": null, "share_basis": null, "active": false}'
  ),
  (
    'Keenan Hock',
    null,
    'cofounder',
    'discovery',
    true,
    '{"contributor_share_pct": 0, "share_target": null, "share_basis": null, "active": false}'
  ),
  (
    'Curtis Smith',
    null,
    'advisor',
    'discovery',
    true,
    '{"contributor_share_pct": 0, "share_target": null, "share_basis": null, "active": false}'
  )
ON CONFLICT (email) DO NOTHING;

-- ─── Task 9: Seed agents ───────────────────────────────────────────────────────
INSERT INTO nervous_system.agents (name, archetype, active, budget, reciprocity_hooks)
VALUES
  (
    'Orchestrator',
    'orchestrator',
    false,
    '{"limit_usd_per_period": 50, "period_days": 7, "current_spent_usd": 0, "resets_at": "2026-05-13T00:00:00Z"}',
    '{"contributor_share_pct": 0, "share_target": null, "share_basis": null, "active": false}'
  ),
  (
    'Analyst',
    'analyst',
    false,
    '{"limit_usd_per_period": 50, "period_days": 7, "current_spent_usd": 0, "resets_at": "2026-05-13T00:00:00Z"}',
    '{"contributor_share_pct": 0, "share_target": null, "share_basis": null, "active": false}'
  ),
  (
    'Elder',
    'elder',
    true,
    '{"limit_usd_per_period": 10, "period_days": 7, "current_spent_usd": 0, "resets_at": "2026-05-13T00:00:00Z"}',
    '{"contributor_share_pct": 0, "share_target": null, "share_basis": null, "active": false}'
  ),
  (
    'Taboo Keeper',
    'taboo_keeper',
    true,
    '{"limit_usd_per_period": 10, "period_days": 7, "current_spent_usd": 0, "resets_at": "2026-05-13T00:00:00Z"}',
    '{"contributor_share_pct": 0, "share_target": null, "share_basis": null, "active": false}'
  )
ON CONFLICT (name) DO NOTHING;
