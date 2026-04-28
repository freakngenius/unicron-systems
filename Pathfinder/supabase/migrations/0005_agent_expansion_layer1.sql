-- 0005_agent_expansion_layer1.sql — Pathfinder 8-agent expansion, Layer 1.
--
-- Two structural changes:
--
--   1. Relax the `agent_name` CHECK constraints on `pathfinder.agent_log`
--      and `pathfinder.agent_runs` to a wider whitelist that names every
--      agent in the planned 8-agent fleet (plus `eval`). This is one
--      migration so Layers 2 and 3 don't have to re-touch the constraint.
--
--   2. Add the Verifier output columns to `pathfinder.projects`:
--      `verified` (nullable boolean — null = pending), `verifier_notes`,
--      and `verifier_pass_count` (default 0). Existing rows stay untouched
--      because both `verified` and `verifier_notes` default to NULL.
--
-- Pairs with `prompts/computer-verifier.md` (the new Layer-1 agent prompt)
-- and the Verifier UI surfaces in `components/ProjectList.tsx` +
-- `components/ProjectModal.tsx`.

-- 1. Relax agent_name CHECKs ------------------------------------------------

alter table pathfinder.agent_log drop constraint agent_log_agent_name_check;
alter table pathfinder.agent_log add constraint agent_log_agent_name_check
  check (agent_name in (
    'ingestor','ranker','adjacent','verifier',
    'outreach','pulse','competitive','briefing','customer-intel','eval'
  ));

alter table pathfinder.agent_runs drop constraint agent_runs_agent_name_check;
alter table pathfinder.agent_runs add constraint agent_runs_agent_name_check
  check (agent_name in (
    'ingestor','ranker','adjacent','verifier',
    'outreach','pulse','competitive','briefing','customer-intel','eval'
  ));

-- 2. Verifier output columns on `pathfinder.projects` ----------------------

alter table pathfinder.projects
  add column verified boolean,
  add column verifier_notes text,
  add column verifier_pass_count integer not null default 0;

-- Index supports the Verifier's poll query:
--   select … from pathfinder.projects where verified is null order by ranked_at desc limit 10;
create index projects_verified_null_idx on pathfinder.projects(ranked_at desc)
  where verified is null;
