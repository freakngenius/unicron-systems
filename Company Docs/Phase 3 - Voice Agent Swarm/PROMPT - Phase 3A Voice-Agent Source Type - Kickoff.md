# PROMPT — Phase 3A Voice-Agent Source Type Extension Kickoff

Paste into a fresh Claude Code session. Recommended model: **Sonnet** (well-defined extension, clear spec). Run AFTER Phase 2 multi-tenant ships AND Phase 3-PRE complete.

---

## Pre-read

1. `Company Docs/Phase 3 - Voice Agent Swarm/PRD - Phase 3 Voice-Agent Swarm.md`
2. `Company Docs/Phase 3 - Voice Agent Swarm/SPEC - Phase 3A Voice-Agent Source Type Extension.md`
3. `Company Docs/Reports/Phase 3 Legal Research/` — sign-off + jurisdiction map
4. `Company Docs/Reports/Phase 3 Vendor Eval/` — selected vendor
5. Existing `Pathfinder/agents/sources/registry.ts` — current registry
6. Existing Source Onboarder code — Tier 2 queue UI to extend

## Hard constraints

- No deletes, no time estimates, no cost caps, multi-Vercel verification, no auto-promotion to Verified.
- This phase does not yet make any voice calls. It only adds the source type, schema, and registration UI.

## Phase A — Investigation (Explore sub-agent)

```
Investigate Pathfinder + Metacron to scope Phase 3A:

1. Find current SourceRef.type enum definition + all usages.
2. Find resolveSource() function + all callers.
3. Find Source Onboarder Tier 2 queue UI in Metacron.
4. Find Architect prompt definition (system prompt + output schema).
5. Identify schema location for new pathfinder.voice_agent_sources table.
6. Confirm Phase 2 organization_id + RLS infrastructure is in place.
7. Report findings.
```

## Phase B — Schema migration

1. `list_migrations` for live max+1.
2. Create migration adding `pathfinder.voice_agent_sources` table per spec.
3. **HARD HALT FOR REVIEW**: print SQL, await Kyle's "apply" before `apply_migration`.

## Phase C — Type extension

1. Extend `SourceRef.type` enum with `voice-agent`.
2. Update Zod validator.
3. Update `resolveSource()` to handle `voice-agent` (returns voiceAgentDispatcher stub for now — Phase 3B implements).

## Phase D — Architect integration

1. Extend Architect's system prompt with `voice-agent` classification instruction (verbatim from SPEC 3A).
2. Update Architect output schema validator to accept voice-agent sources with required metadata.
3. Update Architect Business Summary Panel (if needed) to surface voice-agent sources distinctly.
4. Unit tests: Architect output with voice-agent source validates correctly.

## Phase E — Source Onboarder UI extension

1. In Metacron Source Onboarder Tier 2 queue UI, add "Promote to Voice-Agent" action per item.
2. Promotion form fields: phone_number, jurisdiction, ivr_navigation_hints, preferred_hours_local, language, call_brief_template, compliance_flags, cost_estimate.
3. On submit: insert into `pathfinder.voice_agent_sources`, update any architectures that reference the source.
4. Component test.

## Phase F — Tests

- Unit: SourceRef enum extended, resolveSource handles voice-agent, Zod validates voice-agent metadata.
- Integration: Architect run with mock vertical that should classify source as voice-agent → output includes correct structure.
- Component: Promote-to-voice-agent UI renders, submits, persists.

## Phase G — PR

1. Branch `feat/phase-3a-voice-agent-source-type`.
2. PR titled: `Phase 3A: Voice-Agent Source Type Extension`.
3. PR body: what ships, schema migration drift callout, Phase 3-PRE completion confirmed.
4. Multi-Vercel verification.

## Failure modes — halt + report

- Phase 2 multi-tenant not merged.
- Phase 3-PRE not signed off (legal map, vendor selected, disclosure script).
- Migration produces unexpected diff.

## Kanban hygiene

- Phase A start: card → In Process.
- PR merge: card → Deployed. Cowork moves.

End.
