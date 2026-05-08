-- 20260508_register_sprint3_agents.sql — Sprint 3 Stream B
-- Registers Taboo Keeper and Elder as first-class agents in nervous_system.agents.
--
-- Both agents were previously implicit (Taboo Keeper was inlined in orchestrator.ts;
-- Elder was a placeholder). This migration gives them budget-tracked rows so runAgent()
-- in runtime.ts can enforce spend limits and write audit_log entries per run.
--
-- ON CONFLICT (name) DO UPDATE: safe to re-run; preserves archetype + specialty updates.

INSERT INTO nervous_system.agents (name, archetype, specialty, active, budget, config)
VALUES (
  'Taboo Keeper',
  'taboo_keeper',
  'Refusal gate validation — blocks actions that violate the Unicron taboo register',
  true,
  '{"limit_usd_per_period": 10, "period_days": 7, "current_spent_usd": 0, "resets_at": "2026-05-15T00:00:00Z"}'::jsonb,
  '{"watches_agents": [], "watches_signal_topics": []}'::jsonb
)
ON CONFLICT (name) DO UPDATE SET
  archetype  = EXCLUDED.archetype,
  specialty  = EXCLUDED.specialty,
  active     = EXCLUDED.active;

INSERT INTO nervous_system.agents (name, archetype, specialty, active, budget, config)
VALUES (
  'Elder',
  'elder',
  'Continuity advisory — checks decisions against prior commitments and seven-generations principles',
  true,
  '{"limit_usd_per_period": 20, "period_days": 7, "current_spent_usd": 0, "resets_at": "2026-05-15T00:00:00Z"}'::jsonb,
  '{"watches_agents": [], "watches_signal_topics": []}'::jsonb
)
ON CONFLICT (name) DO UPDATE SET
  archetype  = EXCLUDED.archetype,
  specialty  = EXCLUDED.specialty,
  active     = EXCLUDED.active;
