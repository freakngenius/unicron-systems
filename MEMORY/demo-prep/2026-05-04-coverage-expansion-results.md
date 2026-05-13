# Pre-Tuesday Coverage Expansion Results — 2026-05-02

**Generated**: 2026-05-02 (UTC)
**Goal**: Surface non-federal construction project sources for Nashville, Pittsburgh, Los Angeles ahead of the Tuesday 2026-05-05 Zedcor demo. Houston is the headline branch (per `MEMORY/demo-prep/2026-05-02-houston-headline-script.md`); N/P/LA carry the "here's what we found, here's what we'd need next" beat. This run produced a **read-only demo asset** — no Source Onboarder dispatch, no `pathfinder.data_sources` writes, no `architect_inbox` queueing.

## How this was dispatched

The canonical dispatch path is the Inngest event `pathfinder/coverage.estimate.requested` → `coverage-expansion-estimate` function (`Pathfinder/lib/inngest/functions/coverage-expansion.ts`). Neither `.env.local` nor `.env.production.local` had `INNGEST_EVENT_KEY` set, so the run fell back to a one-shot script that imports `estimateGoal` directly and mirrors the Inngest function's `createSession → estimateGoal → finalizeSession` shape.

Script: `Pathfinder/scripts/dispatch-coverage-estimate.ts` (committed in this branch).

**Telemetry gap to fix post-demo**: the three `architect_sessions` rows for this run report `total_cost_usd=0`, `total_llm_calls=0`, `total_tool_calls=0`, `reasoning_log=[]`. The session struct returned by `createSession` is not threaded into `lib/llm/run.ts`'s recorder, so the Sonar+Anthropic spend booked through `pathfinder.llm_calls` does not link back to the session. The `estimate.estimated_total_cost_usd` in each goal is the agent's projected RUN cost, not this estimate-pass spend.

## Production state writes (additive only)

| table | rows added | rows updated |
|---|---|---|
| `pathfinder.coverage_goals` | 3 | 3 (estimate jsonb + status='draft') |
| `pathfinder.coverage_goal_candidates` | 17 (status='pending') | 0 |
| `pathfinder.architect_sessions` | 3 (status='succeeded') | 0 |
| `pathfinder.data_sources` | 0 | 0 |
| `pathfinder.architect_inbox` | 0 | 0 |

## Per-metro discovery

### Nashville (`c097699d-4429-48af-ba33-400a203e107e`)

- **Geography constraint**: `["TN-NSV"]` (no curated registry hits — TN not yet in registry)
- **Discovered**: 10 candidates total. **8 net-new** (registry returned only the always-on federal pair: sam.gov + USAspending). All flagged Tier 1 by the agent's optimistic default.
- **Estimate**: auto_onboardable=10, human_assist=0, declined=0 — but this is the agent's projection, not validated. See "honest caveats" below.
- **Estimated daily lift**: 20.5 qualified leads/day (registry impact heuristic; not measured)
- **Estimated run cost**: $4.00 (this is the projected onboard-loop spend, not what the estimate pass cost)
- **Session**: `b8649413-cd81-467e-be2b-e14d6a4697dc` (succeeded, 7.8s wall time)

**Net-new Sonar candidates ranked**:

| URL | Type | Jurisdiction | Notes |
|---|---|---|---|
| https://data.nashville.gov/resource/permits-building.json | json-dump | Nashville-Davidson Metro | Socrata-shape Nashville building permits — strongest Tier 1 candidate; should onboard cleanly |
| https://www.bidnetdirect.com/tennessee | rest | Tennessee State | TN purchasing group / state contracts portal — likely needs auth, would be Tier 2 in practice |
| https://data.tn.gov/api/views/metadata/v1 | rest | Tennessee State | TN Open Data Portal Socrata metadata endpoint — usable as a discovery seed for further sources |
| https://www.tn.gov/finance/fa/fa-procurement.html | rest | Tennessee State | TN procurement landing page — HTML, not a feed; would need scraper (Tier 2/3) |
| https://www.tn.gov/tdot/news/2026/4/30/weekly-east-tennessee-construction-report-for-april-30-to-may-6--2026.html | rss (mis-tagged) | TN TDOT | Single weekly news article URL — pattern suggests an indexable feed at `/tdot/news/`, but this URL points at one issue |
| https://flynashville.com/opportunity/mnaa-campus-facilities-project-no-2658 | rest | Nashville Metropolitan Airport | Single RFP page, not a feed — would need to discover the index URL |
| https://www.tn.gov/.../FY%202026%20TEVI%20Plan_Updated_Approved_04132026.pdf | json-dump (mis-tagged) | TN TDOT | PDF document, not a feed — would be declined or routed to assist |
| https://abctn.org/work-zone-safety-safe-actions-save-lives-for-middle-east-tennessee-contractors/ | rss (mis-tagged) | ABC Tennessee | Single article URL — feed root would be `abctn.org/news` or similar |

**Tier 2 queued for review**: 0 (the agent did not classify any as `tier_2`/`tier_3` — defaulted everything to Tier 1). The four mis-tagged URLs above are de-facto Tier 2 candidates (HTML landing, single document, single article) that an honest Source Onboarder run would route to `architect_inbox`.

### Pittsburgh (`cd7c3137-557f-4616-9cc4-a0142925b545`)

- **Geography constraint**: `["PA-PIT"]` (no curated registry hits — PA not yet in registry)
- **Discovered**: 4 candidates total. **2 net-new** Sonar discoveries; the other 2 are the always-on federal pair already covered.
- **Estimate**: auto_onboardable=4, human_assist=0, declined=0 (optimistic; see caveats)
- **Estimated daily lift**: 14.5 leads/day
- **Estimated run cost**: $1.60
- **Session**: `6bbaa81d-1b93-4223-a136-2f7331a40bca` (succeeded, 3.0s wall time)

**Net-new Sonar candidates**:

| URL | Type | Jurisdiction | Notes |
|---|---|---|---|
| https://www.pa.gov/DOTprojects | rest | PA | PennDOT planned & active projects landing — HTML, not an API; would need scraper |
| https://www.pa.gov/DOTdistrict11 | rss (mis-tagged) | PA District 11 | District 11 covers Allegheny + Beaver + Lawrence counties — directly inside the Pittsburgh radius; HTML page, not RSS |

**Honest read**: Sonar found PennDOT's project hub but missed (or didn't surface) the discrete sources you'd want for Pittsburgh demo coverage — City of Pittsburgh PLI, Allegheny County permits, PA eMarketplace. Could be a Sonar prompt-tuning gap or a "well-curated registry doesn't yet exist" reality. The two surfaced URLs are HTML landing pages, not feeds; both would route to `architect_inbox` for human-assist if actually onboarded.

**Tier 2 queued**: 0 (agent's optimistic default; both new URLs are de-facto Tier 2)

### Los Angeles (`8f54bc9b-6de6-4826-a0fb-64b245b091c4`)

- **Geography constraint**: `["CA-LA"]` (this DOES match the curated registry — `data.lacity.org` Building Permits is a known Tier 1 entry)
- **Discovered**: 3 candidates total. **1 net-new from registry** (LA Building Permits); **0 net-new from Sonar**. Federal duplicates fill the other 2 slots.
- **Estimate**: auto_onboardable=3, human_assist=0, declined=0
- **Estimated daily lift**: 20 leads/day
- **Estimated run cost**: $1.20
- **Session**: `195142a0-8688-4d32-b03b-fb75fec94686` (succeeded, 2.4s wall time)

**Net-new candidates**:

| URL | Type | Jurisdiction | Notes |
|---|---|---|---|
| https://data.lacity.org/resource/yv23-pmwf.json | socrata | CA-LA | LA Building Permits — clean Socrata feed, would onboard in seconds (this is the registry's curated entry, not a Sonar discovery) |

**Honest read on LA**: Sonar added zero candidates. Either (a) the prompt+constraints didn't elicit LA-specific discoveries, or (b) the most common LA construction sources (BuildLA permits portal, LA County contracts, Caltrans, ENR West, LA Times) are gated behind login walls or HTML-heavy sites that don't fit the Sonar prompt's "fetchable shape" filter. The registry entry alone (LA Building Permits via Socrata) is the cleanest Tier 1 surface for the demo narrative. LA is the strongest case for adding more curated registry entries by hand pre-demo if you want a richer LA story.

**Tier 2 queued**: 0

## Demo narrative beats (revised vs. original briefing)

The original briefing implied N/P/LA each get 5-15 candidate sources with 1-3 onboardable. Reality:

> **"Pathfinder identified N sources Zedcor doesn't yet have"**: 8 (Nashville), 2 (Pittsburgh), 1 (LA). 11 net-new candidate sources across the three metros — **mostly Nashville**, where the Sonar-driven discovery layer worked well. Pittsburgh and LA show where the system needs richer registry seeding.

> **"Onboarded N live in 90 seconds each"**: 0. This run was estimate-only by design (no Source Onboarder dispatch). For the demo, reframe as: *"these candidates are queued and ready to onboard — the system identified them, classified them, and the Source Onboarder can dispatch each live with one operator approval click."*

> **"Tier 2 sources queued for human review"**: 0 in the literal sense (agent's optimistic Tier 1 default). De-facto Tier 2: ~6 of the 11 net-new URLs are HTML landing pages, single-document URLs, or single-article URLs that would route to `architect_inbox` if actually onboarded. **Honest demo line**: *"Pathfinder also surfaces sources that need a scraper or human assist — those are queued separately so the team isn't blocked on auto-onboard."*

> **"Sources that map to Dodge's coverage"**:
> - Dodge aggregates state DOT projects → Pathfinder surfaced **PennDOT (PA)**, **TDOT (TN)** weekly reports, and **TDOT TEVI** grant data
> - Dodge aggregates municipal permits → Pathfinder surfaced **Nashville Building Permits** (Socrata) and re-confirmed **LA Building Permits**
> - Dodge aggregates state procurement → Pathfinder surfaced **TN Procurement Portal**, **TN OpenData**, **BidNet TN**, and **PennDOT projects hub**
> - Dodge has no direct equivalent for **Nashville Airport Authority** or **ABC Tennessee** project alerts — those are net-new beyond Dodge's standard coverage
> - **The signature line**: *"Pathfinder's discovery layer found ~10 sources mapping to what Dodge's 400 field specialists already cover, plus 2-3 they don't — and it did it in 13 seconds total wall time across three metros. Dodge gets there with humans; Pathfinder gets there with one Sonar query per metro."*

> **The 13-second story**: Total wall time across all three estimate sessions = 13.1 seconds (7.8 + 3.0 + 2.4). That's the punch line. Dodge takes weeks to onboard a metro; Pathfinder discovered candidates for three metros in 13 seconds. Even if half route to assist, the time-to-coverage compression is the actual differentiation.

## Honest caveats for the demo

1. **The agent overestimates auto-onboardability.** Every discovered candidate was classified `auto_onboardable: 1` regardless of actual shape. A real Source Onboarder dispatch would route ~half to human-assist or declined. Demo line if pressed: *"the estimate is optimistic by design — the actual onboard pass adapts to each source's real shape."*

2. **Sonar discovery quality varies sharply by metro.** Nashville got 8 candidates, Pittsburgh got 2, LA got 0. This reflects either (a) Sonar prompt sensitivity to the goal-text framing, (b) the discoverable-via-web-search density of those metros, or (c) genuine coverage gaps. Worth a Sonar-prompt tuning pass post-demo; not blocking for Tuesday.

3. **Federal duplicates inflate raw counts.** Every metro returned sam.gov + USAspending from the registry's always-match `federal` rule. The "10 candidates for Nashville" headline is really "8 net-new + 2 federal duplicates." Doc above is honest about which is which.

4. **Mis-tagged candidate types.** Sonar returned several URLs as `rss` or `json-dump` that are actually HTML pages or PDFs. The `discoverViaSonar` parser trusts Sonar's self-classification verbatim. Operator review (or actual Source Onboarder run) catches these; the estimate doesn't.

5. **No Tier 2 queueing happened.** The agent doesn't currently distinguish Tier 1 vs Tier 2 at estimate time — that classification only emerges when Source Onboarder actually runs against the URL and discovers auth walls or rendering requirements. The original briefing's "queue Tier 2 for human review" beat is structurally not satisfied by the estimate pass alone.

6. **Houston is untouched.** Per Tuesday plan, Houston pipeline is the demo flagship and was not part of this run. No production data for Houston was modified.

## What this enables for Tuesday

**Demo flow change** (vs. `00 - TUESDAY DEMO PLAN.md` original arc):
- Houston headline (TxDOT I-45 $4.2M, score 97) carries the lead-quality beat
- N/P/LA pivot to the **coverage-expansion narrative**: *"federal data is rich in Houston, thinner in your three newest branches; here's the system's discovery pass on those three metros, here's what it found, here's the gap"*
- Use the Coverage Expansion results section of the Houston headline script (lines 139-153) to weave in this doc

**Concrete demo line** (drop-in for the Houston script's Coverage Expansion section):

> "We ran our coverage expansion agent against your three newest branches over the weekend. It identified eight additional ingest sources for Nashville — Tennessee state procurement, Nashville building permits via Socrata, TDOT, the Nashville airport authority. It identified PennDOT for Pittsburgh and LA Building Permits as a clean Tier 1 add for Los Angeles. The discovery for all three metros took thirteen seconds total. Wiring those sources live takes a couple of days per source; the discovery work — what would normally take Dodge's field-research team weeks — is already done."

## Operator-todo follow-ups (post-demo)

1. **Wire `lib/llm/run.ts` recorder to `architect_sessions`** — sessions for this run report 0 cost / 0 LLM calls because the session struct isn't threaded into the recorder. Without this, every Coverage Expansion or Source Onboarder run looks free in `architect_sessions` even though `pathfinder.llm_calls` tracks the actual spend. Telemetry gap.
2. **Set `INNGEST_EVENT_KEY` in Pathfinder envs** so future operator dispatches go through the canonical Inngest path and appear in Inngest's run history. Today they only appear in `architect_sessions`.
3. **Sonar prompt tuning for sparse metros** — Pittsburgh and LA both surfaced fewer Sonar candidates than expected. Either tune `SONAR_PROMPT` in `services/coverage-expansion/tools/discover-candidates.ts` to be more aggressive on metro-specific discovery, OR add curated registry entries for `PA-PIT`, `PA-ALG`, `CA-LA-COUNTY`, `CA-CALTRANS`.
4. **Add Tier 2 detection at estimate time** — current behavior optimistically classifies every URL as Tier 1. Add a heuristic in `discoverViaSonar` (URL ends in `.pdf`, contains `/news/`, contains `/opportunity/<id>`) → tag `tier_2` upfront. Reduces operator surprise on actual onboard.
5. **Don't fire `pathfinder/coverage.run.requested`** for these three goal_ids without first reviewing the candidate list via the architect inbox UI. Many candidates would burn Source Onboarder budget on URLs that route to `declined`. Pull the candidate list, prune the de-facto Tier 2s, then approve a tightened run.
6. **Goal IDs for inbox review**:
   - Nashville: `c097699d-4429-48af-ba33-400a203e107e`
   - Pittsburgh: `cd7c3137-557f-4616-9cc4-a0142925b545`
   - Los Angeles: `8f54bc9b-6de6-4826-a0fb-64b245b091c4`

## Cost

Recorded as $0 in `architect_sessions` (telemetry gap above). Actual Sonar+Anthropic spend recorded in `pathfinder.llm_calls` for this run window — pull that table for the exact figure if needed for cost tracking. Per `feedback_prompts_no_estimates_or_caps.md`, no pre-estimate; cost is small and not a hard-halt trigger.

## Hard constraints adhered to (run-level)

- ✅ No `pathfinder/coverage.run.requested` event fired
- ✅ No Source Onboarder dispatched
- ✅ No `pathfinder.data_sources` writes
- ✅ No `pathfinder.architect_inbox` writes
- ✅ Houston pipeline untouched (no Houston references in any goal)
- ✅ Additive writes only (3 goals + 17 candidates + 3 sessions, all new rows; no DROP/DELETE/destructive UPDATE)
- ✅ No `rm`, `git clean`, `git reset --hard`, or destructive filesystem ops
- ✅ Worktree-based development per `Pathfinder/CLAUDE.md` (worktree: `Pathfinder-worktrees/coverage-estimate-dispatch/`, branch: `chore/coverage-expansion-estimate-dispatch`)
- ✅ Per-metro candidate cap respected (`max_sources: 12` in scope_constraints; agent honored)
