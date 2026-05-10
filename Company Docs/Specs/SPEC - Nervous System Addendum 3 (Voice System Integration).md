# SPEC Addendum 3 — Voice System Integration into Atrium

**Status:** Active
**Parent SPECs:** SPEC - Unicron Nervous System.md, Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md
**Companions:** Addendum 1 (Kanban Surface Routing), Addendum 2 (Skills + Karpathy + Refero)
**Date:** 2026-05-08
**Owner:** Kyle Kesterson
**Reference:** Unicron Voice System brief (current), running at unicron-voice-prototype.vercel.app

The Voice System is now Pathfinder's fifth ingest source and a primary records-acquisition mechanism for procurement-office data that has no API. This addendum defines how it becomes part of the Nervous System and Atrium rather than a parallel track.

Merge into main SPECs at v0.4 after Sprint 5 ships.

---

## 1. Operating principle

**Voice agents are agents, not a separate system.** The Voice System's three agent types (Discovery inbound, SDR outbound, Procurement Pull outbound) register in `nervous_system.agents` alongside Orchestrator, Analyst, Elder, Taboo Keeper, and the Pathfinder/Metacron specialists. Every voice call is a row in `nervous_system.ledger` with `source_type='call'` and `metadata.recorder='voice_agent'`. Every transcript is searchable via the same pgvector RPC. Every action item extracted from a voice call lands on the same kanbans through the same Taboo-gated kanban writer.

Two architectural goals fall out of this:

1. **One Calls view** in Atrium covers Plaud, Fathom, and voice-agent calls uniformly. No "voice tab" separate from "calls tab."
2. **One agent registry** covers all archetypes. Voice agents have `archetype='specialist'` and `specialty='voice_discovery' | 'voice_sdr' | 'voice_procurement_pull'`. Their config jsonb references the persistent Vapi assistant id and the per-customer config rows in `pathfinder.procurement_pull_configs`.

The Voice System's existing Builder UI at `/builder` continues to operate; Atrium absorbs its functionality into the System tab over time. Both can coexist during transition.

## 2. Atrium surface integration

Voice activity appears across six Atrium surfaces.

### 2.1 Now tab

- **Status pulse** gains a fifth indicator: voice fleet (calls in flight, queued, error-rate last 24h). Hover shows per-agent breakdown.
- **Activity feed** receives voice events: call dispatched, call answered, call ended, structured-data extracted, project written to Pathfinder. Throttled and deduped per existing rules. Each event clickable for transcript and outcome.
- **Run a Skill surface** adds three voice skills under a new "Voice" category:
  - `place-discovery-call` (rare manual; Discovery is primarily inbound)
  - `place-sdr-call` (target_prospect param; refusal-gated)
  - `place-procurement-pull` (target_office param; refusal-gated)
  - Each lands in `nervous_system.skills` with `refusal_gate=true` and a non-trivial `budget_usd_per_run` (Vapi minutes + ElevenLabs + Anthropic + Deepgram add up).

### 2.2 Work tab

- **Calls sub-tab** unifies all call sources. Filter chip "Source: voice_agent | plaud | fathom | manual" lets you scope. Detail panel renders the same way regardless of source: full transcript (lazy), decisions extracted, action items created, evidence quotes, plus voice-specific fields when source is voice_agent (dispatcher agent, target office, structured_data JSON, Vapi call id with link to Vapi dashboard).
- **Decisions sub-tab** ContinuityTimeline includes decisions made during voice calls when the call surfaces a customer commitment, regulatory exposure, or architectural reference.
- **Refusals sub-tab** lists Taboo bounces on voice dispatches alongside other refusals.

### 2.3 System tab

New sub-tab: **Voice** (alongside Agents, Taboos, Refusal log, Services, Decay, Memory, Scheduled jobs, Audit log, Continuity).

The Voice sub-tab absorbs the existing `/builder` UI:

- **Configs panel**: CRUD on `pathfinder.procurement_pull_configs`. Per-customer view; expandable per-office editor with cron, phone, pull_window_days, why_priority text, disclosure_text. Edits run through GatedAction wrapper with Taboo Keeper validation.
- **Assistants panel**: Vapi assistant CRUD via JSON editor (API key server-side, never exposed to client). Edits route through `/api/atrium/voice/assistants/:id` with Taboo Keeper.
- **Sources panel**: read-only view of `pathfinder.voice_agent_sources`.
- **Live calls panel**: in-flight calls with mid-call status (queued, ringing, in-conversation, ended), 4-sec polling. Click for live transcript stream once Sprint 6+ wires the live observer.
- **Call attempts log**: `pathfinder.voice_call_attempts` table view with filter chips for office, config, status.

The existing System sub-tabs also extend:

- **Agents galaxy**: voice agents render as nodes with a phone-icon badge. Per-agent card shows last call timestamp, success rate (calls ending with structured_data), cost-per-call rolling average, active toggle.
- **Services health**: Vapi, ElevenLabs, Deepgram as monitored services with status, last successful call, error rate, latency p95.
- **Scheduled jobs**: procurement_pull hourly cron listed with the rest, toggle on/off, "Trigger now" button (Taboo-gated).
- **Audit log**: voice dispatches, voice config edits, voice taboo bounces all logged.

### 2.4 Money tab

- **Accounts** table adds Vapi, ElevenLabs, Deepgram as line items with monthly cost, last-billed date, owner.
- **Expenses** stacked bar gains a "Voice" category broken down by service.
- **Cost spike alerts** monitor per-config burn rate; spike threshold set per-config based on rolling 30-day average.
- **Per-customer cost allocation**: voice costs allocate to the customer whose config triggered the call, surfaces in Products tab tenant view (Section 2.5).

### 2.5 Products tab

The Pathfinder sub-tab tenant view (e.g., Zedcor deep view from prior batch) gains a **Voice activity** section:

- Per-city: voice calls placed last 30d, leads generated from voice, hit rate (call → structured_data → project), per-call cost.
- Per-procurement-office: call frequency, last successful pull, projects sourced all-time.
- Voice cost rollup: subscription costs (Vapi base, ElevenLabs base, Deepgram base) + per-call usage costs, attributed to this customer.
- Editable per-office cron: clicking a config row opens the same editor as System → Voice, scoped to this customer's configs.

### 2.6 Library tab (wiki)

Two new wiki pages in `unicron-knowledge/wiki/how-to/`:

- `voice-system-overview.md`: how voice fits into Pathfinder ingest, when to dispatch which agent, what data ends up where.
- `editing-a-procurement-pull-config.md`: how to add a new target office, set the cron, set the disclosure text, troubleshoot a config that isn't pulling.

The auto-generated `whats-connected.md` lists Vapi, ElevenLabs, Deepgram as connected services with status sourced from System → Services.

## 3. Data flow

Two flows to wire.

### 3.1 Voice call → ledger + Pathfinder (existing + extension)

Vapi `end-of-call-report` webhook hits `/api/voice/webhook/call-ended` (existing handler). Extension:

1. Existing logic: `procurementIngest` writes to `pathfinder.projects` + `pathfinder.project_contacts` + `pathfinder.voice_call_transcripts`.
2. **New**: same handler also writes a row to `nervous_system.ledger` with:
   - `source_type='call'`
   - `source_id=<vapi_call_id>`
   - `source_url=<vapi_dashboard_url>`
   - `participants=[<voice_agent_uuid>, <target_office_contact_uuid_if_known>]`
   - `content_summary=<one_paragraph_from_structured_data>`
   - `content_full=<full_transcript>`
   - `customer_id=<resolved_from_config>`
   - `metadata={recorder: 'voice_agent', vapi_call_id, agent_type, target_office_id, structured_data}`
3. **New**: ingest skill runs on the new ledger row (call ingest skill from Sprint 1) to extract decisions, action items, insights. Action items route through the kanban writer per Addendum 1 (e.g., a procurement call surfacing a $4M project may file an action item "Review HCFCD drainage RFP for Pathfinder lead scoring" on the Pathfinder Features Kanban).
4. **New**: the ledger row is embedded via pgvector trigger and becomes searchable in Atrium global search and System → Memory.

### 3.2 Other agents → voice dispatch

Voice calls become a tool other agents can invoke.

New tool added to the Orchestrator's tool set (per the Sprint 2 Orchestrator upgrade) and to relevant Specialists (Pathfinder Architect, SDR research):

```
dispatch_voice_call(agent_type, target_office_id_or_prospect_id, variable_overrides, scheduled_for)
```

Behavior:
- Posts to `/api/atrium/voice/dispatch` server endpoint
- Endpoint runs Taboo Keeper validation (target office vs taboo register; disclosure text vs taboo register)
- If passes, dispatches to existing `/api/dispatch` voice route with the per-call assistantOverrides
- Audit-logged
- Returns the Vapi call id; the caller agent can poll for outcome or subscribe to the eventual webhook

This unlocks: the Pathfinder Architect agent decides a prospect is worth a phone touch and dispatches procurement_pull programmatically. The Orchestrator can DM-respond to "call HCFCD now" by invoking this tool.

## 4. Refusal layer for voice

Voice is the highest-stakes outbound channel because calls are public artifacts. The Taboo Keeper's role expands:

- **Pre-dispatch validation**: every voice call (manual, scheduled, or programmatic) passes through Taboo Keeper before Vapi is invoked. Inputs validated: target_office_name, disclosure_text, pull_objective, agent_name, caller_brand. Bounce reasons logged to audit_log and posted to #orchestrator-escalations.
- **Domain refusals applied**: militaries, weapons systems, autonomous targeting, prison contractors, payday lenders. Procurement offices serving these domains are refused. The taboo register is the source of truth.
- **Disclosure text gate**: every voice agent must disclose it is an AI agent (per typical AI-call regulation in target jurisdictions). The Taboo Keeper validates disclosure_text matches a known-good template per region. Configs without compliant disclosure cannot dispatch.
- **Override authority**: Kyle, Keenan, or Curtis can override a Taboo bounce with a written reason. Override creates a continuity log entry. Three overrides on the same taboo within 30 days flags an Analyst review.
- **Elder consultation**: voice calls touching customers we have prior commitments to (per continuity log) trigger an Elder advisory before dispatch. The Elder may flag the call as `requires_explicit_override` if a prior commitment is in tension.

## 5. Multi-tenant scope

The Voice System is multi-tenant; Atrium respects that:

- **Per-tenant edits**: voice configs are scoped to a customer (`pathfinder.procurement_pull_configs.customer_id`). Atrium → Products → Pathfinder → tenant detail surfaces only that tenant's configs and activity.
- **Per-tenant cost allocation**: voice costs roll up to the customer's MRR/profitability calculation in Money tab.
- **Cross-tenant view**: Atrium → System → Voice shows all configs across all customers (founder-tier visibility). Filter chip "Customer: any | zedcor | realberry | ..." scopes the view.
- **Cross-tenant learning is gated**: per the manifesto's container tensions, learnings from one tenant's voice activity (e.g., effective phrasings, common refusal reasons from procurement offices) can compound into the platform-wide skill library only with explicit consent. Tenant data stays scoped; meta-learnings opt in.

## 6. Sprint impact

This addendum touches Sprints 5, 6, and 7 of the Master Conductor plan. Specific updates:

| Sprint | New work added |
|--------|---------------|
| 1 (already shipped) | Voice ledger writes + voice ingest can land as a follow-on PR; not blocking |
| 5 | Register voice agents in `nervous_system.agents`. Add `dispatch_voice_call` tool to Orchestrator and relevant Specialists. Wire Voice cost line items into Money tab. Add Voice activity section to Pathfinder tenant deep view. Register the three voice skills in `nervous_system.skills`. |
| 6 | Atrium System tab Voice sub-tab full implementation (absorbs `/builder` functionality). Two wiki pages authored. Voice skill clickable from Run a Skill surface. |
| 7 | Live calls observer (mid-call streaming transcript) wires via Vapi event stream. Polish, Refero consistency pass, mobile parity for Voice surface. |

## 7. What stays at unicron-voice-prototype.vercel.app

The existing Voice System control plane stays operational during transition. Specifically:

- The `/builder` UI at unicron-voice-prototype.vercel.app/builder remains for direct config editing during sprint transitions
- Vapi webhook endpoint stays at the voice-prototype domain (no DNS migration risk)
- The cron job at `/api/cron/procurement-pull` continues running on the voice-prototype Vercel project

Atrium reads from the same Supabase tables and writes to the same `pathfinder.projects` rows. The control plane is duplicated (Builder UI at /builder and Atrium → System → Voice both edit the same data), which is acceptable during the build. Once Atrium is feature-complete on the Voice surface (post-Sprint 6), the `/builder` URL can redirect to Atrium → System → Voice and the voice-prototype project handles only webhook + cron infrastructure.

## 8. Open decisions

1. **Voice agent UUIDs**: when the three voice agent types register in `nervous_system.agents`, do they each get a single agent row, or one row per (agent_type × customer)? Recommendation: one row per agent_type (Discovery, SDR, Procurement Pull) at the company level, with per-customer config rows in `pathfinder.procurement_pull_configs` referenced by the agent's config jsonb. This keeps the agent registry clean.

2. **Cost attribution to ledger**: each voice call has a real per-call cost. Should the cost land on the ledger row directly (`metadata.cost_usd`)? Recommendation yes; enables Money tab per-call accounting.

3. **Inbound discovery routing**: today inbound calls bind to Discovery only. Post-Sprint 7 should we add inbound routing to procurement_pull (a city clerk calling us back)? Defer to founder decision; the architecture supports it.

4. **HubSpot write-through for SDR calls**: pending per the brief. Sprint 5 work to wire HubSpot connector into the SDR webhook handler.

5. **Living Intelligence Engine**: the brief mentions feeding transcripts into a Living Intelligence Engine for institutional memory. This is the same as Atrium's vault + ledger semantic search. Confirm: there's no separate Living Intelligence Engine to build; the vault + pgvector already serves this purpose. Voice transcripts in `nervous_system.ledger` are searchable by every Cowork chat and Atrium global search.

End Addendum 3.
