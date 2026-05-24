# 03 — Submission narrative

What the Perplexity Billion Dollar Build submission must prove and how the deliverables map to that.

## The claim

> "Perplexity Computer is the engine running Pathfinder — a live, agentic procurement intelligence platform for Zedcor Security Systems and the broader multi-billion-dollar construction security market."

This claim is true if and only if PC agents are visibly writing project rows, phase inferences, and customer signals into the live dashboard.

## What the judges will see

The submission requires:

1. **A working live URL** — `zedcor.unicron.systems`
2. **A demo video** (~90 seconds) showing PC agents writing into the dashboard in real time
3. **A pitch deck** (the existing 10-slide deck is at Notion `a7100a7f-1ca5-4fce-807f-b21abda8264f`)
4. **Real traction** — at least one paying or piloting customer (Zedcor is in late-stage LOI)

## The 90-second video script

**0:00–0:10 — Open on the dashboard.**
Voice-over: "Construction site security is a $50B+ market. Today, GCs find vendors like Zedcor through Dodge or ConstructConnect — incumbent platforms with 5,000-person research staffs charging $75K/seat. The data they sell is days late, manually sourced, and built for someone else's workflow."

**0:10–0:25 — Show the branches sidebar and map filling in with Zedcor's 34 locations.**
Voice-over: "Pathfinder is Zedcor's own intelligence engine. 34 branches across the US and Canada. 1,825 active customer sites. Every construction project within reach of every branch, ranked by buy-window phase, scored against Zedcor's actual book of business."

**0:25–0:50 — Zoom into the agent log ticker. Show events streaming in with `runner=pc`.**
Voice-over: "Powered by Perplexity Computer. Three agents running daily, unattended. The Ingestor hits 50 procurement sources across Texas and Louisiana — SAM.gov, TxDOT, Bonfire, IonWave, every county and ISD in the Houston 300-mile radius. The Verifier scores phase confidence — we surface the moment a GC is selecting subcontractors, before incumbents see it. The Customer Intel agent watches Zedcor's existing customers for expansion, M&A, and incident signals that flag the next project."

**0:50–1:15 — Click into a `buy_window_open=true` lead, show its rationale and phase.**
Voice-over: "This is a Harris County detention upgrade. PC inferred sub-bid phase with 0.95 confidence — sub-bid is Zedcor's buying window. It's $2.6M, 19.5 miles from their Houston branch, with a warm-intro path through a customer that's worked the contractor before."

**1:15–1:30 — Pull back to dashboard.**
Voice-over: "Incumbent cost: $75K per seat. Pathfinder cost: $0.07 per generated brief. Two operators. One Perplexity Space. Same engine, every customer, every city, forever."

## What the live URL must show by submission time

Minimum:
- ✅ Loads (currently does — 200)
- ✅ Branch dock with Zedcor's actual branches (currently does — though duplicates)
- ✅ Lead rail with scored projects (currently does)
- 🚧 **Agent log ticker streaming live PC events** (THIS IS THE HEADLINE — agents must be running)
- 🚧 At least 5 projects with `buy_window_open=true` (PC Verifier writes these)
- 🚧 At least 3 rows in `pathfinder.customer_signals` (PC Customer Intel writes these)

Nice-to-have:
- Map renders (Google Maps API key referrer fix)
- Counters work
- Chat works
- Cross-pollination overlay

## What's already true and doesn't need rebuilding

- Lead rail with verified leads ✅
- Phase taxonomy in schema ✅
- Existing cron Ranker writing scores ✅
- Existing cron Verifier writing `verified` column ✅
- Subdomain routing ✅
- Multi-tenant org structure with Zedcor as org #1 ✅
- 1,825 Zedcor customer sites for cross-pollination ✅
- Pitch deck ✅

## The submission gates (in order)

1. **Get PC Ingestor running.** Even one source, one row, one day — proves the engine.
2. **Get PC Verifier running.** Even one phase inference with `buy_window_open=true` — proves the value-add.
3. **Get PC Customer Intel running.** Even one signal — proves the third agent.
4. **Verify writes are visible in the agent log ticker on the live dashboard.**
5. **Shoot the video against the live dashboard with agents running.**
6. **Submit.**

Everything else is post-submission optimization.

## Anti-pattern alerts

- Do NOT spend time perfecting the UI. The judges score on PC-as-engine, not pixel polish.
- Do NOT add new sources beyond what's already seeded. 50+ commercial_ok sources is enough.
- Do NOT swap models trying to optimize cost mid-week. Submit first.
- Do NOT shoot the video before all three agents have produced ≥1 real row each.
- Do NOT enable PC scheduled runs without doing one manual dry run first per agent to verify SQL contracts hold.

## If you have to cut

If you cannot get all three agents running by the deadline, prioritize:

1. PC Ingestor (1 agent, 1 source, 1 row) — table stakes
2. PC Verifier (1 phase inference with buy_window_open) — the value-add
3. PC Customer Intel — drop if necessary

The submission narrative can still be told with 2 agents running. It cannot be told with 0.
