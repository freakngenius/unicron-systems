# SPEC — Phase 2D: Dynamic UI Rendering

Pathfinder customer dashboard adapts UI per-org from `architecture` JSON. Lead schema-driven cards, configurable pipeline kanban, vocabulary substitution, branding hooks, business summary at top.

## What ships

1. Lead card component renders fields from `architecture.lead_unit.schema`.
2. Pipeline kanban stages driven by `architecture.pipeline.stages`.
3. Vocabulary substitution applied throughout UI via `useVocab()` hook.
4. Optional branding (display name in header, accent color CSS var).
5. Business Summary at top of dashboard (read-only, populated from `architecture.business_summary`).
6. Activity Ticker (Phase 1F) integrated.
7. Filters and sort options adapt to lead schema.
8. No hardcoded Zedcor strings remain in customer-facing routes.

## Lead card

Generic component takes the lead row + schema, renders each field per `LeadFieldDef.type`:

```typescript
// Pathfinder/components/LeadCard.tsx

interface Props {
  lead: Lead;
  schema: Record<string, LeadFieldDef>;
}

export function LeadCard({ lead, schema }: Props) {
  return (
    <Card>
      {Object.entries(schema).map(([fieldName, def]) => (
        <Field
          key={fieldName}
          label={def.display_label ?? fieldName}
          value={lead[fieldName]}
          type={def.type}
        />
      ))}
      <ScoreBadge score={lead.score} />
    </Card>
  );
}
```

Field renderer per type:
- `string` → text
- `number` → formatted number
- `currency` → formatted USD/locale-aware
- `enum` → colored chip
- `object` → nested key/value pairs
- `date` → relative time + tooltip absolute

For Realberry, lead card shows: address, asset class chip, units/keys, geography (metro/state), trigger signal, estimated basis (currency), broker contact, score badge.

For Zedcor, lead card shows: project name, location, project value, contact, trigger event, score (existing fields, just routed through new generic).

## Pipeline kanban

```typescript
// Pathfinder/components/PipelineKanban.tsx

export function PipelineKanban({ leads }: { leads: Lead[] }) {
  const { architecture } = useOrg();
  const stages = architecture.pipeline.stages;
  const labels = architecture.pipeline.stage_labels;

  return (
    <div className="kanban">
      {stages.map(stage => (
        <Column
          key={stage}
          label={labels[stage] ?? stage}
          leads={leads.filter(l => l.stage === stage)}
        />
      ))}
    </div>
  );
}
```

Drag-drop between columns persists `lead.stage` to `pathfinder.leads.stage`.

## Vocabulary substitution

`useVocab()` from Stream 2B used throughout customer-facing components:

```typescript
const v = useVocab();
return <h1>Your {v('leads')}</h1>;
// Realberry: "Your deals"
// Zedcor: "Your leads"
```

Apply to:
- Page titles
- Navigation labels
- Filter labels
- Empty states
- Outreach drafter UI ("Draft outreach to lead" → "Draft outreach to seller's broker")

## Branding hooks

Header component reads `architecture.branding`:

```typescript
const { architecture } = useOrg();
return (
  <header style={{ '--accent': architecture.branding.accent_color ?? 'var(--default-accent)' }}>
    <Logo />
    <h1>{architecture.branding.display_name}</h1>
    <PathfinderFooterWordmark />  {/* always present, "Powered by Pathfinder" */}
  </header>
);
```

Optional `branding.logo_url` swaps for customer logo if provided. Default Pathfinder wordmark always retained in footer (per PRD non-goals).

## Business summary at top

`architecture.business_summary` (from Architect output, edited by operator) renders at top of dashboard:

```typescript
<BusinessSummaryPanel
  summary={architecture.business_summary}
  customerName={architecture.branding.display_name}
  readOnly={true}
/>
```

Same component as Metacron-side onboarding panel; reused with `readOnly` prop. Three sections: lead type & business area, problem we solve, what they get.

## Filters

Filter sidebar adapts to schema:
- For each `enum` field in schema, render a multi-select.
- For `currency`/`number` fields, render a range slider.
- For `geography` field (object type with metro/state), render a metro multi-select pre-populated from `architecture.geography.defaults`.
- Default sort: score descending.

## Empty states

Generic empty-state copy with vocab substitution:

> No verified {v('leads')} yet. Sources are warming up — check back in a few hours.

Or, if `architecture.sources` has pending entries:

> {pendingCount} sources still onboarding. {readyCount} live now. First {v('leads')} will appear within the hour.

## Outreach drafter UI

Drafter card on each lead:

```typescript
const v = useVocab();
return (
  <Drafter
    title={`Draft outreach to ${v('contact')}`}
    persona={architecture.outreach.persona}
    lead={lead}
  />
);
```

Calls into Stream 2C's outreach drafter (org-aware).

## Acceptance criteria

- Realberry's `/realberry` dashboard renders Realberry vocabulary, stages, lead schema, branding accent, business summary at top.
- Zedcor's `/zedcor` dashboard renders Zedcor vocabulary, stages, lead schema (unchanged from current), branding accent, business summary at top.
- No hardcoded "Zedcor" or "lead" strings appear in customer-facing routes (grep clean).
- Drag-drop kanban persists across sessions.
- Filters render correct controls per field type.
- Empty states render with vocabulary substitution.
- Activity Ticker (Phase 1F) integrated and updating in real time.
- Mobile responsive (existing Tailwind/responsive logic carried forward).

## Risks + mitigations

- **Schema-render mismatch**: lead row has columns not in `architecture.lead_unit.schema`. Mitigation: render unknown columns in a "Details" expandable section; never hide data.
- **Long enum lists in chips**: 20+ asset classes wrap awkwardly. Mitigation: chip max-width + ellipsis with tooltip.
- **Color contrast on accent_color**: arbitrary user-supplied color may break contrast. Mitigation: validator on architecture write rejects accent colors that fail WCAG AA against default text colors; fallback to default accent.
- **i18n**: only English supported in Phase 2; vocabulary substitution does not implement true i18n. Out of scope.

## Dependencies

- Stream 2A (slug routing + OrgContext)
- Stream 2B (architecture types + useVocab)
- Stream 2C (lead data shape + outreach drafter API)
- Phase 1F bridge (Activity Ticker)
- `BusinessSummaryPanel` component (from Architect Business Summary spec — extract into shared package usable by both Metacron and Pathfinder)

## Out of scope

- Customer-side architecture editing (operator-only via Architect chat)
- Custom CSS/HTML widgets per org (Phase 3+)
- Per-org dark/light mode preference (uses platform default)
- Print-optimized views

End.
