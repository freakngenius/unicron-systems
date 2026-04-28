# Pathfinder — Claude Design Update Prompt

---

Update Pathfinder Hi-Fi.html. Visual language, palette, layout density, and typography all hold — these are targeted updates, not a redesign.

**Architecture frame:** Pathfinder is now operated by three named Perplexity Computer agents — Ingestor, Ranker, Adjacent Discovery — that write directly to Supabase. The dashboard is the operations console for that agent fleet. The current hi-fi reads as a data-pipeline view; reframe it as an agent-fleet view.

---

**Change 1 — Activity log content**

The activity log streams Computer agent reasoning, not data pipeline events. Each line is prefixed with the agent name. Sample:

```
[04:00:12] computer/ingestor → browsing harriscounty.tx.gov/permits · 12 records
[04:00:14] computer/ingestor → fetched usaspending api · 6 federal awards
[04:00:18] computer/ingestor → entity correlate · SAM SOL-2026-04-TxDOT-001 ≈ TxDOT press release apr 22 · merged
[04:00:24] computer/ingestor → classify stage · pre-budget · announcement-language signal
[04:00:31] computer/ranker → multi-model route · claude-sonnet for rationale · 2.4s
[04:00:33] computer/ranker → PRJ-9F2A11 · score 87 · branch HOU · high-priority
[04:00:42] computer/adjacent → researching multi-branch field-sales orgs · 4 candidates surfaced
```

Each agent name carries a subtle distinct color tint drawn from the existing palette. Same color tint per agent everywhere (activity log, agent status row). Agent prefix monospaced, slightly muted relative to the message.

---

**Change 2 — Agent Status row (replaces the data pipeline strip)**

Remove the existing horizontal `INGEST · NORMALIZE · GEOCODE · RANK · DELIVER` strip. Replace with three cells, one per Computer agent:

```
INGESTOR         | RANKER          | ADJACENT
running          | idle            | scheduled
last cycle 12m   | last run 4m     | next run fri 09:00 utc
18 records       | 47 ranked today | 8 targets last week
2.4s avg         | 2.1s avg        | —
```

Each cell: agent name (top, slightly larger), status pill (`running` / `idle` / `scheduled` / `failed`) with subtle agent-color tint, 2-3 monospaced metrics underneath.

---

**Change 3 — Multi-model routing strip**

New component. Lists 4-5 models in use, each with purpose, call count, cost:

```
MODELS · LAST HOUR
local-geocoder   · branch matching   · 124 calls · $0.00
gpt-oss-20b      · stage classify    · 71 calls  · $0.04
claude-haiku     · entity dedup      · 31 calls  · $0.06
claude-sonnet    · rationale gen     · 59 calls  · $0.32
total · 285 calls · $0.42 · $0.003 per ranked lead
```

Monospaced. Cheapest → most expensive, top to bottom. Right-align call count and cost. Footer totals the hour with cost-per-ranked-lead. Skip models that ran zero times.

---

**Change 4 — Computer attribution in top status bar**

Small affiliation in or near the top status bar. Treatments like `3 agents · powered by Perplexity Computer` or `engine: perplexity computer · 3 agents`. Status-pill grade, restrained — not a marketing badge.

---

**Change 5 — Map pin lifecycle, two distinct moments**

- Ingestor lands a new project: pin appears with a sonar-ping ring expanding, ~600ms, then settles
- Ranker scores an existing project: that pin's score badge counts up from 0 → final value, ~600ms; the pin itself does not ping again

Two agents, two distinct moments. Don't conflate them.

---

**Change 6 — Liveness signals**

- Pulsing LIVE dot, ~1.2s slow pulse, low amplitude
- Replace static `LAST INGEST · 04:00:12 UTC` with ticking `LAST INGEST · 12s ago` updating every second
- Top-bar stat counters (`NEW`, `TRACKED`, `RANKED`) tick + briefly highlight when their value changes
- Branch counts in the sidebar tick + briefly highlight when their value changes
- Claude rationale in the project modal streams in character-by-character (~50 chars/sec) on first open of a freshly-ranked project; subsequent opens render instant

---

**Constraints**

- No background ambient motion, scan lines, or generative-AI shimmer
- No agent-icon avatars, anthropomorphic illustrations, or "Claude is thinking" copy
- No more than one motion happening at the same time in any region
- Aesthetic stays operator-grade — Bloomberg, Linear, Mapbox Studio territory
- Computer attribution stays small. No marketing badges.

---

**Deliverable:** revised Pathfinder Hi-Fi.html.
