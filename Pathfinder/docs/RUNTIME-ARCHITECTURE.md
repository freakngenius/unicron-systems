# RUNTIME-ARCHITECTURE — Pathfinder Agent Runtime Map

**Status:** Live · **Date:** 2026-04-28 · **Pairs with:** `docs/PLAN-AGENTS.md`, `docs/specs/*.md`

Pathfinder runs a 10-agent fleet across two runtimes. The split is intentional: agents that do real research-and-reasoning work run on Perplexity Computer (the contest-narrative engine); agents that are deterministic plumbing run on Vercel cron (predictable cost, predictable latency, in-process access to `lib/scoring.ts` and `lib/supabase.ts`).

This split is the contest's defensible answer to "is Computer really the engine, or is this just a wrapper?" — Computer drives every agent that reads the open web, browses LinkedIn, classifies real opportunities, drafts copy, surfaces patterns. Vercel cron only runs the agents whose entire job is "deterministic check + structured write" — those would be a poor use of Computer's research-grade capabilities anyway.

## Final split — 5 / 5

| # | Agent | Runtime | Why this runtime | Trigger | Schedule |
|---|---|---|---|---|---|
| 1 | **Ingestor** | Perplexity Space | Browser automation against Harris County permit portal; cross-source entity correlation; Computer's web stack is the right tool | Cron inside Computer | `0 */6 * * *` (every 6h) |
| 2 | **Adjacent** | Perplexity Space | Open-web discovery across 4 vertical themes; outreach drafting with company research; entirely a research workflow | Cron inside Computer | `0 9 * * 5` (Fri 09:00 UTC) |
| 3 | **Outreach** | Perplexity Space | LinkedIn lookup + company-website browse for contact identification; voice/tone-controlled drafting per channel | Event-driven inside Computer (verified high-pri lead arrival) | Polling |
| 4 | **Customer Intel** | Perplexity Space | Press-wire monitoring, LinkedIn job-postings, SEC filings, Google News; signal classification | Cron inside Computer | Every 12h |
| 5 | **Competitive** | Perplexity Space | USASpending + SAM.gov API pulls + press-release research + share-trend reasoning | Cron inside Computer | Wed 04:00 UTC |
| 6 | **Ranker** | Vercel cron function | Deterministic geo scoring (lib/scoring.ts) + 1 Haiku classify call + 1 Sonnet rationale call. No browser/research work. | HTTP GET from Vercel cron scheduler | `*/30 * * * *` (twice/hr) |
| 7 | **Verifier** | Vercel cron function | 4 deterministic checks (3 of them pure math); 1 Sonnet rationale-anchor classification. No browser/research work. | HTTP GET from Vercel cron scheduler | `0,30 * * * *` (twice/hr) |
| 8 | **Pulse** | Vercel cron function | Statistical pattern detection over rep-behavior aggregates; proposes config diffs. Pure data-pipeline work. | HTTP GET from Vercel cron scheduler | `0 2 * * *` (daily 02:00 UTC) |
| 9 | **Eval** | Vercel cron function | Retrospective reasoning over historical data + 5 ground-truth seeds. Read-only against `pathfinder.projects`; deterministic eval. | HTTP GET from Vercel cron scheduler | `0 6 * * 0` (Sun 06:00 UTC) |
| 10 | **Briefing** | Vercel cron function | Aggregates 7-day metrics from 4 tables; Opus call for synthesis; emits markdown to `briefings` table + Slack/email. Structured pipeline. | HTTP GET from Vercel cron scheduler | `0 6 * * 5` (Fri 06:00 UTC) |

## Contest narrative

> Computer is the engine for the 5 research-and-reasoning agents — Ingestor crawling permit portals, Adjacent discovering shape-matched companies, Outreach researching LinkedIn contacts, Customer Intel scanning press wires + SEC filings, Competitive synthesizing share trends. These are the workflows that genuinely need Computer's browser + web-search + multi-model routing.
>
> The other 5 agents (Ranker, Verifier, Pulse, Eval, Briefing) are deterministic plumbing — geographic math, statistical pattern detection, retrospective scoring against ground truth, weekly aggregation. Running them on Vercel cron is the honest answer: they don't benefit from Computer, so we don't put them there.

This split is defensible because it's honest. Pathfinder isn't claiming Computer does everything — it's claiming Computer does the work where Computer's capabilities matter, and the rest runs on the cheapest predictable substrate that fits.

## Why Vercel cron for the deterministic 5

- **Direct `lib/scoring.ts` import** — no HTTP roundtrip, no auth header juggling. Pure-function kernel runs in-process with the rest of the dashboard backend. (HTTP scoring endpoints at `/api/scoring/branch` and `/api/scoring/score` remain available for any future external caller, but the in-fleet Vercel cron functions don't use them.)
- **Same Supabase client** as the read-side API routes — single auth surface, single connection pooler, same RLS-bypassing service role.
- **Same Anthropic SDK** as the existing rationale generation — `@anthropic-ai/sdk` ^0.32.1, model IDs `claude-haiku-4-5` and `claude-sonnet-4-5` (Briefing also uses `claude-opus-4-7` for the higher-quality weekly synthesis).
- **Predictable cost** — every cycle's token spend is capped by the queue limit. Pulse/Eval/Briefing run once per day or once per week; Ranker + Verifier are bounded at 30 projects per cycle.
- **Predictable latency** — Vercel functions have a 60-second `maxDuration` (300s on Pro). Ranker/Verifier are sized to fit within 60s for the pilot's projected queue depth.

## Why Perplexity Spaces for the research 5

- **Browser automation** — Ingestor walks Harris County's permit search UI; Outreach inspects LinkedIn profile pages and company "about" pages; Customer Intel browses SEC EDGAR + PR Newswire; Adjacent browses company locations pages. None of this is reproducible from a serverless function without setting up our own browser-automation infrastructure (Playwright on Lambda, Browserless, etc.) — Computer ships that out of the box.
- **Multi-model routing inside Computer's catalog** — Ingestor and the research agents benefit from Computer's automatic routing to whichever model fits each step (cheap classifier for filtering, larger model for entity correlation). Replicating that in our own code is doable but reinvents wheels Computer already turns.
- **Cron + scheduled-task management** — Computer Spaces have built-in cron with overlap protection. We use it.
- **Web search** — Computer's web search is first-class; replicating it via SerpAPI or similar adds vendor sprawl.

## File layout

```
Pathfinder/
├── prompts/                        Perplexity Space system prompts
│   ├── computer-ingestor.md
│   ├── computer-adjacent.md
│   ├── computer-outreach.md        (Layer 2 — coming)
│   ├── computer-customer-intel.md  (Layer 3 — coming)
│   ├── computer-competitive.md     (Layer 2 — coming)
│   └── claude-ranking-rationale.md
├── docs/
│   ├── specs/                      Vercel cron behavioral specs
│   │   ├── ranker.md               (Layer 1.5 — moved from prompts/)
│   │   ├── verifier.md             (Layer 1 — moved from prompts/)
│   │   ├── pulse.md                (Layer 2 — coming)
│   │   ├── eval.md                 (Layer 3 — coming)
│   │   └── briefing.md             (Layer 3 — coming)
│   ├── PLAN-AGENTS.md
│   ├── AGENT-DEPLOYMENT-CHECKLIST.md
│   └── RUNTIME-ARCHITECTURE.md     (this file)
├── app/api/cron/                   Vercel cron route handlers
│   ├── ranker/route.ts             (Layer 1.5)
│   ├── verifier/route.ts           (Layer 1)
│   ├── pulse/route.ts              (Layer 2 — coming)
│   ├── eval/route.ts               (Layer 3 — coming)
│   └── briefing/route.ts           (Layer 3 — coming)
└── vercel.json                     Cron schedule registry
```

## Cron trigger — Vercel Hobby workaround

Vercel's Hobby plan caps cron jobs at **once per day**. Ranker (`*/30 * * * *`) and Verifier (`0,30 * * * *`) need a 30-minute cadence, so the crons are NOT registered in `vercel.json` directly. Two enablement paths:

**Path A — Upgrade Vercel to Pro ($20/mo).** Add this to `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/verifier", "schedule": "0,30 * * * *" },
    { "path": "/api/cron/ranker",   "schedule": "*/30 * * * *" }
  ]
}
```
Then re-deploy. Vercel handles auth + invocation natively.

**Path B — External cron (GitHub Actions, Upstash, EasyCron).** The route handlers are runtime-agnostic — they accept any HTTP GET with the right Bearer token. Example GitHub Actions workflow at `.github/workflows/pathfinder-cron.yml`:
```yaml
name: pathfinder-cron
on:
  schedule:
    - cron: '*/30 * * * *'
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://pathfinder-ashy.vercel.app/pathfinder/api/cron/verifier
          curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://pathfinder-ashy.vercel.app/pathfinder/api/cron/ranker
```
GitHub Actions cron schedules drift 5–15 min — fine for our use case. Free, no plan upgrade. The downside: introduces a third runtime in the operator story.

**Current state:** Path B not yet wired. Cron handlers ship live with Path-B-ready auth; pick a path and uncomment the relevant config.

## Operator model

| Action | Where |
|---|---|
| Deploy a Perplexity Space agent | Paste `prompts/computer-<agent>.md` into a Computer Space, configure schedule + Supabase MCP grant, follow `docs/AGENT-DEPLOYMENT-CHECKLIST.md` |
| Deploy a Vercel cron agent | Edit `vercel.json` cron entry + push to main + Vercel auto-runs the cron at the registered schedule |
| Update an agent's behavior | Edit the spec doc (`prompts/computer-*.md` or `docs/specs/*.md`), then re-paste (Perplexity) or re-deploy (Vercel) |
| Pause an agent | Perplexity: pause the Space schedule. Vercel: comment out the cron entry in `vercel.json` and re-deploy. |
| Verify an agent is firing | Both runtimes write to `pathfinder.agent_log` with the same shape. The dashboard's Activity Rail and Agent Status Row are runtime-agnostic. |

## Auth model

- **Perplexity Space agents** authenticate to Supabase via the MCP grant configured in their Space settings (scoped to schema `pathfinder` only).
- **Vercel cron agents** authenticate via `Authorization: Bearer ${CRON_SECRET}` (Vercel injects this header automatically when invoking registered cron paths). The handlers also accept `?secret=<value>` for local testing. They use the dashboard's existing Supabase server client.

`CRON_SECRET` is set in Vercel project env vars (Production + Preview scopes) as a 32-byte random hex. `ANTHROPIC_API_KEY` is shared with the rest of the dashboard backend.

## Dashboard impact: zero

The dashboard reads only from `pathfinder.agent_log`, `pathfinder.agent_runs`, and `pathfinder.projects` (plus the new `pathfinder.outreach_drafts` etc. for Layer 2/3 panels). It doesn't know or care which runtime wrote those rows. Both runtimes adhere to the same `agent_name` / `event_type` / `event_data` contract.
