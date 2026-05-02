# SPEC — Cross-Pollination Engine

Status: Draft v0.1
Date: 2026-05-01
Owner: Kyle (Kēkā)
Related: `PRD - Pathfinder Form-Fit for Zedcor.md`, `SPEC - Zedcor Data Ingestion.md`

---

## 1. Why this exists

Zedcor's CTO named the cross-pollination feature as the single biggest opportunity they're currently missing. They have ~1,863 active customer relationships across 24 branches. When a new lead comes in naming a contractor or owner who's already a Zedcor customer in another region, Zedcor has a warm-intro advantage that today is invisible to the branch sales rep.

This spec defines the matching engine that:
- Maps any new lead's owner / GC / key subs against Zedcor's existing customer relationships
- Surfaces matches with confidence and context (which branch, how many active sites, recency)
- Boosts ranking score on warm-intro leads
- Detects national accounts (5+ branches) for HQ-managed routing
- Supports false-positive prevention via parent-company resolution

For Tuesday's demo, this is the highest-leverage feature.

## 2. Inputs

### 2.1 Lead-side input

Each lead has the following entity-bearing fields:
- `project_owner` (e.g., "Hines Real Estate Investment Trust")
- `prime_contractor` (e.g., "DPR Construction Inc.")
- `key_subs` (array, e.g., ["Roofers Inc.", "Acme Steel"])
- `parent_company` (optional, set during enrichment)

### 2.2 Customer-side input

`pathfinder.zedcor_customer_sites` table populated from the 1,863-row spreadsheet. Per `SPEC - Zedcor Data Ingestion.md`. Columns:
- `customer_name_raw`
- `customer_name_normalized`
- `parent_company_canonical` (resolved during ingestion or via the resolution layer below)
- `branch_id`, `branch_name`, `state`
- `lat`, `lon`
- `is_active`
- `customer_org_id` ('zedcor' for now)

### 2.3 Configuration

Per Zedcor org:
- `national_account_branch_threshold` (default 5)
- `fuzzy_match_max_distance` (default 3 Levenshtein on normalized form)
- `score_boost_for_warm_intro` (default +10 to base ranker score)
- `score_boost_for_national_account` (default 0; national accounts are HQ-only, no branch action)

## 3. Matching algorithm

### 3.1 Normalization

Both lead-side and customer-side names go through a canonical normalization pass:

1. Lowercase
2. Strip common corporate suffixes: Inc, Inc., LLC, Ltd, Ltd., Corp, Corp., Corporation, Co., Company, GP, LP, LLP, GmbH, AG
3. Strip "c/o" and trailing parenthesis content (e.g., "EllisDon Civil c/o EllisDon Corp." → "ellisdon civil")
4. Collapse multiple spaces to single
5. Strip leading and trailing whitespace
6. Remove punctuation except hyphens
7. Output as a single canonical string

Example transformations:
- "D.R. Horton Inc. - South Houston" → "dr horton south houston"
- "EllisDon Civil c/o EllisDon Corp." → "ellisdon civil"
- "ARCO Design/Build" → "arco design/build"

### 3.2 Three matching layers, evaluated in order

#### Layer 1: Exact match on normalized form

Lookup `customer_name_normalized` against an in-memory index. If found, match confidence = 1.0.

#### Layer 2: Fuzzy match on normalized form (Levenshtein)

For each unmatched candidate, compute Levenshtein distance to every customer in the same approximate length window (±20% of candidate length). If `min_distance ≤ fuzzy_match_max_distance` (3 default), consider as match candidate. Match confidence = `1 - (distance / max(len_a, len_b))`.

#### Layer 3: Parent-company canonical match

Both leads and customers have an optional `parent_company_canonical` field resolved by:
- Common-prefix heuristic (e.g., "D.R. Horton South Houston" and "D.R. Horton Dallas" both have "d.r. horton" as the common prefix; canonical = "d.r. horton")
- One-time LLM-assisted pass at customer ingestion that tags ambiguous cases
- Manual override table for the long tail (operator-managed)

If candidate's parent_company_canonical matches any customer's parent_company_canonical, match confidence = 0.85.

### 3.3 Result aggregation

For a single lead, evaluate each entity-bearing field (owner, prime_contractor, each key_sub) through all three layers. Collect every distinct match. Rank by max confidence per matched customer.

If multiple sites for the same customer match, aggregate:
- `branch_count`: count of distinct branches with active sites for that customer
- `active_site_count`: total active sites
- `most_recent_site_date`: latest `created_at` from those sites
- `primary_branch`: branch with the most recent active site (the "owner of relationship")

### 3.4 National account detection

If `branch_count ≥ national_account_branch_threshold` for any matched customer, set `national_account: true` on the match. Surfaces the no-go-zone behavior in UI: branch reps can see the lead but cannot claim it; routes to HQ contact.

National account configuration table:
```sql
create table pathfinder.national_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_org_id text not null,
  customer_canonical text not null,
  hq_contact_name text,
  hq_contact_email text,
  branch_count integer not null,
  last_calculated_at timestamptz not null default now(),
  override_status text check (override_status in ('forced_national', 'forced_branch_ok', null)),
  unique (customer_org_id, customer_canonical)
);
```

Auto-populated nightly from `pathfinder.zedcor_customer_sites` aggregation. Operator can override status.

## 4. Output schema

### 4.1 Cross-pollination match record

```sql
create table pathfinder.lead_cross_pollination (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references pathfinder.projects(id),
  customer_canonical text not null,
  customer_org_id text not null,
  match_layer text not null check (match_layer in ('exact', 'fuzzy', 'parent_company')),
  match_confidence numeric(3, 2) not null,
  primary_branch_id uuid references pathfinder.zedcor_branches(id),
  primary_branch_name text,
  branch_count integer not null,
  active_site_count integer not null,
  most_recent_site_date date,
  national_account boolean not null default false,
  matched_at timestamptz not null default now(),
  matched_field text not null check (matched_field in ('project_owner', 'prime_contractor', 'key_sub', 'parent_company')),
  matched_value_raw text not null
);

create index idx_xpoll_lead on pathfinder.lead_cross_pollination(lead_id);
create index idx_xpoll_customer on pathfinder.lead_cross_pollination(customer_canonical, customer_org_id);
```

### 4.2 Lead score adjustment

When at least one cross-pollination match exists for a lead, add `score_boost_for_warm_intro` to the base ranker score. Cap total score at 100. Record the adjustment in `pathfinder.scores.score_adjustments` jsonb field for transparency.

### 4.3 UI surfacing

Lead detail page renders a "Relationship Context" section:

```
RELATIONSHIP CONTEXT — Warm Intro Available
─────────────────────────────────────────
Matched Entity: D.R. Horton Inc. (prime contractor)
Match Type: Exact (confidence 1.0)

Existing Relationship:
- 3 active sites across 1 branch
- Primary branch: South Houston (Texas)
- Most recent site activity: 2026-04-15

This is the customer's first project in [target branch region].
Recommended action: Coordinate with South Houston branch before
reaching out. They likely have established contacts.
```

Lead list shows a "Warm Intro" badge column (clickable to filter).

## 5. False-positive prevention

The biggest demo risk is matching dissimilar entities ("ABC LLC" → "ABC Holdings"). Three guards:

1. **Length window on fuzzy match.** Don't fuzzy-match a 4-character name against a 12-character name even if Levenshtein distance is low. The length window (±20%) prevents this.

2. **Suffix-stripping awareness.** "ABC LLC" → "abc" (3 chars) and "ABC Holdings Inc" → "abc holdings" (12 chars). Length window kicks them apart.

3. **Verifier pass on warm-intro flagging.** Before surfacing in UI, the Verifier agent reviews the match: "Is this match plausible given the lead's project description and the customer's known industry?" If Verifier flags as suspicious, demote to Layer 3 (lower confidence) or drop entirely.

Eval set: 50 hand-labeled match candidates (35 true matches, 15 planted false-positives). False-positive rate must be ≤ 5% before demo.

## 6. Performance

- Exact match lookup: O(1) via hash map of normalized names
- Fuzzy match: O(N) per candidate where N is the customer count in the length window. With 1,863 customers and average length window covering ~200 customers, each fuzzy match takes ~200 Levenshtein computations. Acceptable.
- Total time per lead: ~50ms target.
- Run as a synchronous step in the ranker pipeline (not a separate Inngest function) to keep the surfacing latency low.

## 7. Eval criteria

Before demo:
- 50-case hand-labeled eval set in `eval/cross-pollination/cases.json`
- Each case: lead entity strings + expected matches (or expected no-match)
- Pass rate ≥ 90% on true matches identified
- False-positive rate ≤ 5%
- Latency ≤ 200ms per lead at 1,863 customer corpus

After demo:
- Production monitoring: weekly sample of 50 random matches reviewed by operator
- False-positive feedback loop: when operator marks a match as wrong, that pair gets added to a denylist; learning feeds back into the algorithm

## 8. Future extensions (post-demo)

- **Multi-tenant generalization.** Replace `customer_org_id='zedcor'` with parameterized lookups so a second customer (e.g., a traffic-cone company) can use the same engine with their own customer relationships.
- **Adjacency-driven cross-pollination.** When AdjacencyMapper detects a similar adjacent project to a Zedcor win, suggest the lead even if no entity match. (Score boost smaller, +5 instead of +10.)
- **Confidence-weighted score boosts.** Today the boost is flat +10 for any match. Future: scale boost by match confidence and recency of most-recent-site relationship.
- **National account contact resolution.** Auto-populate hq_contact_name and hq_contact_email from public sources (LinkedIn for senior procurement contacts). Today this is operator-managed.
- **Win/loss feedback into matching.** When a warm-intro lead converts (deal won), reinforce the customer match. When a warm-intro lead is rejected by the rep (e.g., "this contractor's relationship is cold"), down-weight similar matches.

## 9. Open questions

- Do we want to surface "soft" matches (Layer 3 parent-company) in the demo, or only "hard" matches (Layer 1-2)? Lean: only hard for demo, both in pilot.
- Should we ingest Zedcor's HubSpot deal history to enrich the customer-side data with contract value, recency of last contract, etc.? Lean: yes, post-demo. Adds depth to "Relationship Context" panel.
- How to handle customer name changes / mergers / acquisitions over time? Probably an operator-managed alias table. Defer until needed.
