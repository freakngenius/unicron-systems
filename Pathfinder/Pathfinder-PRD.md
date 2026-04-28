# Pathfinder

**Status:** Draft v1 · **Date:** April 25, 2026 · **Owner:** Kyle (Unicron Systems)
**Purpose:** 5-day demo prototype that lands the Zedcor pilot.

---

## Problem

Multi-branch field-sales companies miss high-value opportunities because the buying signals — construction permits, federal contract awards, project announcements, press releases — are scattered across hundreds of public sources, fragmented by jurisdiction, and surface days or weeks before the budget window opens. By the time their salespeople drive past a jobsite, budgets are set and competitors are already chosen. Pathfinder runs an agent loop that continuously monitors public data, cross-references it against branch geography and existing customer relationships, and produces a ranked weekly intelligence report per branch — surfacing pre-budget opportunities and warm cross-pollination paths that would otherwise stay invisible.

## Users

Primary user is the VP of Sales or branch manager at a multi-branch field-sales company operating in geographic territories — security/surveillance providers, equipment rental, temporary fence/power/sanitation, traffic control, modular site offices, commercial roofing. Secondary user is the individual salesperson who consumes the ranked report as weekly prospecting input. The champion-buyer for this demo is Zedcor's CTO; synthetic branches, customers, and footprint are configured to mirror Zedcor's actual North American operation (real geographies, fabricated entities).

## Core Features

- Public-data ingestion from 4 sources (USASpending federal contracts, SAM.gov opportunities, Google News construction signals, Harris County TX permits) running on a 6-hour cron, normalized into one project schema
- Branch coverage map with 5 synthetic Zedcor branches plotted across North America, 300-mile coverage radii, real-time project pins added as records ingest
- Per-branch ranked intelligence list — top 15 projects scored against geography and adjacent customers, each with Claude-generated rationale (project stage, security opportunity assessment, recommended outreach hook, distance to nearest customer)
- Project detail modal — click any pin or list item to see full Claude reasoning, source link, raw record, suggested next action
- Live activity counter — "X projects pulled in last hour, Y new this week" — visibly demonstrates Computer running continuously
- Cross-pollination view — toggle existing customer markers; warm-intro paths highlight where a project sits in a branch's coverage but adjacent to another branch's customer

## Design Direction

- Dark-mode-first, technical-operator aesthetic — closer to Linear or Mapbox Studio than a marketing site
- Map is the primary visual layer; everything else floats over it as semi-transparent panels
- Palette: deep neutral background (#0B0F14), high-contrast accents (mint #3DDC97 for new, amber #FFB454 for high-priority, cobalt #5B7FFF for branches)
- Typography: Inter or Geist Sans, tight tracking, generous line height
- Restrained motion — subtle pulse on new pin ingest, counter tick animation, no chrome-y transitions

## Tech Stack & Constraints

Next.js 14 App Router on Vercel. Supabase Postgres (with pgvector extension for future entity matching). Mapbox GL JS for the map (Leaflet+OpenStreetMap fallback if Mapbox token is friction). Claude API (Sonnet 4.6) for ranking and rationale generation. Computer (Perplexity) drives all 4 ingestion sources via scheduled agents — must be visibly the engine for contest narrative. Deployed to a Vercel subdomain with HTTP basic auth gating the demo. Build budget: 5 days, 2 hours/day human time, balance handled by Claude Code parallel subagents and Computer scheduled runs.

## Out of Scope

- No real Zedcor data — all branches and customers are synthetic, schema-mirrored
- No CRM integration, no Slack bot, no on-prem Llama deployment (all Phase 2)
- No multi-tenant auth — single demo instance, basic-auth gated
- No accept/decline workflow, no edit operations — read-only
- No mobile-optimized layout — desktop-first, works on iPad landscape

## Success Criteria

- Demo runs live in front of Kyle Doenz, real public data flowing in real time, producing recognizable intelligence for synthetic Zedcor branches in his actual geography
- Curtis can walk the demo solo in under 8 minutes and answer "where is this data from" and "how is ranking decided" without help
- At least 100 real, normalized project records across the 4 sources within a 7-day window
- Claude rationale on each project reads as plausible to a security-industry CTO
