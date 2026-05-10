# SPEC — Phase 2E: Onboarding-to-Live Pipeline (Operator-Internal)

**Updated 2026-05-05.** Customer invite / magic-link removed. Operators view tailored Pathfinder dashboards via Metacron deep-link. Customers don't log in.

Architect Approve → org persisted → first ingestion run → operator can navigate to tailored Pathfinder for that org with real data flowing.

## What ships

1. After Architect approve, persist org via `POST /api/organizations` with full architecture JSON.
2. Trigger on-demand first ingestion via Inngest event `org.created`.
3. After first run produces verified leads, set status `ready_to_view`.
4. Metacron Customers tab status badge: setting_up → first_run → ranking → awaiting_threshold → ready_to_view → operator_viewed.
5. "Open Pathfinder for X" button in Metacron Customer Detail; lights up at `ready_to_view`.

## Flow

```
Architect approve in Metacron
    ↓
ApproveDeployModal captures name + slug
    ↓
POST /api/organizations  (status=setting_up, architecture JSON)
    ↓
Inngest.send({ name: 'org.created', data: { organization_id } })
    ↓
ingestOrgFunction runs adapters from architecture.sources (status=first_run)
    ↓
rankAndVerifyOrgFunction (status=ranking)
    ↓
verifiedCount >= 3 ? status=ready_to_view : status=awaiting_threshold
    ↓
Operator clicks "Open Pathfinder for X" in Metacron Customer Detail
    ↓
Routes to /[slug]/ with operator session
    ↓
status=operator_viewed (set on first /[slug]/ render)
```

## On-demand first run (Inngest)

```typescript
export const ingestOrgFunction = inngest.createFunction(
  { id: 'ingest-org-on-demand', concurrency: { limit: 5 } },
  { event: 'org.created' },
  async ({ event, step }) => {
    const { organization_id } = event.data;
    const org = await step.run('fetch-org', async () => {
      return supabase.schema('pathfinder').from('organizations')
        .select('*').eq('id', organization_id).single();
    });

    await step.run('mark-first-run', async () =>
      supabase.schema('pathfinder').from('organizations')
        .update({ status: 'first_run' }).eq('id', organization_id)
    );

    for (const sourceRef of org.architecture.sources) {
      const adapter = resolveSource(sourceRef);
      if (adapter === 'tier-2' || adapter === 'pending') continue;
      await step.invoke('run-adapter', {
        function: adapter.fn,
        data: { organization_id, source_id: sourceRef.id }
      });
    }

    await step.run('mark-ranking', async () =>
      supabase.schema('pathfinder').from('organizations')
        .update({ status: 'ranking' }).eq('id', organization_id)
    );

    await step.invoke('rank-and-verify', {
      function: rankAndVerifyOrgFunction,
      data: { organization_id }
    });
  }
);
```

## Threshold check

```typescript
export const checkReadyToViewFunction = inngest.createFunction(
  { id: 'check-ready-to-view' },
  { event: 'org.ranking-complete' },
  async ({ event, step }) => {
    const { organization_id } = event.data;
    const { count } = await step.run('count-verified', async () =>
      supabase.schema('pathfinder').from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization_id)
        .eq('status', 'verified')
    );

    const status = (count ?? 0) >= 3 ? 'ready_to_view' : 'awaiting_threshold';

    await step.run('update-status', async () =>
      supabase.schema('pathfinder').from('organizations')
        .update({ status }).eq('id', organization_id)
    );
  }
);
```

## Metacron Customers tab badge

Status per org (polled or Realtime):

```
setting_up         → "Setting up sources"
first_run          → "Running first ingestion"
ranking            → "Scoring + verifying"
awaiting_threshold → "Below threshold — expand geography or lower threshold" + action button
ready_to_view      → "Ready to view" + Open Pathfinder button enabled (highlighted)
operator_viewed    → "Live" + Open Pathfinder button (default)
```

Open Pathfinder button → `https://pathfinder.unicron.systems/[slug]` with operator session via shared Supabase Auth cookie.

## Acceptance criteria

- Approve Architect plan → "Realberry" appears with status setting_up.
- Status flows through state machine to ready_to_view (or awaiting_threshold).
- Open Pathfinder button enabled at ready_to_view.
- Click → operator lands on `/realberry` with real per-org data.
- Status flips to operator_viewed on first render.
- If awaiting_threshold, operator can trigger Coverage Expansion or lower threshold to unblock.

## Out of scope (was in original spec, dropped)

- Customer email capture in modal
- Magic-link send to customer
- invite_sent / active states
- Resend-invite button
- `pathfinder.invite_log` table
- Customer-facing Auth email template

## Dependencies

- Phase 2A (slug routing + operator allowlist auth)
- Phase 2C (per-org agent dispatch)
- Phase 2D (tailored UI rendering)
- `pathfinder.organizations` with `status` column

End.
