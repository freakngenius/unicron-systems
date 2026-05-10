# SPEC — Phase 3B: Voice Agent Service MVP

Single-source proof: voice agent calls Harris County clerk for Zedcor, asks about commercial property recordings, extracts data, drops into ingestion. 5 successful calls with ≥80% extraction accuracy.

## What ships

1. Voice-agent service (Vercel function or dedicated worker) that takes a `voice_agent_sources` row + customer context, places a call, runs dialogue, returns structured data.
2. Vendor integration (Vapi or Retell — whichever wins Phase 3-PRE benchmark).
3. Disclosure script execution (legally-reviewed v1 from Phase 3-PRE).
4. Structured extraction: dialogue → call brief schema fields → `pathfinder.leads` rows.
5. Transcript storage in `pathfinder.voice_call_transcripts` (audit trail).
6. Cron + on-demand triggers.
7. Single MVP source: Harris County, TX commercial property clerk.

## Architecture

```
Trigger (cron / event / on-demand operator click)
    ↓
voiceAgentDispatcher receives (organization_id, source_id)
    ↓
Fetch voice_agent_sources row + organization architecture
    ↓
Build call brief: introduction (with disclosure), questions, extraction schema
    ↓
Vendor API call: place call to phone_number with brief
    ↓
Vendor handles real-time TTS/STT/dialogue with brief as system prompt
    ↓
On call complete: vendor webhook returns transcript + structured outputs
    ↓
Service writes transcript to pathfinder.voice_call_transcripts
    ↓
Service maps structured outputs → pathfinder.leads with organization_id
    ↓
Lead enters existing ingestion pipeline (ranker → verifier → enricher)
    ↓
On extraction failure or low confidence: surface to Operator Review (Phase 3C)
```

## Schema additions

```sql
CREATE TABLE pathfinder.voice_call_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES pathfinder.organizations(id),
  source_id text NOT NULL REFERENCES pathfinder.voice_agent_sources(id),
  vendor text NOT NULL,                         -- 'vapi' / 'retell' / etc
  vendor_call_id text NOT NULL,
  call_started_at timestamptz NOT NULL,
  call_ended_at timestamptz,
  duration_seconds integer,
  status text NOT NULL,                         -- 'completed' / 'voicemail' / 'busy' / 'hangup' / 'transfer' / 'refused' / 'error'
  transcript text NOT NULL,
  structured_output jsonb,
  extraction_confidence numeric(4,3),
  cost_usd numeric(6,4),
  needs_operator_review boolean DEFAULT false,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON pathfinder.voice_call_transcripts (organization_id, created_at DESC);
CREATE INDEX ON pathfinder.voice_call_transcripts (source_id, created_at DESC);
CREATE INDEX ON pathfinder.voice_call_transcripts (needs_operator_review) WHERE needs_operator_review = true;
ALTER TABLE pathfinder.voice_call_transcripts ENABLE ROW LEVEL SECURITY;

-- Operators (service role) read all
CREATE POLICY "service role all" ON pathfinder.voice_call_transcripts FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
-- Customers do NOT read transcripts directly (only the resulting leads)
```

## Service implementation

```typescript
// Pathfinder/agents/voice-agent/dispatch.ts

export const voiceAgentDispatcher = {
  async dispatch(organization_id: string, source_id: string): Promise<{ call_id: string }> {
    const source = await fetchSource(source_id);
    const org = await fetchOrg(organization_id);

    const brief = buildCallBrief({
      customerName: org.architecture.branding.display_name,
      questions: source.call_brief_template.questions,
      extractionSchema: source.call_brief_template.extraction_schema,
      disclosure: getDisclosureScript(source.jurisdiction, source.compliance_flags),
      escalationConditions: source.call_brief_template.escalation,
    });

    const vendorCall = await vendor.placeCall({
      to: source.phone_number,
      systemPrompt: brief,
      webhookUrl: `${API_URL}/voice-agent/webhook`,
      metadata: { organization_id, source_id }
    });

    return { call_id: vendorCall.id };
  }
};
```

```typescript
// Pathfinder/api/voice-agent/webhook/route.ts

export async function POST(req: Request) {
  const event = await req.json();
  const { organization_id, source_id } = event.metadata;

  // Persist transcript
  const transcript = await supabase.schema('pathfinder')
    .from('voice_call_transcripts')
    .insert({
      organization_id,
      source_id,
      vendor: 'vapi',
      vendor_call_id: event.call_id,
      call_started_at: event.started_at,
      call_ended_at: event.ended_at,
      duration_seconds: event.duration,
      status: event.status,
      transcript: event.transcript,
      structured_output: event.structured_output,
      extraction_confidence: event.confidence,
      cost_usd: event.cost,
      needs_operator_review: event.confidence < 0.8 || event.status !== 'completed'
    });

  // Map to leads if extraction successful
  if (event.status === 'completed' && event.confidence >= 0.8) {
    const leads = mapToLeads(event.structured_output, organization_id, source_id);
    await supabase.schema('pathfinder').from('leads').insert(leads);
  }

  // If review needed, surface to Operator Review queue (Phase 3C)
  if (transcript.needs_operator_review) {
    // Phase 3C handles this
  }

  return Response.json({ ok: true });
}
```

## Disclosure script integration

Pulled from Phase 3-PRE legal review. Per-jurisdiction variants:

```typescript
function getDisclosureScript(jurisdiction: string, flags: string[]): string {
  const baseDisclosure = "Hi, I'm an AI assistant calling on behalf of {{customer_name}} to ask about {{topic}}.";
  
  if (TWO_PARTY_CONSENT_STATES.has(jurisdiction)) {
    return baseDisclosure + " This call is being recorded with your awareness for quality and record-keeping. Do you consent to continue?";
  }
  
  return baseDisclosure + " This call may be recorded for quality. Do you have a moment?";
}
```

## Triggers

- Cron: `inngest.createFunction({ cron: '0 9 * * 1-5' }, ...)` — calls source weekdays at 9 AM CT for orgs that have it in their architecture
- Event: `org.requested_refresh` event triggers on-demand call
- On-demand operator click: Metacron UI button "Refresh now" calls dispatcher directly

## Acceptance criteria

- 5 successful calls to Harris County clerk on behalf of Zedcor
- ≥80% extraction accuracy (operator-validated against actual recordings)
- All calls include disclosure
- All transcripts stored with cost + duration
- Failed calls (voicemail, refused, low-confidence) flagged for operator review
- Successful calls produce leads in `pathfinder.leads` with `organization_id=zedcor`
- Leads flow through existing ranker/verifier/enricher chain

## Risks + mitigations

- Vendor call quality bad on real-world calls: budget Phase 3-PRE pilot week before declaring vendor selected
- IVR navigation fails: capture in transcript, flag for operator, refine call brief
- Source detects AI voice and refuses/blocks: log + surface; switch tactic or escalate to human
- Cost overrun: per-call cost cap not numeric (per project rules) — instead, halt-on-anomaly: if 5 consecutive calls return error or ≥3x median duration, pause source

## Dependencies

- Phase 3-PRE complete (legal + vendor)
- Phase 3A shipped (`voice-agent` source type)
- Phase 2 multi-tenant Pathfinder shipped

## Out of scope

- Operator review UI (Phase 3C)
- Cross-customer reuse (Phase 3E)
- Voice cloning / customer-specific voices
- Multi-leg calls (transfer to specialist)
- Outbound voicemail strategies

End.
