-- Soft-delete support for chat_messages reset.
-- When a user clears their conversation, cleared_at is stamped on all
-- messages in the thread. Future reads filter cleared_at IS NULL so
-- the display and history window exclude cleared messages while
-- preserving the audit trail.
alter table pathfinder.chat_messages
  add column if not exists cleared_at timestamptz;
