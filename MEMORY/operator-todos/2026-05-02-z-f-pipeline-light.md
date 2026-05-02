# Z-F integrator pipeline run — halt note

**Status:** HALT per orchestrator rule. Pipeline-runs complete but
per-target-branch high-quality-lead counts are below the 3-per-branch
threshold. Surfacing for Kyle's review before auto-merge.

**Branch:** `zedcor/f-integrator`
**Pre-merge tag:** `pre-merge/zedcor/stream-f/feature-2-3-9`
**Run timestamp:** 2026-05-02 ~05:30 UTC

---

## Per-target-branch metrics (post backfill + re-rank)

| Branch | Total geo-tagged | score ≥ 90 | score ≥ 80 | score ≥ 70 | score ≥ 60 | Top score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Nashville** | 8 | 0 | 0 | 0 | 3 | 65 |
| **Pittsburgh** | 57 | 0 | 0 | 0 | 0 | 46 |
| **LA** | 17 | 0 | 0 | 0 | 0 | 42 |

Threshold for auto-merge: `≥3 leads with score ≥ 90 per branch`. **Failed
on all three branches.**

---

## Top 5 per branch

### Nashville (zedcor branch `1fc2bfd2-…`)
1. score=65, 29.1mi, no value, solicitation — Avigilon CCTV cameras to include installation and programming
2. score=65, 29.1mi, no value, solicitation — Memphis National Cemetery, National Shrine Project
3. score=65, 29.1mi, $27.7M, awarded — Department of the Interior award to ATHERTON CONSTRUCTION LLC: GRSM 149285/14936…
4. score=0, 29.1mi, no value, solicitation — New Bale Press and Conveyor System… USDA Memphis
5. score=0, 29.1mi, $75.7M, awarded — Department of Energy award to JOHNSON CONTROLS GOVERNMENT SYSTEMS, LLC: ESPC FOR THE OAK R…

### Pittsburgh (zedcor branch `725985c9-…`)
1. score=46, 146.7mi, $33.0M, awarded — Department of the Interior award to THE BEDWELL COMPANY: REHABILITATION OF FIRST BANK, IND…
2. score=37, 190.5mi, $119.5M, awarded — Department of Agriculture award to GRUNLEY CONSTRUCTION CO., INC.: USDA SOUTH BUILDING WIN…
3. score=37, 190.5mi, $56.9M, awarded — Department of the Interior award to CONSIGLI CONSTRUCTION CO., INC.: NAMA 216042 LINCOLN M…
4. score=37, 190.5mi, $45.7M, awarded — Department of Transportation award to CAPITAL GROUP, LLC: EFAST PROCUREMENT ACTION #: 23-0…
5. score=0, 146.7mi, no value, solicitation — 3HD 3040 017330673 D5, SHAFT

### LA (zedcor branch `d9b7e6be-…`)
1. score=42, 164.2mi, $213.8M, awarded — General Services Administration award to HENSEL PHELPS CONSTRUCTION CO.: DESIGN BUILD SERV…
2. score=42, 164.2mi, $847.0M, awarded — Department of Homeland Security award to FISHER SAND & GRAVEL CO: SW BORDER CONSTRUCTION…
3. score=42, 164.2mi, $74.5M, awarded — Department of Homeland Security award to WHITING-TURNER CONTRACTING COMPANY, THE: CONSTRUC…
4. score=0, 164.2mi, no value, awarded — Germantown Defuel
5. score=0, 164.2mi, $46.7M, awarded — Department of Veterans Affairs award to ESA SOUTH, INC.: EHRM VAGLA CONSTRUCTION

---

## Cross-pollination signature (DEMO-CRITICAL FEATURE)

**9 warm-intro matches written to `pathfinder.lead_cross_pollination`.**
This is the demo's signature feature and is now LIVE.

Highlights — both are exact-match high-confidence signals:

1. **BRASFIELD & GORRIE LLC** (`usaspending:CONT_AWD_47PE0323C0004…`) — federal building project. Already a Zedcor customer in **Jacksonville branch**, 2 active sites across 2 branches. Match layer: exact, confidence 1.0.
2. **BIG-D CONSTRUCTION CORP** (`usaspending:CONT_AWD_47PJ0021C0045…`) — Frank E. Moss federal building seismic project. Already a Zedcor customer in **Phoenix branch**, 1 active site. Match layer: exact, confidence 1.0.

Plus 7 fuzzy matches (confidence 0.73-0.88), some of which are
false-positives (CDM Constructors → BC Constructors etc). Verifier
review pass before demo would be useful.

The demo's "this contractor is currently active on N Zedcor projects in
your X branch — first project in [target region]" line works for both
of the exact matches above, even though they're not in our 3 target
branches.

---

## Root causes for the lead-quality miss

1. **State-centroid geocoding is too coarse for big states.** Pennsylvania centroid is 146mi from Pittsburgh; California centroid is 164mi from LA. Tennessee works (29mi from Nashville). With branch coverage_radius_miles=300 and geo_score decaying linearly past 50mi, a 150mi project only gets geo_score ~60 → composite ~50.
2. **14-day public-data window has thin local volume in target metros.** USAspending + SAM.gov in this window returned 7 TN, 6 PA, 17 CA leads. Most CA hits are San Diego or Edwards AFB; most PA hits are Harrisburg/Mechanicsburg, not Pittsburgh.
3. **Haiku classifier is rejecting many legitimate construction awards as "no"** (most score=0 entries above were actual federal construction awards but failed the triage).

---

## Recommended next steps for Kyle

In priority order:

1. **Add a city-level / zip-level geocoder.** Replace the
   `extractStateFromPayload()` fallback in `lib/zedcor/state-centroids.ts`
   with a real geocoder (Mapbox geocoding API, Google geocoding, or
   precomputed major-cities table) so San Diego doesn't get pinned to
   Sacramento area. This single change should lift LA and Pittsburgh
   scores by 30-40 points.
2. **Loosen the Haiku classifier prompt** or skip the triage entirely
   for the demo's 3 target branches. Many real construction awards are
   being demoted to score=0.
3. **Pull a 30-day window** instead of 14-day for the Tuesday demo.
   USAspending volume in TN/PA/CA local metros is sparse.
4. **Fall back to Houston** for the demo if local pipelines stay thin.
   The demo plan flags Houston as "their biggest branch" with known
   volume; we already have 9 Houston-mapped leads with score ≥ 80.
5. **Verify the 2 exact cross-pollination matches** (Brasfield & Gorrie,
   Big-D Construction) are in fact today's Zedcor customers — these
   are the demo's signature line.

---

## What this PR ships regardless

- ✅ Ranker now writes `nearest_zedcor_branch_id` + `zedcor_distance_miles` at rank time (Z-C bug fixed).
- ✅ Ranker now calls `findMatches()` and writes to `lead_cross_pollination` with +10 score boost (Z-B bug fixed).
- ✅ Ingestor seeds lat/lon at insert time from raw_payload state codes (was always null).
- ✅ Lead detail page renders Relationship Context section + Warm Intro badge + nearest-branch line in header (#9 done).
- ✅ Backfill script + cross-pollination one-off bridge for current data.
- ✅ Roadmap slide already shipped at `Presentation/zedcor-roadmap-slide.md`.
- ❌ Three-branch pipeline runs surfaced thin lead volume (this halt note).
- ⏭️ Document intelligence OCR — skipped per dispatch (CTO PDFs not received).
