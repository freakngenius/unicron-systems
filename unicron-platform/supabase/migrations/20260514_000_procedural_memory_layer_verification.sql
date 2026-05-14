-- 20260514_procedural_memory_layer_verification.sql
-- Sprint 9 Stream A — Verification bundle for the procedural memory layer migration.
--
-- SELECT-only. Run after apply_migration(20260514_procedural_memory_layer.sql)
-- on the target Supabase project (preferred: a Supabase branch first, then
-- production). The conductor cross-references the live values against the
-- expectations documented next to each query.
--
-- Project: anfihcusvekpovcchpoh
-- Pre-migration baseline (2026-05-14):
--   - nervous_system.skills row count: 38
--   - 38 rows with customer_id IS NULL (all system Skills)
--   - 38 rows where author_kind defaults will land 'human' post-migration
--   - 38 rows where lifecycle_status defaults will land 'approved' post-migration

-- ---------------------------------------------------------------------------
-- V1. Row count unchanged at 38
-- ---------------------------------------------------------------------------
SELECT 'V1 row_count' AS check_name, count(*) AS row_count
FROM nervous_system.skills;
-- expect: row_count = 38

-- ---------------------------------------------------------------------------
-- V2. All 38 rows defaulted to lifecycle_status='approved'
-- ---------------------------------------------------------------------------
SELECT 'V2 lifecycle_status' AS check_name, lifecycle_status, count(*) AS rows
FROM nervous_system.skills
GROUP BY lifecycle_status
ORDER BY lifecycle_status;
-- expect: one row, lifecycle_status='approved', rows=38

-- ---------------------------------------------------------------------------
-- V3. All 38 rows defaulted to author_kind='human'
-- ---------------------------------------------------------------------------
SELECT 'V3 author_kind' AS check_name, author_kind, count(*) AS rows
FROM nervous_system.skills
GROUP BY author_kind
ORDER BY author_kind;
-- expect: one row, author_kind='human', rows=38

-- ---------------------------------------------------------------------------
-- V4. All 38 rows defaulted to version=1, run_count=0, success_count=0, evidence='[]'
-- ---------------------------------------------------------------------------
SELECT 'V4 defaults' AS check_name,
       count(*) FILTER (WHERE version = 1)         AS version_1,
       count(*) FILTER (WHERE run_count = 0)       AS run_count_0,
       count(*) FILTER (WHERE success_count = 0)   AS success_count_0,
       count(*) FILTER (WHERE evidence = '[]'::jsonb) AS evidence_empty
FROM nervous_system.skills;
-- expect: all four counts = 38

-- ---------------------------------------------------------------------------
-- V5. All 18 new columns are present on nervous_system.skills
-- ---------------------------------------------------------------------------
SELECT 'V5 new_columns' AS check_name,
       count(*) AS new_columns_present
FROM information_schema.columns
WHERE table_schema = 'nervous_system'
  AND table_name   = 'skills'
  AND column_name IN (
    'lifecycle_status','version','parent_skill_id','code_body','code_hash',
    'source_run_id','evidence','author_kind','author_id','approved_by',
    'approved_at','taboo_check_id','run_count','success_count','decay_at',
    'customer_id','embedding','fts'
  );
-- expect: new_columns_present = 18

-- ---------------------------------------------------------------------------
-- V6. Companion tables exist with 0 rows
-- ---------------------------------------------------------------------------
SELECT 'V6 proposed_skills'    AS check_name, count(*) AS rows FROM nervous_system.proposed_skills;
SELECT 'V6 skill_invocations'  AS check_name, count(*) AS rows FROM nervous_system.skill_invocations;
-- expect: rows = 0 for each

-- ---------------------------------------------------------------------------
-- V7. RLS enabled on all three tables
-- ---------------------------------------------------------------------------
SELECT 'V7 rls' AS check_name, relname, relrowsecurity
FROM pg_class
WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname='nervous_system')
  AND relname IN ('skills','proposed_skills','skill_invocations')
ORDER BY relname;
-- expect: relrowsecurity = true for all three

-- ---------------------------------------------------------------------------
-- V8. Taboo write trigger present on skills
-- ---------------------------------------------------------------------------
SELECT 'V8 trigger' AS check_name, tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'nervous_system.skills'::regclass
  AND tgname IN ('skills_require_taboo_check_tg','skills_audit_tg')
ORDER BY tgname;
-- expect: two rows, tgenabled='O' (origin/replica enabled)

-- ---------------------------------------------------------------------------
-- V9. UNIQUE constraint swap landed
-- ---------------------------------------------------------------------------
SELECT 'V9 constraints' AS check_name, conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'nervous_system.skills'::regclass
  AND contype = 'u'
ORDER BY conname;
-- expect:
--   - skills_customer_name_version_key UNIQUE (customer_id, name, version)
--   - NO skills_name_key

-- ---------------------------------------------------------------------------
-- V10. Partial UNIQUE index for system Skills present
-- ---------------------------------------------------------------------------
SELECT 'V10 partial_uq' AS check_name, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'nervous_system'
  AND tablename  = 'skills'
  AND indexname  = 'skills_system_name_version_uq';
-- expect: one row with WHERE (customer_id IS NULL) in indexdef

-- ---------------------------------------------------------------------------
-- V11. All required indexes present (Addendum 5 §2.2)
-- ---------------------------------------------------------------------------
SELECT 'V11 indexes' AS check_name, indexname
FROM pg_indexes
WHERE schemaname = 'nervous_system'
  AND tablename  = 'skills'
  AND indexname IN (
    'skills_fts_idx','skills_embedding_idx','skills_lifecycle_idx','skills_customer_idx'
  )
ORDER BY indexname;
-- expect: four rows

-- ---------------------------------------------------------------------------
-- V12. fts populated for all 38 rows via the GENERATED ALWAYS column
-- ---------------------------------------------------------------------------
SELECT 'V12 fts_populated' AS check_name,
       count(*) FILTER (WHERE fts IS NOT NULL) AS fts_rows,
       count(*)                                AS total_rows
FROM nervous_system.skills;
-- expect: fts_rows = total_rows = 38

-- ---------------------------------------------------------------------------
-- V13. Decay-path UPDATE smoke check (read-only): confirm no row currently
-- carries a non-null taboo_check_id (all pre-existing rows untouched).
-- ---------------------------------------------------------------------------
SELECT 'V13 taboo_check_id_null' AS check_name, count(*) AS null_rows
FROM nervous_system.skills
WHERE taboo_check_id IS NULL;
-- expect: null_rows = 38

-- ---------------------------------------------------------------------------
-- V14. Search RPCs present (Section 10: consumed by Stream B /api/skills/search)
-- ---------------------------------------------------------------------------
SELECT 'V14 search_rpcs' AS check_name, p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'nervous_system'
  AND p.proname IN ('ns_skills_search_by_fts', 'ns_skills_search_by_vector')
ORDER BY p.proname;
-- expect: two rows
--   ns_skills_search_by_fts(p_query text, p_customer_id uuid, p_limit integer)
--   ns_skills_search_by_vector(p_query_embedding vector, p_customer_id uuid, p_limit integer)

-- ---------------------------------------------------------------------------
-- V15. Search RPC smoke: FTS finds at least one seeded skill on a generic query.
-- (Embedding RPC smoke is deferred to post-Stream-D run when seed embeddings
-- exist; this is fine because pre-existing rows have embedding=NULL and the
-- vector RPC correctly excludes them.)
-- ---------------------------------------------------------------------------
SELECT 'V15 fts_rpc_smoke' AS check_name, count(*) AS hits
FROM nervous_system.ns_skills_search_by_fts('skill', NULL, 20);
-- expect: hits >= 1 (any seeded skill whose name or description contains 'skill').
