-- 20260530_lead_chat_messages.sql
-- Stream H, Lead Chat Agent (Internal): history table for the Internal
-- pop-up chat. Additive. The existing Pathfinder chat (chat_threads,
-- chat_messages from 0009_chat.sql) is untouched and keeps serving the
-- Zedcor surface; this table backs the Internal-only chat at
-- /api/internal/chat and lives next to it.
--
-- Scope keying: (org_id, company_id, thread_id). company_id null means
-- "list scope" (filtered set across companies); company_id set means
-- "detail scope" for one Internal company. thread_id is a stable
-- client-generated string so reloads continue the thread.
--
-- FK types match the referenced tables exactly:
--   pathfinder.organizations.id  uuid (from 20260509_organizations.sql)
--   pathfinder.projects.id        text (from 0002_tables.sql)

CREATE TABLE IF NOT EXISTS pathfinder.lead_chat_messages (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id          uuid        NOT NULL REFERENCES pathfinder.organizations(id) ON DELETE CASCADE,
  company_id      text        NULL REFERENCES pathfinder.projects(id) ON DELETE CASCADE,
  thread_id       text        NOT NULL,
  user_email      text        NOT NULL,
  role            text        NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  kind            text        NOT NULL DEFAULT 'text',
  content         text        NOT NULL,
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  sources         jsonb       NULL,
  tool_name       text        NULL,
  model_used      text        NULL,
  latency_ms      integer     NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  cleared_at      timestamptz NULL
);

CREATE INDEX IF NOT EXISTS lead_chat_messages_org_company_idx
  ON pathfinder.lead_chat_messages (org_id, company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lead_chat_messages_thread_idx
  ON pathfinder.lead_chat_messages (thread_id, created_at);

CREATE INDEX IF NOT EXISTS lead_chat_messages_user_idx
  ON pathfinder.lead_chat_messages (user_email, created_at DESC);

-- RLS: service_role bypasses automatically. Anon and authenticated are
-- denied by default. Reads happen through the API route under service
-- role, scoped to (org_id, company_id, user_email) in app code.
ALTER TABLE pathfinder.lead_chat_messages ENABLE ROW LEVEL SECURITY;

-- Verification queries an operator can run after apply:
--   SELECT count(*) FROM pathfinder.lead_chat_messages;            -- expect 0
--   \d pathfinder.lead_chat_messages                                -- expect 14 columns
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname = 'pathfinder'
--     AND tablename  = 'lead_chat_messages';                        -- expect 3 indexes + pk
