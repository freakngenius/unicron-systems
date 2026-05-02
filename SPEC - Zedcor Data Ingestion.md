# SPEC — Zedcor Data Ingestion

Status: Draft v0.1
Date: 2026-05-01
Owner: Kyle (Kēkā)
Related: `PRD - Pathfinder Form-Fit for Zedcor.md`, `SPEC - Cross-Pollination Engine.md`

---

## 1. Why this exists

Zedcor's CTO sent two Excel files on May 1: a 24-branch list and a 1,863-row active customer sites list. These power GeoMapper proximity scoring, the cross-pollination engine, the branch radius map, and national account detection. This spec defines the schema, the normalization, the geocoding, and the ingestion script.

## 2. Source files

Path: `/Users/keka/Dropbox/Projects/Unicron Systems/Zedcor/`

### 2.1 `Zedcor Branch List.xlsx`

Sheet `branches`, 35 rows (1 header + 34 data, but only ~24 of those are real US/Canada branches per CTO; remaining rows may be placeholder or pending).

Columns:
- `branch_name` (text, e.g., "Calgary", "Houston", "Nashville")
- `country` ("Canada" or "USA")
- `province/State` (e.g., "AB", "TX")

Limitation: no addresses, no lat/lon, no branch IDs. Branch names are city-level. Geocode to city centroid acceptable for demo; CTO Kyle can send specific branch addresses post-demo.

### 2.2 `Zedcor - Unique Customer Sites 2026-04-29.xlsx`

Sheet `Sheet1`, 1,863 rows + 1 header.

Columns:
- `Customer Name` (text, sometimes null — must parse from Site Location field when missing)
- `Site Location` (text, format usually "Customer : Site Name - Address")
- `Address`
- `City` (often filled by Zedcor's audit pass; some still blank)
- `Prov` (Province/state code)
- `Lat.` (numeric, populated)
- `Long.` (numeric, populated)

Sheet `City Update Audit` is a metadata audit log of how blank city values were filled. Not for ingestion. Skip during ingestion but worth flagging in the operator notes that Zedcor has internal data hygiene processes already.

Data quality issues observed:
- ~14 null Customer Name rows (parse from Site Location's "Customer : ..." prefix when present)
- Inconsistent suffixes ("Inc.", "LLC", "GP", "c/o ...", " - South Houston" suffix patterns)
- Some addresses are full mailing addresses, some are partial directions ("East of Hwy 10 and Fraser Hwy Intersection")
- Customer names with multi-line patterns ("EllisDon Civil c/o EllisDon Corp." actually represents two entities; canonical = "ellisdon civil" with parent "ellisdon")

## 3. Schema

### 3.1 `pathfinder.zedcor_branches`

```sql
create table pathfinder.zedcor_branches (
  id uuid primary key default gen_random_uuid(),
  customer_org_id text not null default 'zedcor',
  branch_name text not null,
  country text not null check (country in ('USA', 'Canada', 'CA', 'US')),
  state text not null,
  city text,
  lat numeric(9, 6),
  lon numeric(9, 6),
  radius_miles integer not null default 200,
  is_active boolean not null default true,
  geocode_source text check (geocode_source in ('google_geocoding', 'city_centroid', 'manual_override', null)),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_zb_org on pathfinder.zedcor_branches(customer_org_id);
create index idx_zb_active on pathfinder.zedcor_branches(customer_org_id, is_active);
```

### 3.2 `pathfinder.zedcor_customer_sites`

```sql
create table pathfinder.zedcor_customer_sites (
  id uuid primary key default gen_random_uuid(),
  customer_org_id text not null default 'zedcor',
  customer_name_raw text,
  customer_name_normalized text not null,
  parent_company_canonical text,
  site_name text,
  address text,
  city text,
  state text,
  lat numeric(9, 6),
  lon numeric(9, 6),
  is_active boolean not null default true,
  source_row_index integer,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_zcs_normalized on pathfinder.zedcor_customer_sites(customer_org_id, customer_name_normalized);
create index idx_zcs_parent on pathfinder.zedcor_customer_sites(customer_org_id, parent_company_canonical) where parent_company_canonical is not null;
create index idx_zcs_geo on pathfinder.zedcor_customer_sites using gist (point(lon, lat));
```

GiST index on geographic point enables efficient nearest-customer-site lookup if needed.

## 4. Ingestion script

### 4.1 Location

`Pathfinder/scripts/seed-zedcor.ts`

### 4.2 Behavior

```
Usage: pnpm tsx scripts/seed-zedcor.ts [--dry-run] [--branches-only] [--sites-only]

Steps:
1. Read Zedcor Branch List.xlsx
2. Filter rows to actual US/Canada branches (24 rows; skip the empty Sheet1 rows or any obvious placeholders)
3. Normalize country codes (Canada → CA, USA → US)
4. Geocode each branch to city centroid via Google Geocoding API (or the embedded city-centroid lookup table for the 24 known cities — see Appendix A)
5. Insert into pathfinder.zedcor_branches with geocode_source='google_geocoding' or 'city_centroid' as appropriate
6. Read Zedcor - Unique Customer Sites 2026-04-29.xlsx (Sheet1)
7. For each row:
   a. Parse customer_name from Customer Name field; if null, parse from Site Location prefix
   b. Normalize customer_name → customer_name_normalized using the rules in SPEC - Cross-Pollination Engine.md
   c. Resolve parent_company_canonical via common-prefix heuristic (apply to all rows; use prefix-collision detection)
   d. Insert into pathfinder.zedcor_customer_sites
8. Run a one-time LLM-assisted parent-company resolution pass on ambiguous cases (rows where common-prefix yielded a generic prefix like "the" or "north")
9. Build the in-memory cross-pollination index (already covered in cross-pollination spec, just confirm warm cache)
10. Verify: count, sample 20 random rows, check normalization correctness
```

### 4.3 Idempotency

Re-running the script should:
- Update geocodes if geocode_source != 'manual_override'
- Update normalized name if customer_name_raw changes
- Insert new rows for new entries; do NOT delete missing rows on re-run (Zedcor may send incremental updates)
- Use a unique constraint on (customer_org_id, customer_name_raw, address) to prevent duplicates

### 4.4 Error handling

- Geocoding API failures: fall back to city centroid lookup. If city not in the lookup table, log a warning and leave lat/lon null with notes='geocoding_failed_no_centroid'.
- Malformed rows: log to `MEMORY/operator-todos/zedcor-ingestion-errors.md` and skip.
- Duplicate detection: log dupes, keep first occurrence, log subsequent.

## 5. Normalization rules (single source of truth)

Per `SPEC - Cross-Pollination Engine.md` Section 3.1. Both this spec's ingestion script and the cross-pollination engine MUST use the same normalization function. Implementation lives at `Pathfinder/lib/normalization/customer-name.ts` and is imported by both consumers.

```typescript
export function normalizeCustomerName(raw: string): string {
  if (!raw) return '';
  
  let s = raw.toLowerCase();
  
  // Remove c/o and trailing parens
  s = s.replace(/\s+c\/o\s+.*$/i, '');
  s = s.replace(/\s*\([^)]*\)\s*$/, '');
  
  // Strip suffixes (order matters; longer first)
  const suffixes = [
    /\s+(corporation|incorporated|limited|company)\s*$/i,
    /\s+(inc|ltd|corp|llc|llp|gp|lp|co|gmbh|ag)\.?\s*$/i,
  ];
  for (const re of suffixes) s = s.replace(re, '');
  
  // Remove punctuation except hyphens
  s = s.replace(/[.,;:'"]/g, '');
  
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  
  return s;
}
```

## 6. Parent-company resolution

Common-prefix heuristic implementation:

```
For all customers in the corpus, group by first 3 words of normalized name.
For each group with size > 1:
  - Compute longest common prefix of normalized names in the group
  - If prefix length >= 4 chars AND prefix doesn't match a denylist of generic words 
    (the, north, south, east, west, new, big, etc.), assign prefix as parent_company_canonical
  - Else, leave parent_company_canonical null

Example:
  ["dr horton south houston", "dr horton dallas", "dr horton phoenix"]
  → common prefix "dr horton"
  → assign all three's parent_company_canonical = "dr horton"

Edge case:
  ["acme inc.", "acme holdings", "acme construction"]
  → common prefix "acme"
  → assign all three's parent_company_canonical = "acme"
  → in cross-pollination, this means an unrelated "ACME LLC" lead might match all three
  → mitigation: also require similarity in the suffix to count as same parent
  → for v1 demo: accept this risk, surface in audit log, operator can override
```

Post-demo: replace heuristic with LLM-assisted pass (Sonnet) that takes a sample of customer name groupings and outputs explicit parent-company assignments with confidence. Cost ~$5 one-time for the 1,863-row corpus.

## 7. Branch geocoding

For demo, embed a city-centroid lookup table for the 24 known Zedcor cities. Each branch geocodes to its city's centroid (city-level precision is acceptable for the 200mi radius use case; specific branch addresses are the post-pilot enhancement).

### Appendix A: City centroid lookup table (sample)

```typescript
const CITY_CENTROIDS = {
  // Canada
  'Calgary,AB': { lat: 51.0447, lon: -114.0719 },
  'Chilliwack,BC': { lat: 49.1579, lon: -121.9515 },
  'Leduc,AB': { lat: 53.2594, lon: -113.5520 },
  'Ottawa,ON': { lat: 45.4215, lon: -75.6972 },
  'Toronto,ON': { lat: 43.6532, lon: -79.3832 },
  'Winnipeg,MB': { lat: 49.8954, lon: -97.1385 },
  // USA
  'Alabama,AL': { lat: 32.3617, lon: -86.2792 },  // Montgomery as Alabama centroid; CTO to confirm specific branch
  'Albuquerque,NM': { lat: 35.0844, lon: -106.6504 },
  'Arkansas,AR': { lat: 34.7361, lon: -92.3311 },  // Little Rock
  'Austin,TX': { lat: 30.2672, lon: -97.7431 },
  'Charlotte,NC': { lat: 35.2271, lon: -80.8431 },
  'Dallas,TX': { lat: 32.7767, lon: -96.7970 },
  'Denver,CO': { lat: 39.7392, lon: -104.9903 },
  'Georgia,GA': { lat: 33.7490, lon: -84.3880 },  // Atlanta
  'Houston,TX': { lat: 29.7604, lon: -95.3698 },
  'Los Angeles,CA': { lat: 34.0522, lon: -118.2437 },
  'Nashville,TN': { lat: 36.1627, lon: -86.7816 },
  'Phoenix,AZ': { lat: 33.4484, lon: -112.0740 },
  'Pittsburgh,PA': { lat: 40.4406, lon: -79.9959 },
  // Add remaining branches based on full Branch List
};
```

CTO Kyle's branch list spreadsheet has only `branch_name`, `country`, and `province/State`. For ambiguous state-only entries (e.g., "Alabama" without a city), Kyle to confirm specific city Monday morning. Default to state capital for demo.

## 8. Verification

Before demo:
1. `select count(*) from pathfinder.zedcor_branches where lat is not null;` ≥ 24
2. `select count(*) from pathfinder.zedcor_customer_sites;` = 1,863 (within ±5)
3. `select count(*) from pathfinder.zedcor_customer_sites where customer_name_normalized is not null and length(customer_name_normalized) > 0;` = 1,863
4. `select customer_name_normalized, count(*) from pathfinder.zedcor_customer_sites group by customer_name_normalized order by count desc limit 20;` should show top customers (D.R. Horton, Home Depot Canada, Maple Reinders, EllisDon variants, etc.)
5. Spot-check 20 random rows: customer_name_normalized is sensible, parent_company_canonical reasonable
6. `select count(*) from pathfinder.zedcor_customer_sites where lat is null;` = 0 (or document the exceptions in operator todos)

## 9. Open questions

- Branch addresses post-demo: CTO Kyle will send specific branch street addresses. Re-geocode at that point.
- Some branches in the spreadsheet may be "Alabama" or "Arkansas" (state-level, not city). Confirm with CTO Monday morning whether these represent specific cities (e.g., "Alabama" might mean Birmingham or Montgomery) or whether the branch covers the entire state.
- Customer site list cadence: how often will Zedcor send updates? Weekly? Monthly? On-demand? Defines the re-ingestion cron schedule.
- Data freshness signal per customer site: do we get last-contract-date or last-touchpoint-date so we can weight matches by recency? Today's spreadsheet doesn't have that. Ask post-demo.
