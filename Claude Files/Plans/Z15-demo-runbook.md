# Z15 Zedcor Demo Runbook (internal: script + FAQ)

_As verified 2026-05-29T06:47:03Z against Supabase project `anfihcusvekpovcchpoh` (schema `pathfinder`, org `6cd87740-7c72-4337-ac79-316a54242eef`) and Notion data source `39b001e3-fa1f-4fbf-aeea-219d4ef2b19a`. Re-verify on every reuse; numbers drift. Z14.2 has merged; Z16 and Contact Cleanup had NOT merged at verification time, re-run once they merge._

Do not demo anything in the "do not show" list.

## What the demo proves (the honest spine)
Pathfinder finds construction opportunities in the post-award, pre-sub-selection window and hands Zedcor reps a prioritized, phase-tagged lead feed with pitch hooks and a recommended action, in their existing Notion. The live demo shows real Houston-metro and multi-metro opportunities, correctly staged, with the buy-window logic that defines when Zedcor should pitch.

## Demo state (quote these numbers, not rounder ones)
- **50 non-empty rows** in the Notion Lead Feed (plus 1 empty placeholder, Lead ID 1, that the Rep View does not surface).
- **11 in-window hero rows** (Bid Stage in {GC Selected, Sub Bid, Mobilization} AND Buy Window = Open): 8 GC Selected, 0 Sub Bid, 3 Mobilization. 10 of those 11 carry all three pitch hooks plus a recommended action.
- **33 pre-window pipeline-tracking rows** (Solicitation stage) showing the watch-list play.
- **4 multi-metro rows** beyond Houston: Fort Worth x2 (Solicitation), San Antonio x1 (Solicitation), Dallas x1 (Awarded / Closed federal). The three TX Solicitation rows are the ones to demo; the Dallas federal row is breadth only.
- **6 federal-derived rows** (Federal Contract source type) used only to show source breadth, not as outreach targets.
- **Customer base loaded:** 3,627 Zedcor sites covering 733 unique parent companies, 199 of those in Texas (918 TX sites).

## Run of show (~15 min)
1. **Frame the window (2 min).** "When a GC gets named on a project, you have a 2 to 4 week window to get on their sub list before it locks. Missing that window is missing the job. Pathfinder watches public sources and tells your reps which projects just entered that window and who to call." Anchor on the buy-window concept, not the tech.
2. **Open the Rep View in Notion (3 min).** Show the filter: construction sources (Public Construction, County Purchasing, School District, State DOT), real bid stages from Solicitation through Mobilization, sorted Buy Window open first, then score, then deadline. Point out that the rep opens this and the top of the list is "call these this week."
3. **Walk two hero rows (4 min).** Pick from the rows that actually have all three pitch hooks and a recommended action. Strong candidates as of verification:
   - Lead ID 5: **Cut Back Asphalt DW-26, TxDOT Paris District** (Mobilization / Open). Pitch hooks: securing RC-250 cutback asphalt stockpile, 24/7 remote monitoring of high-value liquid asphalt material, multi-tower coverage across SH-11 linear maintenance sites. Recommended action with call script present.
   - Lead ID 20: **RFP for Turn-Key Maintenance, Repair and Replacement Services for Jail Facilities** (GC Selected / Open). Galveston / Brazoria county-jail work; demonstrates the buy-window play on a hardened-site project type.
   - Lead ID 15: **ITB, Maintenance, Inspection, and Repair of HVAC Systems and Related Items for Universal Services** (GC Selected / Open). A clean Houston-metro HVAC retrofit example.
   - Lead ID 18: **26-13, Debris Removal from Streambank and Shoreline Along Oyster Creek and Bastrop Bayou** (GC Selected / Open). Also carries a populated Cross-Pollination field reading "No existing Zedcor relationship, cold outreach", which is honest and demonstrates the column works (it just has no warm intro to surface here).
   - **Avoid Lead ID 2 (Texas City Hurricane Levee Improvements).** It is in-window (GC Selected / Open) but all three pitch hooks and the recommended action are empty. Until enrichment fills it, the row is not demo-ready. Track as a follow-up to backfill.
   For each row you show: phase tag (why it is in-window now), the three pitch hooks tied to a specific Zedcor capability, the recommended action with a call script, and the action-by date.
4. **Show the tracking play (2 min).** Open a Solicitation-stage Hardy Downtown Connector row (Lead ID 44 "RFSQ, Professional Traffic Engineering Services for HDC" or Lead ID 45 "RFSQ, Hydraulics and Hydrology Services for HDC"). "This isn't actionable yet. Pathfinder is tracking it so the moment the GC is named, it moves into your call list automatically." Both rows carry an explicit tracking-style Recommended Action that explains the RFSQ to design-GC to construction-GC sequence.
5. **Show multi-metro (2 min).** Two Fort Worth Solicitation rows (Lead ID 21 "PMD, Expansion of RTCC Facility" and Lead ID 22 "RFP, Commerce Street Development") plus the San Antonio Solicitation row (Lead ID 23 "Emergency Services Warehouse 23-04057"). "Same engine, any market you operate in. Adding a metro is a config change, not a rebuild."
6. **Close on cadence (2 min).** "This refreshes on a schedule. Your reps get a Slack ping when a project enters the window. The platform evolves weekly." Lead into the pilot ask.

## What to show vs not show
SHOW: phase tagging, buy-window logic, pitch hooks on the rows that have them, recommended action, multi-metro Solicitation rows (Fort Worth and San Antonio), the tracking play (Hardy Downtown Connector), the customer-base load (733 companies, 199 TX) as the foundation for warm-intro matching once TX GC names are flowing.

DO NOT SHOW:
- **GC Contact Email column.** Only 69 of 1,927 Zedcor projects carry a value, and 100% of those are layer-3 pattern-guessed catchall emails of the form `contact@<contractor-domain>` paired with the generic Contact Name "Project Manager". They are not verified person emails.
- **Cross-Pollination / Warm Intro Path columns as a "warm intros" capability proof.** Supabase holds 14 cross-pollination matches (12 distinct leads), but every match is on an `awarded`-stage federal contract with a customer-branch presence in another state (FL, GA, MD, UT, NM, NY, MO). None of the 11 in-window TX hero rows has a populated warm-intro path. The 3 Cross-Pollination cells that are filled in Notion all read "No existing Zedcor relationship, cold outreach", useful as honest signal, not as a warm-intro showcase.
- **Raw federal-derived rows** (sam.gov / usaspending) as if they were outreach targets. They are present for breadth.
- **Bonfire detail-page data.** The Harris County Bonfire adapter ingests row-level metadata (25 Solicitation rows in the feed) but cannot follow the detail page; deep-detail fields are intentionally blank.
- **Lead ID 2** "Texas City Hurricane Levee Improvements" until pitch-hook backfill lands.
- **The empty Lead ID 1 placeholder row.**

## FAQ (anticipated Zedcor questions + honest answers)

**Q: Are these contact emails the actual project manager?**
No. As of verification, every populated GC Contact Email is a layer-3 pattern guess of the form `contact@<contractor-domain>` with the Contact Name set to the generic role "Project Manager", on 69 of 1,927 Zedcor projects. They are catchall guesses, not verified person emails. Person-level PM emails come online when we turn on the paid enrichment layer (Hunter / Apollo), which is a switch, not a build. For the pilot we can also do manual PM lookup on the rows you choose to pursue.

**Q: Do you match these against our existing customers so we know who we already know?**
The matching engine and your full customer base (733 unique companies, 199 in Texas, 3,627 sites in total) are loaded. The cross-pollination engine has fired 14 matches against your customers so far, but every one of those matches is on a federal `awarded`-stage row whose work site is in another state (FL, GA, MD, UT, NM, NY, MO) and whose Zedcor customer branch is in a city other than the project location. None of the 11 in-window TX hero rows currently has a warm-intro path. That is a data-coverage gap (named TX GCs are not yet flowing through in volume), not a capability gap. As soon as Texas GC selections start landing, Z14 and Z14.2 are wiring more news sources and Z16 will add more, the matches will surface on rows reps actually want to call.

**Q: Where do the opportunities come from?**
Public procurement portals (Harris County, Houston OBO, Houston Public Works, Houston METRO, Brazoria County, Galveston County, Fort Worth, San Antonio), school district purchasing (HISD), state DOT bid tabs, federal award and spending data (sam.gov, usaspending), and a newly-wired set of construction trade RSS and news sources (TxDOT Electronic State Business Daily, Engineering News-Record Texas Awards, Virtual Builders Exchange Texas Commercial Leads) per Z14 and Z14.2. We add sources per the markets you care about.

**Q: How fresh is this?**
Polled on a schedule, daily on most sources, more often on high-priority ones. 10 distinct sources have produced rows in the last 7 days (102 ingested rows in that window for the Zedcor org). Reps get Slack alerts when a project enters the buy window.

**Q: Can it cover [our other metros]?**
Yes. Houston is hub one. Fort Worth and San Antonio are already in (3 demoable Solicitation rows across those two metros). New metros are a configuration, demonstrated live in the multi-metro rows.

**Q: What's blocked / what are you still building?**
Three honest items: (1) some county portals (Bonfire on Harris County and Fort Worth) block automated detail-page reads from our servers; we unlock those via a paid bypass or vendor registration. (2) Person-level contacts need the paid enrichment layer switched on; today's catchall pattern guesses are not real PM emails. (3) The Z14 and Z14.2 RSS news adapters are wired and being polled but have not yet produced any ingested rows for the Zedcor org as of verification; that is the next thing to land. All three are turn-on items, scoped for the pilot.

**Q: Why Notion?**
It is where the lead feed lives so your reps work in a tool they already have. No new login. We can route to Slack and email too.

## Numbers to keep straight if pushed
- **10 sources actively producing rows for the Zedcor org in the last 7 days:** harris-county-bonfire (37 rows), houston-metro (19), hisd-ionwave (14), houston-obo (12), houston-public-works (8), brazoria-county (3), galveston-county (3), tx-bid-tabs (3), fort-worth-bonfire (2), san-antonio-purchasing (1). Federal sam.gov / usaspending and the Z14 RSS adapters are wired but produced 0 new rows in the last 7 days.
- Buy-window logic fires on GC Selected, Sub Bid, and Mobilization stages with a construction-keyword gate. Sub Bid currently produces zero in-window rows; the live hero count is 8 GC Selected + 3 Mobilization = 11.
- Action-by date = sub-bid deadline minus 14 days, or award date plus 21 days, whichever applies.
- 1,927 total Zedcor-org projects in Supabase across all stages (most are pre-window or out-of-window); the Notion Lead Feed surfaces the prioritized 50.

## Verification evidence (queries to results, all 2026-05-29T06:47:03Z)
The full set of SQL and Notion queries plus their pasted results that back the numbers above is reproduced in the PR description. Do not edit numbers in this doc without updating the PR evidence block. If a sibling sprint (Z16, Contact Cleanup) merges after this verification, re-run the queries and refresh both the numbers and the verified-at timestamp.
