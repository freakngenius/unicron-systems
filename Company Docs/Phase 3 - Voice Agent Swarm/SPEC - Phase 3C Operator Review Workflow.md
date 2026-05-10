# SPEC — Phase 3C: Operator Review Workflow

Metacron UI for reviewing voice-agent calls. Transcript playback, structured output validation, escalation queue, failure analysis.

## What ships

1. New Metacron tab/section: "Voice Calls" (or integrated into existing Agents view).
2. Queue of voice calls needing review (`needs_operator_review = true`).
3. Per-call detail view: transcript, structured output, vendor metadata, audio playback link, lead it produced (or didn't).
4. Operator actions: confirm extraction, correct extraction, mark call as failed, escalate to human follow-up.
5. Failure mode analytics: aggregate stats on call status (completed / voicemail / refused / etc) per source.
6. Source-level controls: pause source, retry source, edit call brief template.

## UI sections

### Voice Calls List

```
[Filter: All | Needs Review | Today | Source: Harris County | ...]

┌─────────────────────────────────────────────────────────────┐
│ ⚠️  Harris County Clerk · Zedcor · 4 min ago               │
│   Status: completed · Confidence: 0.62 (low — review)       │
│   Extraction: 3 leads · Operator review required             │
├─────────────────────────────────────────────────────────────┤
│ ✓ Harris County Clerk · Zedcor · 12 min ago                │
│   Status: completed · Confidence: 0.91 · 5 leads            │
├─────────────────────────────────────────────────────────────┤
│ ✗ Harris County Clerk · Realberry · 30 min ago             │
│   Status: voicemail · Retry queued for 2pm CT               │
└─────────────────────────────────────────────────────────────┘
```

### Per-call detail

- Vendor metadata (call_id, duration, cost)
- Transcript with timestamps
- Audio playback (if recording stored — depends on Phase 3-PRE compliance config)
- Structured output JSON (raw)
- Extraction validation: side-by-side transcript phrase ↔ extracted field
- Resulting leads list (if any) with link to each lead row
- Operator actions: ✓ confirm | ✎ correct | ✗ reject

### Source controls

- Pause source (no calls dispatched until unpaused)
- Edit call brief (questions, extraction schema, escalation rules)
- View call success rate over time
- View cost per source over time

## Component structure

```
unicron-platform/src/components/voice-calls/
├── VoiceCallsList.tsx
├── VoiceCallDetail.tsx
├── TranscriptViewer.tsx
├── ExtractionValidator.tsx
├── SourceControls.tsx
└── FailureAnalytics.tsx
```

## API endpoints (Pathfinder side, called from Metacron)

- `GET /api/voice-calls?organization_id=...&filter=needs_review` — list
- `GET /api/voice-calls/:id` — detail
- `POST /api/voice-calls/:id/confirm` — operator confirms extraction; leads kept
- `POST /api/voice-calls/:id/correct` — operator submits corrected structured output; service rewrites leads
- `POST /api/voice-calls/:id/reject` — operator marks call as failed; leads (if any) deleted; surface for retry
- `POST /api/voice-calls/:id/escalate` — escalate to human follow-up queue
- `POST /api/voice-agent-sources/:id/pause` — pause source
- `POST /api/voice-agent-sources/:id/resume` — resume

## Operator workflow

1. New call lands with `needs_operator_review = true`.
2. Operator gets Slack notification (existing Slack alerts infrastructure).
3. Operator opens Metacron Voice Calls tab.
4. Reviews transcript + structured output side by side.
5. Either: ✓ confirm (leads stay), ✎ correct (rewrite extraction), ✗ reject (failed, retry strategy), escalate (human follow-up).
6. After 50 calls per source: confidence threshold can be auto-tuned downward (more calls auto-pass).

## Acceptance criteria

- All voice calls land in Metacron Voice Calls tab.
- Operator can review, confirm, correct, reject any call.
- Operator can pause/resume any source.
- Slack notification fires on new review-required call.
- Failure analytics aggregate by source over time.
- Audit trail: every operator action logged to `voice_call_transcripts.reviewed_by_user_id` + timestamp.

## Risks + mitigations

- Operator review backlog grows faster than operator can process: alert on backlog size, surface to Kyle.
- Operator over-confirms inaccurate extractions: random sample QA loop (10% of confirmed calls re-reviewed).
- Operator rejects too many: tune confidence threshold up or improve call brief.

## Dependencies

- Phase 3B service writing transcripts to `voice_call_transcripts`
- Existing Metacron UI primitives (tab, table, detail panel) — extend, don't rebuild
- Existing Slack alerts infrastructure

## Out of scope

- Mobile review (desktop only)
- Bulk operator actions across multiple calls
- ML-based auto-correction suggestions (Phase 4)
- Call routing optimization (Phase 4)

End.
