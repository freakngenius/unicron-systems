-- 20260514_002_seed_three_system_skills_verification.sql
--
-- Verification bundle the conductor runs AFTER apply_migration on
-- 20260514_002_seed_three_system_skills.sql. Not an apply_migration target
-- itself — execute via the Supabase MCP execute_sql tool.
--
-- Each block returns a single row with an `ok` boolean and an assertion
-- label. If any `ok` is false, halt and report. The bundle is intentionally
-- read-only; no writes, no DDL.

-- ----------------------------------------------------------------------
-- 1. The Skill Forge agent row is present, inert, and on the latest
--    config.on_call = false stub state.
-- ----------------------------------------------------------------------
SELECT
  'skill_forge_agent_registered_inert' AS assertion,
  (
    SELECT name = 'Skill Forge'
       AND archetype = 'distiller'
       AND active = false
       AND (config->>'on_call')::boolean = false
       AND (config->>'sprint_9_stub')::boolean = true
       AND budget IS NOT NULL
    FROM nervous_system.agents
    WHERE name = 'Skill Forge'
  ) AS ok;

-- ----------------------------------------------------------------------
-- 2. All three system Skills exist, exactly once each.
-- ----------------------------------------------------------------------
SELECT
  'three_system_skills_exist_unique' AS assertion,
  (
    SELECT COUNT(*) = 3
    FROM (
      SELECT name, COUNT(*) AS n
      FROM nervous_system.skills
      WHERE name IN (
        'run_zedcor_weekly_digest',
        'onboard_county_records_source',
        'draft_briefing_for_bd_rep'
      )
      GROUP BY name
      HAVING COUNT(*) = 1
    ) t
  ) AS ok;

-- ----------------------------------------------------------------------
-- 3. Every seeded Skill carries a non-null taboo_check_id.
--    Also asserts that none of them is still a placeholder UUID — the
--    conductor must have patched them with real Taboo Keeper audit_log ids.
-- ----------------------------------------------------------------------
SELECT
  'taboo_check_id_present_and_not_placeholder' AS assertion,
  (
    SELECT bool_and(
      taboo_check_id IS NOT NULL
      AND taboo_check_id NOT IN (
        '9aaa0000-0000-0000-0000-000000000001'::uuid,
        '9aaa0000-0000-0000-0000-000000000002'::uuid,
        '9aaa0000-0000-0000-0000-000000000003'::uuid
      )
    )
    FROM nervous_system.skills
    WHERE name IN (
      'run_zedcor_weekly_digest',
      'onboard_county_records_source',
      'draft_briefing_for_bd_rep'
    )
  ) AS ok;

-- ----------------------------------------------------------------------
-- 4. lifecycle_status = 'approved' for all three.
-- ----------------------------------------------------------------------
SELECT
  'lifecycle_status_approved' AS assertion,
  (
    SELECT bool_and(lifecycle_status = 'approved')
    FROM nervous_system.skills
    WHERE name IN (
      'run_zedcor_weekly_digest',
      'onboard_county_records_source',
      'draft_briefing_for_bd_rep'
    )
  ) AS ok;

-- ----------------------------------------------------------------------
-- 5. author_kind = 'human' for all three.
-- ----------------------------------------------------------------------
SELECT
  'author_kind_human' AS assertion,
  (
    SELECT bool_and(author_kind = 'human')
    FROM nervous_system.skills
    WHERE name IN (
      'run_zedcor_weekly_digest',
      'onboard_county_records_source',
      'draft_briefing_for_bd_rep'
    )
  ) AS ok;

-- ----------------------------------------------------------------------
-- 6. author_id and approved_by both resolve to Kyle Kesterson.
-- ----------------------------------------------------------------------
SELECT
  'author_and_approver_is_kyle' AS assertion,
  (
    SELECT bool_and(
      author_id   = '7715cb75-8192-42c5-8eff-6fe77dd2f62a'::uuid
      AND approved_by = '7715cb75-8192-42c5-8eff-6fe77dd2f62a'::uuid
      AND approved_at IS NOT NULL
    )
    FROM nervous_system.skills
    WHERE name IN (
      'run_zedcor_weekly_digest',
      'onboard_county_records_source',
      'draft_briefing_for_bd_rep'
    )
  ) AS ok;

-- ----------------------------------------------------------------------
-- 7. version = 1 and customer_id IS NULL (system Skills) for all three.
-- ----------------------------------------------------------------------
SELECT
  'version_one_system_scope' AS assertion,
  (
    SELECT bool_and(version = 1 AND customer_id IS NULL)
    FROM nervous_system.skills
    WHERE name IN (
      'run_zedcor_weekly_digest',
      'onboard_county_records_source',
      'draft_briefing_for_bd_rep'
    )
  ) AS ok;

-- ----------------------------------------------------------------------
-- 8. system_prompt and skill_md_path both populated (non-empty).
-- ----------------------------------------------------------------------
SELECT
  'system_prompt_and_skill_md_path_populated' AS assertion,
  (
    SELECT bool_and(
      coalesce(length(system_prompt), 0) > 100
      AND coalesce(length(skill_md_path), 0) > 0
    )
    FROM nervous_system.skills
    WHERE name IN (
      'run_zedcor_weekly_digest',
      'onboard_county_records_source',
      'draft_briefing_for_bd_rep'
    )
  ) AS ok;

-- ----------------------------------------------------------------------
-- 9. The pre-existing ~40 Sprint 3-6 seeded skills are still readable and
--    still default to lifecycle_status = 'approved' (per Stream A's
--    column default). This guards against the auto-revert trigger
--    "A pre-existing skill row is mutated destructively".
-- ----------------------------------------------------------------------
SELECT
  'pre_existing_skills_intact_and_approved' AS assertion,
  (
    SELECT (cnt_total >= 40 AND cnt_approved = cnt_total)
    FROM (
      SELECT
        COUNT(*) AS cnt_total,
        COUNT(*) FILTER (WHERE lifecycle_status = 'approved') AS cnt_approved
      FROM nervous_system.skills
      WHERE name NOT IN (
        'run_zedcor_weekly_digest',
        'onboard_county_records_source',
        'draft_briefing_for_bd_rep'
      )
    ) c
  ) AS ok;

-- ----------------------------------------------------------------------
-- 10. Audit log received both expected entries.
-- ----------------------------------------------------------------------
SELECT
  'audit_log_entries_present' AS assertion,
  (
    SELECT
      (SELECT COUNT(*) FROM nervous_system.audit_log
         WHERE table_name = 'nervous_system.agents'
           AND action = 'agent_registered'
           AND payload->>'agent_name' = 'Skill Forge') >= 1
      AND
      (SELECT COUNT(*) FROM nervous_system.audit_log
         WHERE table_name = 'nervous_system.skills'
           AND action = 'system_skills_seeded'
           AND payload->'skills' ? 'run_zedcor_weekly_digest') >= 1
  ) AS ok;

-- ----------------------------------------------------------------------
-- DIAGNOSTIC (non-assertion): full row dump for the three Skills.
-- The conductor pastes this output verbatim into the PR description.
-- ----------------------------------------------------------------------
SELECT
  name,
  domain,
  type,
  lifecycle_status,
  version,
  author_kind,
  author_id,
  approved_by,
  approved_at,
  taboo_check_id,
  customer_id,
  active,
  status,
  skill_md_path,
  length(system_prompt) AS system_prompt_chars
FROM nervous_system.skills
WHERE name IN (
  'run_zedcor_weekly_digest',
  'onboard_county_records_source',
  'draft_briefing_for_bd_rep'
)
ORDER BY name;
