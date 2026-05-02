# Progress

Cross-stream progress log. Newest entries on top. One section per stream/sprint.

---

## Stream M0.5 (Metacron) — 2026-05-02

Phase 0.5 (Agent Console foundation) shipped.

**Schema (production Supabase `anfihcusvekpovcchpoh`):**

- New file: `unicron-platform/supabase/migrations/0001_agent_console.sql` (fresh history; first migration of the metacron pipeline; precursor `0090_unicron_settings.sql` lives under `Pathfinder/supabase/migrations/` and was never applied to this project, so the `unicron` schema was created fresh by this run).
- Tables created in `unicron` schema: `agent_dispatches` (16 cols), `agent_dispatch_events` (5 cols).
- Indexes: `idx_agent_dispatches_org` (compound, customer_org_id+agent_name+created_at desc), `idx_agent_dispatches_status` (partial, status+created_at desc where status in running/awaiting_review), `idx_agent_dispatches_run`, `idx_agent_dispatch_events_dispatch` (composite, dispatch_id+created_at).
- RLS: operator-team-only — `for all to authenticated using (true)` on both tables; service_role retains full access; anon explicitly excluded from grants.
- Realtime: both tables added to `supabase_realtime` publication; live smoke confirmed event delivery in 1063ms.
- SPEC drift surfaced: SPEC §8 declared `agent_run_id uuid`, but production `pathfinder.agent_runs.id` is `bigint`. Migration uses `bigint` to match reality; spec to be updated in a follow-up doc PR.
- PostgREST exposed-schemas config drift surfaced: project initially exposed only `public, graphql_public, pathfinder`. Fixed via `alter role authenticator set pgrst.db_schemas to 'public,graphql_public,pathfinder,unicron'; notify pgrst, 'reload schema';`. JS client can now query the `unicron` schema.

**Components built (all under `unicron-platform/src/`):**

- `lib/contracts/agentConsole.ts` — wire types mirroring schema, status/event-type unions, `isTerminal()` helper.
- `lib/agentConsoleClient.ts` — `createDispatch`, `listDispatches`, `getDispatch`, `verifyDispatch`, `rejectDispatch`, `appendEvent`, `listEvents`, `subscribeToEvents`. Mirrors the call-shape of `architectClient.ts` / `sourceOnboarderClient.ts`.
- `lib/agentRegistry.ts` — central catalog, empty initially. `registerAgent`, `getAgent`, `listAgents`, `hasAgents`. Phase 1 streams populate it.
- `components/agent-console/AgentModalShell.tsx` — header (icon, name, role, status pill, cost ticker, recent-runs count), close action, footer slot.
- `components/agent-console/AgentInputForm.tsx` — generic form driven by an `AgentFormSchema` (text/textarea/number/select). No zod dependency.
- `components/agent-console/AgentLiveExecution.tsx` — Supabase Realtime subscription on `agent_dispatch_events`, streaming activity log filtered by `event_type`. Test seams for `subscribeFn` / `loadInitial`.
- `components/agent-console/AgentResult.tsx` — Verify / Reject (with reason) / fallback JSON-dump renderer. Per-agent custom renderers via `agent.resultRenderer`.
- `components/agent-console/AgentHistoryGrid.tsx` — filter (status), sort (date / cost / status), tile grid. Test seam for the loader.
- `components/agent-console/AgentTile.tsx` — single dispatch tile.
- `components/agent-console/AgentsView.tsx` — Agents tab entry. Empty state when registry is empty; agent-card grid otherwise; click-to-open modal via component state (no router).
- `components/Topbar.tsx` extended — `'agents'` added to `TabId`, `AGENTS` tab label appended.
- `App.tsx` extended — `tab === 'agents' && <AgentsView />` render branch.

**Tests (colocated under `src/` per existing convention; prompt's `__tests__/` path doesn't match the vitest `include` pattern):**

- `src/components/agent-console/AgentModalShell.test.tsx` — 4 tests (identity render, status pill, onClose, $0.000 fallback).
- `src/components/agent-console/AgentHistoryGrid.test.tsx` — 4 tests (empty state, tile rendering, status filter, cost sort).
- `src/components/agent-console/AgentLiveExecution.test.tsx` — 5 tests (loading→empty, contract-mock realtime delivery, eventTypeFilter, dedup, unmount unsubscribe).
- `src/lib/agentConsoleClient.test.ts` — 5 tests (createDispatch shape, listDispatches filters, verifyDispatch/rejectDispatch update payloads, appendEvent shape).

Total: 18 new tests, +0 regressions. Suite went 58 → 76 tests, all passing.

**Realtime smoke (live, against production Supabase):**

```
[smoke] connecting to https://anfihcusvekpovcchpoh.supabase.co
[smoke] created dispatch id=901a94b0-9d48-41ac-9bd0-9313629c1496
[smoke] channel status=SUBSCRIBED
[smoke] event inserted; awaiting Realtime delivery…
[smoke] received event after 1063ms event_type=reasoning
[smoke] channel status=CLOSED
[smoke] PASS event_received_ms=1063 dispatch_id=901a94b0-9d48-41ac-9bd0-9313629c1496
```

Smoke script preserved at `unicron-platform/scripts/realtime-smoke.mjs` for Phase 1 reuse. Cleans up its test rows on success.

**Coordination filed:**

- `MEMORY/operator-todos/2026-05-02-pathfinder-needs-verification-bridge.md` — request to Pathfinder chat to ship `pathfinder.agent_verifications` migration + customer-facing ticker/badge surface (Phase 1F). Includes verbatim SPEC §8 SQL.

**Pre-existing concern surfaced (not Phase 0.5 scope):**

- The local `/agents` console emits browser warnings: `settings.loadRemote/saveRemote failed Could not find the table 'unicron.settings' in the schema cache`. The `0090_unicron_settings.sql` migration was authored under `Pathfinder/supabase/migrations/` but never applied to this Supabase project — `unicron.settings` does not exist in production. Settings drawer's remote persist path is broken everywhere, not just on this branch. Worth a separate follow-up to either apply that migration or move settings persistence to a different table.

**Outstanding TODOs for Phase 1 streams:**

- `unicron.dispatched_by_user_id` is currently nullable — Phase 1 streams should pass `auth.user.id` from the SignInGate context when calling `createDispatch`.
- Result-payload shape for Verify path is currently an opaque `Record<string, unknown>`; Phase 1 streams should agree on a per-agent shape (Coverage Expansion: `{ source_ids: string[], lead_pool_delta: number }` etc.) and document in their own SPEC sections.
- `pathfinder.agent_verifications` row write happens after the Pathfinder chat ships the table per the operator-todo above.

---

## Stream M0 (Metacron) — 2026-05-02

Phase 0 (Metacron Vercel project setup) closed.

- Vercel project `metacron` created and live: ID `prj_4LlPkQ30I4CMRm6hUfk7CJERWDAz` (team `team_ox5qAXv7jA6yFUCoOuXQvSfj`). Framework Vite, Root Directory `unicron-platform`, Build `npm run build`, Install `npm ci`, Output `dist`.
- Production deploy READY: `dpl_5YZZ4soStYdiMFy13BLpejhWranq` at commit `793be48` (PR #72 squash merge). Working URLs: `https://metacron-9hyy2oaml-kekas-projects-89ac4317.vercel.app/` and the branch alias `https://metacron-git-main-kekas-projects-89ac4317.vercel.app/`.
- 8 production env vars set per Phase 0 runbook (names captured in the operator-todo; values managed in Vercel dashboard).
- Issue #48 (marketing-site prerender failure) closed — production self-healed before this work; the 14-route force-dynamic refactor is captured as a non-blocking cleanup todo.
- Bumps along the way (logged for posterity, all resolved):
  - PR #71's bundled workspace move (marketing-site source → `Marketing Site/`) doubled the Next.js route paths and broke the `unicron-systems` post-build packaging. Reverted at `8ad65ed`.
  - The revert in turn left the `unicron-systems` Vercel project's Root Directory pointing at the (now-non-existent) `Marketing Site/` directory and re-introduced the `unicron-platform/` exclusion in root `.vercelignore` that was breaking the metacron Vite build. Kyle cleared the Root Directory in the dashboard and promoted the previous READY deploy as a safety belt; an empty commit (`3b2afd5`) re-triggered the marketing-site build to pick up the corrected setting. PR #72 then re-applied just the `.vercelignore` fix and docs-restore (without the broken move).

Outstanding Kyle-actions (none block any other work):

- Attach `metacron.unicron.systems` as a custom domain in Vercel dashboard → metacron → Settings → Domains. DNS is already live (CNAME → `cname.vercel-dns.com` at Namecheap). Currently TLS handshake fails because the project hasn't claimed the hostname.
- Decide whether to keep Vercel Deployment Protection (SSO) on for the metacron project. Default-on is fine for an operator-only UI; toggle off if external demo access is needed, since `VITE_AUTH_REQUIRED=true` already gates the app via Supabase magic-link.

The marketing-site → `Marketing Site/` workspace move is parked for a separate post-Tuesday-demo PR.

Next: Phase 0.5 (Agent Console foundation) per `Company Docs/Specs/SPEC - Agent Console (Metacron).md`.
