# SPEC — Architect Business Summary Panel

New Metacron onboarding panel above Architect decomposition. Three plain-language answers: what leads for what business, what problem we solve, what we give them.

## What ships

1. Architect emits `business_summary` field in output JSON.
2. Metacron Onboarding renders `BusinessSummaryPanel` above decomposition stream.
3. Three sections: lead type & business area, problem we solve, what they get.
4. Inline editable by operator before Approve/Deploy.
5. Persists into `architecture.business_summary` for customer-side surfacing.

## Architect output extension

```json
{
  "business_summary": {
    "lead_type": "Acquisition opportunities — multifamily (200+ units) and hospitality (150+ keys) properties with confirmed seller motivation in Mountain West and Southeast metros.",
    "business_area": "Real estate investment / acquisitions team. Feeds the underwriting pipeline that drives 7,200-unit multifamily and 5,300-key hospitality portfolio growth.",
    "problem_solved": "Realberry's acquisitions team can't manually monitor SEC filings, distressed debt feeds, broker listings, county recorders, and trade press across 8 metros. Deal flow uneven; opportunities slip past during cycle shifts.",
    "what_they_get": "Daily scored feed of acquisition opportunities matching their underwriting profile. AI-drafted broker outreach (review-before-send). Pipeline kanban from Sourced through Closed. Slack/email digest of top 10. Cross-customer signals from adjacent verticals."
  }
}
```

## Architect prompt extension

Append to system prompt:

```
After completing the technical decomposition, generate a business_summary object with four fields:
- lead_type: one sentence describing the lead unit and its key attributes
- business_area: which part of the customer's organization will use these leads, and to what end
- problem_solved: the operational pain being addressed; reference any specific constraints
- what_they_get: the concrete deliverable in plain language (dashboard, alerts, briefs, drafts)

Each field 1-3 sentences. Use the customer's vocabulary. Avoid system terms like "agent," "ingestion," "ranker."
```

## UI placement

```
Onboarding view:
[Architect prompt input]
─────────────────────────
WHAT REALBERRY GETS  ← NEW PANEL
  LEAD TYPE & BUSINESS AREA  [✎ edit]
  PROBLEM WE SOLVE           [✎ edit]
  WHAT THEY GET              [✎ edit]
─────────────────────────
[Architect decomposition stream]
─────────────────────────
[APPROVE & DEPLOY] [APPLY EDITS]
```

## Component

`unicron-platform/src/components/BusinessSummaryPanel.tsx`:

```typescript
interface BusinessSummary {
  lead_type: string;
  business_area: string;
  problem_solved: string;
  what_they_get: string;
}

interface Props {
  summary: BusinessSummary;
  customerName: string;
  onEdit: (field: keyof BusinessSummary, value: string) => void;
  readOnly?: boolean;
}
```

Each section renders header + inline-editable text region. Click "✎ edit" → textarea → save on blur or Cmd+Enter. `readOnly` suppresses edit affordances (used customer-side).

## Streaming

Architect emits `business_summary` after decomposition completes. Until then: skeleton loading state. On failure: error state allowing manual entry.

## Edit + persist

Edits local until Approve/Deploy. On approve, edited summary included in architecture JSON written to `pathfinder.organizations`. Customer dashboard reads `architecture.business_summary` and renders read-only at top.

## Acceptance criteria

- Architect output includes `business_summary` on every successful decomposition.
- Panel renders above decomposition in Metacron Onboarding.
- Operator edits inline persist on Approve/Deploy.
- Customer dashboard renders same summary read-only.
- Decomposition failure → error state with manual entry option.

## Risks + mitigations

- Summary quality varies on dense vs sparse prompts: edit affordance + customer survey doc.
- Drift from technical decomposition: operator edits intentional; future "regenerate" button.
- Tone mismatch: vocabulary substitution applies to summary rendering.

## Implementation paste-ready CC prompt

```
Implement the Architect Business Summary Panel per `Company Docs/Specs/SPEC - Architect Business Summary Panel.md`.

Phase A — Architect agent
1. Find Architect agent code (Pathfinder/api/architect/* or unicron-platform/api/architect/*).
2. Extend output schema: business_summary object (4 string fields).
3. Extend system prompt with business_summary instruction (verbatim from spec).
4. Unit test: output JSON includes business_summary on sample decomposition.

Phase B — Metacron UI
1. Create unicron-platform/src/components/BusinessSummaryPanel.tsx.
2. Wire above Architect decomposition stream in Onboarding.
3. Inline edit per section.
4. Persist edits to local state; include in architecture JSON on Approve/Deploy.
5. Skeleton + error states.
6. Component test (Vitest + RTL).

Phase C — Verification
1. Local smoke: run decomposition, verify panel + edits persist.
2. Both Vercels green post-merge.

Hard constraints: no deletes, no time estimates, no cost caps, multi-Vercel, kanban hygiene at start (→ In Process) and end (→ Deployed/Review), no auto-promotion to Verified.

PR title: `feat: Architect Business Summary Panel — three-question framing above decomposition`.
```

End.
