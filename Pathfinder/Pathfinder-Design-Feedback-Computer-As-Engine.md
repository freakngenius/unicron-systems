# Pathfinder — Design Feedback: Computer As Engine

**Status:** v1 · **Date:** April 27, 2026 · **For:** Claude Design
**Pairs with:** Pathfinder-Design-Feedback-Liveness.md
**Reason:** The architecture has shifted. Perplexity Computer is now the explicit operator of the system — three named agents that own ingestion, ranking, and adjacent-account discovery. The visual design holds; the content inside specific surfaces needs to reflect this. These changes lock in the contest's "Computer is the engine" criterion.

---

## What stays

Visual design language, color palette, layout, density, motion timing, typography — all unchanged. The hi-fi delivered is the right direction. Below are content-level and component-level updates only.

## Content changes

### 1. Activity log strip — content reflects Computer agents reasoning

The activity log streams Computer agents' actual work, not data pipeline events. Each line is prefixed with the agent name and shows a reasoning step, not a transport event.

Sample lines (live data shape — these come from the `agent_log` Supabase table, written by Computer):

```
[04:00:12] computer/ingestor → browsing harriscounty.tx.gov/permits · 12 records
[04:00:14] computer/ingestor → fetched usaspending api · 6 federal awards
[04:00:18] computer/ingestor → entity correlate · SAM SOL-2026-04-TxDOT-001 ≈ TxDOT press release apr 22 · merged
[04:00:24] computer/ingestor → classify stage · pre-budget · announcement-language signal
[04:00:31] computer/ranker → multi-model route · claude-sonnet for rationale · 2.4s
[04:00:33] computer/ranker → PRJ-9F2A11 · score 87 · branch HOU · high-priority
[04:00:42] computer/adjacent → researching multi-branch field-sales orgs · 4 candidates surfaced
```

Visual treatment:

- Agent name in the line should have a subtle color tint that distinguishes the three agents from each other. Not loud — just enough that a reader scanning the log can tell at a glance "the Ranker is busy right now."
- Use one consistent color per agent across the entire UI (activity log, pipeline strip, agent status panel, log filtering). Pick from your existing palette — don't add new colors.
- The agent prefix is monospaced and slightly muted relative to the message body.

### 2. Pipeline strip — re-frame as "Agent Status," not data pipeline

Currently I asked for `INGEST · NORMALIZE · GEOCODE · RANK · DELIVER` as a horizontal pipeline. Replace with a three-cell agent status row showing the three Computer agents and their current state:

```
INGESTOR        | RANKER          | ADJACENT
running         | idle            | scheduled
last cycle 12m  | last run 4m     | next run fri 09:00 utc
18 records      | 47 ranked today | 8 targets last week
2.4s avg        | 2.1s avg        | —
```

Each cell:

- Agent name (top, slightly larger)
- Status pill (running / idle / scheduled / failed) with subtle color
- 2-3 monospaced metrics underneath
- Same color tint per agent as in the activity log

This converts the dashboard from "data pipeline view" to "agent fleet view." The contest argument shifts from "look at the data flowing" to "look at the agents working."

### 3. New small component — Multi-model routing strip

Computer's native superpower is orchestrating multiple models in parallel. Make this visible AND useful — for the contest judges (proves Computer is doing real multi-model work) and for the buyer (shows the system is engineered for cost discipline, not just throwing every job at the most expensive model).

Add a small horizontal strip — could sit inside the agent status row or as a separate thin band below it — showing model utilization in the last hour. Each model gets its own pill or row with: model name, what it's used for, call count, cost.

```
MODELS · LAST HOUR
local-geocoder   · branch matching   · 124 calls · $0.00
gpt-oss-20b      · stage classify    · 71 calls  · $0.04
claude-haiku     · entity dedup      · 31 calls  · $0.06
claude-sonnet    · rationale gen     · 59 calls  · $0.32
```

Treatment notes:

- Monospaced throughout. Each row right-aligns the call count and cost so the eye scans down a column cleanly.
- Models ordered cheapest → most expensive (top to bottom), so the cost discipline story reads at a glance: cheap models handle high-volume rote work, expensive models reserved for reasoning.
- Use 4-5 models max. Don't list anything that ran zero times in the window.
- Cost is the buyer-grade signal. Model names plus call counts alone are vanity; adding $cost per row earns the strip's existence.
- A small footer line below totaling the hour is helpful: `total · 285 calls · $0.42 · $0.003 per ranked lead`. That last metric — cost per ranked lead — is what a CFO actually wants on the slide.

This single component does double duty: judges read it as "Computer is doing real multi-model orchestration with engineered cost routing"; the buyer reads it as "this system is operationally serious and won't blow up our compute budget at scale."

### 4. Computer attribution somewhere visible

Somewhere in the top status bar or under the Pathfinder logotype: a small affiliation that names Computer as the engine. Subtle, not branded. Examples:

- `3 agents · powered by Perplexity Computer`
- `engine: perplexity computer`
- `agents: 3 · runtime: perplexity`

Pick a treatment that fits. The contest's named criterion is "Computer is the engine, not a helper" — making this attribution visible on every screenshot a judge sees is high-leverage.

### 5. Map pin lifecycle — two distinct moments

Right now a new project pin arrives with one animation (the sonar ping). With three agents in play, there are now two moments worth distinguishing:

- **Ingestor lands a new project** — current sonar ping behavior. Pin appears at coordinates, ring expands, fades. ~600ms.
- **Ranker finishes scoring an existing project** — the existing pin's score badge counts up from 0 to final value over ~600ms. The pin itself doesn't ping again — only the score animates.

This visually separates "a record arrived" from "a record was reasoned about." Different agents, different events.

## Things to NOT add

- No agent-icon avatars, no "agent personalities," no anthropomorphic illustrations. Computer agents are processes, not characters.
- No generative-AI-flavored shimmer, no rainbow/iridescent treatments to signal "AI." The aesthetic stays operator-grade — Bloomberg, Linear, Mapbox Studio.
- No multi-step agent illustrations or flow diagrams in the dashboard chrome. The flow is implicit in the activity log; do not duplicate it as a graphic.
- No live-streaming "thoughts" beyond what the agent_log naturally produces. The log is the system's voice.

## Why these changes matter

The contest's "Computer is the engine" criterion is judged on whether Perplexity Computer is visibly central to how the product works — not buried as an implementation detail. The five changes above are what convert the current design from "a dashboard that happens to use Computer for ingestion" to "an operations console for a Computer agent fleet." That difference is what the judges will pick up on in the demo and in the submission video.

Implement these as targeted content + component updates on top of the existing hi-fi. Should not require redesign.
