-- Migration: sprint_runs tracking table
-- Sprint 5 Stream D — nervous_system.sprint_runs
-- Tracks every sprint execution: status, fork metadata, evidence, kanban linkage.

CREATE TABLE IF NOT EXISTS nervous_system.sprint_runs (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  sprint_name      text        NOT NULL,
  sprint_prompt_path text,
  surface          text,
  status           text        DEFAULT 'in_process'
                               CHECK (status IN (
                                 'in_process', 'deployed', 'review',
                                 'bug_fixes', 'verified', 'halted'
                               )),
  started_at       timestamptz DEFAULT now(),
  completed_at     timestamptz,
  evidence_link    text,
  kanban_card_id   text,
  fork_count       integer     DEFAULT 1,
  fork_winner_id   uuid,
  log_tail         jsonb       DEFAULT '[]'::jsonb,
  created_by       jsonb,
  ttl_days         integer     DEFAULT 90,
  last_touched     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sprint_runs_status
  ON nervous_system.sprint_runs (status);

CREATE INDEX IF NOT EXISTS idx_sprint_runs_sprint_name
  ON nervous_system.sprint_runs (sprint_name);

GRANT SELECT, INSERT, UPDATE ON nervous_system.sprint_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON nervous_system.sprint_runs TO service_role;

COMMENT ON TABLE nervous_system.sprint_runs IS
  'Sprint 5 Stream D: tracks every sprint execution, fork metadata, status lifecycle, and evidence links.';

COMMENT ON COLUMN nervous_system.sprint_runs.status IS
  'Lifecycle: in_process → deployed | review → bug_fixes | verified | halted';

COMMENT ON COLUMN nervous_system.sprint_runs.fork_count IS
  'Number of parallel forks run for this sprint (1 = no fork, default)';

COMMENT ON COLUMN nervous_system.sprint_runs.fork_winner_id IS
  'UUID of the winning ForkCandidate when fork_count > 1; references the fork run externally';

COMMENT ON COLUMN nervous_system.sprint_runs.log_tail IS
  'Append-only JSONB array of recent log entries (capped at last 50 by convention)';

COMMENT ON COLUMN nervous_system.sprint_runs.ttl_days IS
  'Days until this row auto-archives (reset on last_touched update)';
