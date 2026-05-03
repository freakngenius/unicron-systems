-- 0111_lead_detail_redesign.sql
--
-- Demo Polish UX Sprint, Gate 7A — Lead Detail Page UX Redesign.
-- Adds `enrichment_citations` jsonb column to pathfinder.projects.
--
-- pathfinder.deals.pipeline_stage already exists from migration 0050 — no
-- action needed there. Verified by grep of supabase/migrations/.
--
-- Shape:
--   enrichment_citations: [
--     { url: string, fact_supported: string, confidence: number (0-1) }
--   ]
--
-- Populated by services/enricher/lead-detail.ts (Gate 3C / future Gate 7B
-- extension). Read by components/lead/SourceCitations.tsx (rendered as
-- footer on the redesigned lead detail page).
--
-- Additive. Idempotent. Reversible by drop-only-columns rollback.

alter table pathfinder.projects
  add column if not exists enrichment_citations jsonb;

comment on column pathfinder.projects.enrichment_citations is
  'Per-fact source URLs for the enrichment pass. Array of '
  '{url, fact_supported, confidence}. Read by SourceCitations footer '
  'component on the redesigned lead detail page.';
