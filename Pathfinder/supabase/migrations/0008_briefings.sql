-- Briefings table — persistence target for the Briefing agent's weekly
-- output. One row per generated brief; org-level + per-branch share the
-- same shape (scope discriminates).
--
-- Notes:
--   - `delivered_at` is set when at least one delivery channel (email or
--     Slack) succeeds; failed channels are recorded only in agent_log.
--   - `recipients` is a `text[]` of strings like "email:kyle@…" or
--     "slack:webhook" so a single column captures both channels.

create table pathfinder.briefings (
  id              bigserial primary key,
  scope           text not null check (scope in ('org','branch')),
  branch_id       text references pathfinder.branches(id) on delete set null,
  brief_markdown  text not null,
  metrics         jsonb not null default '{}'::jsonb,
  generated_at    timestamptz not null default now(),
  delivered_at    timestamptz,
  recipients      text[] not null default '{}'
);

create index briefings_generated_idx on pathfinder.briefings(generated_at desc);
create index briefings_scope_idx     on pathfinder.briefings(scope, generated_at desc);
