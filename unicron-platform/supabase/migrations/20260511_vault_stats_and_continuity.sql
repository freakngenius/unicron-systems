-- 20260511_vault_stats_and_continuity.sql
-- S4b + S4c: vault stats + continuity log ingestion.
--
-- S4b — nervous_system.vault_stats stores rolling counts from the
-- freakngenius/unicron-knowledge vault (raw/, wiki/, outputs/ doc counts,
-- last-commit recency). The Inngest function `vaultStatsSync` reads the
-- vault via GITHUB_VAULT_TOKEN (existing env var, already used by
-- analystWikiSync) and upserts one row per observed_at.
--
-- S4c — nervous_system.continuity_log stores parsed entries from
-- wiki/memory/elder/continuity.md. The Inngest function `continuityIngest`
-- pulls the file, parses each --- delimited entry into a row, and upserts
-- by entry_hash so re-runs are idempotent.
--
-- Both tables surface in Atrium System (Library header tiles for vault
-- stats; Continuity sub-tab timeline for continuity entries).

-- ─────────────────────────────────────────────────────────────────────────────
-- S4b: vault_stats
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nervous_system.vault_stats (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observed_at     timestamptz NOT NULL DEFAULT now(),
  raw_docs        int NOT NULL DEFAULT 0,
  wiki_docs       int NOT NULL DEFAULT 0,
  outputs_docs    int NOT NULL DEFAULT 0,
  total_bytes     bigint NOT NULL DEFAULT 0,
  last_commit_sha text,
  last_commit_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault_stats_observed_at_idx
  ON nervous_system.vault_stats (observed_at DESC);

ALTER TABLE nervous_system.vault_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vault_stats_authenticated_read ON nervous_system.vault_stats;
CREATE POLICY vault_stats_authenticated_read
  ON nervous_system.vault_stats
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS vault_stats_service_role_write ON nervous_system.vault_stats;
CREATE POLICY vault_stats_service_role_write
  ON nervous_system.vault_stats
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.ns_vault_stats_latest()
RETURNS TABLE (
  observed_at     timestamptz,
  raw_docs        int,
  wiki_docs       int,
  outputs_docs    int,
  total_bytes     bigint,
  last_commit_sha text,
  last_commit_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT observed_at, raw_docs, wiki_docs, outputs_docs,
         total_bytes, last_commit_sha, last_commit_at
  FROM nervous_system.vault_stats
  ORDER BY observed_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.ns_vault_stats_latest() TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- S4c: continuity_log
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nervous_system.continuity_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_hash    text NOT NULL UNIQUE,
  entry_date    date,
  title         text,
  body          text NOT NULL,
  tags          text[] NOT NULL DEFAULT '{}',
  source_path   text NOT NULL DEFAULT 'wiki/memory/elder/continuity.md',
  ingested_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS continuity_log_entry_date_idx
  ON nervous_system.continuity_log (entry_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS continuity_log_ingested_at_idx
  ON nervous_system.continuity_log (ingested_at DESC);

ALTER TABLE nervous_system.continuity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS continuity_log_authenticated_read ON nervous_system.continuity_log;
CREATE POLICY continuity_log_authenticated_read
  ON nervous_system.continuity_log
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS continuity_log_service_role_write ON nervous_system.continuity_log;
CREATE POLICY continuity_log_service_role_write
  ON nervous_system.continuity_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS continuity_log_service_role_update ON nervous_system.continuity_log;
CREATE POLICY continuity_log_service_role_update
  ON nervous_system.continuity_log
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.ns_continuity_log_latest(p_limit int DEFAULT 50)
RETURNS TABLE (
  id          uuid,
  entry_date  date,
  title       text,
  body        text,
  tags        text[],
  ingested_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'nervous_system', 'public'
AS $$
  SELECT id, entry_date, title, body, tags, ingested_at
  FROM nervous_system.continuity_log
  ORDER BY COALESCE(entry_date, ingested_at::date) DESC, ingested_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ns_continuity_log_latest(int) TO authenticated, anon, service_role;
