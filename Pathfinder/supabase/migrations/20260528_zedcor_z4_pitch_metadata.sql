-- 20260528_zedcor_z4_pitch_metadata.sql — Sprint Z4, additive only.
--
-- Adds pathfinder.projects.pitch_metadata (jsonb) which carries Z4's outputs:
--   { cross_pollination, warm_intro_path, pitch_hooks (string[3]),
--     recommended_action, action_by_date (YYYY-MM-DD),
--     possible_cross_pollination (low-confidence matches),
--     generated_at }
--
-- Idempotent. Safe to re-run.

begin;

alter table pathfinder.projects
  add column if not exists pitch_metadata jsonb not null default '{}'::jsonb;

create index if not exists projects_pitch_action_by_date_idx
  on pathfinder.projects ((pitch_metadata->>'action_by_date'))
  where pitch_metadata ? 'action_by_date';

comment on column pathfinder.projects.pitch_metadata is
  'Sprint Z4 output. Keys: cross_pollination, warm_intro_path, pitch_hooks (string[]), recommended_action, action_by_date, possible_cross_pollination (jsonb[]), generated_at. Populated by lib/adapters/zedcor/pitch-generator.ts + cross-pollination.ts + recommended-action.ts.';

commit;

-- Post-migration sanity probe:
--   select count(*) from pathfinder.projects where pitch_metadata ?| array['pitch_hooks','recommended_action'];
