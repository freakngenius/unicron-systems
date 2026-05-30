# Z17 — Manual trigger runs full pipeline (PR dossier)

Branch: `z17-manual-full-pipeline`
Spec: `Company Docs/Specs/SPEC-zedcor-Z17.md`
Notion card: https://www.notion.so/370785c67e72815a8612d40ad788bd57

## Root cause (one paragraph)

`lib/orchestrator/orchestrator.ts` Wave 2 calls `updateProjectScore()`, which writes a non-existent `ranked_by` column to `pathfinder.projects`. The function's typed return is `Promise<{ error: unknown }>` but the error is never checked, so the whole UPDATE silently no-ops. Every project ingested by the manual orchestrator since the schema drift ends with `score=null, rationale=null`. The downstream enrichment + pitch waves then run on a too-narrow filter (`buy_window_open=true OR project_stage IN ('awarded','gc_selected','sub_bid')`), so most newly-ingested `solicitation`-stage rows skip them entirely. Finally, the Notion writer has no enrichment-complete gate, so bare shells reach the Lead Feed.

### Verbatim evidence

```sql
-- Schema check (pathfinder.projects)
SELECT column_name FROM information_schema.columns
WHERE table_schema='pathfinder' AND table_name='projects' AND column_name='ranked_by';
-- (0 rows — column does not exist)

-- Reproduce the silent failure
UPDATE pathfinder.projects SET ranked_by = 'test'
WHERE id = 'harris-county-bonfire:26/0163';
-- ERROR: 42703: column "ranked_by" of relation "projects" does not exist
```

```text
-- ZED-58 (harris-county-bonfire:26/0163), as found before Z17:
score: null
rationale: null         -- not '(scoring disabled)'; Wave 2 never wrote.
project_stage: solicitation
buy_window_open: false
agent_run_id: 6713
Notion page: /ITB-Replacement-of-the-Existing-Generator-...-370785c67e7281ac92fcd2a02e4b6544
```

Run 6713's `run_metadata`:
```json
{ "projects_inserted": 7, "notion_writes": 7,
  "enrichment_attempted": 0, "enrichment_succeeded": 0 }
```
Seven bare rows written to Notion. Zero enrichment attempts because the
narrow filter matched none of the seven `solicitation`-stage rows.

The `(scoring disabled)` string the spec observed actually comes from the
Notion writer (`lib/notion/zedcor-writer.ts:325`), which appends it to the
Rationale property whenever `input.score === null` — it is a downstream
symptom of the silent-write failure, not an upstream gate that fired.

## Changes

(populated as work lands)

## Acceptance criteria — evidence

(populated after verification)
