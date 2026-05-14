-- Sprint 8 F5 — action_items.completed columns
--
-- Adds explicit completion tracking to nervous_system.action_items.
-- Prior state: completion was inferred from status='done' / 'closed'.
-- Sprint 8 spec requires explicit completed bool + completed_at + completed_by
-- so the auto-completion cron can distinguish manual closes (operator clicked
-- the checkbox) from auto closes (ledger event matched the item).

ALTER TABLE nervous_system.action_items
  ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by text;

CREATE INDEX IF NOT EXISTS action_items_completed_idx
  ON nervous_system.action_items (completed) WHERE completed = false;

-- Backfill: any existing rows with status in done/closed/completed should be
-- marked completed. last_touched is the best proxy for completed_at on
-- historical rows (closed_at is not a column on this table).
UPDATE nervous_system.action_items
   SET completed = true,
       completed_at = COALESCE(completed_at, last_touched, created_at),
       completed_by = COALESCE(completed_by, 'backfill:sprint-8-f5')
 WHERE status IN ('done', 'closed', 'completed')
   AND completed = false;

COMMENT ON COLUMN nervous_system.action_items.completed IS
  'Sprint 8 F5: explicit completion flag, set by PATCH /api/atrium/action-items/:id (manual) or autoCompleteActionItems cron (auto:<ledger_id>).';
COMMENT ON COLUMN nervous_system.action_items.completed_by IS
  'Either a team_member.id, ''auto:<ledger_id>'' for cron-matched completions, or ''backfill:<sprint>'' for historical rows.';
