# PLAN — Gate 8B: Clay + Apollo + Hunter providers + cron + on-demand API

Branch: `demo-polish-ux/gate8b-contact-providers-cron`
Spec: `Company Docs/Specs/SPEC - Contact Enrichment.md`
Base: `origin/main` at `db023b8` (Gate 8A merged).

## Goal

Make Gate 8A's interface real. Three concrete providers (Clay primary, Apollo fallback, Hunter verifier), an orchestrator that wires them with the spec's fallback + verify pipeline, an Inngest daily cron, and an admin POST endpoint for on-demand single-lead enrichment.

## Files in scope

In:
- `Pathfinder/services/contact-enricher/providers/clay.ts` — primary provider (HTTP API).
- `Pathfinder/services/contact-enricher/providers/apollo.ts` — fallback provider.
- `Pathfinder/services/contact-enricher/providers/hunter.ts` — email verifier.
- `Pathfinder/services/contact-enricher/cost-recorder.ts` — writes to `pathfinder.llm_calls` with `provider` set.
- `Pathfinder/services/contact-enricher/agent.ts` — orchestrator (Clay → Apollo fallback → Hunter verify → dedupe → classify → rank → cap).
- `Pathfinder/services/contact-enricher/persist.ts` — `wipe + insert` writer to `pathfinder.lead_contacts`.
- `Pathfinder/services/contact-enricher/runner.ts` — selects top-50, applies 7-day staleness gate, runs orchestrator, persists, returns summary.
- `Pathfinder/lib/inngest/functions/contact-enrichment.ts` — daily 02:00 UTC cron.
- `Pathfinder/lib/inngest/functions/index.ts` — additive export of the new cron.
- `Pathfinder/app/api/leads/[projectId]/enrich-contacts/route.ts` — admin POST (basic-auth gated by middleware).
- `Pathfinder/tests/contact-enricher-agent.test.ts` — happy/fallback/empty/cap/skip/verification tests.
- `Pathfinder/tests/contact-enricher-providers.test.ts` — per-provider parser + missing-cred + fetch-mock tests.
- `MEMORY/operator-todos/2026-05-02-contact-enrichment-setup.md` — env vars Kyle must add.

Out (later gates):
- ContactsCard UI / wiring (8C).
- Production rollout + Houston verification (8D).

## Architecture

```
┌─────────────────────┐
│ daily Inngest cron  │  TZ=UTC 0 2 * * *
└──────────┬──────────┘
           │
           ▼
┌────────────────────────────────────────────┐
│ runner.runEnrichment({ topN: 50 })         │  also called by on-demand POST
│   - selectTopProjects                       │
│   - loadEnrichmentRecency (7d gate)         │
│   - for each candidate:                     │
│       enrichOneLead → writeContacts         │
│   - aggregate per-provider cost telemetry   │
└────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ agent.enrichOneLead(input, deps)             │
│   1. shouldSkip → skip                       │
│   2. ClayContactEnricher.enrichContacts      │
│   3. shouldFallbackToApollo → Apollo         │
│   4. dedupe                                  │
│   5. for guessed/unknown emails:             │
│        HunterEmailVerifier.verifyEmail       │
│   6. classify decision_authority + seniority │
│   7. rankAndCap (≤5)                         │
└──────────────────────────────────────────────┘
```

## Cost telemetry

Every Clay / Apollo / Hunter call writes a row to `pathfinder.llm_calls` with `provider` set (column added in 0112) and `agent_name='contact_enricher'`. Existing cost-summary endpoint sums automatically. The Gate 8 prompt's 5x-baseline halt monitor reads this table.

## Spec deviations / clarifications

1. **Hunter "unknown" verdict preserves the existing `email_status`** rather than collapsing to `invalid`. Hunter's `accept_all` / `webmail` cases are not "the email is bad" — they're "we can't tell." Demoting to `invalid` would over-delete contacts. UI distinguishes via the chip (verified=green, guessed=amber, invalid=red).
2. **`cross_pollination_serves_owner` skip rule sources from `projects.warm_for_customer_id`** (the multi-tenant adjacency signal that drives `scoreProject`) rather than from `lead_cross_pollination` (the Zedcor contractor signal that drives the Cross-Pollination card). Two distinct layers per Gate 2 architecture decision; the orchestrator only checks the layer the spec semantically intends ("nearest branch already serves the owner").
3. **`writeContacts` is wipe-and-insert per project** rather than upsert-by-name. The cron is the authoritative snapshot per the spec's refresh policy; historical audit lives outside this gate.

## Tests

- 19 new tests across 2 files. All provider HTTP behavior is mocked via `vi.fn(global.fetch)` so no real network calls.
- All existing 1066 tests remain.

## Validation

- `pnpm typecheck` clean.
- `pnpm lint` clean.
- `pnpm test` passes.

## Halt-before-merge gate

Per the Gate 8 prompt: surface to Kyle if any of the 4 env vars are missing in Pathfinder Vercel production env before the merge. The operator-todo doc spells out the exact `vercel env ls` check.
