# Progress

Cross-stream progress log. Newest entries on top. One section per stream/sprint.

---

## Stream M2 (Metacron) — 2026-05-02

Phase 1 / Stream M2 (Source Onboarder Modal) shipped to PR #84 (open, awaiting Kyle review). Branched from M1 (`feat/metacron-m1-coverage-expansion`) so M2 inherits the `AgentDefinition.modalComponent` extension; rebases cleanly onto main once M1 (PR #80) merges.

**Files (all under `unicron-platform/`):**

- `src/views/agents/SourceOnboarderModal.tsx` (new) — orchestrator with the `isMockRuntime` gate (mirrors M1). Three result branches: Tier 1 (live), Tier 2 (human-assist), declined.
- `src/components/agents/source-onboarder/SourceOnboarderInputForm.tsx` (new) — URL or description (either-or), hint dropdown (`socrata` / `rest` / `rss` / `json-dump`), jurisdiction, `api_key_env` (NAME ONLY — never the key), test_only checkbox.
- `src/components/agents/source-onboarder/SourceOnboarderResultPanel.tsx` (new) — Tier 1 schema preview + Commit, Tier 2 escalation block + Open Ticket, declined reason. Tier 1 commit verifies the dispatch.
- `src/components/agents/Tier2ResolveModal.tsx` (new — exported for reuse) — three modes (manual / dismiss / resume). Required note for manual + dismiss; resume reveals URL / api_key_env / hint / jurisdiction overrides. Backed by `POST /api/architect/inbox/[id]/resolve`.
- `src/lib/inboxClient.ts` (new) — typed wrapper for inbox list + resolve. Reuses `VITE_ARCHITECT_API_*` env (architect inbox is shared between Stream D and Stream E by category).
- `src/lib/contracts/inbox.ts` (new) — wire types matching the Pathfinder route handlers.
- `src/lib/agents/sourceOnboarderAgent.ts` (new) — registry entry; lazy `modalComponent`.
- `src/lib/agents/index.ts` (extended) — registers `sourceOnboarderAgent` alongside M1's `coverageExpansionAgent`.
- `src/data/mocks.ts` (additive, +156 LOC) — `sourceOnboarderDispatchesMock`, `inboxTicketsMock` (Pittsburgh RSS + Austin 401 fixtures), `sourceOnboarderMockOnboardResult` / `sourceOnboarderMockTier2Result`, 10-step scripted live timeline.
- `src/components/live/panels/AddSourcePanel.tsx` — replaced with a redirect shim that surfaces "moved to Agents tab → Source Onboarder."
- `src/components/live/panels/_archive/AddSourcePanel.tsx` (moved via `git mv`) — original two-phase analyze/deploy panel preserved per `feedback_no_deletes.md`.
- `tsconfig.app.json` + `eslint.config.js` — exclude `src/**/_archive/**` from build + lint so archived code doesn't pollute baselines.

**Tests:**

- `src/lib/inboxClient.test.ts` — 7 tests (mock + real modes; filter/query encoding, error mapping, all three resolution modes).
- `src/components/agents/Tier2ResolveModal.test.tsx` — 5 tests (mode coverage manual/dismiss/resume + validation).
- `src/components/agents/source-onboarder/SourceOnboarderInputForm.test.tsx` — 3 tests (validation, payload, `toOnboardRequest` mapping).
- `src/components/agents/source-onboarder/SourceOnboarderResultPanel.test.tsx` — 4 tests (Tier 1 + Tier 2 + declined + readOnly).
- `src/views/agents/SourceOnboarderModal.test.tsx` — 3 tests (Tier 1 happy path, Tier 2 escalation surfaces `Tier2ResolveModal`, error path).

Total: 22 new. Suite went 101 → 123, all passing.

**Pre-flight (verbatim):**

```
$ npm run typecheck   → exit 0 (clean)
$ npm test            → Test Files 21 passed (21) | Tests 123 passed (123) | Duration 4.40s
$ npm run lint        → 13 problems (11 errors, 2 warnings) — matches origin/main baseline; zero new
$ npm run build       → built in 642ms; SourceOnboarderModal lazy chunk 25.79 kB / 6.82 kB gzip
```

**Multi-Vercel state at branch settle (verbatim):**

- **metacron** preview `dpl_AAzKom8wzVvAcquzsV5GhSbwBSXb` for commit `<m2-sha>` — **READY**. URL: `metacron-nlsvzdrpc-kekas-projects-89ac4317.vercel.app`.
- **pathfinder** main production `dpl_5XfN8KDYJ2Zjafzbx3amh1NaHrHM` at `7d707a28` — **READY**.
- **unicron-systems** main production `dpl_WAtRG7Z1gZgKQJdk5EcqNdVG6cGK` at `7d707a28` — **READY**.

**Coordination filed:**

- **PR #80 (M1)** depends on this PR's `Tier2ResolveModal` export. The coordination watcher (`trig_01FdqrNFnMKq3pS1rNJJcG12`) auto-flags the M2 merge so M1's `onTier2Click` no-op can swap to `setTier2Ticket(candidate)` — single-line edit.
- **AddSourcePanel redirect**: LiveSystem ActionBar → "Add Source" still works; the panel renders a "moved to Agents tab" notice + close. A follow-up can thread `onSwitchToAgentsTab` through ActionBar/LiveSystem if friction warrants.

**Outstanding TODOs:**

- **Real-mode env decision** (Kyle): direct browser → Pathfinder routes vs. server-side proxy. Either works with this PR's clients.
- **Phase 1F verification write** — same as M1; adds `pathfinder.agent_verifications` row when the Pathfinder bridge ships.
- **Ticket fetch by ID** — Pathfinder's inbox route lacks a single-ticket GET; M2's `realFetchTicket` narrows the open-list response. Acceptable for small queues; revisit if queue grows.
- **AdapterCode inline edit** — preview-only this PR. Edit-in-place is a follow-up sprint per the M2 prompt.

**Kanban (Metacron Features data source `07970e18-984a-4034-b491-cde76b9b1bad`):**

- "Tier 2 ticket resolution UI" (existing card `354785c6-7e72-8179-8fe2-fffff00e16bb`) → Stage `Not Yet Started` → `Review`. Scope absorbed into Source Onboarder Modal.
- "Source Onboarder Modal" (NEW card) → Stage `Review`. Created with full PR + branch + test-delta + coordination notes.

PR: https://github.com/freakngenius/unicron-systems/pull/84

---

## Stream M1 (Metacron) — 2026-05-02

Phase 1 / Stream M1 (Coverage Expansion Modal) shipped to PR #80 (open, awaiting Kyle review).

**Files (all under `unicron-platform/`):**

- `src/views/agents/CoverageExpansionModal.tsx` (new, 309 LOC) — orchestrator composing `AgentModalShell` + `CoverageInputForm` + `AgentLiveExecution` + `CoverageResultPanel` + `AgentHistoryGrid` through a typed phase machine (idle → dispatching → running → awaiting_review → verified | rejected | failed). Mock-mode walks a scripted event timeline through `appendEvent` so the live panel renders identically to a real run.
- `src/components/agents/coverage/CoverageInputForm.tsx` (new, 290 LOC) — vertical, goal text, metro chips, radius slider, target-lead-count, signal-keyword chips with suggestions, lookback dropdown (14 / 30 / 60 / 90d), optional budget cap. Structured validation; `toScopeConstraints()` helper to convert to the wire `CoverageScopeConstraints`.
- `src/components/agents/coverage/CoverageResultPanel.tsx` (new, 224 LOC) — Tier 1 vs Tier 2 grouping, lead-pool delta row, Commit-to-production button. Tier 2 click-handler exposed but currently a no-op until M2's `Tier2ResolveModal` lands.
- `src/lib/coverageClient.ts` (new, 137 LOC) — typed wrapper for the four Stream E endpoints. Mock-mode toggle `VITE_COVERAGE_API_ENABLED` (default `false`). Real-mode forwards Basic auth from `VITE_COVERAGE_API_BASIC_*` env. Mock-mode reads from the new fixtures.
- `src/lib/contracts/coverage.ts` (new, 134 LOC) — wire types mirroring `Pathfinder/services/coverage-expansion/types.ts` and migration `0081_coverage_expansion.sql`.
- `src/lib/agents/coverageExpansionAgent.ts` (new, 47 LOC) — registry entry with a lazy-loaded `modalComponent` + a programmatic `dispatchHandler`.
- `src/lib/agents/index.ts` (new, 14 LOC) — central registration; AgentsView imports as a side-effect so all Phase 1 streams' agents register at module-load.
- `src/data/mocks.ts` (additive +217 LOC) — `coverageGoalsMock` (Pittsburgh verified, Houston running, LA estimating), `coverageDispatchesMock`, `buildCoverageGoalDetailMock(id)`, `coverageMockLiveEvents` (8-step scripted live timeline).
- `src/lib/agentRegistry.ts` (extended, +20 LOC) — added optional `modalComponent: ComponentType<{onClose: () => void}>` field to `AgentDefinition`. Additive — no existing agents to invalidate.
- `src/components/agent-console/AgentsView.tsx` (extended, +18 LOC) — renders `selected.modalComponent` inside a `Suspense` boundary when defined; falls back to the Phase 0.5 placeholder shell otherwise. Side-effect import of `src/lib/agents/index.ts` triggers registration.

**Tests** (colocated, vitest `include: src/**/*.{test,spec}.{ts,tsx}` — the M1 prompt's `__tests__/` path doesn't match the discovery glob):

- `src/lib/coverageClient.test.ts` — 9 tests covering both modes (mock-mode fixtures, real-mode fetch with filter param encoding, error mapping, JSON body shape).
- `src/components/agents/coverage/CoverageInputForm.test.tsx` — 5 tests (validation blocks for goal_text + metros, chip add on Enter, full payload submission, `toScopeConstraints` mapping).
- `src/components/agents/coverage/CoverageResultPanel.test.tsx` — 5 tests (Tier 1 / Tier 2 grouping, lead-delta render, Commit button + readonly toggle, Tier 2 click).
- `src/views/agents/CoverageExpansionModal.test.tsx` — 4 tests (mount shape, end-to-end input → dispatch → live → result → verify, error path, verified-history-tile reload).
- `src/lib/agents/coverageExpansionAgent.test.ts` — 2 tests (registry entry shape, side-effect registration).

Total: 25 new tests. Suite went 76 → 101, all passing.

**Pre-flight (verbatim):**

```
$ npm run typecheck   → exit 0 (clean)
$ npm test            → Test Files 16 passed (16) | Tests 101 passed (101) | Duration 2.53s
$ npm run lint        → 13 problems (11 errors, 2 warnings) — all pre-existing on origin/main; M1 added zero
$ npm run build       → built in 553ms; CoverageExpansionModal lazy chunk 20.57 kB / 5.83 kB gzip
```

**Multi-Vercel state at branch settle (verbatim):**

- **metacron** preview `dpl_Ej4R55NYYCBG7W8LD4UzWohCpCYF` for commit `30880ea` — **READY** (~17s build). URL: `metacron-p950zswfp-kekas-projects-89ac4317.vercel.app`. Anonymous `curl -I` returns `HTTP/2 401` + `_vercel_sso_nonce` (expected — Vercel Deployment Protection on).
- **pathfinder** main production `dpl_5XfN8KDYJ2Zjafzbx3amh1NaHrHM` at `7d707a28` — **READY**. Auto-rebuilt without regression on the M1 push.
- **unicron-systems** main production `dpl_WAtRG7Z1gZgKQJdk5EcqNdVG6cGK` at `7d707a28` — **READY**. Same.

**First-build failure + recovery (logged for posterity):**

`d7ee6f2` ERRORed at TS2307 because `unicron-platform/.vercelignore` had a bare `coverage` rule (matching `src/components/agents/coverage/`). Same root cause forced a matching `.gitignore` adjustment earlier in the branch (where bare `coverage/` was matching during `git add`). Fix `30880ea` anchored both rules to project root.

**Coordination filed:**

- `MEMORY/operator-todos/2026-05-02-stream-e-coverage-http-routes.md` (new) — captures the gap that forced mock-mode-only ship: Stream E PR #36's claimed `/api/coverage/goals*` HTTP routes are not in fact present on any branch. Real-mode toggle defaults off in production env until Pathfinder lands the four route handlers.

**Outstanding TODOs:**

- **Tier 2 modal** — M1 result panel exposes `onTier2Click` but currently no-ops; swap for `Tier2ResolveModal` open call when M2 (Phase 1 / Stream M2) ships and exports it. Single-line edit.
- **Phase 1F verification write** — Verify path leaves a TODO comment referencing `MEMORY/operator-todos/2026-05-02-pathfinder-needs-verification-bridge.md`. Adds `pathfinder.agent_verifications` row write when that table ships.
- **Real-mode wiring** — flip `VITE_COVERAGE_API_ENABLED=true` once Stream E HTTP routes land; PR will include verbatim curl evidence from each endpoint.
- **Map picker library** — current radius slider + metro chip list is the CSS placeholder per M1 prompt's "do not install" guidance.
- **AgentsView extension** — added optional `modalComponent` field is the canonical extension point M2 / M4 / M5 will reuse. Field is additive; no merge conflicts expected across parallel streams.

**Kanban:**

- Notion card "Coverage Expansion UI" renamed → **"Coverage Expansion Modal"** (page id `354785c6-7e72-813e-b5c2-da17bba7ce8f`); Stage moved `Not Yet Started` → `Review`. `Implemented at <commit-sha> · merged at <ISO timestamp>` footer to be appended on merge per Kanban hygiene rule.

PR: https://github.com/freakngenius/unicron-systems/pull/80

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
