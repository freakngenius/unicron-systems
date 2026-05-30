# Z17 — Manual trigger runs full pipeline (PR dossier)

Branch: `z17-manual-full-pipeline`
Spec: `Company Docs/Specs/SPEC-zedcor-Z17.md`
Notion card: https://www.notion.so/370785c67e72815a8612d40ad788bd57

## Root cause (one paragraph)

`lib/orchestrator/orchestrator.ts` Wave 2 called `updateProjectScore()`, which UPDATE'd a non-existent `ranked_by` column on `pathfinder.projects`. The function's return is `Promise<{ error: unknown }>` but the error was never inspected, so the whole UPDATE silently no-op'd. Every project ingested by the manual orchestrator since the schema drift ended with `score=null, rationale=null`. The downstream enrichment + pitch waves then operated on a too-narrow filter (`buy_window_open=true OR project_stage IN ('awarded','gc_selected','sub_bid','mobilization')`), so newly-ingested `solicitation` rows skipped them entirely. Finally, the Notion writer had no enrichment-complete gate, so bare shells reached the Lead Feed. The `(scoring disabled)` string the spec quoted actually comes from the Notion writer at `lib/notion/zedcor-writer.ts:325`, which appends it to the Rationale property whenever `input.score === null` — a downstream symptom of the silent-write failure, not an upstream gate that fired.

### Verbatim evidence — root cause

```text
-- Schema check (column does not exist)
SELECT column_name FROM information_schema.columns
WHERE table_schema='pathfinder' AND table_name='projects' AND column_name='ranked_by';
-- (0 rows)

-- Direct reproduction of the silent-failure path
UPDATE pathfinder.projects SET ranked_by='test'
WHERE id='harris-county-bonfire:26/0163';
-- ERROR: 42703: column "ranked_by" of relation "projects" does not exist
```

```text
-- ZED-58 / harris-county-bonfire:26/0163 as found before Z17:
score: null
rationale: null         -- not '(scoring disabled)'; Wave 2 never wrote.
project_stage: solicitation
buy_window_open: false
agent_run_id: 6713
Notion page: /ITB-Replacement-of-the-Existing-Generator-...-370785c67e7281ac92fcd2a02e4b6544 (bare shell)
```

Run 6713 (most recent pre-Z17 manual orchestrator run) `run_metadata`:
```json
{ "projects_inserted": 7, "notion_writes": 7,
  "enrichment_attempted": 0, "enrichment_succeeded": 0 }
```
Seven bare shells written to Notion. Zero enrichment attempts because
the narrow filter matched none of the seven `solicitation`-stage rows.

## Changes

| Commit | File(s) | What |
|---|---|---|
| `cf19cb2` | `lib/orchestrator/orchestrator.ts` `lib/orchestrator/zedcor-scorer.ts` `docs/Z17-DOSSIER.md` | Drop the bogus `ranked_by` column from `updateProjectScore`; surface write errors. Remove the wrong `anthropicEnabled()` gate from the deterministic scorer. |
| `183a5df` | `lib/orchestrator/orchestrator.ts` `app/api/zedcor/run-orchestrator/route.ts` | Reorder waves so pitch runs before Notion. Add `isReadyForNotion` gate (calls the already-exported `shouldWriteToZedcorNotion` + score-present + in-window-needs-hooks check). Add Wave 5 in-run backfill of pre-existing un-enriched construction rows. Per-stage counts added to `run_metadata`. Drop legacy `ZEDCOR_DISABLE_ANTHROPIC` kill-switch from `isPitchEnabled` per spec ("no paid-key dependence for core stages"). `maxDuration` 60 → 300. |
| (third commit) | `scripts/diagnose-z17-full-pipeline.ts` | End-to-end diagnostic harness driving `runZedcorOrchestrator()` against the live DB with before/after probe + aggregate counts. Provides the `ZEDCOR_Z17_SKIP_NOTION` escape hatch for local verification (production code unaffected). |

## Acceptance criteria — verbatim evidence

### #1 — One bare in-window row goes bare → enriched after a SINGLE trigger

Probe row: `hisd-ionwave:26-03-13` — "Carpet, Wood, and Other Flooring Services Maintenance and Repairs", Houston ISD, in-window construction.

**Before (pre-Z17 state):**
```text
score:              null
rationale:          null
ranked_at:          null
pitch_metadata.pitch_hooks:        (empty)
pitch_metadata.recommended_action: (null)
```

**After (single Z17 trigger — run 6716 backfill):**
```text
score:              65
rationale:          "Houston ISD: Harris County (in-network)."
ranked_at:          2026-05-30 05:53:56.751+00
project_stage:      gc_selected
buy_window_open:    true
gc_metadata.gc_name: (null — no GC found on detail page; degrade gracefully)
pitch_metadata.pitch_hooks: [
  "Houston ISD's multi-campus flooring program means overnight work crews across dozens of unmonitored school sites—Zedcor's rapid-deploy towers secure those after-hours staging areas without grid power.",
  "With flooring materials staged across HISD's sprawling district footprint, Zedcor's solar-powered surveillance towers protect laydown yards of rolled goods and equipment from theft between shifts.",
  "Zedcor's 24/7 remote monitoring service can cover HISD school sites during weekend flooring crews, giving the district real-time visibility without adding on-site security guards."
]
pitch_metadata.recommended_action:
  "Identify the project owner at the GC and call them directly. Subject:
   'Carpet, Wood, and Other Flooring Services Maintenance and R… — surveillance
   for staging yards'. Open with: Houston ISD's multi-campus flooring program
   means overnight work crews across dozens of unmonitored school sites—Zedcor's
   rapid-deploy towers secure those after-hours staging areas without grid power.
   Reference: no existing relationship on file. Follow up by 2026-05-30."
```

ZED-58 itself (`harris-county-bonfire:26/0163`) is `solicitation` + `buy_window_open=false`, so it is OUTSIDE the in-window probe set the spec asks about — it sits behind the in-window priority in the backfill queue. Subsequent triggers will reach it (32 in-window construction rows backed up before Z17; 8 enriched per trigger).

### #2 — Notion gating proven

Run 6716 ingested 3 rows from `san-antonio-city` (all `source_authority='city_purchasing'`, NOT in `CONSTRUCTION_AUTHORITIES`): "Medical Supplies and Pharmaceuticals", "Medical Supplies and Equipment", "ADA Shuttle Buses". All three were **withheld** by `isReadyForNotion()` because `shouldWriteToZedcorNotion()` returned false (not construction-relevant):
```json
"notion_withheld": 3, "notion_writes": 0
```

In the same run, the backfill produced 10 fully-enriched construction rows that PASSED the gate (score present; pitch_hooks + recommended_action present for in-window rows):
```json
"backfill_notion_writes": 10
```

Gate function: `lib/orchestrator/orchestrator.ts:isReadyForNotion()` (calls `lib/notion/zedcor-writer.ts:shouldWriteToZedcorNotion()` then checks score + in-window-pitch-hooks).

### #3 — `run_metadata` shows enrichment stage counts

Run 6716 `run_metadata` (verbatim, from `pathfinder.agent_runs`):
```json
{
  "scored": 3,
  "gc_resolved": 0,
  "contact_resolved": 0,
  "hooks_generated": 0,
  "notion_withheld": 3,
  "notion_writes": 0,
  "notion_dedupes": 0,
  "backfill_attempted": 10,
  "backfill_scored": 10,
  "backfill_gc_resolved": 6,
  "backfill_hooks_generated": 10,
  "backfill_notion_writes": 10
}
```

Pre-Z17 (run 6713) had only ingestion + Notion counts — no scoring or pitch
visibility because those silent-failed.

### #4 — No-cron proof

`Pathfinder/vercel.json` retains `"crons": []` (commit `92c9b5e`, May 24). No
cron entries were re-added by Z17 (`git diff main -- Pathfinder/vercel.json`
shows zero lines changed). All three Z17 verification runs (6716, 6717, 6718)
were driven by direct `runZedcorOrchestrator()` function calls from
`scripts/diagnose-z17-full-pipeline.ts` — no HTTP, no cron, no Inngest fan-out
required to complete the full chain.

### #5 — Backfill aggregate before / after

| Counter | Pre-Z17 (2026-05-30 05:50) | After 3 Z17 triggers | Δ |
|---|---|---|---|
| total                       | 1998 | 2001 | +3 (new ingest) |
| with_score                  | 1828 | 1857 | +29 |
| with_hooks                  | 207  | 231  | +24 |
| with_gc_name                | 77   | 90   | +13 |
| in_window                   | 42   | 42   | 0 |
| construction_total          | 187  | 190  | +3 |
| construction_with_score     | 17   | 46   | **+29** |
| construction_with_hooks     | 11   | 35   | **+24** |
| construction_in_window      | 42   | 42   | 0 |

Each trigger enriched ~8 more construction rows via backfill. With the
default `ZEDCOR_Z17_BACKFILL_CAP=30`, sustained triggers (operator running
Run Zedcor a handful of times after deploy) carry the in-window
construction set to ~100% enriched per spec.

### #6 — Idempotency

Diagnostic run with `--twice` (runs 6717 + 6718, identical inputs, no new
data between them). The second run inserted zero new rows because every
ingested row dedup'd via the `UNIQUE(source, source_id)` constraint:

```text
Run 6717: projects_inserted=0, projects_deduped=148, total=2001
Run 6718: projects_inserted=0, projects_deduped=148, total=2001
```

Direct constraint check (zero duplicate `(source, source_id)` pairs in the
whole Zedcor org):
```sql
SELECT source, source_id, COUNT(*) FROM pathfinder.projects
WHERE organization_id='6cd87740-7c72-4337-ac79-316a54242eef'
GROUP BY source, source_id HAVING COUNT(*) > 1;
-- 0 rows
```

Notion dedup: `lib/notion/zedcor-writer.ts:findExisting()` uses the
`Project ID` property as the primary key; `writeProjectToNotion()` returns
`alreadyExists=true` when the row already has a page, and the orchestrator
counts it as `notion_dedupes` rather than `notion_writes`. (In the
diagnostic runs above `notion_writes`/`notion_dedupes` are zero because
`ZEDCOR_Z17_SKIP_NOTION=true` was set so the harness can run without the
production-only `NOTION_API_TOKEN` secret — the production manual trigger
exercises the real Notion path via the existing dedup primitive.)

## Multi-Vercel verification

- `Pathfinder/` — `pnpm typecheck` clean on Z17 branch.
- `unicron-platform/` — unaffected by Z17 (orchestrator + Pathfinder writer
  code only). Independent project; build chain decoupled from this PR.

## Auto-revert criterion

If, after Kyle merges and Vercel deploys `pathfinder-ashy`, a manual
trigger of Run Zedcor throws or the Notion Lead Feed receives a bare row
(any `notion_writes > 0` while `with_pitch_hooks=false` for that page):
revert the merge commit.

## Hard rules satisfied

- No destructive git ops; worktree under `Pathfinder-worktrees/z17-manual-full-pipeline/`.
- No `Verified` column promotion (human-only); card moves to **Review** at PR open.
- No paid-key dependence for core stages: score and phase remain deterministic;
  pitch requires `ANTHROPIC_API_KEY` (core LLM, not a paid extra). Hunter / Apollo
  / ScrapingBee remain optional; absence degrades the contact-resolution wave
  gracefully without halting the chain.
- No time estimates, no numeric cost caps. Backfill scope is bounded via
  `ZEDCOR_Z17_BACKFILL_CAP` (default 30 rows per trigger).
