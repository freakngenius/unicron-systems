# Pathfinder — Deployment Runbook

Phase 1 G2 Task 7. Operator-facing reference for production operations on `kekas-projects-89ac4317/pathfinder` (deploy) + `anfihcusvekpovcchpoh` (Supabase).

**Public URL:** [www.unicron.systems/pathfinder](https://www.unicron.systems/pathfinder)
**Vercel direct alias:** `pathfinder-ashy.vercel.app` (rewritten from the parent `unicron-systems` app — `next.config.js` `basePath: '/pathfinder'`)

---

## Deploy chain

```
feature branch → push to origin → open PR → human merge to main → Vercel auto-deploys
```

**Hard prohibitions** (per `Pathfinder/CLAUDE.md`):

- **No `vercel deploy --prod` from CLI.** Only allowed: `vercel redeploy <existing-deployment>` for env-var refresh (no new code), and `vercel env add|rm|pull` for secrets management.
- **No direct push to `main`.**
- **No Vercel API or MCP calls that bypass the git trigger.**
- **No merging your own PR** (except Kyle, who is the human reviewer).

**Allowed exceptions:** explicit hot-fix during a live demo (must be logged in the next PR's description).

---

## Apply a Supabase migration

The canonical record for which migrations are applied is `supabase_migrations.schema_migrations` in the live DB. Disk files in `Pathfinder/supabase/migrations/` are the source-of-truth shape; live state is the truth.

### Recommended path: Supabase MCP (or dashboard)

```bash
# List applied migrations
# (from a Claude Code session with the Supabase MCP loaded)
mcp__claude_ai_Supabase__list_migrations(project_id: "anfihcusvekpovcchpoh")

# Apply a new migration
mcp__claude_ai_Supabase__apply_migration(
  project_id: "anfihcusvekpovcchpoh",
  name: "pathfinder_00NN_<description>",
  query: "-- file contents -->"
)
```

Or use the Supabase dashboard: project → Database → Migrations → "Run".

### Local Supabase CLI (for dev or batch apply)

```bash
cd Pathfinder
# Initialize the link once if not done
supabase link --project-ref anfihcusvekpovcchpoh
# Apply pending migrations
supabase db push
# List
supabase migration list --linked
```

### Migration numbering

Pathfinder migrations live in `Pathfinder/supabase/migrations/00NN_<name>.sql` and are numbered sequentially. As of G1 the highest is `0014_llm_calls.sql`. Numbers `0006` and `0007` are intentionally skipped (cosmetic gap; not real). New migrations: pick the next sequential number.

---

## Trigger a redeploy without new code

Used when env vars change but no code does (e.g. new `INNGEST_EVENT_KEY` set in Vercel).

```bash
# List recent deployments
vercel ls --scope team_ox5qAXv7jA6yFUCoOuXQvSfj

# Pick the latest production "Ready" deployment URL, then:
vercel redeploy https://pathfinder-<id>-kekas-projects-89ac4317.vercel.app --target production
```

Takes ~1 min. The new deployment picks up current env vars; production alias `pathfinder-ashy.vercel.app` is reassigned automatically.

---

## View logs

### Vercel function logs (real-time)

Vercel dashboard → Project `pathfinder` → Deployments → pick the latest → Functions tab → click a function. Or via CLI:

```bash
vercel logs <deployment-url> --follow
```

### Axiom (structured production logs)

If `AXIOM_TOKEN` + `AXIOM_DATASET` env vars are set, structured events from `lib/observability/axiom.ts` flow to Axiom. Vercel function `console.*` output also lands there if the native Vercel-Axiom integration is configured in the Vercel dashboard.

Dashboard: [app.axiom.co](https://app.axiom.co/)

### Helicone (LLM trace inspection)

If `HELICONE_API_KEY` is set, every Anthropic + Perplexity call from `lib/llm/run.ts` routes through Helicone for trace inspection.

Dashboard: [helicone.ai](https://helicone.ai/)

### Supabase agent_log

Real-time event log of every agent run cycle. Query directly:

```sql
select ts, agent_name, event_type, message
from pathfinder.agent_log
order by ts desc
limit 100;
```

### Inngest cloud (event bus + function runs)

Dashboard: [app.inngest.com](https://app.inngest.com/) → app `pathfinder`. Shows incoming events (`pathfinder/signal.verified`, `signal.escalated`, etc.) and the function runs they trigger.

---

## Cron schedule (Vercel)

Defined in `Pathfinder/vercel.json`:

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/ingestor` | `0 */6 * * *` | Poll USAspending + SAM.gov |
| `/api/cron/ranker` | `0,30 * * * *` | Score new projects |
| `/api/cron/verifier` | `0,30 * * * *` | 4-check verification; emits Inngest events |
| `/api/cron/outreach` | `15,45 * * * *` | Outreach drafter |
| `/api/cron/briefing` | `0 6 * * 5` | Friday 06:00 UTC weekly brief |
| `/api/cron/slack-alerts` | `*/10 * * * *` | Polling fallback for high-priority alerts |
| `/api/cron/cost-alert` | `0 13 * * *` | Daily LLM cost alert (threshold `COST_ALERT_THRESHOLD_USD` USD) |

Auth: every cron handler verifies `Authorization: Bearer ${CRON_SECRET}` (or `?secret=` query param for local debug).

---

## Roll back a deployment

```bash
# Find the previous good production deployment
vercel ls --scope team_ox5qAXv7jA6yFUCoOuXQvSfj

# Promote it to production
vercel promote <deployment-url> --scope team_ox5qAXv7jA6yFUCoOuXQvSfj
```

Vercel reassigns the production alias instantly (~5 sec).

For database rollbacks: write a forward-only "fix" migration. **Do not** run `DROP` migrations against production — Pathfinder's spec calls for additive schema evolution only. If a column / table needs to be removed, deprecate first, then drop in a separate cycle once no callers reference it.

---

## Secrets management

Production secrets live in the Vercel project's Environment Variables (Project Settings → Environment Variables). Local dev uses `.env.local` (mirror of `.env.example`).

To rotate a secret:

```bash
# Add or replace
vercel env add <NAME> production
# (paste value)

# Trigger a redeploy to pick up the new value
vercel redeploy <latest-deployment-url> --target production
```

**Never commit `.env*` files.** They're in `.gitignore`. AI sessions also enforce this — reading them is a banned operation.

---

## Health checks (operator daily)

```sql
-- Pipeline progression in last 24h
select source,
       count(*) as ingested,
       count(*) filter (where rationale is not null) as ranked,
       count(*) filter (where verified = true) as verified
from pathfinder.projects
where ingested_at > now() - interval '24 hours'
group by source;

-- LLM cost in last 24h
select model,
       count(*) as calls,
       round(sum(cost_usd)::numeric, 4) as cost_usd
from pathfinder.llm_calls
where created_at > now() - interval '24 hours'
group by model
order by cost_usd desc;

-- Recent errors
select ts, agent_name, event_type, message
from pathfinder.agent_log
where event_type = 'error'
  and ts > now() - interval '24 hours'
order by ts desc;
```

---

## Common operations

| Operation | How |
|---|---|
| Run the seed locally | `pnpm seed` |
| Backfill synthetic projects | `pnpm backfill` |
| Test a verifier run end-to-end | `curl -H "Authorization: Bearer $CRON_SECRET" https://www.unicron.systems/pathfinder/api/cron/verifier` |
| Test cost alert (force-fire) | `COST_ALERT_THRESHOLD_USD=0` env var, then trigger `/api/cron/cost-alert` |
| Inngest discovery refresh | `curl -X PUT https://www.unicron.systems/pathfinder/api/inngest` |
| Verify production alias | `vercel inspect pathfinder-ashy.vercel.app` |

---

## Where to look when something breaks

| Symptom | Look here |
|---|---|
| Cron not firing | Vercel dashboard → cron schedule + recent logs |
| LLM calls not in `llm_calls` | Verify gateway deployed (`PUT /api/inngest` → 200); env var `ANTHROPIC_API_KEY` / `PERPLEXITY_API_KEY` set |
| Inngest function not running | Inngest dashboard → app `pathfinder` → function recent runs; verify `INNGEST_SIGNING_KEY` matches |
| Slack alerts not posting | `pathfinder.slack_workspaces` row exists for org? `slack_branch_routes` row for branch? |
| HubSpot sync stuck | `pathfinder.lead_actions` row state + `hubspot_pushed_at` timestamp; webhook signature verification |
| Verifier escalations | `pathfinder.projects` where `verifier_pass_count >= 2 and verified = false`; dashboard escalations pill |

---

Last updated: 2026-05-01 (Phase 1 G2 exit).
