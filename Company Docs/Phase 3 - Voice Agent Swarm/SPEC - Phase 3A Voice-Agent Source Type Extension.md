# SPEC — Phase 3A: Voice-Agent Source Type Extension

Architect + Source Onboarder integration. Adds `voice-agent` to the SourceRef.type enum, extends Architect classification, routes dispatches to voice-agent service.

## What ships

1. `SourceRef.type` enum gains `voice-agent` value alongside `registered`, `tier-2-human-assist`, `pending`.
2. Architect output may classify a source as `voice-agent` when it has a phone but no API.
3. Source Onboarder reclassification: existing Tier 2 queue items can be promoted to `voice-agent` if the source matches voice-agent capability profile.
4. `resolveSource()` registry function returns voice-agent dispatch handler for `voice-agent` type.
5. Schema for voice-agent source registration: phone number, IVR navigation hints, expected hours, preferred language, escalation rules.

## Schema additions

```typescript
// Pathfinder/lib/types/architecture.ts

export interface SourceRef {
  id: string;
  type: 'registered' | 'tier-2-human-assist' | 'pending' | 'voice-agent';  // NEW value
}
```

```sql
-- New table: pathfinder.voice_agent_sources
CREATE TABLE pathfinder.voice_agent_sources (
  id text PRIMARY KEY,                              -- source_id used in architecture.sources
  display_name text NOT NULL,
  phone_number text NOT NULL,
  ivr_navigation jsonb,                             -- structured IVR menu instructions if known
  preferred_hours_local text,                        -- e.g. "Mon-Fri 9-12, 2-4 CT"
  jurisdiction text NOT NULL,                        -- state code for legal routing
  language text NOT NULL DEFAULT 'en',
  call_brief_template jsonb NOT NULL,                -- structured brief: introduction, questions, extraction schema, escalation
  compliance_flags text[] DEFAULT '{}',              -- e.g. ['two-party-consent', 'finra-applicable']
  cost_estimate_usd_per_call numeric(6,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON pathfinder.voice_agent_sources (jurisdiction);
ALTER TABLE pathfinder.voice_agent_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role all" ON pathfinder.voice_agent_sources FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
```

## Architect prompt extension

Add classification instruction:

```
For each source you propose, classify type as one of:
- registered: a built digital adapter exists in the registry
- voice-agent: phone-only source, no public API, voice-agent service can call on the customer's behalf
- tier-2-human-assist: phone-only source that requires human judgment (legal, sensitive, or complex multi-step)
- pending: source likely to have an API or scrapable feed but adapter not yet built

When classifying voice-agent, include in the output:
- phone_number (best-known main line)
- jurisdiction (state code)
- ivr_navigation_hints (if known)
- preferred_hours_local
- call_brief_template (structured: introduction, questions to ask, expected extraction schema, escalation conditions)
- compliance_flags (any known constraints)

Default to tier-2-human-assist if the source involves regulated industries (FINRA, HIPAA-adjacent) or requires human judgment beyond data extraction.
```

## Source Onboarder reclassification

Existing Tier 2 queue items get a "promote to voice-agent" operator action:

- Operator reviews queue item
- Clicks "promote to voice-agent"
- Form pre-filled with source metadata; operator fills phone, IVR hints, brief template
- On submit: row written to `pathfinder.voice_agent_sources`, source's type updated in any architectures referencing it

## resolveSource extension

```typescript
export function resolveSource(sourceRef: SourceRef): SourceAdapter | 'tier-2' | 'pending' | VoiceAgentDispatcher {
  if (sourceRef.type === 'voice-agent') {
    return voiceAgentDispatcher;
  }
  if (sourceRef.type === 'tier-2-human-assist') return 'tier-2';
  if (SOURCE_ADAPTERS[sourceRef.id]) return SOURCE_ADAPTERS[sourceRef.id];
  return 'pending';
}
```

`voiceAgentDispatcher` is the entry point to Phase 3B service.

## Acceptance criteria

- Architect can output a source classified as `voice-agent` with all required metadata.
- Source Onboarder operator UI has "promote to voice-agent" action on Tier 2 items.
- `voice_agent_sources` table populated for at least one source (Harris County clerk for MVP).
- `resolveSource` correctly routes `voice-agent` sources to the dispatcher.
- Regression: existing source types still resolve correctly.

## Dependencies

- Phase 2 multi-tenant Pathfinder shipped (architecture JSON support, OrgContext, RLS)
- Phase 3-PRE complete (vendor selected, legal cleared)

## Out of scope

- The actual voice agent service implementation (Phase 3B)
- Cross-customer call reuse (Phase 3E)
- Auto-tuning of call brief templates (Phase 3F)

End.
