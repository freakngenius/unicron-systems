# SPEC — Lead Detail Enrichment

Demo Polish UX Sprint, Gate 3 contract. Defines the 10 lead-detail fields that
must be populated and rendered for the top-50 leads by score before the Tuesday
2026-05-05 Zedcor demo. Source: `00 - TUESDAY DEMO PLAN.md` CRITICAL #8.

This spec is the per-field contract: where the value comes from, how it is
extracted, how it is rendered, and what null means.

---

## Field map

For each of the 10 demo fields below: **column** is the new (or existing)
`pathfinder.projects` column the UI reads from. **Source order** is left-to-right
preference — try raw_payload first (cheap, deterministic, free), fall back to
enrichment for null values.

### 1. Owner / developer (with PE / municipality flag)

| Element | Value |
|---|---|
| Columns | `owner_name TEXT`, `owner_type TEXT` |
| owner_type values | `federal_agency`, `state_agency`, `municipality`, `private_developer`, `pe_firm`, `reit`, `university`, `nonprofit`, `other` |
| Source — sam.gov | `raw_payload->>'fullParentPathName'` (parent agency, e.g. `DEPT OF DEFENSE.DEPT OF THE NAVY...`). Owner name = leaf segment. owner_type = `federal_agency`. |
| Source — usaspending | `raw_payload->>'Awarding Agency'` (agency that issued the contract is the **owner**, not the recipient). owner_type = `federal_agency` (all 177 rows are federal). |
| Source — harris | `raw_payload->>'address'` is a property address, not an owner. owner_name = null from raw; enrichment required. |
| Source — news | Title/summary text only; enrichment required. |
| Enrichment | Perplexity Sonar — given title + summary + place_of_performance, identify the property owner / developer. Sonar prompt asks for the entity that owns the project (not the GC), and classifies into the owner_type taxonomy. PE-firm flag triggers when ownership is a fund or named portfolio company. |
| Render | `owner_name` shown bold; `owner_type` rendered as a chip next to it (e.g. `MUNICIPALITY`, `PE FIRM`, `FEDERAL AGENCY`). Null → `—`. |

### 2. Prime contractor

| Element | Value |
|---|---|
| Column | `prime_contractor_name TEXT` |
| Source — usaspending | `raw_payload->>'Recipient Name'` (177/183 rows; this **is** the awardee). |
| Source — sam.gov | Pre-award solicitations have no awardee. Leave null at backfill, enrich via Sonar only when an award notice is present (`raw_payload->>'award'` not null) — otherwise leave null. |
| Source — harris | `raw_payload->>'contractor_listed' = true` signals a contractor exists on the permit; the actual name is not in the seed payload. Enrichment required when flag is true. |
| Source — news | Enrichment required. |
| Enrichment | Sonar — search for the GC named on the project. Skip when source = sam.gov solicitation pre-award. |
| Render | Plain text. Null → `—`. |

### 3. Key subs with company names

| Element | Value |
|---|---|
| Column | `key_subs JSONB` — array of `{ name: string, role?: string, source_url?: string }` |
| Source | None of the four sources include sub-tier rosters. |
| Enrichment | Sonar — for top-50 leads, query for known subcontractors (security, electrical, civil) attached to the prime. Cap at 5 subs per project. Empty array if not found; never hallucinate. |
| Render | Bullet list of names with optional role suffix. Empty array → `Not yet enriched`. |

### 4. Project description

| Element | Value |
|---|---|
| Column | `description_long TEXT` (distinct from existing `summary` which is one-line) |
| Source — usaspending | `raw_payload->>'Description'` (177/183 rows). Use as-is when length > 60 chars. |
| Source — sam.gov | `raw_payload->>'description'` is a URL, not content (275 rows). Backfill leaves description_long null. The short `summary` column already holds a usable line. |
| Source — harris / news | Use `summary` column when present; otherwise enrichment. |
| Enrichment | Anthropic (Sonnet) — summarize the project into a 2-3 sentence description focused on scope + scale + duration. Never invent facts; if input is too thin, output `Insufficient detail in source.` |
| Render | 2-3 sentence paragraph. Null → fall back to `summary`; both null → `—`. |

### 5. Industry classification (NAICS preferred)

| Element | Value |
|---|---|
| Columns | `naics_code TEXT` (6-digit), `naics_description TEXT` |
| Source — sam.gov | `raw_payload->>'naicsCode'` (260/284 rows). Description joinable via the canonical NAICS taxonomy table — but for backfill we leave naics_description null and let the enrichment step or a static lookup fill it. |
| Source — usaspending | `raw_payload->>'naics'` populated for only 9 / 183 rows. Bulk are null. |
| Source — harris / news | Not present. |
| Enrichment | Anthropic — given title + description, classify into the closest 6-digit NAICS code. Confidence threshold ≥ 0.7 to write; otherwise leave null. |
| Render | `naics_code · naics_description` (e.g. `561612 · Security Guards and Patrol Services`). Code-only when description is null. Null → `—`. |

### 6. Location + GPS coordinates

| Element | Value |
|---|---|
| Columns | existing `lat`, `lon`; new `location_text TEXT` (human-readable) |
| Source — sam.gov | `raw_payload->>'placeOfPerformance'` (203/284) → flatten to `City, ST` for `location_text`. lat/lon already populated by GeoMapper. |
| Source — usaspending | `raw_payload->>'Place of Performance State Code'` (163/183) → state-only `location_text` (e.g. `CO`). lat/lon from GeoMapper. |
| Source — harris | `raw_payload->>'address'` → use as `location_text` directly. |
| Source — news | Title / summary parsing for city; enrichment fallback. |
| Enrichment | Skip — coordinates already enriched by `scripts/backfill-geography.ts`. Location text uses raw_payload only; never enriched. |
| Render | `location_text` line; below it, `lat.toFixed(4), lon.toFixed(4)` in monospace. Null GPS → `—` for coords; null location_text → `—`. |

### 7. Estimated start / end dates

| Element | Value |
|---|---|
| Columns | `estimated_start_date DATE`, `estimated_end_date DATE` |
| Source — sam.gov | `raw_payload->>'responseDeadLine'` is the bid deadline (proxy for *start of work*); `raw_payload->>'archiveDate'` is the close-out date (proxy for *end of solicitation*). For solicitations these are bid-window dates, not project execution dates — labeled distinctly in the UI. |
| Source — usaspending | `Period of Performance Start Date` and `Period of Performance Current End Date` — both 0/183 in the corpus. Bulk null at backfill; enrichment required. |
| Source — harris | `raw_payload->>'filing_date'` → `estimated_start_date` only (no end). |
| Enrichment | Sonar — find published start / end dates for the project. Validate output as ISO-8601 dates before writing. |
| Render | `estimated_start_date – estimated_end_date` (e.g. `2026-06-01 – 2027-04-30`). Single date if only start populated. Both null → `—`. |

### 8. Permit info + jurisdiction + dates

| Element | Value |
|---|---|
| Columns | `permit_number TEXT`, `permit_jurisdiction TEXT`, `permit_filing_date DATE`, `permit_type TEXT` |
| Source — harris | `raw_payload->>'permit_type'` (`commercial-renovation`, etc.); `raw_payload->>'filing_date'`. Jurisdiction = `Harris County, TX` (constant for this source). Permit number = source_id. |
| Source — sam.gov / usaspending / news | Federal contracts and news articles do not carry city permit data. Enrichment required only when high-value justifies it. |
| Enrichment | Sonar — for top-50 non-harris leads only, attempt permit lookup against the lead's jurisdiction (city of place_of_performance). Frequently null. |
| Render | `permit_type · permit_number` line; `permit_jurisdiction` below; `permit_filing_date` formatted MM-DD-YY. All null → `Not yet enriched`. |

### 9. Estimated project cost

| Element | Value |
|---|---|
| Column | existing `project_value NUMERIC` (already populated for sam.gov/usaspending). |
| Source — sam.gov | `raw_payload->>'amount'` → already set on `project_value` at ingest. |
| Source — usaspending | `raw_payload->>'Award Amount'` → already set on `project_value` at ingest. |
| Source — harris / news | Often null. |
| Enrichment | Sonar — for null project_value rows in top-50, attempt to retrieve published project value or estimated construction cost. |
| Render | `$X.XM` shorthand (millions). Null → `—`. |

### 10. Lot size

| Element | Value |
|---|---|
| Column | `lot_size_acres NUMERIC` |
| Source | Not present in any of the 4 raw_payload structures. |
| Enrichment | Sonar — given location_text or address, lookup parcel / lot size (acres). Validate as positive number ≤ 10000 before writing. Frequently null for solicitation-only leads. |
| Render | `X.X acres` (1 decimal). Null → `Not yet enriched`. |

---

## New columns (migration `0110_lead_detail_columns.sql`)

All columns are nullable and additive. No DROP. No destructive ALTER.

```sql
alter table pathfinder.projects
  add column if not exists owner_name             text,
  add column if not exists owner_type             text,
  add column if not exists prime_contractor_name  text,
  add column if not exists key_subs               jsonb,
  add column if not exists description_long       text,
  add column if not exists naics_code             text,
  add column if not exists naics_description      text,
  add column if not exists location_text          text,
  add column if not exists estimated_start_date   date,
  add column if not exists estimated_end_date     date,
  add column if not exists permit_number          text,
  add column if not exists permit_jurisdiction    text,
  add column if not exists permit_filing_date     date,
  add column if not exists permit_type            text,
  add column if not exists lot_size_acres         numeric,
  add column if not exists enriched_at            timestamptz,
  add column if not exists enrichment_provider    text,
  add column if not exists enrichment_cost_usd    numeric;
```

`enrichment_provider` values:
- `raw_payload_only` — backfilled from raw_payload, no LLM calls.
- `sonar` — Perplexity Sonar fields only.
- `anthropic` — Anthropic fields only.
- `sonar+anthropic` — combined enrichment pass.

`enrichment_cost_usd` is the cumulative enrichment cost for this project, summed across providers.

---

## Backfill order (Gate 3B)

`scripts/backfill-lead-detail-fields.ts`:

1. Pull all 481 projects in batches of 100.
2. For each project, branch on `source`:
   - **sam.gov** → owner from `fullParentPathName`, owner_type=`federal_agency`, naics_code from `naicsCode`, location_text flattened from `placeOfPerformance` object, estimated_start_date from `responseDeadLine`, estimated_end_date from `archiveDate`. description_long left null (sam.gov description is a URL).
   - **usaspending** → owner from `Awarding Agency`, owner_type=`federal_agency`, prime_contractor_name from `Recipient Name`, description_long from `Description`, location_text from `Place of Performance State Code`. POP dates left null (corpus has none).
   - **harris** → permit_number from source_id, permit_type from `raw_payload->>'permit_type'`, permit_filing_date from `filing_date`, permit_jurisdiction = `Harris County, TX`, location_text from `address`, estimated_start_date from `filing_date`.
   - **news** → location_text parsed from title/summary if simple, else null.
3. Set `enrichment_provider = 'raw_payload_only'`, `enriched_at = now()` for the whole batch.
4. Print before/after counts per column.

Idempotent: only updates columns currently null. Safe to re-run.

---

## Enrichment pass (Gate 3C)

`services/enricher/lead-detail.ts` (new):

1. Select top-50 projects by score (descending), excluding rejected (`rejection_reason is null`).
2. For each project, dispatch:
   - **Sonar** — single call per project, requesting the 7 enrichment-only fields it owns: owner_name (when null), owner_type, key_subs, lot_size_acres, permit_number/jurisdiction/filing_date/type when null, prime_contractor_name when null, estimated_start_date/end_date when null. Returns structured JSON; we merge non-null values only.
   - **Anthropic (Sonnet)** — single call when `description_long` is null OR `naics_code` is null. Summarizes description, classifies NAICS.
3. Write per-project: merged values, `enriched_at = now()`, `enrichment_provider = 'sonar+anthropic'` (or `'sonar'` / `'anthropic'` if one path was skipped because no fields needed it), `enrichment_cost_usd += <run cost>`.
4. Cost capture goes through `lib/llm/run.ts` (which writes to `pathfinder.llm_calls`). Aggregate run cost recorded in `MEMORY/demo-polish-ux-sprint-live-status.md`. Hard halt if total > 5x existing per-run pattern.

Existing per-run baseline (per `MEMORY/zedcor-sprint-live-status.md`): Outreach Drafter is the highest spender at ~$0.40 per run. 5x baseline ≈ $2.00. **Hard halt if Gate 3C total enrichment cost > $10** (50 leads × $0.20 = $10 ceiling — already 5x of the highest-cost agent's per-run number times the lead cap).

---

## UI rendering (Gate 3D)

New component: `Pathfinder/components/lead/ProjectFactsCard.tsx`.

```tsx
<SidebarCard title="Project facts">
  <Field label="Owner" value={owner_name} chip={owner_type} />
  <Field label="Prime contractor" value={prime_contractor_name} />
  <Field label="Key subs" value={key_subs}> ... </Field>
  <Field label="Description" value={description_long ?? summary} />
  <Field label="NAICS" value={naics_code ? `${naics_code} · ${naics_description}` : null} />
  <Field label="Location" value={location_text} subtitle={`${lat}, ${lon}`} />
  <Field label="Dates" value={`${estimated_start_date} – ${estimated_end_date}`} />
  <Field label="Permit" value={permit_type ? `${permit_type} · ${permit_number}` : null}
                       subtitle={permit_jurisdiction ?? null}
                       date={permit_filing_date} />
  <Field label="Estimated cost" value={project_value ? formatMoney(project_value) : null} />
  <Field label="Lot size" value={lot_size_acres ? `${lot_size_acres} acres` : null} />
</SidebarCard>
```

Null values render as `—`; explicitly-non-extractable fields (`key_subs` empty, `lot_size_acres` null) render as `Not yet enriched` only when `enriched_at is null`. After enrichment, null means "not found"; UI shows `—`.

The card is inserted in `Sidebar` (in `components/lead/LeadDetail.tsx` line 527) **above** the existing `Rationale` card so the demo flow leads with facts.

### Posted date reformat

In `LeadDetail.tsx` and `ProjectList.tsx` (or wherever `posted_date` renders),
change:

```
2026-05-01
```

to two-line format:

```
3 days ago
05-01-26
```

Top line: relative ("X days ago", "Today", "1 day ago"). Subtitle: MM-DD-YY in
monospace small caps.

---

## Acceptance criteria (Gate 3E)

- Houston flagship (`sam.gov:TXDOT-I45-2026-001`) renders all 10 fields populated. If any is blank for the flagship, halt — flagship must be the cleanest example.
- Top-5 by score per metro (Houston / LA / Nashville / Pittsburgh) all show ≥ 8 of 10 fields populated.
- Cross-pollination signature beats (Brasfield & Gorrie, Big-D Construction) remain visible in the dashboard with their cross-poll banners intact.
- No regression in existing Sidebar cards (Rationale, Contacts, Recent sends).
- Enrichment cost recorded in `pathfinder.llm_calls` for the run window; total ≤ $10.

---

## Hard constraints

- Schema additive only. NO DROP, NO destructive ALTER.
- Backfill is idempotent — only updates null columns.
- Enrichment never overwrites raw_payload-derived values; only fills null gaps.
- `key_subs` and other Sonar outputs must not hallucinate. Empty array preferred over fabrication. The Sonar prompt enforces this.
- Cost halt at $10 total Gate 3C spend.
- Houston flagship cross-poll display preserved end-to-end.
