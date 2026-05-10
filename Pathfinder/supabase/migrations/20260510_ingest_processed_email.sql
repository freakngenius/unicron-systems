-- 20260510_ingest_processed_email.sql — Sprint 5 Stream A
--
-- Creates nervous_system.ingest_processed for cross-source deduplication.
-- external_id stores the provider-native message/document ID (e.g. Gmail
-- message ID). Prevents duplicate ledger rows when the cron re-fetches
-- messages that were already ingested.

CREATE TABLE IF NOT EXISTS nervous_system.ingest_processed (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id text        NOT NULL UNIQUE,
  source_type text,
  processed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingest_processed_external_id
  ON nervous_system.ingest_processed (external_id);

GRANT SELECT, INSERT ON nervous_system.ingest_processed TO service_role;
