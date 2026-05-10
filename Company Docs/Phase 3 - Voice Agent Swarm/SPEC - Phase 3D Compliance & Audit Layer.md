# SPEC — Phase 3D: Compliance & Audit Layer

Cross-cutting layer that enforces the legal output of Phase 3-PRE on every call. Disclosure script execution, two-party consent flagging, jurisdiction routing, transcript retention, audit trail.

## What ships

1. Pre-call jurisdiction check: source's jurisdiction looked up against legal map; calls blocked if jurisdiction is red.
2. Pre-call disclosure script injection: vendor call brief always includes legally-reviewed disclosure.
3. Two-party consent flow: in two-party states, explicit consent question + halt-on-no.
4. Transcript retention policy: configurable retention window per jurisdiction, automated deletion after window.
5. Compliance flags on every call: which rules apply, which were enforced, what disclosures fired.
6. Audit log: every call has full provenance (who triggered, what brief was used, what disclosure fired, what consent was captured, what extracted, who reviewed).
7. TOS audit cache: source-level cache of TOS audit results from Phase 3-PRE; refreshed quarterly.

## Pre-call gating

```typescript
// Pathfinder/agents/voice-agent/compliance.ts

export async function preCallCheck(source: VoiceAgentSource, org: Organization): Promise<{ allowed: boolean; reason?: string }> {
  // 1. Jurisdiction map check
  const jurisdictionStatus = LEGAL_JURISDICTION_MAP[source.jurisdiction];
  if (jurisdictionStatus === 'blocked') {
    return { allowed: false, reason: `Jurisdiction ${source.jurisdiction} blocked per Phase 3-PRE legal review` };
  }
  
  // 2. Source TOS check (cached)
  const tosStatus = await getTOSStatus(source.id);
  if (tosStatus === 'prohibited') {
    return { allowed: false, reason: `Source TOS prohibits AI calls` };
  }
  
  // 3. Industry-specific rules
  if (source.compliance_flags.includes('finra-applicable') && !org.compliance_finra_cleared) {
    return { allowed: false, reason: 'FINRA-applicable source requires org compliance clearance' };
  }
  
  // 4. Hours-of-operation check
  if (!isWithinPreferredHours(source.preferred_hours_local, source.jurisdiction)) {
    return { allowed: false, reason: 'Outside preferred calling hours' };
  }
  
  return { allowed: true };
}
```

Calls that fail pre-check are logged but never placed.

## Disclosure injection

Every call brief built by Phase 3B passes through `injectDisclosure()`:

```typescript
function injectDisclosure(brief: CallBrief, source: VoiceAgentSource, org: Organization): CallBrief {
  const disclosure = getDisclosureScript(source.jurisdiction, source.compliance_flags);
  return {
    ...brief,
    introduction: `${disclosure}\n\n${brief.introduction}`,
    consent_required: TWO_PARTY_CONSENT_STATES.has(source.jurisdiction),
    halt_on_consent_decline: true
  };
}
```

Vendor receives the introduction with disclosure baked in. If `consent_required`, vendor halts call if recipient declines after consent question.

## Transcript retention

```sql
ALTER TABLE pathfinder.voice_call_transcripts ADD COLUMN retention_until timestamptz;

-- Computed at insert time per jurisdiction
-- Default: 13 months
-- Two-party consent states: 36 months (cover litigation window)
-- HIPAA-adjacent: explicit longer retention if applicable
```

Cron job daily:

```typescript
inngest.createFunction(
  { id: 'voice-transcript-retention-sweep', cron: '0 3 * * *' },
  async () => {
    await supabase.schema('pathfinder')
      .from('voice_call_transcripts')
      .delete()
      .lt('retention_until', new Date().toISOString());
  }
);
```

## Audit log

Every voice-call action logged to `pathfinder.voice_call_audit`:

```sql
CREATE TABLE pathfinder.voice_call_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_call_transcript_id uuid REFERENCES pathfinder.voice_call_transcripts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  source_id text NOT NULL,
  event_type text NOT NULL,                  -- 'pre_check_pass' / 'pre_check_block' / 'call_placed' / 'disclosure_fired' / 'consent_captured' / 'consent_declined' / 'extraction_complete' / 'operator_review' / 'lead_created' / 'transcript_retained' / 'transcript_deleted'
  actor_type text NOT NULL,                  -- 'system' / 'operator' / 'vendor' / 'recipient'
  actor_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON pathfinder.voice_call_audit (voice_call_transcript_id, created_at);
CREATE INDEX ON pathfinder.voice_call_audit (organization_id, created_at DESC);
ALTER TABLE pathfinder.voice_call_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role read" ON pathfinder.voice_call_audit FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service role insert" ON pathfinder.voice_call_audit FOR INSERT USING (auth.jwt() ->> 'role' = 'service_role');
```

## TOS audit refresh

Quarterly cron job:

```typescript
inngest.createFunction(
  { id: 'voice-source-tos-refresh', cron: '0 0 1 */3 *' },
  async () => {
    // For each voice-agent source, re-check TOS via web fetch
    // Flag any change for human review
    // Surface to Cowork chat for legal re-review
  }
);
```

## Acceptance criteria

- Calls in blocked jurisdictions never placed.
- Calls in two-party states halt if consent declined.
- Every call has disclosure in vendor's first turn.
- Every call has full audit trail.
- Transcripts deleted at retention boundary.
- Quarterly TOS audit produces report; new prohibitions surface to Cowork.

## Risks + mitigations

- Legal map drifts (new state law, new FCC ruling): Phase 3-PRE deliverable scheduled for refresh quarterly.
- Vendor doesn't honor consent halt instruction: validate via 5 test calls per vendor; switch vendor if non-compliant.
- TOS audit web-fetch fails for some sources: human review queue for fetch failures.

## Dependencies

- Phase 3-PRE legal review complete
- Phase 3B voice-agent service shipped
- Phase 3C operator review workflow shipped (for compliance review escalations)

## Out of scope

- International compliance (US-only MVP)
- Real-time legal database integration (manual quarterly refresh in MVP)
- Encrypted-at-rest transcripts beyond Supabase defaults

End.
