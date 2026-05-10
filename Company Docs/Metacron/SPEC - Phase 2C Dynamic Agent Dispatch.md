# SPEC — Phase 2C: Dynamic Agent Dispatch

Backend agent fleet adapts per-org from architecture JSON. Source adapters, ranker, geography filter, outreach drafter — all org-scoped.

## What ships

1. Per-org agent dispatch: every Inngest job carries `organization_id`; outputs land in org-scoped rows.
2. Source adapter registry: source IDs from architecture mapped to live adapter modules; unknowns route to Source Onboarder queue.
3. Ranker: takes `architecture.scoring.weights`.
4. Geography filter: `architecture.geography.defaults` constrains ingestion + ranking.
5. Outreach drafter: persona/tone/value_prop from `architecture.outreach`.
6. Verifier: thresholds from `architecture.scoring.thresholds`.
7. Compliance filter on outreach: `architecture.compliance` enforces no-retail-solicitation language for SEC orgs.

## Per-org dispatch

```typescript
interface AgentJobInput {
  organization_id: string;
  architecture: OrgArchitecture;
  trigger: 'cron' | 'on-demand' | 'first-run';
  // ...
}
```

Inngest cron iterates active orgs:

```typescript
inngest.createFunction(
  { id: 'ingest-all-orgs' },
  { cron: '0 */4 * * *' },
  async ({ step }) => {
    const orgs = await step.run('list-active-orgs', async () => {
      return supabase.schema('pathfinder').from('organizations')
        .select('*').eq('status', 'active');
    });
    for (const org of orgs) {
      await step.invoke('ingest-org', {
        function: ingestOrgFunction,
        data: { organization_id: org.id, architecture: org.architecture, trigger: 'cron' }
      });
    }
  }
);
```

## Source adapter registry

```typescript
// Pathfinder/agents/sources/registry.ts

export const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  'sam-gov': samGovAdapter,
  'usaspending': usaSpendingAdapter,
  'harris-county': harrisCountyAdapter,
  'sec-edgar': secEdgarAdapter,
  'rentcafe': rentCafeAdapter,
  'loopnet-feed': loopNetAdapter,
};

export function resolveSource(sourceRef: SourceRef): SourceAdapter | 'tier-2' | 'pending' {
  if (sourceRef.type === 'tier-2-human-assist') return 'tier-2';
  if (SOURCE_ADAPTERS[sourceRef.id]) return SOURCE_ADAPTERS[sourceRef.id];
  return 'pending';
}
```

For each org's `architecture.sources`:
- `registered` + adapter exists → run adapter
- `tier-2-human-assist` → operator queue
- `pending` → enqueue to Source Onboarder

## Ranker

```typescript
// Pathfinder/agents/ranker/score.ts

export function scoreCandidate(
  candidate: LeadCandidate,
  weights: Record<string, number>
): number {
  let score = 0;
  for (const [feature, weight] of Object.entries(weights)) {
    const featureScore = computeFeature(candidate, feature);
    score += featureScore * weight;
  }
  return Math.min(1, Math.max(0, score));
}
```

New extractors for real estate: `geography_match`, `asset_class_match`, `trigger_strength`, `basis_fit`, `unit_count_fit`. Weights from `architecture.scoring.weights`.

## Geography filter

`architecture.geography.defaults` gives target metros. Each adapter and the ranker filter on these. Coverage Expansion Agent extends `geography.defaults` on operator request.

## Outreach drafter

```typescript
const OUTREACH_PROMPT = `
You are drafting outreach on behalf of ${architecture.branding.display_name}.
Persona: ${architecture.outreach.persona}.
Tone: ${architecture.outreach.tone}.
Value proposition: ${architecture.outreach.value_prop}.

Compliance constraints: ${architecture.compliance.join(', ')}.
${complianceClause(architecture.compliance)}

Lead context:
${formatLead(lead, architecture.lead_unit.schema)}

Draft a ${architecture.outreach.tone} outbound message...
`;

function complianceClause(compliance: string[]): string {
  if (compliance.includes('SEC') || compliance.includes('accredited-investor')) {
    return 'CRITICAL: Do not solicit retail investors. Frame for institutional partners only.';
  }
  return '';
}
```

## Verifier

```typescript
const verified = candidate.score >= architecture.scoring.thresholds.verified;
const highPriority = candidate.score >= architecture.scoring.thresholds.high_priority;
```

## Cross-pollination (light Phase 2 wiring)

When verified lead created for org A, query cross-pollination signals from other orgs matching (same metro, same trigger window, same broker). Surface as `lead.cross_customer_signals` array without exposing source org. UI rendering in Stream 2D.

## Acceptance criteria

- Inngest job for Realberry ingests SEC EDGAR + RentCafe + LoopNet (or tier-2 queue).
- Realberry leads scored with Realberry weights.
- Realberry outreach drafts use "institutional acquisitions principal" persona.
- No cross-org leakage (RLS verified).
- Compliance filter rejects retail-investor language for SEC orgs.

## Risks + mitigations

- Adapter coverage gap: Source Onboarder picks them up; UI shows "X sources in setup."
- Scoring drift: Architect's weekly tuning agent iterates per org from operator-verify feedback.
- Outreach quality: existing Generator-Verifier loop catches mismatches.

## Dependencies

- `pathfinder.organizations.architecture` (peer 6mz1zgdf)
- Customer-data tables with `organization_id` + RLS (Stream 2A)
- Source Onboarder, Coverage Expansion, Architect tuning (already shipped)

End.
