# SPEC — Phase 3-PRE: Legal Research & Vendor Eval

Gating non-code work. Must complete before any voice-agent code ships. Cowork-driven via deep-research skill + Kyle review.

## What ships

1. Legal research deliverable: TCPA + FCC AI voice ruling + state-by-state two-party consent map + industry-specific rules (FINRA, HIPAA, GLBA), all cited to primary sources.
2. Vendor benchmark: 3-vendor matrix (Vapi, Retell, Bland) + 1 fallback (Twilio Voice AI) on latency, IVR navigation, transcription, pricing, compliance posture.
3. Disclosure script v1: legally-reviewed opening statement for AI voice calls in B2B research context.
4. Jurisdiction map: states/scenarios where MVP can run vs cannot vs needs additional consent.
5. Source TOS audit: 5-10 candidate phone-only sources reviewed for explicit "no AI" language.

## Legal research scope

Topics to cover with primary-source citations:

- TCPA prerecorded/AI voice rules — current state post-Feb 2024 declaratory ruling
- FCC AI voice ruling specifics: definition of "AI-generated voice," consent requirements, exemptions
- State-by-state two-party consent recording laws (CA, FL, IL, MD, MA, MT, NH, PA, WA, plus any 2025-2026 changes)
- State-level automated calling restrictions beyond TCPA
- B2B research call exemptions (informational vs telemarketing distinction)
- Industry-specific layers: FINRA rule 2210 / 2230 (broker comms), HIPAA Privacy Rule, GLBA financial info, sector-specific
- Recording disclosure best practices ("This call may be recorded for quality")
- AI disclosure best practices ("I'm an AI assistant calling on behalf of...")
- Robocall/STIR-SHAKEN implications for B2B AI calls
- Carrier-level AI voice fingerprinting / blocking trends

## Vendor benchmark matrix

Compare across:

| Criterion | Vapi | Retell | Bland | Twilio Voice AI |
|---|---|---|---|---|
| First-token latency (target <500ms) | | | | |
| Steady-state turn latency | | | | |
| IVR navigation success rate | | | | |
| Hold music handling | | | | |
| Voicemail detection | | | | |
| Transcription accuracy (clean phone) | | | | |
| Transcription accuracy (accented / poor connection) | | | | |
| Function-calling / structured output | | | | |
| Webhook reliability | | | | |
| Pricing per minute | | | | |
| Compliance: built-in consent prompts | | | | |
| Compliance: recording disclosure | | | | |
| Compliance: call recording storage | | | | |
| Pre-call pause / pre-disclosure handling | | | | |
| AI voice fingerprint detection rate (carrier flag rate) | | | | |
| Documentation quality | | | | |
| Reference customers in similar use case | | | | |

Run 5 test calls per vendor against the same target source (mock or low-stakes real). Capture latency, accuracy, disclosure handling.

## Disclosure script v1

Draft language to be lawyer-reviewed:

> "Hi, I'm an AI assistant calling on behalf of [Customer Name] to ask about [topic]. This call is being recorded for quality and record-keeping. Do you have a moment to help with a quick question?"

Variants for: voicemail, gatekeeper, transfer requested, "are you a robot," explicit refusal.

## Jurisdiction map output

Deliverable format: a matrix with rows = US states, columns = (recording consent, AI disclosure required, automated call restrictions, applicable industry layer). Color-coded green/yellow/red for MVP launch readiness.

## Source TOS audit

For each candidate source (Harris County clerk, Texas DSHS, county recorders in Mountain West, NCAA-style associations, etc.):

- Pull TOS / website terms / phone-system warnings
- Flag explicit "no AI / no automated calls" language
- Flag implicit signals (e.g., "this call may be recorded" with no AI disclaimer)
- Score: green (clear), yellow (ambiguous, needs counsel review), red (prohibited)

## Acceptance criteria

- Legal research delivered as a 8-15 page document with primary-source citations (Federal Register, FCC public notice, state statute citations)
- Vendor matrix complete with at-least-3 vendor data + 5 test calls per vendor
- Disclosure script v1 reviewed by legal counsel (Kyle hires or assigns)
- Jurisdiction map covers all 50 states + DC
- Source TOS audit covers ≥10 candidate sources
- All deliverables stored in `Company Docs/Reports/Phase 3 Legal Research/` and `Company Docs/Reports/Phase 3 Vendor Eval/`
- Kyle signs off explicitly before Phase 3A kicks off

## Risks + mitigations

- Legal landscape shifts mid-research (FCC issues new ruling, state passes new law). Mitigation: re-check primary sources within 2 weeks of Phase 3A start.
- Vendor performance varies on real-world calls vs benchmark calls. Mitigation: budget for 1 production-pilot week before declaring vendor selected.
- TOS language is ambiguous on AI specifically. Mitigation: counsel-reviewed interpretation per source; default to "no" if ambiguous.

## Out of scope

- International legal review (US only for MVP)
- Consumer-facing call regulations (B2B research only)
- Court depositions / legal discovery use cases (separate compliance regime)
- HIPAA-covered scenarios (excluded from MVP entirely)

End.
