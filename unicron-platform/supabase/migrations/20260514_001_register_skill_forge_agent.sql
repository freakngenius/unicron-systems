-- 20260514_001_register_skill_forge_agent.sql — Sprint 9 Stream D
--
-- Registers the Skill Forge agent in nervous_system.agents as an inert stub.
-- Skill Forge is the fifth always-on agent per Addendum 6: it observes the
-- ledger, distills successful trajectories into proposed Skills, and queues
-- them for human + Taboo Keeper approval. The observation loop is OUT OF
-- SCOPE for Sprint 9 — this row exists so the Atrium System tab Agents
-- Galaxy renders the node and so Sprint 10 can flip `active = true` without
-- a schema change.
--
-- Live nervous_system.agents columns verified 2026-05-14 via
-- information_schema.columns (project anfihcusvekpovcchpoh):
--   id (uuid, default gen_random_uuid()),
--   name (text NOT NULL),
--   archetype (text NOT NULL),
--   specialty (text NULL),
--   config (jsonb NULL),
--   active (boolean NULL DEFAULT true),
--   budget (jsonb NULL),
--   reciprocity_hooks (jsonb NULL DEFAULT '{}'::jsonb),
--   created_at (timestamptz NULL DEFAULT now()),
--   description (text NULL),
--   guiding_prompt (text NULL),
--   schedule_cron (text NULL),
--   updated_at (timestamptz NOT NULL DEFAULT now()),
--   last_run_synthetic (boolean NOT NULL DEFAULT true),
--   last_run_at (timestamptz NULL),
--   last_run_evidence (jsonb NULL).
--
-- Mapping from Addendum 6 §2 (spec slug -> live column):
--   slug                 -> name = 'Skill Forge'  (existing rows use Title Case)
--   archetype            -> archetype = 'builder'
--   on_call              -> NOT a live column. Encoded as active = false for
--                           Sprint 9 (inert) and config.on_call = false for
--                           Sprint 10 distinction. Flip in Sprint 10.
--   model / fallback     -> stored under config.model / config.fallback_model
--   budget_usd_per_day   -> stored under budget.limit_usd_per_period with
--                           period_days = 1 (matches Sprint 3 budget shape).
--   reciprocity_hooks    -> '{}'::jsonb (parent SPEC R3 placeholder).
--
-- ON CONFLICT (name) DO UPDATE: idempotent re-apply. Preserves the row's id
-- so foreign keys in skill_invocations etc. survive a re-run.

INSERT INTO nervous_system.agents (
  name,
  archetype,
  specialty,
  description,
  guiding_prompt,
  schedule_cron,
  active,
  budget,
  config,
  reciprocity_hooks
)
VALUES (
  'Skill Forge',
  'builder',
  'Procedural distillation — observes successful ledger trajectories, drafts Skills, queues them in nervous_system.proposed_skills for human + Taboo Keeper approval. Never writes to nervous_system.skills directly.',
  'Fifth always-on agent. Observation loop registered Sprint 10 (Addendum 6 §3). Refinement loop (Addendum 6 §4) gates on success_count/run_count < 0.7 over the last 10 invocations and run_count >= 10. Hard refusal: any write path to nervous_system.skills. All proposals carry a Taboo Keeper dry-run id and a satisfaction score from the Addendum 4 LLM judge.',
  'You are Skill Forge. You distill successful trajectories from the ledger into runnable Skills for re-execution. Your output is an artifact for an agent to invoke, not prose for a human to read (that is the Analyst). You write only to nervous_system.proposed_skills, never to nervous_system.skills. Every proposal carries an evidence array of ledger row ids, a satisfaction score from the Addendum 4 LLM judge, and a Taboo Keeper dry-run id. You refuse to propose a Skill that would bypass the refusal layer, overwrite a manual edit, or duplicate an approved Skill within 0.85 cosine of the existing embedding.',
  -- schedule_cron NULL in Sprint 9 (inert). Sprint 10 sets this to the
  -- 6-hour observation cron alongside the Analyst decayTick registration.
  NULL,
  -- active = false: Sprint 9 stub. Sprint 10 flips to true.
  false,
  -- Daily inference budget per Addendum 6 §5. Encoded in the live budget
  -- jsonb shape used by Taboo Keeper and Elder rows.
  jsonb_build_object(
    'limit_usd_per_period', 5.00,
    'period_days', 1,
    'current_spent_usd', 0,
    'resets_at', (date_trunc('day', now()) + interval '1 day')::text,
    'note', 'Addendum 6 §5 — daily inference cap. Override per-row, not via prompt.'
  ),
  -- config.on_call = false captures Addendum 6 §2 "on_call: false" which the
  -- live schema does not have a top-level column for. Sprint 10 flips
  -- config.on_call to true alongside active = true.
  jsonb_build_object(
    'on_call', false,
    'sprint_9_stub', true,
    'model', 'claude-sonnet-4-6',
    'fallback_model', 'claude-haiku-4-5',
    'observation_cron', '0 */6 * * *',
    'watches_agents', jsonb_build_array('Orchestrator','Analyst','Architect','SourceOnboarder'),
    'watches_signal_topics', jsonb_build_array(
      'cowork.thread.resolved',
      'voice.call.procurement_pull',
      'slack.orchestrator.chain',
      'architect.proposal.onboarded'
    ),
    'refusal_policy', jsonb_build_object(
      'hard_refusal', jsonb_build_array(
        'write_to_skills_table_directly',
        'overwrite_human_edit',
        'bypass_taboo_keeper'
      ),
      'soft_flag', jsonb_build_array(
        'near_duplicate_of_approved_skill',
        'evidence_array_under_2_rows'
      )
    ),
    'resource_caps', jsonb_build_object(
      'max_proposals_per_24h', 20,
      'novelty_cosine_threshold', 0.85,
      'satisfaction_floor', 0.75,
      'satisfaction_high_confidence', 0.90
    ),
    'spec_addendum', 6,
    'lifecycle', 'inert_stub'
  ),
  '{}'::jsonb
)
ON CONFLICT (name) DO UPDATE SET
  archetype         = EXCLUDED.archetype,
  specialty         = EXCLUDED.specialty,
  description       = EXCLUDED.description,
  guiding_prompt    = EXCLUDED.guiding_prompt,
  schedule_cron     = EXCLUDED.schedule_cron,
  active            = EXCLUDED.active,
  budget            = EXCLUDED.budget,
  config            = EXCLUDED.config,
  reciprocity_hooks = EXCLUDED.reciprocity_hooks,
  updated_at        = now();

-- Audit log entry for the agent registration. Live nervous_system.audit_log
-- columns (verified 2026-05-14): id, table_name, action, actor_id, payload,
-- created_at. Sprint 3 seed migrations did not emit audit rows; subsequent
-- migrations (20260511_cash_balance.sql etc.) do — match the newer pattern.
INSERT INTO nervous_system.audit_log (table_name, action, actor_id, payload)
VALUES (
  'nervous_system.agents',
  'agent_registered',
  -- Kyle Kesterson (founder, demonstrated authorship) per
  -- nervous_system.team_members lookup 2026-05-14:
  -- id = 7715cb75-8192-42c5-8eff-6fe77dd2f62a, email = kyle@demystified.ai.
  '7715cb75-8192-42c5-8eff-6fe77dd2f62a'::uuid,
  jsonb_build_object(
    'agent_name', 'Skill Forge',
    'archetype', 'builder',
    'lifecycle', 'inert_stub',
    'sprint', 9,
    'spec', 'Company Docs/Specs/SPEC - Nervous System Addendum 6 (Skill Forge Agent).md',
    'sprint_10_flip', jsonb_build_object(
      'active', true,
      'config.on_call', true,
      'schedule_cron', '0 */6 * * *'
    )
  )
);
