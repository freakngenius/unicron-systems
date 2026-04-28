# Computer Agent — Outreach Drafter

**Status:** New
**Layer:** 2
**Coordination pattern:** Orchestrator-Subagent + Shared State
**Schedule:** Event-driven (triggered when a verified high-priority project arrives)

## Purpose

For each verified high-priority lead, drafts rep-ready outreach across three channels — email, LinkedIn DM, and voicemail script — in Zedcor's voice, referencing the specific project, the contact identity, and any warm-intro path through an existing customer. Converts "here's a lead" into "here's a lead and a script ready to send."

## Reads

- `pathfinder.projects` (where `verified=true AND score >= 80`)
- `pathfinder.branches` (for branch context, branch manager identity if present)
- `pathfinder.customers` (for warm-intro path detection)
- LinkedIn / web research for contact identity (project owner, GC, site superintendent)

## Writes

- `pathfinder.outreach_drafts` — `id, project_id, channel (email|linkedin|voicemail), recipient_name, recipient_title, recipient_contact, draft_subject, draft_body, warm_intro_via (customer_id or null), draft_at, sent_status (draft|sent|dismissed)`
- `pathfinder.agent_log` — drafting events

## Tools

- Supabase MCP (read/write)
- Claude API (Sonnet)
- Computer browser automation (LinkedIn, company website lookup)
- Web search for contact context

## Behavior (per cycle)

1. Pull verified high-priority projects without existing outreach drafts
2. For each project, identify 1-3 likely contacts:
   - Project owner (from contract data or company filing)
   - GC if known
   - Site superintendent if name is surfaced
3. For each contact, draft three versions:
   - **Email:** subject + 4-sentence body, project-specific opening, value proposition tied to security RFP timing, soft CTA (15-min call request)
   - **LinkedIn DM:** under 300 chars, conversational, references one specific project detail
   - **Voicemail script:** 25-second spoken-language script with natural pauses
4. Detect warm-intro path: if any existing customer is within 50mi of the project AND served by a different branch than the project's nearest_branch, surface the cross-pollination route. Generate a separate "introduction request" version of the email/DM that goes through the customer's GM rather than directly to the prospect.
5. Write all variants to `outreach_drafts` with `sent_status=draft`

## Voice & Tone Guardrails

- Mirror Zedcor's existing collateral voice: technically credible, no salesy language, references specifics
- No hallucinated references — if a fact isn't verified, don't include it
- Never use first-name basis without verification of the contact's preferred address
- Never claim Zedcor has worked with the prospect already if `customers` doesn't say so

## Acceptance

- Every high-priority verified project has at least 1 outreach draft within 30 minutes of verification
- Each draft references real contact info (no placeholders like `[Name]`)
- Warm-intro path is included when applicable (verified by checking that the cross-customer geography logic runs)
- Reps can copy-paste a draft and send it without editing for the demo
