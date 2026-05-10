-- 20260510_seed_sprint5_deep_research_skill.sql
-- Sprint 5 Stream C — Register the deep-research skill in nervous_system.skills.
--
-- Note: if the nervous_system.skills table does not yet exist in this Supabase
-- project (it lives in unicron-platform's scope per the multi-tenant architecture),
-- this migration is a no-op thanks to the DO $$ block guard below.
-- Stream G (unicron-platform) owns the canonical skills table schema;
-- this migration seeds the deep-research row once the table exists.
--
-- Column alignment patch (2026-05-09): removed non-existent skill_id column
-- (live PK is id uuid); changed ON CONFLICT target to (name); aligned name
-- value to slug 'deep-research' (consistent with Stream G migration).

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
      name,
      description,
      domain,
      status,
      run_endpoint
    ) VALUES (
      'deep-research',
      'Autoresearch a topic to an 8-15 page synthesized brief with citations in wiki/research/',
      'research',
      'active',
      '/api/skills/deep-research'
    ) ON CONFLICT (name) DO NOTHING;

    RAISE NOTICE 'deep-research skill seeded into nervous_system.skills';
  ELSE
    RAISE NOTICE 'nervous_system.skills table not found — seed deferred to Stream G (unicron-platform)';
  END IF;
END $$;
