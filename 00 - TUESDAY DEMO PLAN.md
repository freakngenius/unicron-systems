# TUESDAY DEMO PLAN — Zedcor Executive Team

Tuesday May 5, 2026, 3:45-6:30 PM Central. 30-45 min slot. Audience: Todd (CEO), James (COO/CRO), Ameen (CFO), CTO Kyle.

You are not pitching technology. You are showing the Zedcor exec team a system that already understands their business, ingested their data over the weekend, and is surfacing real leads in their three newest branches that their salespeople have not seen. That is the entire point.

Win condition for Tuesday: Todd, James, and Ameen leave the meeting wanting to greenlight a paid pilot. Kyle (CTO) is already aligned. He needs the room to see it land.

---

## The 5-Minute Demo Spine

This is the only thing that has to work. Everything else is background depth.

1. Open with the live map. Three pins lit up: Nashville, Pittsburgh, Los Angeles. Each shows the radius and recent leads count.
2. Click into Nashville. Pull up one specific high-score lead the system found in the last 72 hours. Read the AI rationale aloud verbatim. Make sure it is unambiguously a Zedcor-grade lead (3+ month duration, pre-bid stage, owner identified, GC named, value disclosed).
3. Show the cross-pollination tag on that lead OR another. Something like "ABC Construction is already a Zedcor customer in your Houston branch (3 active sites). This is their first project in Tennessee. Warm intro available."
4. Show the rejected pile. One example: "Project rejected — duration 28 days, below your 3-month minimum." Demonstrates the system understands their criteria.
5. Click the chat panel. Type: "What are my top 5 leads in Nashville this week?" The system replies with a properly formatted table.

If that 5-minute spine lands, you have the room. Everything else is roadmap conversation.

---

## What Has to Be Ready by 3:45 PM Tuesday

Priority is ordered. If something below the cutline isn't done by Sunday night, drop it.

### CRITICAL (will not demo without these)

1. **Zedcor branch list ingested.** All 24 branches loaded into the system as `branches` records with country, state, lat/lon. GeoMapper uses these for proximity scoring. (Branch list has only branch_name + country + province; will need to geocode to lat/lon — Sunday task.)

2. **Zedcor's 1,863 active customer sites ingested** as a `zedcor_customer_sites` table. Each row: customer_name, site_name, address, city, state/prov, lat, lon. This is what powers cross-pollination.

3. **Three target branches' lead pipelines populated with real leads.** Run sam.gov + USAspending + Dodge/ConstructConnect adapters (if Dodge/CC adapters not built, focus on the public sources) targeted at Nashville (200mi from Nashville Metro), Pittsburgh (200mi from Pittsburgh Metro), Los Angeles (200mi from LA Metro). Goal: 50+ raw leads per branch, 5+ high-quality (score >= 90) per branch.

4. **Owner enrichment pass on top 5 leads per branch.** Perplexity-based deep research on the project owner. Pulls in: industry classification, parent company, recent news, similar projects, public funding sources. This is what makes a lead "feel" real to an exec.

5. **Cross-pollination matching live.** When a lead's project owner OR general contractor name fuzzy-matches a customer in the 1,863-site list, flag the lead with a "warm intro" badge that names the existing relationship and which Zedcor branch owns it. Match on: exact name, fuzzy name (Levenshtein < 3 on normalized form), and parent-company resolution.

6. **One narratable rationale per target lead.** The agent's reasoning text needs to read like Kyle's voice in the prior demo: project stage, security scope match, timing, distance to nearest branch, value, what to do next. No hallucinated facts. If the data isn't there, the rationale should say "owner not yet enriched" rather than make something up.

7. **Rejected pile visible with reason.** Lead rejected because duration < 3 months. Lead rejected because outside 200mi radius. Lead rejected because no security scope identified. Three categories minimum, with one example in each.

8. **Lead detail page showing the fields they asked for:** owner/developer (with PE/municipality flag), prime contractor, key subs with company names, project description, industry classification, location + GPS, estimated start/end dates, permit info + jurisdiction + dates, estimated project cost, lot size if available.

### IMPORTANT (will tell better story but skippable if time-strapped)

9. **Branch radius visualization on the map.** Each of the 24 branches drawn with a 200mi circle. Leads color-coded by which branch they're closest to. Three target branches lit brighter than the others.

10. **AI-drafted outreach for the top 3 leads per branch.** Default template tuned roughly toward Zedcor's voice (mobile, solar-powered surveillance towers; ~1/5th cost of boots-on-ground; cite the specific project's apparent need). Editable in the lead detail page.

11. **Chat panel that can answer 5 specific questions:**
    - "What are my top 5 leads in [Nashville/Pittsburgh/LA] this week?"
    - "Which leads match an existing Zedcor customer relationship?"
    - "What leads got rejected in [branch] and why?"
    - "What's the average project value of leads above score 90 in Nashville?"
    - "Show me leads where a national account is involved."
    
    Tested ahead of time. If chat is flaky, drop it from the demo.

12. **Score distribution view.** "232 leads ingested in last 7 days across the 3 target branches. 15 above score 90. 30 above 80. 187 below 80." This frames the noise-to-signal ratio for the exec audience.

13. **Daily and weekly intelligence brief sample.** Static example for the exec audience showing what arrives in inbox each Friday. Real-looking, even if hand-tuned for the demo.

### NICE TO HAVE (only if everything above is solid by Monday EOD)

14. Permissioning preview. Show the role hierarchy concept: admin, sales rep with single branch, regional director with multi-branch. Just visual, no real auth wiring.

15. National account flag. Show that retail customers Zedcor already has at HQ level are flagged "no-go for branch sales" with explanation.

16. Slack/Teams integration teaser. Mention only — don't actually wire Teams during the demo.

### EXPLICITLY OUT OF SCOPE FOR TUESDAY

- HubSpot bidirectional sync (Phase 2 conversation)
- Voice-to-CRM (roadmap conversation only)
- Drone integration (Keenan handles that thread separately with their CEO)
- Any Phase 2 stretch features (Sales Agent Counterpart, Daily Intelligence Loop)
- Pricing/tier display (don't show numbers — that's the followup conversation)

---

## Demo Narrative Arc (15 minutes max for the actual demo)

### Setup (2 min)

Curtis or you handle the introduction. Frame the meeting as "we ran your data over the weekend, here's what we found, three branches in three minutes each."

Establish the gap: "Your salespeople spend up to 8 hours a day reading construction documents to find 1-2 viable leads. We're going to show you what 8 hours of agent work looks like."

### Nashville walkthrough (3 min)

- Click Nashville pin. "200mi radius around the Nashville metro. In the last 7 days the system ingested X projects and ranked Y above your quality threshold."
- Pick the highest-score lead with a cross-pollination tag if available. Read the rationale.
- "Your Nashville team has not seen this lead. The bid window opens in 18 days."

### Pittsburgh walkthrough (2 min)

- Same pattern, faster.
- Show one lead where a national account customer is involved. "This contractor is currently active on 3 Zedcor projects in your Calgary branch. First project in Pennsylvania. Whoever picks up the phone first wins."

### Los Angeles walkthrough (2 min)

- Same pattern.
- Show the rejected pile. "Out of 87 leads ingested this week, 12 were rejected for duration under 3 months. The system already understands your minimums."

### Cross-pollination zoom (2 min)

- Switch view to cross-pollination dashboard.
- "1,863 active Zedcor sites in our system. We mapped every new lead against every existing customer relationship. 23 leads in the last 7 days are warm-intro candidates."
- Show the list. Pick one. Show which branch owns the relationship.

### Chat demo (2 min)

- Type the prepared question. Show the formatted answer.
- One follow-up: "Show me the same thing for Pittsburgh." Demonstrates conversational continuity.

### Roadmap pitch (2 min)

- "Today is leads. Phase 2 is sending outreach from inside Pathfinder, capturing replies, capturing every edit your reps make to drafts so the system tunes itself to your voice."
- "Phase 3 is voice-to-CRM and the intelligent CRM Kyle mentioned."
- "Phase 4 is the system learning your wins and proactively pointing other branches at adjacent verticals — banking, retail, whatever closes."

End with: "Today's question is whether what you just saw is enough to greenlight a paid pilot in one branch. We can have it tuned, branded, and live with your sales team in two weeks."

---

## Zedcor Data → Feature Mapping

What Kyle (CTO) sent feeds these features directly:

### Zedcor Branch List (35 rows, columns: branch_name, country, province/State)

Powers:
- **GeoMapper proximity scoring.** Each lead gets a distance-to-nearest-branch calculation. This is the single biggest score-quality lift Tuesday's demo will show.
- **Branch radius map view.** Visual grounding for the demo.
- **Branch filter on lead list.** Each Zedcor user (when role-based access ships) sees their own branch's pipeline.
- **Cross-pollination "owner of relationship" attribution.** When a lead matches an existing customer, the system says which branch already serves them.

Caveat: branch list has no lat/lon. Need to geocode 35 entries via Google Geocoding API or hardcode. Sunday task.

### Zedcor Unique Customer Sites (1,863 rows, columns: customer_name, site_name, address, city, prov, lat, lon)

Powers:
- **Cross-pollination engine.** This is the highest-value feature Kyle (CTO) explicitly named as "huge opportunity we're missing." Match new leads against this list by customer/contractor name fuzzy match. When matched, show: which branch serves them, how many active sites, recency of relationship.
- **National account detection.** Customers appearing in 5+ different branches (e.g., Home Depot Canada appears many times) are flagged as HQ-managed accounts. Branch reps see them but can't act without HQ approval.
- **Reverse lead-quality boost.** When a sam.gov RFP names a contractor that's already a Zedcor customer, score boost. This is gold for ranking.
- **Historical context per lead.** "Zedcor has 3 active sites with this customer in TX. This is their first project in TN. Their satisfaction signal: [based on whether contract renewed/expanded]."

Sample inspection:
- Garland, TX (Arco Design/Build): 1 site
- Multiple D.R. Horton South Houston sites
- Multiple Home Depot Canada sites
- Multiple Calgary sites (their HQ region)
- ~780 rows had blank city which they auto-filled via text-match or nearest-GPS lookup (their internal audit log shows the cleanup work)

The data is messy enough to need a normalization pass before fuzzy-matching. That's an Ingestion task this weekend.

### What's missing from the data dump (and what to ask CTO Kyle for)

CTO Kyle mentioned he could send "examples of perfect and bad project documents." Those did not arrive yet. Ask Monday morning. Spec books and drawings let you tune the document-intelligence pass and validate that the agent recognizes "temporary security" in scanned PDFs.

He also mentioned he would send their internal client database. The 1,863 customer sites list is part of that but probably not the full picture. Ask whether there are additional fields (contract value, contract dates, branch assignment, contact name) that would deepen the cross-pollination signal.

---

## What I Need You to Do Before Sunday Night

This list assumes Claude Code does the heavy lifting. Your role:

1. **Send the launch prompt to a fresh Claude Code session by Saturday afternoon.** The prompt is at `00 - PROMPT - Zedcor Demo Sprint.md` (drafted alongside this plan). It bakes in the priority list above and the constraints from the strategy meeting.

2. **Confirm the three target branches' coverage areas.** Nashville, Pittsburgh, LA. Each has a 200mi radius per CTO Kyle. Confirm or correct. The launch prompt assumes 200mi.

3. **Decide the chat panel's prepared question list.** Five from my list above are reasonable. If you want to swap one, tell Claude Code to use yours.

4. **Geocode the 24 branches.** Either give Claude Code permission to call a geocoding API, or paste lat/lon for the 24 US/Canada branches in the order they appear in the spreadsheet. Probably 30 minutes of your time if you choose the manual route.

5. **Sit through one full demo run-through Monday afternoon.** With Curtis and Keenan if they can make it. Run the 15-minute arc. Time it. Catch the first wave of bugs while there's still 24 hours to fix them.

6. **Prepare for the roadmap question.** When Todd or James asks "what does this cost," your answer is "tier-based on number of high-ranked leads per month per branch — let us send the pricing model after this call so we can map it to your branch capacity." Don't quote numbers in the room. Strategy meeting consensus: tiered packaging modeled against 7-9¢/lead processed cost.

7. **Prepare for the "we built this internally" objection.** CTO Kyle is sharp. He may say "what stops us from building this in HubSpot ourselves." Your answer is the gap-between-vibe-coded-and-productizable line plus the cross-customer learning advantage: "Every Zedcor lead and every other vertical we serve makes the model smarter for your team. You can't replicate that internally."

---

## Risk Register

- **Owner enrichment quality is the single biggest demo risk.** A lead with a hallucinated owner in the rationale will torch credibility. Better to write "owner not yet enriched" in plain text than make something up. The launch prompt enforces this via Generator-Verifier gates with hallucination flagging.

- **Cross-pollination false positives.** Matching "ABC Constructors" to "ABC Construction Inc." is good. Matching "ABC" to "ABC Holdings" is bad. Use full normalized name + parent-company resolution. The launch prompt specs this explicitly.

- **Empty pipelines in target branches.** If sam.gov + USAspending + Harris County return zero leads above score 90 for Nashville, the demo dies. Fallback: pull a 30-day window instead of 7-day, OR show one of the existing Zedcor markets where you know there's volume (Houston is their biggest branch).

- **Demo network latency.** Run from a wired connection. Have a screen recording as backup.

- **Chat panel hallucination on the prepared questions.** Run all 5 questions twice the morning of, capture clean outputs, and have screenshots ready as fallback if the live chat misbehaves.

- **CTO Kyle pulls "let's wire this to HubSpot during the call."** Politely defer: "Let's nail the lead quality first; HubSpot integration is a 2-day effort once we agree on the contract."

- **Regional director access ask comes up.** Have a one-slide answer: admin / regional director (multi-branch) / sales rep (single branch or multi-select). Don't promise a specific date.

---

## Success Metrics to Track in the Meeting

Take notes on these as the call unfolds. They feed the proposal you send afterward:

- Did Todd lean forward when the first lead landed?
- Did James (sales) ask a follow-up about the cross-pollination feature?
- Did Ameen (CFO) ask about cost?
- Did anyone ask "when can we have it"?
- Did anyone object to the lead quality? On what grounds?
- Did anyone bring up a feature you weren't expecting? Capture that — it's a tell about what they actually value.

---

## Followup Within 24 Hours of the Call

1. Send Todd / James / Ameen / Kyle a written summary of what they saw, what came up, and what's next.
2. Send a tiered pricing proposal anchored to: number of high-quality leads per branch per month, branch saturation capacity (reverse-engineered from their factory output of ~10 towers/day), and a starter-tier free trial.
3. Schedule the followup call with CTO Kyle for the pilot agreement.
4. Capture every objection / question that you didn't have a great answer for. Those become the next sprint's priorities.
