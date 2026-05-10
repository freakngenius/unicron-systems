# PROMPT — Phase 3-PRE Legal Research & Vendor Eval Kickoff

Cowork-driven (not CC). Two parallel tracks: legal deep-research via Gemini + vendor benchmark via direct testing. No code in this phase.

---

## Track 1: Legal deep-research

Use the `anthropic-skills:deep-research` skill (Google Gemini Deep Research Agent — produces detailed cited reports in 2-10 minutes).

Research brief:

```
Research the legal landscape for AI-powered voice calls in B2B research contexts. Produce a detailed report with primary-source citations covering:

1. TCPA prerecorded/AI voice rules — current state including FCC's February 8, 2024 declaratory ruling that AI-generated voices fall under TCPA. Define what counts as "AI-generated voice." Define exemptions. Define current enforcement posture.

2. State-by-state two-party consent recording laws. All 50 states + DC. Include any 2025-2026 changes. Format as a matrix: state, consent rule, AI-specific provisions, recording disclosure requirements.

3. State-level automated calling restrictions beyond federal TCPA. Which states have additional rules. What kinds of calls trigger them.

4. B2B research call exemptions. Distinction between informational calls and telemarketing under federal and state law. Specifically: are calls to government offices, county clerks, trade associations, or licensing boards considered B2B research and exempt from telemarketing restrictions?

5. Industry-specific layers:
   - FINRA Rule 2210 / 2230 for broker communications — does AI voice on outbound research calls fall under broker-dealer comm rules?
   - HIPAA Privacy Rule — what voice-call scenarios trigger HIPAA?
   - GLBA — financial info disclosure on calls?
   - FERPA — education-sector calls?
   - Any other industry rules relevant to commercial real estate, construction, or B2B research.

6. Recording disclosure best practices. Sample language used by major call-center operators. Legal sufficiency of "this call may be recorded for quality" in different states. AI-specific disclosure language.

7. AI disclosure best practices. Sample language used by AI voice companies (Bland AI, Vapi, Retell). Legal sufficiency of "Hi, I'm an AI assistant" in different states.

8. STIR/SHAKEN framework and AI calls. Do AI voice calls need to participate? What attestation level applies?

9. Carrier-level AI voice fingerprinting and blocking trends in 2025-2026. How are carriers identifying AI calls? What flag rates are typical? Mitigation strategies.

10. Specific to the use case: Pathfinder calls county clerks, state licensing boards, trade associations, broker offices to extract publicly-available data for B2B customer (real estate investor, security operator). Customer pays Pathfinder; Pathfinder makes the call; recipient is a government or business office. What specific compliance considerations apply to this exact pattern?

Output as a structured 10-15 page report with:
- Executive summary (1 page)
- Primary findings per topic
- Citations to Federal Register, FCC public notices, state statute citations, case law where applicable
- Practical recommendations: where can Pathfinder operate without additional consent? Where does Pathfinder need explicit consent? Where is Pathfinder blocked?
- Disclosure script v1 (legally-defensible language for the introduction)
- Jurisdiction map (50-state matrix, color-coded green/yellow/red)
```

Save report to `Company Docs/Reports/Phase 3 Legal Research/`.

After Gemini delivers, Kyle (or hired counsel) reviews, signs off or flags items needing human legal review.

## Track 2: Vendor benchmark

Manual testing track. Cowork drives the evaluation.

For each of: Vapi, Retell AI, Bland AI, Twilio Voice AI:

1. Sign up for trial / dev account.
2. Configure a test call brief: identical structured prompt for all vendors, asking for publicly-available info from a low-stakes target (e.g., a public utility customer service line).
3. Place 5 test calls per vendor.
4. Capture per call:
   - First-token latency (ms)
   - Steady-state turn latency (ms)
   - IVR navigation success
   - Transcription accuracy (vs human-transcribed ground truth)
   - Function-calling / structured output reliability
   - Webhook reliability
   - Cost
5. Test failure modes per vendor:
   - Voicemail handling
   - Hold music
   - Transfer requests
   - "Are you a robot" question
   - Explicit refusal
6. Document compliance posture per vendor:
   - Built-in consent prompts available?
   - Recording disclosure built-in?
   - Per-state jurisdiction routing supported?
   - Recording storage policy?
7. Score each vendor 1-5 across all criteria.
8. Save matrix to `Company Docs/Reports/Phase 3 Vendor Eval/`.

Recommend top vendor + fallback in the report's executive summary.

## Track 3: Source TOS audit

Pick 10 candidate phone-only sources for MVP. For each:

1. Pull TOS / website terms / phone-system warning recordings.
2. Search for explicit "no AI" / "no automated calls" / "human only" language.
3. Score: green (clear), yellow (ambiguous, needs counsel review), red (prohibited).
4. Document in `Company Docs/Reports/Phase 3 Vendor Eval/source_tos_audit.md`.

Source candidates to audit:
- Harris County Clerk Real Property Department (TX)
- Texas DSHS licensing
- Travis County Recorder (TX)
- Denver County Clerk Recording (CO)
- Maricopa County Recorder (AZ)
- Salt Lake County Recorder (UT)
- Davidson County Register of Deeds (TN)
- Mecklenburg County Register of Deeds (NC)
- Hillsborough County Clerk Recording (FL)
- Dallas County Clerk Recording (TX)

## Acceptance gate

Phase 3-PRE complete when:

- Legal report delivered + Kyle signs off + counsel reviews disclosure script
- Vendor matrix complete with at-least-3 vendor data + 5 test calls each
- Top vendor selected with rationale
- Source TOS audit complete for ≥10 sources
- Jurisdiction map (50-state matrix) delivered
- Disclosure script v1 finalized + counsel-reviewed
- Phase 3A authorization unblocked

Estimated turnaround: deep-research delivers in hours; vendor testing in days; source TOS audit in days; counsel review timing depends on Kyle's legal contact.

## Kanban hygiene

Card on Metacron kanban: "Phase 3-PRE: Legal Research & Vendor Eval"
- Move from Not Yet Started → In Process when Cowork dispatches deep-research
- Move to Review when reports delivered, awaiting Kyle + counsel sign-off
- Move to Verified when Kyle authorizes Phase 3A kickoff (human-only)

End.
