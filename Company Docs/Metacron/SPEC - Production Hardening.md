# SPEC — Production Hardening

Cross-cutting work to take Metacron from "demo-ready for Zedcor" to "production-ready for N customers." Observability, RLS audit, deploy safeguards, test stabilization, secret handling.

## What ships

1. Observability: structured logging across all agent runs, error tracking via Sentry or equivalent, dashboard for per-org agent run health.
2. RLS audit: programmatic test that every customer-data table has correct RLS policies and that operator vs service-role contexts behave as expected.
3. Deploy safeguards: PR template enforces multi-Vercel verification, smoke test step before merge, auto-revert trigger on 5xx error rate spike.
4. Pre-existing test failures fixed: 10 tests in `unicron-platform/src/test-setup.ts` re VITE_SUPABASE_* env wiring.
5. Secret audit: every secret moved to Vercel env vars, no committed secrets, rotation procedure documented.
6. CI/CD gaps: required checks on every PR, branch protection on main, Vercel preview required green.
7. Schema drift detection: cron job comparing local migrations to live Supabase, alert if drift exceeds threshold.

## Observability

```
Pathfinder agent run → structured log → Inngest dashboard + Sentry
Per-org agent run health endpoint: GET /api/orgs/:slug/health
  → returns last_ingestion_run_at, success_rate_24h, error_count_24h, sources_active, sources_failing
Metacron Live System tab queries this per org, surfaces health badges
```

Logging fields per agent run:
- agent_name, organization_id, run_id, started_at, ended_at, status, error_message (if any), cost_usd, leads_emitted

Sentry integration: every uncaught error in agent runs sent with org_id + agent_name tags.

## RLS audit

```typescript
// Test suite: tests/rls-audit.test.ts
describe('RLS isolation', () => {
  it('Realberry user cannot read Zedcor leads', async () => {
    const realberrySession = await createTestSession('realberry@test.unicron.systems');
    const result = await supabase
      .schema('pathfinder')
      .from('leads')
      .select('*')
      .eq('organization_id', ZEDCOR_ORG_ID);
    expect(result.data).toHaveLength(0);
  });
  // Repeat for every customer-data table.
});
```

Run on CI.

## Deploy safeguards

PR template requires:
- [ ] CI green
- [ ] Pathfinder Vercel preview green
- [ ] Metacron Vercel preview green
- [ ] Smoke test ran locally (paste output)
- [ ] No new committed secrets (gitleaks scan)
- [ ] No new RLS bypass (gitleaks-like check for .schema('...').service_role)

Auto-revert trigger:
```
On production deploy:
  Wait 60s for traffic
  Sample 5xx rate over 60s
  If 5xx rate > 1% AND deploy is < 5 min old:
    Auto-revert to previous deployment
    Slack alert with diff + 5xx samples
```

Implement via Vercel webhook + Inngest handler.

## Test stabilization

`unicron-platform/src/test-setup.ts`:
- 10 tests failing on VITE_SUPABASE_* env wiring
- Likely missing `.env.test` or missing default values
- Fix: add test fixture env vars, document in `unicron-platform/README.md`

## Secret audit

- Audit every committed file for hardcoded keys, tokens, URLs
- Move to Vercel env vars or `.env.local` (gitignored)
- Document rotation procedure for each: ARCHITECT_API_TOKEN, SOURCE_ONBOARDER_TOKEN, INNGEST_API_KEY, Anthropic API key, Supabase service role key, vendor API keys
- Run gitleaks on every PR

## CI/CD

Required checks on main branch:
- Pathfinder lint, typecheck, test, build
- Metacron lint, typecheck, test, build
- Pathfinder Vercel preview deploy
- Metacron Vercel preview deploy
- gitleaks
- RLS audit

Branch protection: no direct commits to main, no force-push, require 1 approval (from operator), require all checks green.

## Schema drift detection

```typescript
// Daily cron
inngest.createFunction(
  { id: 'schema-drift-check', cron: '0 12 * * *' },
  async () => {
    const liveMigrations = await supabase.from('supabase_migrations.schema_migrations').select('version');
    const localMigrations = await fs.readdir('Pathfinder/supabase/migrations/');
    const drift = liveMigrations.length - localMigrations.length;
    if (drift > 5) {
      await slackAlert(`Schema drift: ${drift} migrations applied to prod beyond local files`);
    }
  }
);
```

## Acceptance criteria

- All 10 pre-existing test failures fixed.
- RLS audit suite green on CI.
- Auto-revert tested with a synthetic 5xx-spike deploy.
- gitleaks finds zero committed secrets.
- Schema drift cron alerts via Slack on threshold breach.
- Per-org health endpoint returns structured data for any org.
- PR template enforced via repo settings.

## Out of scope

- APM / distributed tracing (Phase 4)
- SOC 2 / compliance certifications
- Disaster recovery runbooks
- Multi-region failover

## Dependencies

- Phase 2A foundational schema + RLS
- Sentry account or equivalent error tracker
- Vercel webhook access for auto-revert handler

End.
