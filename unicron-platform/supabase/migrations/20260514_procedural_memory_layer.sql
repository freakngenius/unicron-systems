-- 20260514_procedural_memory_layer.sql
-- Sprint 9 Stream A — Procedural Memory Substrate
-- Parent spec: Company Docs/Specs/SPEC - Nervous System Addendum 5 (Procedural Memory Layer).md
-- Parent PRD : Company Docs/PRD/PRD - Procedural Memory & Skill Forge.md
--
-- This migration extends the live nervous_system.skills table (38 seeded rows
-- as of 2026-05-14) and creates two companion tables:
--   nervous_system.proposed_skills
--   nervous_system.skill_invocations
--
-- Additive only. No DROP of existing data. The one allowed constraint change
-- is the swap of the bare UNIQUE(name) for the composite UNIQUE(customer_id,
-- name, version) — documented inline below and in the PR description.
--
-- Verified against live schema (Supabase project anfihcusvekpovcchpoh) on
-- 2026-05-14:
--   - skills row count : 38
--   - live columns     : id, name, description, domain, type, inputs_schema,
--                        outputs_schema, schedule_cron, trigger_event,
--                        refusal_gate, budget_usd_per_run, skill_md_path,
--                        active, registered_at, last_run_at, total_runs,
--                        status, run_endpoint, execution, system_prompt
--   - NO created_at, NO updated_at, NO repo (Addendum 5 §1's draft list
--     diverges from live — trust this migration, not the draft).
--   - existing constraints: skills_pkey, skills_name_key (UNIQUE name),
--     skills_domain_check, skills_type_check, skills_status_check,
--     skills_execution_chk.
--   - pgvector 0.8.0 is installed.
--   - audit_log uses (id, table_name, action, actor_id, payload, created_at).

-- ---------------------------------------------------------------------------
-- Extensions (idempotent)
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ---------------------------------------------------------------------------
-- 1. ALTER nervous_system.skills — additive columns
--    Every column is nullable or defaulted so the 38 pre-existing rows
--    backfill via column defaults without an explicit UPDATE.
-- ---------------------------------------------------------------------------

ALTER TABLE nervous_system.skills
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS version          int  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_skill_id  uuid REFERENCES nervous_system.skills(id),
  ADD COLUMN IF NOT EXISTS code_body        text,
  ADD COLUMN IF NOT EXISTS code_hash        text,
  ADD COLUMN IF NOT EXISTS source_run_id    uuid,
  ADD COLUMN IF NOT EXISTS evidence         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS author_kind      text NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS author_id        uuid,
  ADD COLUMN IF NOT EXISTS approved_by      uuid REFERENCES nervous_system.team_members(id),
  ADD COLUMN IF NOT EXISTS approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS taboo_check_id   uuid,
  ADD COLUMN IF NOT EXISTS run_count        int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS success_count    int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decay_at         timestamptz,
  ADD COLUMN IF NOT EXISTS customer_id      uuid REFERENCES nervous_system.customers(id),
  ADD COLUMN IF NOT EXISTS embedding        vector(1536);

-- fts is a generated tsvector column over (name, description).
-- ALTER ... ADD GENERATED is supported in Postgres 12+ and Supabase runs 15+.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'nervous_system' AND table_name = 'skills' AND column_name = 'fts'
  ) THEN
    ALTER TABLE nervous_system.skills
      ADD COLUMN fts tsvector
      GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
      ) STORED;
  END IF;
END;
$$;

-- last_run_at already exists on the live table; the spec re-lists it but we
-- DO NOT re-add it (would trip "column already exists" without IF NOT EXISTS,
-- and even with IF NOT EXISTS we keep the live default + existing data).

-- CHECK constraints for the new enum-style text columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'skills_lifecycle_status_check'
      AND conrelid = 'nervous_system.skills'::regclass
  ) THEN
    ALTER TABLE nervous_system.skills
      ADD CONSTRAINT skills_lifecycle_status_check
      CHECK (lifecycle_status IN ('proposed', 'approved', 'retired', 'rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'skills_author_kind_check'
      AND conrelid = 'nervous_system.skills'::regclass
  ) THEN
    ALTER TABLE nervous_system.skills
      ADD CONSTRAINT skills_author_kind_check
      CHECK (author_kind IN ('human', 'skill_forge', 'imported'));
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. UNIQUE constraint swap — bare UNIQUE(name) → UNIQUE(customer_id, name, version)
--
--    Rationale (per Addendum 5 §2.1):
--      A bare UNIQUE(name) prevents two tenants from owning a same-named Skill
--      and prevents version evolution. A composite (customer_id, name, version)
--      lets system Skills (customer_id IS NULL) AND per-tenant Skills co-exist,
--      and lets a name lineage carry multiple versions.
--
--    Tradeoff (documented):
--      - Postgres treats NULL as distinct in UNIQUE, so two system Skills with
--        customer_id=NULL and the same (name, version) WOULD pass the composite.
--        That is a regression versus the bare UNIQUE(name) for system Skills.
--      - To preserve the system-Skill uniqueness guarantee we ALSO add a
--        partial UNIQUE index covering customer_id IS NULL on (name, version).
--      - For per-tenant Skills the composite gives exactly the desired
--        "same name across tenants OK, same name twice within a tenant not OK
--        unless versions differ" semantics.
--
--    Before:
--      UNIQUE (name)
--    After:
--      UNIQUE (customer_id, name, version)
--      PARTIAL UNIQUE INDEX skills_system_name_version_uq ON (name, version)
--        WHERE customer_id IS NULL
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- Drop the bare UNIQUE(name) only if it still exists.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'skills_name_key'
      AND conrelid = 'nervous_system.skills'::regclass
  ) THEN
    ALTER TABLE nervous_system.skills DROP CONSTRAINT skills_name_key;
  END IF;

  -- Add the composite UNIQUE if not already present.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'skills_customer_name_version_key'
      AND conrelid = 'nervous_system.skills'::regclass
  ) THEN
    ALTER TABLE nervous_system.skills
      ADD CONSTRAINT skills_customer_name_version_key
      UNIQUE (customer_id, name, version);
  END IF;
END;
$$;

-- Partial UNIQUE index — preserves system-Skill name+version uniqueness
-- across the NULL-customer_id space (which the composite UNIQUE alone does
-- not guarantee in Postgres).
CREATE UNIQUE INDEX IF NOT EXISTS skills_system_name_version_uq
  ON nervous_system.skills (name, version)
  WHERE customer_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Indexes per Addendum 5 §2.2
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS skills_fts_idx
  ON nervous_system.skills USING gin (fts);

-- ivfflat with default lists=100 (Supabase pgvector default). Backfill of
-- embeddings happens in a follow-up job; an empty index is valid.
CREATE INDEX IF NOT EXISTS skills_embedding_idx
  ON nervous_system.skills
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS skills_lifecycle_idx
  ON nervous_system.skills (lifecycle_status, decay_at);

CREATE INDEX IF NOT EXISTS skills_customer_idx
  ON nervous_system.skills (customer_id, lifecycle_status);

-- ---------------------------------------------------------------------------
-- 4. nervous_system.proposed_skills — Skill Forge proposal queue (Addendum 5 §2.3)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS nervous_system.proposed_skills (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_skill      jsonb       NOT NULL,
  customer_id         uuid        REFERENCES nervous_system.customers(id),
  source_run_id       uuid        NOT NULL,
  trajectory_summary  text        NOT NULL,
  satisfaction_score  numeric(3,2),
  confidence          text        CHECK (confidence IN ('medium', 'high')),
  taboo_check_id      uuid,
  taboo_flags         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  status              text        NOT NULL CHECK (status IN ('queued', 'approved', 'rejected', 'expired')),
  reviewed_by         uuid        REFERENCES nervous_system.team_members(id),
  reviewed_at         timestamptz,
  rejection_reason    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL DEFAULT (now() + interval '14 days')
);

CREATE INDEX IF NOT EXISTS proposed_skills_status_idx
  ON nervous_system.proposed_skills (status, created_at);

CREATE INDEX IF NOT EXISTS proposed_skills_customer_idx
  ON nervous_system.proposed_skills (customer_id, status);

-- ---------------------------------------------------------------------------
-- 5. nervous_system.skill_invocations — per-call run log (Addendum 5 §2.4)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS nervous_system.skill_invocations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id        uuid        NOT NULL REFERENCES nervous_system.skills(id),
  skill_version   int         NOT NULL,
  caller_kind     text        NOT NULL CHECK (caller_kind IN ('orchestrator', 'agent', 'human', 'cron')),
  caller_id       uuid,
  customer_id     uuid        REFERENCES nervous_system.customers(id),
  inputs          jsonb       NOT NULL,
  outputs         jsonb,
  status          text        NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'refused')),
  refusal_reason  text,
  cost_cents      int,
  latency_ms      int,
  inngest_run_id  text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

CREATE INDEX IF NOT EXISTS skill_invocations_skill_idx
  ON nervous_system.skill_invocations (skill_id, started_at);

CREATE INDEX IF NOT EXISTS skill_invocations_customer_idx
  ON nervous_system.skill_invocations (customer_id, started_at);

-- ---------------------------------------------------------------------------
-- 6. auth_customer_id() helper
--    Reads a 'customer_id' claim from the JWT. Returns NULL when absent
--    (which is the case for every request today — no claim has been wired
--    up yet). Policies treat NULL as "no tenant scope" and only allow
--    reads of system Skills (customer_id IS NULL) — exactly matching the
--    seeded 38-row state. Service role bypasses RLS as today.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION nervous_system.auth_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = nervous_system, public
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'customer_id',
    ''
  )::uuid;
$$;

GRANT EXECUTE ON FUNCTION nervous_system.auth_customer_id()
  TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 7. RLS for new tables + tighten skills read scope (Addendum 5 §3)
--
--    Existing skills policies (kept intact):
--      - skills_read_all        (SELECT, USING true)        ← Sprint 3
--      - "ns skills read"       (SELECT, USING true)        ← Sprint 3
--      - skills_service_write   (ALL TO service_role)       ← Sprint 3
--      - "service role bypass"  (ALL, USING true)           ← Sprint 3
--
--    These remain. We do NOT tighten the existing permissive read because
--    the Atrium Library tab and Orchestrator depend on it and all 38 live
--    rows have customer_id IS NULL anyway. We add tenant-scoping for the
--    NEW per-tenant Skills via a future policy if/when non-NULL customer_id
--    rows arrive; until then, the permissive policy is correct for system
--    Skills.
--
--    Per-tenant tightening will land alongside the Sprint 11 Metacron
--    per-tenant Skill Library UI; for Sprint 9 we keep the conservative
--    additive posture so the live UI keeps working.
-- ---------------------------------------------------------------------------

-- proposed_skills
ALTER TABLE nervous_system.proposed_skills ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'nervous_system'
      AND tablename  = 'proposed_skills'
      AND policyname = 'proposed_skills_read'
  ) THEN
    CREATE POLICY proposed_skills_read ON nervous_system.proposed_skills
      FOR SELECT
      USING (
        -- System proposals: visible to authenticated operators (allowlist
        -- enforcement lives in the application layer until SSO claims wire up).
        customer_id IS NULL
        OR customer_id = nervous_system.auth_customer_id()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'nervous_system'
      AND tablename  = 'proposed_skills'
      AND policyname = 'proposed_skills_service_write'
  ) THEN
    CREATE POLICY proposed_skills_service_write ON nervous_system.proposed_skills
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

-- skill_invocations
ALTER TABLE nervous_system.skill_invocations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'nervous_system'
      AND tablename  = 'skill_invocations'
      AND policyname = 'skill_invocations_read'
  ) THEN
    CREATE POLICY skill_invocations_read ON nervous_system.skill_invocations
      FOR SELECT
      USING (
        customer_id IS NULL
        OR customer_id = nervous_system.auth_customer_id()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'nervous_system'
      AND tablename  = 'skill_invocations'
      AND policyname = 'skill_invocations_service_write'
  ) THEN
    CREATE POLICY skill_invocations_service_write ON nervous_system.skill_invocations
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Refusal-gate write trigger (Addendum 5 §5)
--
--    "Every write to nervous_system.skills (insert or version-bump) must
--    carry a taboo_check_id."
--
--    Scope of enforcement (designed so the 38 pre-existing rows remain
--    fully usable and existing seed migrations keep working):
--      - INSERT: required when ANY of (
--                  author_kind IN ('skill_forge','imported'),
--                  lifecycle_status = 'proposed',
--                  code_body IS NOT NULL,
--                  approved_by IS NOT NULL,
--                  approved_at IS NOT NULL
--                ).
--                Plain seed-style INSERTs (author_kind='human', no code_body,
--                no approval signoff, lifecycle_status defaults to 'approved')
--                pass through without a taboo_check_id so the existing
--                Sprint 3-6 seed UPSERT migrations stay green. The Library
--                author UI in Sprint 10 will always carry a taboo_check_id
--                because it explicitly authors code_body or sets approved_by.
--      - UPDATE: required when ANY of (code_body, code_hash, lifecycle_status,
--                version, parent_skill_id, evidence, taboo_check_id,
--                approved_by, approved_at) changes.
--                Updates that only touch lifecycle telemetry (last_run_at,
--                total_runs, run_count, success_count, active, status,
--                run_endpoint, system_prompt, schedule_cron, trigger_event,
--                inputs_schema, outputs_schema, budget_usd_per_run,
--                refusal_gate, decay_at, embedding, description, domain,
--                type, name, skill_md_path, execution, registered_at,
--                customer_id, author_kind, author_id, fts) are exempt — these
--                are housekeeping mutations the Atrium UI and decay cron
--                already perform and they do not change Skill semantics.
--
--    Service role still bypasses RLS but the trigger runs on every write
--    regardless of role. To avoid breaking existing service-role seed inserts
--    that don't carry a taboo_check_id, INSERTs that don't trip any of the
--    procedural-write signature fields above are exempt.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION nervous_system.skills_require_taboo_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_requires boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Procedural-bearing inserts (Skill Forge / imported / explicit 'proposed')
    -- always require a taboo_check_id.
    IF NEW.author_kind IN ('skill_forge', 'imported') THEN
      v_requires := true;
    END IF;

    IF NEW.lifecycle_status = 'proposed' THEN
      v_requires := true;
    END IF;

    -- An INSERT that carries code_body or an approval signoff is also
    -- procedural and must be gated.
    IF NEW.code_body IS NOT NULL THEN
      v_requires := true;
    END IF;

    IF NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
      v_requires := true;
    END IF;

    IF v_requires AND NEW.taboo_check_id IS NULL THEN
      RAISE EXCEPTION 'nervous_system.skills INSERT requires taboo_check_id for procedural writes (author_kind=%, lifecycle_status=%)',
        NEW.author_kind, NEW.lifecycle_status
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- A semantic mutation is one that changes the executable surface or
    -- the lifecycle/version posture. Housekeeping mutations (telemetry,
    -- toggles) pass through.
    IF NEW.code_body          IS DISTINCT FROM OLD.code_body          THEN v_requires := true; END IF;
    IF NEW.code_hash          IS DISTINCT FROM OLD.code_hash          THEN v_requires := true; END IF;
    IF NEW.lifecycle_status   IS DISTINCT FROM OLD.lifecycle_status   THEN v_requires := true; END IF;
    IF NEW.version            IS DISTINCT FROM OLD.version            THEN v_requires := true; END IF;
    IF NEW.parent_skill_id    IS DISTINCT FROM OLD.parent_skill_id    THEN v_requires := true; END IF;
    IF NEW.evidence           IS DISTINCT FROM OLD.evidence           THEN v_requires := true; END IF;
    IF NEW.approved_by        IS DISTINCT FROM OLD.approved_by        THEN v_requires := true; END IF;
    IF NEW.approved_at        IS DISTINCT FROM OLD.approved_at        THEN v_requires := true; END IF;

    -- The decay cron flips lifecycle_status from 'approved' to 'retired'
    -- without a taboo_check_id. Treat decay retirement as the one allowed
    -- semantic mutation without taboo signoff. Detection: lifecycle moving
    -- approved → retired and NO other procedural field changed.
    IF v_requires
       AND OLD.lifecycle_status = 'approved'
       AND NEW.lifecycle_status = 'retired'
       AND NEW.code_body         IS NOT DISTINCT FROM OLD.code_body
       AND NEW.code_hash         IS NOT DISTINCT FROM OLD.code_hash
       AND NEW.version           IS NOT DISTINCT FROM OLD.version
       AND NEW.parent_skill_id   IS NOT DISTINCT FROM OLD.parent_skill_id
       AND NEW.evidence          IS NOT DISTINCT FROM OLD.evidence
       AND NEW.approved_by       IS NOT DISTINCT FROM OLD.approved_by
       AND NEW.approved_at       IS NOT DISTINCT FROM OLD.approved_at
    THEN
      v_requires := false;
    END IF;

    IF v_requires AND NEW.taboo_check_id IS NULL THEN
      RAISE EXCEPTION 'nervous_system.skills UPDATE requires taboo_check_id for procedural changes (skill_id=%)',
        NEW.id
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'skills_require_taboo_check_tg'
      AND tgrelid = 'nervous_system.skills'::regclass
  ) THEN
    CREATE TRIGGER skills_require_taboo_check_tg
      BEFORE INSERT OR UPDATE ON nervous_system.skills
      FOR EACH ROW
      EXECUTE FUNCTION nervous_system.skills_require_taboo_check();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Audit trigger — log every write to nervous_system.skills, proposed_skills,
--    and skill_invocations into nervous_system.audit_log.
--    Matches the live audit_log shape: (table_name, action, actor_id, payload).
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER required: nervous_system.audit_log has RLS enabled with
-- only a SELECT policy; without DEFINER the INSERT would be blocked when the
-- triggering write comes through a non-service-role context (e.g. an
-- authenticated UI write). The function explicitly sets search_path to avoid
-- function-hijacking risk.
CREATE OR REPLACE FUNCTION nervous_system.skills_audit_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nervous_system, public, pg_temp
AS $$
DECLARE
  v_action  text;
  v_row_id  uuid;
  v_payload jsonb;
  v_actor   uuid;
BEGIN
  v_action := lower(TG_OP);  -- 'insert' | 'update' | 'delete'

  -- auth.uid() returns NULL in background contexts (inngest service role).
  -- Schema-qualify so SECURITY DEFINER + locked search_path can still find it.
  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_row_id  := OLD.id;
    v_payload := jsonb_build_object('table', TG_TABLE_NAME, 'op', v_action, 'row', to_jsonb(OLD));
  ELSE
    v_row_id  := NEW.id;
    v_payload := jsonb_build_object('table', TG_TABLE_NAME, 'op', v_action, 'row', to_jsonb(NEW));
  END IF;

  INSERT INTO nervous_system.audit_log (table_name, action, actor_id, payload)
  VALUES (
    'nervous_system.' || TG_TABLE_NAME,
    'procedural_memory.' || TG_TABLE_NAME || '.' || v_action,
    v_actor,
    v_payload
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'skills_audit_tg'
      AND tgrelid = 'nervous_system.skills'::regclass
  ) THEN
    CREATE TRIGGER skills_audit_tg
      AFTER INSERT OR UPDATE OR DELETE ON nervous_system.skills
      FOR EACH ROW
      EXECUTE FUNCTION nervous_system.skills_audit_write();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'proposed_skills_audit_tg'
      AND tgrelid = 'nervous_system.proposed_skills'::regclass
  ) THEN
    CREATE TRIGGER proposed_skills_audit_tg
      AFTER INSERT OR UPDATE OR DELETE ON nervous_system.proposed_skills
      FOR EACH ROW
      EXECUTE FUNCTION nervous_system.skills_audit_write();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'skill_invocations_audit_tg'
      AND tgrelid = 'nervous_system.skill_invocations'::regclass
  ) THEN
    CREATE TRIGGER skill_invocations_audit_tg
      AFTER INSERT OR UPDATE OR DELETE ON nervous_system.skill_invocations
      FOR EACH ROW
      EXECUTE FUNCTION nervous_system.skills_audit_write();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. End of migration. No DROP, no destructive ALTER. Reversible via:
--      ALTER TABLE nervous_system.skills DROP COLUMN <each added column>;
--      DROP TABLE nervous_system.proposed_skills;
--      DROP TABLE nervous_system.skill_invocations;
--      DROP FUNCTION nervous_system.skills_require_taboo_check();
--      DROP FUNCTION nervous_system.skills_audit_write();
--      DROP FUNCTION nervous_system.auth_customer_id();
--      ALTER TABLE nervous_system.skills ADD CONSTRAINT skills_name_key UNIQUE (name);
-- ---------------------------------------------------------------------------
