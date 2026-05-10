-- 20260510_seed_sprint5_deep_research_skill.sql
-- Sprint 5 Stream C — Register the deep-research skill in nervous_system.skills.
--
-- Note: if the nervous_system.skills table does not yet exist in this Supabase
-- project (it lives in unicron-platform's scope per the multi-tenant architecture),
-- this migration is a no-op thanks to the DO $$ block guard below.
-- Stream G (unicron-platform) owns the canonical skills table schema;
-- this migration seeds the deep-research row once the table exists.

DO $$
BEGIN
  -- Guard: only execute the INSERT if the skills table exists.
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'nervous_system'
      AND table_name = 'skills'
  ) THEN
    INSERT INTO nervous_system.skills (
      skill_id,
      name,
      description,
      domain,
      status,
      run_endpoint
    ) VALUES (
      'deep-research',
      'Deep Research',
      'Autoresearch a topic to an 8-15 page synthesized brief with citations in wiki/research/',
      'research',
      'active',
      '/api/skills/deep-research'
    ) ON CONFLICT (skill_id) DO NOTHING;

    RAISE NOTICE 'deep-research skill seeded into nervous_system.skills';
  ELSE
    RAISE NOTICE 'nervous_system.skills table not found — seed deferred to Stream G (unicron-platform)';
  END IF;
END $$;
