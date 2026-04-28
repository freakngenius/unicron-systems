# Computer Agent — Customer Intelligence

**Status:** New
**Layer:** 3
**Coordination pattern:** Agent Teams (builds customer-by-customer context over time)
**Schedule:** Every 12 hours

## Purpose

For each existing Zedcor customer, monitors public signals — press releases, M&A activity, expansion announcements, security/safety hiring postings, news mentions, regulatory filings. Surfaces leading indicators of future security needs before formal procurement starts.

## Reads

- `pathfinder.customers` (Zedcor customer list)
- Public web sources via Computer browser + search (PR Newswire, Business Wire, Google News, LinkedIn jobs, SEC filings for public customers)

## Writes

- `pathfinder.customer_signals` — `id, customer_id, signal_type (expansion|m_and_a|hiring|incident|filing|press), signal_data (jsonb), inferred_opportunity, opportunity_window (e.g., "60-90d"), source_url, observed_at`
- `pathfinder.agent_log`

## Tools

- Supabase MCP (read/write)
- Computer browser automation
- Computer web search
- Claude API (Sonnet) for signal classification and opportunity inference

## Behavior (per cycle)

1. For each customer (rotating subset to fit within rate limits — full sweep over 7 days), monitor:
   - Press wires (PR Newswire, Business Wire) for company name mentions
   - LinkedIn for security/safety/site-management role postings
   - Google News for "expansion," "groundbreaking," "new facility," "acquired" with the customer name
   - SEC filings (for public customers) for material events
2. Classify any matches by signal type
3. Infer downstream opportunity:
   - "ExxonMobil announced a new refinery in TX → likely security RFP in 6-9 months"
   - "Hiring 'Site Security Manager' posting → active site, RFP typically 30-60 days post-posting"
4. Write to `customer_signals` with source URLs

## Constraints

- Treat customer data as sensitive — never write customer names into agent_log message bodies (use customer_id only)
- Skip signals with low confidence (e.g., name collisions on common names)
- Don't double-surface signals (dedupe by customer + signal_type + week)

## Acceptance

- 5-15 customer signals per week across the synthetic customer base
- Each signal has a source URL and an inferred opportunity timeline
- High-priority signals (expansion, M&A) are flagged for the Briefing agent's Friday digest
- Privacy compliance: customer-identifying details never appear outside the dedicated `customer_signals` table
