# PRD — Pathfinder Form-Fit for Zedcor

Status: Draft v0.1
Date: 2026-05-01
Owner: Kyle (Kēkā)
Related: `00 - TUESDAY DEMO PLAN.md`, `SPEC - Cross-Pollination Engine.md`, `SPEC - Backend Architecture.md`

---

## 1. Why this exists

Zedcor is Pathfinder's customer zero. Their CTO (Kyle Dens) sent over 1,863 active customer sites and a 24-branch list. They want a working demo for their executive team on Tuesday May 5 that proves the system can replace 8 hours of manual lead-hunting per salesperson per day with an autonomous agent pipeline that surfaces high-quality leads pre-bid.

This PRD covers two horizons:
- **Demo horizon (Saturday-Tuesday).** What ships before 3:45 PM Central on Tuesday.
- **Pilot horizon (May 6 - June 6).** What ships if the exec team greenlights a paid pilot.

Beyond pilot, features evolve into the multi-tenant productized Pathfinder per the existing kanban. This PRD does not redefine that long-term roadmap.

## 2. Customer profile

- **Company:** Zedcor (~$3.6B AUM... wait that's the wrong company). Zedcor is a public company, ~24 branches across North America, factory output ~10 mobile solar surveillance towers per day (~3,000-3,800 per year), founded as oilfield services pre-2015, pivoted to security 2015. Now ~3% energy, 97% diversified across construction / hospitality / mixed-use / data centers / infrastructure / retail.
- **Stack today:** HubSpot (CRM), NetSuite (financials, quoting, invoicing), Microsoft ecosystem (Teams, Outlook, SharePoint), ZoomInfo (contact enrichment), drone/Matrice DJI (pilot program just landed).
- **Pain in their words:** "Bane of my existence. Salespeople spend 8 hours a day downloading scanned PDFs from Dodge or ConstructConnect, manually reading hundreds of pages to find the words 'temporary security'. They find 1-2 viable leads on a good day. We arrive too late after the bid window closed and security vendors have been chosen."
- **Goal:** Get on bid lists sooner. Win bids more often. Cross-leverage existing customer relationships across branches (currently a "huge opportunity we're missing out on" per CTO).
- **Decision-makers for greenlight:** Todd (CEO), James (COO and former CRO, runs sales), Ameen (CFO), Kyle (CTO, primary sponsor and contact).

## 3. What success looks like

### Demo success (Tuesday)

Todd, James, and Ameen leave the meeting wanting a paid pilot. Within 24 hours, Kyle (CTO) signs a one-page pilot agreement.

Demo proves five things in 15 minutes:
1. The system already understands their criteria (3+ months, pre-bid, project value, security scope).
2. The system surfaces leads their reps haven't seen, in their three newest branches.
3. The system finds warm-intro opportunities by mapping new leads to their existing 1,863 customer relationships.
4. The system rejects bad leads with explicit reasoning (3-month minimum violated, no security scope, etc.).
5. The system reads naturally to a non-technical exec via the chat panel and the rationale paragraphs.

### Pilot success (June 6)

One Zedcor branch (likely Houston, their biggest, OR Nashville per CTO's preference) running in production for 30 days. Outcome metrics:

- ≥ 50 high-quality (score ≥ 90) leads surfaced, attributable to Pathfinder
- ≥ 10 leads result in a meeting booked with the prospect
- ≥ 1 deal in the bid stage attributable to Pathfinder
- ≥ 3 cross-pollination warm intros leveraged
- Rep feedback: "this saves me 4+ hours a week" or stronger
- Cost: tracked end-to-end so pricing can be calibrated

If the pilot delivers, expansion to 3 branches in month 2, all 24 in month 3.

## 4. Personas

### Primary: Branch Sales Rep

Houston-area or Nashville-area sales rep. Sells Zedcor's mobile surveillance towers to construction GCs, owners, and developers. Schmoozer profile. Spends most of his day on-site, in trucks, or in office trailers with prospects. Uses his laptop sparingly. Currently hates HubSpot data entry.

What he wants from Pathfinder:
- A short list of viable leads in his 200mi radius, ranked by quality
- One-click outreach drafted in his voice, sendable from his Outlook
- Notification when a national account he's already worked with files a permit nearby
- Voice-to-CRM eventually so he can dictate updates after a site visit

### Secondary: Regional Director

Manages 6-7 branches in a region. Needs cross-branch visibility. Wants to know which branches are converting leads, which are starving for leads, where to redirect attention.

### Tertiary: Executive (Todd, James, Ameen)

Wants ROI proof, low operational risk, predictable cost. Cares about bid-list inclusion rate, win rate, and rep productivity. Will not log into Pathfinder daily but expects a Friday brief and quarterly attribution reporting.

### Operator (us)

Kyle, Keenan, agent-orchestrator engineers. Need to onboard new Zedcor branches turnkey, maintain quality across customers, debug agent runs that go sideways, evolve the system without breaking active deployments.

## 5. Functional requirements

### 5.1 Demo-horizon (must ship by Tuesday)

The full demo feature list lives in `00 - TUESDAY DEMO PLAN.md` and the Pathfinder Kanban "Zedcor Demo" column. Summary:

**P1 (critical):**
1. Zedcor branch list ingested + geocoded (24 branches with lat/lon)
2. Zedcor customer sites ingested (1,863 records, normalized for matching)
3. Cross-pollination engine matching new leads to existing customer relationships
4. Three-branch pipeline runs (Nashville, Pittsburgh, LA) producing ≥ 5 high-quality leads per branch
5. Rejected pile with explicit reason
6. Narratable rationale per lead, with hallucination guard
7. Existing core agents: Ingestor, Ranker, Verifier, Enricher, GeoMapper, Outreach Drafter

**P2 (important):**
8. Branch radius map view
9. National account / no-go zone flagging
10. Score distribution summary widget
11. Industry classification per lead
12. Permit info + jurisdiction display
13. Outreach drafts tuned to Zedcor voice
14. Lead detail page rendering all required fields
15. Lead list view with score, value, distance, stage columns
16. Chat panel with 5 pre-validated demo questions

**P3 (nice-to-have):**
17. Document intelligence / OCR for scanned PDFs (if CTO sends PDFs by Sunday)
18. Feedback mechanism (thumbs + reason)
19. Roadmap slide for the call's last 2 minutes

### 5.2 Pilot-horizon (must ship by June 6)

After demo greenlight, build out:

**Sales workflow:**
- Send outreach via Outlook OAuth (CTO Kyle uses Microsoft ecosystem; Outlook is priority over Gmail for Zedcor)
- Reply detection via Microsoft Graph subscription
- Pipeline Kanban customized to Zedcor's stages (likely NEW → CONTACTED → SITE-VISIT → ON-BID-LIST → BID-SUBMITTED → AWARDED → DEPLOYED-OR-LOST)
- Activity timeline per deal
- Reinforcement loop capturing rep edits to outreach drafts

**Multi-branch operations:**
- Role-based access: admin / regional director (multi-branch) / branch sales rep (single OR multi-select)
- Per-branch lead pipelines visible only to that branch's reps + their regional director + admins
- Cross-branch national account routing rules
- HQ contact directory for national accounts

**Intelligence:**
- Per-branch scoring weight tuning via Architect (already built; just needs Zedcor-org-id wiring)
- Feedback loop with rep thumbs + reason captured to lead_feedback table
- Conversion tracking: rep marks lead as CLOSED-WON or CLOSED-LOST with reason
- Architect tuning consumes this feedback weekly to refine ranker

**HubSpot bidirectional sync:**
- Push leads to HubSpot as deals (one-way to start)
- Pull deal status from HubSpot when reps update there directly
- Conflict resolution: last-write-wins per field, with audit trail

**Microsoft Teams integration:**
- Replace Slack alerts with Teams alerts (CTO Kyle's preference)
- Daily / Friday briefs via Teams DM to each rep

**Cost / compliance:**
- Per-customer cost tracking (already built via llm_calls.surface)
- SOC2 readiness (already in Phase 1 with audit log + RBAC)

### 5.3 Out of scope (defer to post-pilot)

- Voice-to-CRM mobile app
- Drone integration (Keenan's separate thread)
- Self-modifying Architect / inter-customer learning
- Sales Agent Counterpart real-time coaching
- Any Phase 4 features from the kanban

## 6. Non-functional requirements

- **Time-to-greenlight:** demo must execute end-to-end in 15 minutes flat without crashes.
- **Hallucination tolerance in lead rationales:** zero in the top 5 per branch shown in the demo. Caught by Generator-Verifier loop with rationale-specific eval.
- **Cross-pollination false-positive rate:** ≤ 5% (validated against hand-audited sample).
- **GeoMapper accuracy:** branch lat/lon within 5 miles of city centroid is acceptable for demo; fine-tune to specific branch addresses post-pilot when CTO Kyle sends them.
- **Demo data freshness:** lead pool updated within 24 hours of demo time. Re-run Sunday evening, freeze Monday morning.
- **Cost cap for demo prep:** $30 in LLM spend across all worktrees through Tuesday.

## 7. Pricing model (for the post-demo conversation, not for the demo itself)

Tier-based on number of high-quality leads per branch per month. Hard cost per processed lead estimated at 7-9¢ (per Keenan's strategy meeting math). Reverse-engineer pricing from Zedcor's factory capacity (~10 towers/day → ~300 deployments/month at saturation across 24 branches → ratio of leads needed to feed that conversion volume).

Three tiers proposed:
- **Starter:** 1 branch, 1,000 raw leads / 100 ranked leads / 10 verified high-quality / month → $X/month
- **Growth:** 5 branches, 10,000 / 1,000 / 100 → $Y/month
- **Enterprise:** All branches, 100,000 / 10,000 / 1,000 → $Z/month + dedicated agent-orchestrator engineer

Numbers TBD. Strategy meeting consensus: model against hard costs first, mark up 4-5x, leave room for win-share or success-fee structure on closed deals.

The pricing tiers should also bundle the ongoing Architect tuning work (improving ranker weights as feedback accrues) since CTO Kyle's strategy meeting note flagged that as "ongoing work that has real value and cost."

## 8. Sequencing for demo prep (Saturday → Tuesday)

### Saturday (build)

Two parallel tracks:

**Track A — Data foundation:**
- Ingest Zedcor branch list + geocode
- Ingest Zedcor customer sites + normalize
- Build cross-pollination matching index
- Wire GeoMapper to branch list

**Track B — Quality + presentation:**
- Narratable rationale (Generator-Verifier) hardened
- Rejected pile + score distribution UI
- Outreach drafts tuned to Zedcor voice
- Industry classification + permit info display

### Sunday (run pipeline + verify)

- Run three-branch pipelines (Nashville, Pittsburgh, LA)
- Manual review of top 5 leads per branch
- Fix prompts if hallucinations found, re-run
- Validate cross-pollination matches
- Build branch radius map view
- Validate chat panel with 5 canned questions

### Monday (rehearsal + polish)

- Full 15-minute demo run-through with Curtis and Keenan
- Time it. Catch friction.
- Fix anything that's brittle.
- Lock down the leads pool — no more pipeline reruns after Monday EOD
- Take backup screenshots in case of live-demo flakiness
- Prepare roadmap slide

### Tuesday (demo)

- Cold-start Pathfinder dashboard 30 min before call
- Run through the spine once internally before joining call
- Demo
- Capture every objection / question for followup

## 9. Risks

Listed in `00 - TUESDAY DEMO PLAN.md` Risk Register. Top five to flag here:

1. Owner enrichment hallucinations torch demo credibility.
2. Cross-pollination false positives ("ABC LLC" → "ABC Holdings Inc.") look amateur.
3. Empty pipelines in target branches kill the narrative.
4. Live chat hallucinations during the demo.
5. CTO Kyle pulls "let's wire HubSpot during the call" mid-demo (politely defer).

## 10. Open questions

For Tuesday's demo: none blocking.

For pilot conversion conversation:
- What threshold (score 80? 85? 90?) does Zedcor consider "high-quality"? Establish post-demo with their sales team.
- How many high-quality leads per branch per month does Zedcor want / can handle? (Asked but not answered in consultation.)
- Their typical conversion rate from a high-quality lead → bid-list inclusion → win? CFO Ameen will know.
- Outlook OAuth provisioning timeline (Microsoft Entra app registration is a Zedcor IT task).
- HubSpot API key + sandbox for two-way sync testing.
- Microsoft Teams workspace and channel for alerts.
- Pricing greenlight + contract format.

For long-term:
- When does Zedcor become a multi-tenant tenant rather than customer-zero? Multi-tenant org separation is a kanban-tracked feature; required before Pathfinder onboards a second customer alongside Zedcor.
- Drone integration: Keenan's separate thread with their CEO. Not part of Pathfinder PRD scope but informs the broader "Unicron engine" vision.

## 11. Spec references

Detailed specs derived from this PRD:
- `SPEC - Cross-Pollination Engine.md` — the matching engine that turns the 1,863 customer sites into demo-grade warm intros
- `SPEC - Zedcor Data Ingestion.md` — schema + normalization + geocoding
- `SPEC - Feedback Loop & Conversion Tracking.md` — pilot-horizon feature, drives the Architect's per-customer tuning
- `SPEC - Backend Architecture.md` — existing, covers the agent pipeline this PRD builds on
- `SPEC - Architect Agent.md` — existing, the per-customer tuning runtime
- `PROMPT - Zedcor Demo Sprint.md` — paste-ready Claude Code orchestrator prompt for parallel build over the weekend
