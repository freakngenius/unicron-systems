# unicron-platform — Stream C notes

This file is the stream-scoped equivalent of `MEMORY/decisions.md` and
`MEMORY/spec-references.md` for the Phase 2 Stream C work. The workspace-level
`MEMORY/` directory at the repo root is untracked and shared across streams,
so per-stream notes land here and get promoted in the PR description.

## Decisions

### 2026-05-01 — Stream C imports unicron-platform baseline as committed code

**Choice:** Copy the canonical `unicron-platform/` (Vite + React 19 operator UI
at the workspace root, untracked, ~1.8 MB sans node_modules) into the
`stream/c-platform` worktree and commit it.

**Why:** The Phase 2 spawn note says "stay in this worktree" and "do not modify
code in main, in other worktrees, in `_demo-snapshot-2026-04-30/`...". The
existing `unicron-platform/` lives in the main worktree at workspace root.
For Stream C to deliver code via PR, the source must live inside the
worktree. Stream C is the only stream that touches the operator UI per
`00 - PARALLEL BUILD MAP.md`, so this single-stream import does not collide.

**Alternatives considered:**
- Operate on the workspace-root copy directly — violates the no-touch rule on
  main; also there is no clean way to commit those changes via this branch.
- Pick a new path like `apps/platform/` per the parallel build map — risks
  divergence from the audit (`MEMORY/audit-unicron-platform.md`) and from the
  `_demo-snapshot-2026-04-30/` rollback artifact.

**Drift:** none — verbatim copy of the canonical demo snapshot.

### 2026-05-01 — Anon Supabase client, no service role in browser

**Choice:** `src/lib/supabase.ts` exposes a single anon-keyed client. Service
role keys never reach the bundle. RLS on `pathfinder.*` allows
`anon, authenticated` SELECT on the read-public tables, which is sufficient
for the operator UI's read-only consumption of cron-driven activity.

**Spec reference:** STREAM-README Gate C1 — "Use the **anon** Supabase client
for reads (RLS allows `anon, authenticated` SELECT on the read-public
tables); never use service-role keys in browser code."

### 2026-05-01 — Settings persistence: localStorage + `unicron.settings`

**Choice:** `SettingsContext` hydrates from localStorage (instant), then
overwrites from `unicron.settings` (debounced 800 ms write-through). When
auth is off, the sentinel operator key `'anon-operator'` is used so a single
shared row is used in local dev.

**Spec reference:** STREAM-README Gate C1 — "Settings drawer wires to real
Settings table (create one in `unicron.*` schema if it doesn't exist; don't
pollute `pathfinder.*`)."

**Alternatives considered:**
- Unauthenticated localStorage-only — fails the spec ("wires to real Settings
  table").
- Strict-remote-only — flashes default settings on every reload while the
  network round-trip lands. Pragmatic to keep the localStorage cache.

### 2026-05-01 — Magic-link auth gated by `VITE_AUTH_REQUIRED`

**Choice:** `SignInGate` wraps the app shell. When `VITE_AUTH_REQUIRED=true`
it requires a Supabase magic-link session before rendering. When unset or
"false" it renders straight through (anon reads continue to work because
RLS permits them).

**Why:** STREAM-README requires "Authentication flow wires to real Supabase
auth." The flag gives us a single config flip to enforce sign-in for staging
or prod without blocking local dev where reads work anonymously.

**Spec reference:** STREAM-README Gate C1.

### 2026-05-01 — Migration range: Stream C reserves 0090-0099

**Choice:** `0090_unicron_settings.sql` lives in
`Pathfinder/supabase/migrations/`. Stream C reserves the 0090-0099 range.

**Why:** `00 - PARALLEL BUILD MAP.md` lists migration ranges for each stream
(B 0050-0069, D 0070-0079, E 0080+). Stream C was unclaimed; 0090+ keeps
clear of E's open-ended range without forcing a renumber elsewhere.

### 2026-05-01 — Retire iframe Pixi, keep Canvas-2D React port

**Choice:** Delete `src/components/live/LivingIntelligenceFrame.tsx` and
`public/living-intelligence.html`. Live System now renders the same
`<Visualizer />` (Canvas-2D React port) that Onboarding already uses,
driven by `SystemConfig`.

**Why:** Phase 2 spawn note + audit §3 + §6: two visualizers coexist, only
the React one is driven by `SystemConfig`, the iframe doesn't postMessage
clicks back. Killing the iframe collapses the duplication and unblocks
`onNodeClick → EditNodePanel` selection.

**Spec reference:** STREAM-README Gate C2 — "Pick the Canvas-2D React port.
Retire the iframe Pixi version (commit deletion with explicit reasoning in
commit message)."

### 2026-05-01 — HUD overlay strategy: real data wins, sim HUD as fallback

**Choice:** `<Visualizer hudOverride={...} />`. When the override snapshot
is provided, it takes precedence; otherwise the simulation's internal HUD
(driven by SimEngine events) renders. `useRealHud` hook aggregates over
`pathfinder.agent_runs` + `agent_log` and polls the `/api/cost-summary`
endpoint for `cost.per.report`.

**Why:** STREAM-README "HUD counters tick from real cost data via the
existing `app/api/cost-summary/` endpoint Pathfinder publishes (read-only
contract). Counters will read 0 until Stream A's Gate A0 work resumes
ingestion; coordinate timing." Override leaves the canvas simulation alone
(it's still useful for onboarding visual reference) while binding the HUD
to the real cron pipeline.

**Spec reference:** STREAM-README Gate C2.

### 2026-05-01 — Feature-flag-gated D/E clients with mock-by-default

**Choice:** `src/lib/architectClient.ts` and `sourceOnboarderClient.ts` are
typed against the contracts in `src/lib/contracts/{architect,sourceOnboarder}.ts`.
When `VITE_ARCHITECT_API_ENABLED` / `VITE_SOURCE_ONBOARDER_ENABLED` is "true"
AND the corresponding base URL is set, the client `fetch()`s the real API.
Otherwise it returns mock fixtures shaped against the same contract.

**Why:** Phase 2 spawn rule: "Do NOT block this gate on D/E being done. Ship
the C-side wiring with mocks behind a feature flag or environment-gated swap
so the swap is one-line when D/E land." The flag flip is the only change
needed. Mock fixtures match the projected contract so consuming components
don't branch on mock vs real.

**Spec reference:** STREAM-README Gate C3.

**Drift:** as of 2026-05-01 Stream D and Stream E have not published their
canonical contracts. The `src/lib/contracts/*.ts` files document the shape
Stream C wires against, derived from `SPEC - Architect Agent.md` and
`SPEC - Source Onboarder Agent.md`. When D and E publish, those files are
the single source-of-truth to reconcile against. Every TODO in the
component-side code carries a `TODO[stream-d-contract,...]` /
`TODO[stream-e-contract,...]` marker with the file:line for fast grep.

### 2026-05-01 — Realtime pulse mapping: agent_runs.agent_name → AgentDef.id

**Choice:** `resolveAgentId(agentName, agents)` in LiveSystem.tsx does
case-insensitive exact match → fuzzy substring match → null. When the
mapping fails, no pulse fires; the visualizer simulation continues as-is.

**Why:** `pathfinder.agent_runs.agent_name` enumerates ten cron agents
(`ingestor`, `ranker`, `adjacent`, `verifier`, ...). `SystemConfig.agents`
uses operator-defined ids like `a-ranker` whose `role` reads `Ranker`.
The mapping is loose by design — Stream A may add new agents that don't
have a SystemConfig analogue, and Stream C doesn't gate on perfect
alignment.

## Spec references

- `unicron-platform/src/lib/supabase.ts` — implements STREAM-README Gate C1
  Supabase client section. Drift: none.
- `unicron-platform/src/lib/env.ts` — env validation; documents the four
  Stream C env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_AUTH_REQUIRED`, plus the C3 feature flags). Drift: none.
- `unicron-platform/src/lib/activity.ts` — implements STREAM-README Gate C1
  activity feed (real `pathfinder.agent_log` reads + Realtime). Drift: none.
- `unicron-platform/src/lib/settings.ts` — implements STREAM-README Gate C1
  settings persistence to `unicron.settings`. Drift: none.
- `unicron-platform/src/lib/auth.ts` — implements STREAM-README Gate C1 auth
  flow. Drift: none.
- `unicron-platform/src/components/live/ActivityFeed.tsx` — replaces mock with
  `useActivityFeed`. Drift: minor — the static "Architect" status card now
  derives `status`/`last update` from the feed and shows `proposals: —`
  until Gate C3 wires Stream D's Architect API.
- `unicron-platform/src/components/SettingsContext.tsx` — wires localStorage
  + `unicron.settings` persistence behind the existing `useSettings` API.
  Drift: none — public API unchanged, private persistence added.
- `unicron-platform/src/components/auth/SignInGate.tsx` — sign-in wrapper.
  New file; no prior contract.
- `Pathfinder/supabase/migrations/0090_unicron_settings.sql` — creates the
  `unicron` schema + `unicron.settings` table. Drift: none.
- `unicron-platform/src/lib/agentRuns.ts` — implements STREAM-README Gate C2
  Realtime subscription on `pathfinder.agent_runs`. Drift: none.
- `unicron-platform/src/lib/hud.ts` — implements STREAM-README Gate C2 HUD
  aggregation. Drift: cost-summary endpoint URL is env-configurable
  (`VITE_COST_SUMMARY_URL`) since the operator UI deploys to a different
  origin than Pathfinder.
- `unicron-platform/src/components/visualizer/Visualizer.tsx` — added
  `hudOverride` prop so Live System can bind the HUD to real Supabase
  aggregates without disturbing the canvas simulation. Drift: none.
- `unicron-platform/src/components/live/LiveSystem.tsx` — replaced
  `<LivingIntelligenceFrame />` with `<Visualizer />` driven by SystemConfig
  + Realtime pulse + real HUD. Drift: deleted iframe variant.
- `unicron-platform/src/components/live/LivingIntelligenceFrame.tsx` — deleted.
- `unicron-platform/public/living-intelligence.html` — deleted.
- `unicron-platform/src/lib/contracts/architect.ts` — published Stream D
  contract (decomposition + proposals + approve/dismiss). Update this file
  when D publishes the canonical shape.
- `unicron-platform/src/lib/contracts/sourceOnboarder.ts` — published Stream E
  contract (analyze + deploy). Update this file when E publishes.
- `unicron-platform/src/lib/architectClient.ts` — feature-flag-gated client
  (mock-by-default). Tests at `architectClient.test.ts` cover both modes.
- `unicron-platform/src/lib/sourceOnboarderClient.ts` — feature-flag-gated
  client (mock-by-default). Tests at `sourceOnboarderClient.test.ts`.
- `unicron-platform/src/components/onboarding/ArchitectThinking.tsx` —
  decomposition flow now drives the type-on animation from the contract's
  `lines[]` rather than reading mocks directly. Drift: cost line still
  filtered by `settings.showInternalCostMetrics`; documented in this file.
- `unicron-platform/src/components/inbox/ArchitectInbox.tsx` — proposals
  load via `listProposals()`; approve/dismiss go through the client.
  Fallback client-side apply preserved for the mock path.
- `unicron-platform/src/components/inbox/ProposalCard.tsx` — typed against
  the contract Proposal; dot color derived from category.
- `unicron-platform/src/components/live/panels/AddSourcePanel.tsx` — analyze
  + deploy go through the Stream E client; UI flow unchanged.

## Post-deploy checklist

1. After `0090_unicron_settings.sql` is applied, add `unicron` to the
   project's "Exposed schemas" in Supabase dashboard
   (Settings → API → Exposed schemas), so the JS client can issue
   `supabase.schema('unicron').from('settings')` queries against PostgREST.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel
   project env (or wherever the operator UI deploys).
3. Optional: set `VITE_AUTH_REQUIRED=true` in non-local environments to
   enforce magic-link sign-in.
