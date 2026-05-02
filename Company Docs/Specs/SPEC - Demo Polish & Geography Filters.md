# SPEC — Demo Polish & Geography Filters

Status: Draft v0.1
Date: 2026-05-02
Owner: Kyle (Kēkā)
Related: `00 - TUESDAY DEMO PLAN.md`, `PRD - Pathfinder Form-Fit for Zedcor.md`, `SPEC - Cross-Pollination Engine.md`

---

## 1. Why this exists

Wave 1+2+3 shipped the agent pipeline and UI surfaces. Demo-day field-testing surfaced four issues that need fixing before Tuesday 3:45 PM Central:

1. **Geography pollution.** A Romania US-airbase project surfaced (score 15) because there's no country/distance gating at ingest or verify. The lead list view shows all 416 projects regardless of relevance to Zedcor's 24 branches.

2. **Lead list modal lacks sort + filter controls.** The current modal shows "· ranked" but no way to flip sort direction, restrict to in-radius leads, or set a score floor.

3. **Header layout collision.** The "CONFIDENTIAL" badge overlaps the "Chat" label. It belongs between "Chat" and "New Opportunities Ingested." Plus the New Opportunities counter reads 0 despite real ingestion in the last 24h.

4. **Cross-pollination hidden on lead detail.** When a lead matches an existing Zedcor customer, the lead detail page should surface the relationship explicitly AND that context should feed the Recommended Outreach generation, not just trigger a badge.

This spec specifies the fix for each, plus acceptance criteria for the demo.

## 2. Geography filtering

### 2.1 Current behavior

- Ingestor pulls from sam.gov, USAspending, Harris County, news without country/region filter
- Verifier on null-coordinates skips geographic checks instead of failing → projects pass with reduced confidence
- Distance gating is informational, not gating
- 136 of 416 projects have null coordinates (33%)
- Lead list defaults to all 416 regardless of distance or score

### 2.2 New behavior

Three layers of geography enforcement:

**Layer A — Ingest filter (hard).** Reject any project whose source data indicates a non-US/Canada country. Drop before scoring. New rejection_reason = `out_of_country`. Implementation:
- For sam.gov: read `placeOfPerformance.country` field; reject if not USA or CAN
- For USAspending: read `recipient.location.country_code`; reject if not USA
- For Harris County: assume US (TX), no filter needed
- For news: extract country mentions via NER pass; if any country other than US/Canada is mentioned more than US/Canada in the body, reject

**Layer B — Coordinate enforcement (soft).** When lat/lon are null:
- Run a text-extraction fallback on title + summary + raw_payload to infer city/state
- If inference confidence ≥ 0.7, populate lat/lon from city centroid
- If still null after extraction, score the project with a `geo_unknown: true` flag and cap score at 50 (so it never appears in default top-10 views)

**Layer C — Distance gating (configurable).** New rejection_reason = `no_branch_coverage` for projects whose `nearest_zedcor_branch_distance > max_supported_distance` (default 250 miles, configurable per-org). Replace the current "skip if null" behavior with an explicit reject.

### 2.3 Schema additions

```sql
-- Add to pathfinder.projects
alter table pathfinder.projects 
  add column if not exists country text,
  add column if not exists rejection_reason text,
  add column if not exists rejected_at timestamptz,
  add column if not exists geo_unknown boolean default false,
  add column if not exists geo_inference_confidence numeric(3,2);

-- Configurable per-org distance threshold
create table if not exists pathfinder.org_geo_config (
  org_id text primary key,
  max_supported_distance_miles integer not null default 250,
  allowed_countries text[] not null default array['USA', 'CAN'],
  updated_at timestamptz not null default now()
);

insert into pathfinder.org_geo_config (org_id) values ('zedcor') on conflict do nothing;
```

### 2.4 Ranker changes

Update Ranker so that:
- Before scoring, check country against org config; if not allowed, skip scoring and write rejection_reason
- After scoring, if distance > threshold, write rejection_reason = `no_branch_coverage`
- Maintain projects.score as the raw score; `effective_score` = score IF status='qualified' ELSE NULL for rejected

### 2.5 Backfill for existing data

One-time migration to backfill the existing 416 projects:
1. For each project, infer country from placeOfPerformance / location fields in raw_payload
2. For null coordinates, run the text-extraction fallback
3. Re-evaluate distance thresholds
4. Set rejection_reason for any that fail; leave others unchanged

The Romania project specifically should land with rejection_reason = `out_of_country` after backfill.

## 3. Lead list modal Sort + Filter UI

### 3.1 Current state

Modal at `/pathfinder/` right-side lead list shows:
- Header: "ALL BRANCHES · RANKED" with count "416 of 416"
- Filter chips: "ALL", "STARRED · 1"
- Sort chips: "SCORE" (default selected), "DISTANCE", "POSTED", "MOST RECENT"
- Lead list below

### 3.2 New state

Replace the current chip layout with a unified Sort | Filter control:

**Header line:**
- "ALL BRANCHES · 416" (or "WITHIN RANGE · 47" when range filter on)
- Remove "· RANKED" label; replace with the active filter summary

**Sort control:**
- Single dropdown: Sort by [SCORE | DISTANCE | POSTED | MOST RECENT]
- Toggle button next to dropdown: ↑ ASC / ↓ DESC (clickable to flip)
- Default: SCORE, DESC

**Filter control:**
- Toggle button: "WITHIN RANGE" / "OUTSIDE RANGE" / "ALL" (3-state)
  - Within range: only projects where `nearest_zedcor_branch_distance ≤ max_supported_distance` (250mi default)
  - Outside range: only projects beyond max_supported_distance (for QA/operator review)
  - All: no distance filter
- Score floor slider: range 0-90, increments of 10
  - Label: "Score ≥ {value}"
  - Default: 0 (show all)
  - On change, filter list to projects with score ≥ value

**Remove the Atlanta / Chicago / Phoenix / Seattle preset chip row.** Branches are accessed via the map / branches panel, not via list filter chips.

### 3.3 URL state persistence

Filter + sort state should persist in the URL query string:
- `?sort=score&dir=desc&range=within&min_score=80`
- Sharing URLs preserves the view; bookmarkable

### 3.4 Visual placement

Top of modal, below the header line, in a single horizontal control row:
```
[Sort: SCORE ▾] [↓ DESC]   [Filter: WITHIN RANGE ▾] [Score ≥ 80 ▬▬▬▬○────]
```

Mobile / narrow modal: stack the sort and filter rows vertically.

### 3.5 Empty states

When filter combination produces zero results:
- "No leads match. Try widening your range or lowering score floor."
- Show the active filter summary so user knows what to adjust

## 4. Header layout fix

### 4.1 Current state

The header has overlapping elements: a "CONFIDENTIAL" tag visually overlaps "Chat". Header also contains "New Opportunities Ingested" counter showing 0 incorrectly.

### 4.2 New layout

Header row, left to right:
```
[Pathfinder logo]  [Chat ▾]  [CONFIDENTIAL]  [New Opportunities Ingested · 184]  [User ⌄]
```

Order:
1. Logo / brand
2. Chat dropdown / button
3. CONFIDENTIAL badge — distinct pill style; positioned BETWEEN Chat and the counter
4. New Opportunities Ingested counter (last 24h)
5. User menu

### 4.3 New Opportunities counter — fix the data

Counter currently shows 0. Likely cause: query is filtering by something too restrictive (e.g., status='verified' AND score >= 90 AND last 24h, when the right query is just "ingested in last 24h").

Correct query:
```sql
select count(*) from pathfinder.projects 
where ingested_at > now() - interval '24 hours';
```

This should return 184 today (per the recent verification). If the counter still shows 0 after the query is corrected, it's a frontend caching / fetcher bug to investigate.

### 4.4 CONFIDENTIAL badge styling

- Background: light red or amber (visible but not alarming)
- Text: monospace small caps
- Padding: tight
- Tooltip on hover: "All data on this page is customer-confidential. Do not screenshot or share outside Zedcor."

## 5. Cross-pollination on lead detail page

### 5.1 Current state

When a lead matches an existing Zedcor customer (cross-pollination match), the lead currently shows a small "Warm Intro" badge and gets a +10 score boost. The match metadata is stored in `pathfinder.lead_cross_pollination` but isn't surfaced explicitly in the lead detail UI. The Recommended Outreach generation doesn't read cross-pollination context.

### 5.2 New behavior

**On lead detail page**, when at least one cross-pollination match exists, render a dedicated "Relationship Context" section between the project metadata and the verifier output:

```
RELATIONSHIP CONTEXT — Warm Intro Available
─────────────────────────────────────────
Matched Entity: D.R. Horton Inc. (prime contractor)
Match Type: Exact (confidence 1.00)

Existing Zedcor Relationship:
  • Active sites: 3
  • Primary branch: South Houston (TX)
  • Most recent site: 2026-04-15 (17 days ago)
  • Customer satisfaction signal: [contract renewal status if available]

This project: First D.R. Horton project in Tennessee.
Recommended next step: Coordinate with South Houston branch
before reaching out. They likely have established contacts
and pricing context.
```

If multiple matches exist (e.g., owner AND prime contractor both match different existing customers), show each match with its own block.

### 5.3 Cross-pollination feeds Recommended Outreach

Currently the Outreach Drafter generates from the project metadata. After this change, when cross-pollination matches exist, the Drafter receives the full match context as additional input:

```typescript
type OutreachContext = {
  project: ProjectMetadata,
  scoring: ScoreBreakdown,
  cross_pollination?: CrossPollinationMatch[],  // NEW
};
```

The Drafter prompt is augmented with a section like:

```
RELATIONSHIP CONTEXT (use this to personalize):
- Customer "D.R. Horton" is already a Zedcor customer
- Active in 3 sites in South Houston branch
- Most recent activity: April 15, 2026

Reference this relationship in your outreach. Lead with: 
"Hi <Name>, I see your team is working on <project>. Zedcor 
has been supporting D.R. Horton on multiple South Houston 
sites — the towers there..." Then transition to the new 
project's specifics and CTA.
```

When no match exists, the Drafter falls back to the standard cold outreach template.

### 5.4 Ranking implications

The score boost stays at +10 for any cross-pollination match. After this change, the boost is justified by something visible to the operator (the Relationship Context section), not just an invisible badge.

### 5.5 Schema unchanged

Uses existing `pathfinder.lead_cross_pollination` join table. No migration needed.

## 6. Acceptance criteria for Tuesday demo

Each fix is demo-day-acceptable when:

**Geography:**
- Romania project's Stage = "rejected" with rejection_reason = "out_of_country" in the database
- Lead list with default filters shows ZERO foreign-country projects
- Score distribution shifts: more projects above 50 because the noise is filtered out

**Sort + Filter UI:**
- Sort dropdown + direction toggle render correctly
- "Within Range" filter restricts list to ≤ 250mi from any Zedcor branch
- Score floor slider works end-to-end
- Atlanta/Chicago/Phoenix/Seattle preset chips removed
- URL state persists across reload

**Header layout:**
- CONFIDENTIAL badge between Chat and New Opportunities counter, no overlap
- New Opportunities counter shows realistic last-24h count (≥100 per current ingestion volume)

**Cross-pollination:**
- At least one demo lead in Nashville / Pittsburgh / LA has a visible Relationship Context section
- The Recommended Outreach for that lead opens with the relationship reference (e.g., "I see Zedcor is already supporting [customer] in [branch]...")
- The relationship feels organic, not bolted on

## 7. Build sequence

Three independent streams; can run in parallel:

**Stream P1 — Geography filtering (highest impact, 2-3 hours)**
- Schema migration (additive)
- Ingest-time country filter (sam.gov, USAspending, news adapters)
- Coordinate enforcement / text-extraction fallback
- Distance gating
- Backfill migration for existing 416 projects

**Stream P2 — Lead list UI (1-2 hours)**
- Sort dropdown + direction toggle component
- Filter controls (within range / score floor)
- Remove preset chip row
- URL state persistence
- Empty states

**Stream P3 — Header + Cross-pollination on detail (2-3 hours)**
- Header layout fix (CONFIDENTIAL position)
- New Opportunities counter query fix
- Lead detail Relationship Context section
- Outreach Drafter prompt augmentation with cross-pollination context
- Regenerate top-3-per-branch demo outreach drafts using new context

After all three merge: re-run three-branch pipelines to refresh the demo data with all the new filters + cross-pollination outreach applied.

## 8. Open questions

- Per-org `max_supported_distance_miles`: 250 is the proposed default. Confirm with CTO Kyle whether some branches have wider effective coverage. Likely yes for less-densely-served regions.
- Text-extraction fallback for null coordinates: use a lightweight LLM pass (Haiku) or a deterministic regex / NER lib? Lean Haiku — cost is trivial at 416 projects.
- Should the score floor slider remember its last position per user, or reset on reload? Lean: persist via URL query string only; no per-user storage.
- Should "Outside Range" be hidden from default UI (operator-only)? Probably yes for the customer-facing dashboard. For the demo, expose all three states (ALL / WITHIN / OUTSIDE) since CTO Kyle is technical and may want to see what's filtered.
- Cross-pollination context: when there are 5+ matches (e.g., a major national contractor on a project), show top 3 by recency or by branch_count? Lean: top 3 by recency.

## 9. Out of scope

- Real-time Vercel Edge filter pushdown (defer; fine to filter client-side with the current ~416 record volume)
- Per-rep saved filter views (covered by separate "Saved filters / views" backlog card)
- Score-floor slider with non-uniform increments (e.g., finer near 90)
- Multi-country support beyond US/Canada (defer until Zedcor expands or new customer requires)

## 10. Implementation prompt

See `PROMPT - Demo Polish Sprint.md` for the paste-ready Claude Code launch prompt that runs all three streams.
