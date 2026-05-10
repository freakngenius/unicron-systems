# PROMPT — Phase 3B Voice Agent Service MVP Kickoff

Paste into a fresh Claude Code session. Recommended model: **Opus** (cross-cutting service, real-time streaming, vendor integration, error handling complexity). Run AFTER Phase 3A merges.

---

## Pre-read

1. `Company Docs/Phase 3 - Voice Agent Swarm/PRD - Phase 3 Voice-Agent Swarm.md`
2. `Company Docs/Phase 3 - Voice Agent Swarm/SPEC - Phase 3B Voice Agent Service MVP.md`
3. `Company Docs/Phase 3 - Voice Agent Swarm/SPEC - Phase 3D Compliance & Audit Layer.md` — disclosure injection runs through here
4. `Company Docs/Reports/Phase 3 Legal Research/` — disclosure script
5. `Company Docs/Reports/Phase 3 Vendor Eval/` — selected vendor SDK docs
6. Existing Pathfinder agent dispatch code (Phase 2C)

## Hard constraints

- No deletes, no time estimates, no cost caps, multi-Vercel verification, no auto-promotion to Verified.
- Vendor API secrets stored in Vercel env (not committed).
- Test calls only to Phase 3-PRE-approved sources during MVP.

## Phase A — Investigation

```
Investigate to scope Phase 3B:

1. Confirm Phase 3A shipped: voice_agent_sources table, voice-agent type in SourceRef.
2. Find existing Inngest function patterns for agent dispatch.
3. Identify webhook endpoint pattern (api/.../route.ts).
4. Confirm vendor SDK from Phase 3-PRE selection (Vapi or Retell).
5. Find lead schema mapping logic from existing source adapters.
6. Find Slack alert infrastructure for review-required notifications.
7. Report findings.
```

## Phase B — Schema migration

1. `list_migrations` for live max+1.
2. Create migration adding:
   - `pathfinder.voice_call_transcripts` table per spec
   - `pathfinder.voice_call_audit` table per Phase 3D spec (compliance layer foundation)
3. **HARD HALT FOR REVIEW**: print SQL, await Kyle's "apply" before `apply_migration`.

## Phase C — Vendor integration

1. Install vendor SDK.
2. Configure Vercel env vars: VENDOR_API_KEY, VENDOR_PROJECT_ID, etc.
3. Create `Pathfinder/lib/voice-agent/vendor.ts` wrapping vendor SDK.
4. Test: place call to a known test number (e.g., a published utility customer service line).
5. Capture vendor response shape, document for type generation.

## Phase D — Compliance layer (Phase 3D foundation)

1. Create `Pathfinder/agents/voice-agent/compliance.ts` per Phase 3D SPEC.
2. Implement `preCallCheck()` — jurisdiction, TOS, hours, industry rules.
3. Implement `injectDisclosure()` — pulls from Phase 3-PRE legal output.
4. Implement audit logging helper.
5. Unit tests for each.

## Phase E — Voice-agent service

1. Create `Pathfinder/agents/voice-agent/dispatch.ts` per spec.
2. Build call brief from voice_agent_sources row + organization architecture.
3. Pass brief through compliance.injectDisclosure().
4. Place call via vendor.
5. Persist initial audit log entry.

## Phase F — Webhook handler

1. Create `Pathfinder/api/voice-agent/webhook/route.ts` per spec.
2. Handle vendor webhook events (call complete, voicemail, error).
3. Persist transcript to voice_call_transcripts.
4. Map structured output to leads if confidence ≥0.8.
5. Flag for operator review if confidence <0.8 or status not 'completed'.
6. Audit log entries for every event.

## Phase G — Triggers

1. Cron Inngest function: weekday 9am CT, iterates orgs with voice-agent sources.
2. On-demand event: 'org.voice_agent_refresh' → calls dispatcher.
3. Operator click trigger from Metacron → API endpoint → dispatcher.

## Phase H — End-to-end smoke test

1. Configure Harris County clerk source in voice_agent_sources.
2. Place 5 test calls on behalf of Zedcor.
3. Verify:
   - Disclosure fired on every call
   - Transcripts persisted
   - Compliance audit log entries created
   - Successful calls produced leads with organization_id=zedcor
   - Failed calls flagged for operator review
4. Capture screenshots/logs for PR.

## Phase I — Tests

- Unit: every helper (preCallCheck, injectDisclosure, mapToLeads, audit logger).
- Integration: full flow with mock vendor.
- E2E: 5 real calls to Phase 3-PRE-approved test source.

## Phase J — PR

1. Branch `feat/phase-3b-voice-agent-service-mvp`.
2. PR titled: `Phase 3B: Voice Agent Service MVP — Harris County clerk for Zedcor`.
3. PR body must include: 5-call evidence, transcripts, lead extraction validation, compliance audit log sample, vendor cost breakdown.
4. Multi-Vercel verification.

## Failure modes — halt + report

- Phase 3A not merged.
- Phase 3-PRE legal/vendor not signed off.
- Vendor authentication fails.
- preCallCheck blocks the test source unexpectedly (jurisdiction map issue).
- Disclosure not surfacing in vendor's first turn.
- Webhook delivery failure rate >10%.
- Extraction confidence persistently <0.5 (call brief needs tuning).

## Kanban hygiene

- Phase A start: card → In Process.
- 5-call smoke complete: card → Review.
- PR merge: card → Deployed.
- Phase 3 demo gate (Chad or Zedcor witnesses live demo): Verified — human-only.

End.
