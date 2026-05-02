# Audit — unicron-platform

Operator-facing UI for Unicron Systems. Vite + React + TypeScript + Tailwind. Renders the living-intelligence visualizer driven by `SystemConfig` from onboarding + Architect Inbox proposals.

This file accumulates findings about how the platform UI matches (or doesn't) the canonical spec + sibling streams. Append findings under dated subheadings.

---

## Stream C findings — 2026-05-01

Discovered during the Stream D post-merge reconciliation pass (`fix/stream-c-architect-contract` branch). Stream C wired against projected Architect contracts that don't fully match Stream D's actual ship. The contract file (`unicron-platform/src/lib/contracts/architect.ts`) has been reconciled; the UI components still reference the legacy projected types and need follow-up adapter work.

### Drift summary (between Stream C's projection and Stream D's actual)

| Surface | Stream C projection | Stream D reality | Adapter cost |
|---|---|---|---|
| Decomposition request body | `{ buyerPain }` | `{ buyer_pain_prompt, vertical_id?, customer_org_id?, existing_vertical_id?, constraints?, trigger? }` | trivial — wrap `buyerPain` → `buyer_pain_prompt`. |
| Decomposition response shape | `{ sessionId, lines: DecompositionLine[], recommendedConfig: SystemConfig, confidence, costUsd? }` | `{ proposal_id, session_id, architecture, reasoning: string[], cost_usd, duration_ms, status }` | medium — UI must build `DecompositionLine[]` from `architecture` + `reasoning[]`, and adapt `architecture` → `SystemConfig`. |
| Inbox proposal shape | `Proposal { id, category: 'sources'\|'agents'\|'tuning', type (label), time (relative), headline, body, details: [{k,v}], apply? }` | `ArchitectProposalRow { id, session_id, vertical_id, type: 'vertical_configuration'\|'source_discovery'\|'agent_proposal'\|'tuning_suggestion', headline, body, details: jsonb, confidence, status, resolved_at, resolved_by_user_email, resolution_notes, source_input_summary, created_at }` | medium — type→category mapping per filter-pill rule (Sources = `source_discovery`; Agents = `agent_proposal` ∪ `vertical_configuration`; Tuning = `tuning_suggestion`); `created_at` ISO → relative-time string client-side. |
| Approve / dismiss | `POST /proposals/:id/approve` returning `{ ok, systemConfig }` | **No HTTP endpoint shipped.** Update `architect_proposals.status='approved'\|'dismissed'` via supabase client + dispatch side-effects locally. | non-trivial — Stream C must own the supabase write + the side-effect dispatch (Source Onboarder kick, agent install) until D ships an endpoint. |
| `apply` patch | Optimistic client-side `addSource`/`addAgent`/`updateAgent` patch | Not exposed by D | acceptable as a mock-mode-only convenience; production approval doesn't need it. |
| Streaming "thinking" | `lines[]` rendered type-on (server-sent stream implied) | `reasoning[]` returned at completion (no SSE) | UI animation must drive itself off the finished array, not a server stream. |

### Resolution options (recommendations, not auto-applied)

1. **Adapter layer in `architectClient.ts`** — keep the existing component imports stable by pushing all conversions into `architectClient.ts`. Each `postDecomposition` / `listProposals` returns the legacy UI types; the function body fetches Stream D and converts. Lowest blast radius. Recommended.

2. **Migrate per-component** — `ArchitectInbox.tsx`, `ProposalCard.tsx`, `ArchitectThinking.tsx` each migrate to canonical types over time. More invasive but ends with the legacy types deletable.

3. **Hybrid** — adapter in `architectClient.ts` short-term to unblock the merge; per-component migration as cleanup later.

The reconcile PR (`fix/stream-c-architect-contract`) only updates the contract file and keeps legacy types as `@deprecated` aliases. UI changes are out-of-scope for that PR per the user's "do not auto-redesign" constraint.

### UX gaps where Stream C's projection assumes a flow Stream D doesn't expose

#### a) Real-time "thinking" stream

Stream C's `ArchitectThinking.tsx` was designed around the assumption that Stream D would return a stream of `DecompositionLine` events the UI could render type-on with sub-second pacing (mocked via `mockDecompLines` walking through preset strings).

Stream D returns a single completed response with a `reasoning: string[]` array (one summary per assistant turn). The UI can still render type-on, but the animation pacing is now client-controlled (no server-side throttling). Visually identical, structurally simpler. No change required to UX.

If a true streaming response surface is needed (e.g., for "live thinking" feel during a 30-second decomposition), Stream D would need to add a Server-Sent-Events variant of `/api/architect/decompose`. That's a Phase 2.5 enhancement, not a Phase 2 blocker.

#### b) Approve flow

Stream C's `ArchitectInbox.tsx` calls `approveProposal(id)` which (in mock mode) returns the new `SystemConfig` for optimistic application. Stream D doesn't ship an approve endpoint.

The pragmatic fix: Stream C uses the supabase service-role client (already available — Stream B wired it for Pathfinder reads) to write `architect_proposals.status='approved'`, then dispatches the actual side-effect:
- For `type='source_discovery'`: call the Source Onboarder dispatch (Stream E owns this — endpoint TBD).
- For `type='agent_proposal'` / `type='vertical_configuration'`: write to local SystemContext mutators (no production-side mutation needed yet — Phase 2 is single-vertical).
- For `type='tuning_suggestion'`: prompt update would write to a per-agent prompt-revision table that doesn't exist yet (this is the same gap captured in `MEMORY/decisions.md` — Phase 2.5 prompt-swap infra).

#### c) Apply patches

`Proposal.apply` is a client-only optimistic-update sugar. Stream D doesn't speak the language. Stream C should keep `apply` as a mock-mode-only path and use the supabase status-write path in production.

#### d) Filter-pill / category mapping

Stream C's `ProposalCategory = 'sources' | 'agents' | 'tuning'` is a UI concern, not a wire type. The mapping from Stream D's `type` is documented in the canonical contract section. Each card adapter should derive `category` from `type` at render time.

### Action items

- [ ] PR `fix/stream-c-architect-contract`: contract reconciled, legacy aliases retained. **Pending Kyle's merge.**
- [ ] Follow-up PR (Stream C): adapter layer in `architectClient.ts` that fetches Stream D, returns legacy UI types. Delete legacy aliases when the components are migrated.
- [ ] Decide whether to add an SSE variant of `/api/architect/decompose` (Phase 2.5) or live with client-paced type-on.
- [ ] Coordinate with Stream E on the Source Onboarder dispatch endpoint (so Stream C's approve flow can fan out source proposals).

---

## 2026-05-01 (post-Stream-E-merge) — Stream C ↔ Stream E Source Onboarder contract drift

Discovered during PR #39 post-merge verification. Stream C's mocked Source
Onboarder contract (`unicron-platform/src/lib/contracts/sourceOnboarder.ts`,
shipped in PR #35) does NOT match what Stream E actually published in PR #36.
When Stream C is configured to hit the real Stream E API
(`VITE_SOURCE_ONBOARDER_ENABLED=true`, `VITE_SOURCE_ONBOARDER_URL=...`),
every request will fail.

### Drift summary

| Concern | Stream C expects (mocked) | Stream E ships (PR #36) |
|---|---|---|
| **Endpoint shape** | Two endpoints: `POST /analyze` then `POST /deploy` | One endpoint: `POST /api/sources/onboard?sync=1` |
| **Request body** | `{ tab: 'url'\|'api'\|'feed'\|'file'\|'describe', input: string, meta?: Record<string,string> }` | `{ url?: string, description?: string, hint?: 'socrata'\|'rest'\|'rss'\|'json-dump', jurisdiction?: string, poll_frequency_seconds?: number, api_key_env?: string, created_by_user_email?: string }` |
| **Response (success)** | `{ analysisId, jurisdiction, sourceType, detectedAdapter, estimatedDailyVolume, estimatedQualifiedPerDay, fields[], proposedSource, proposedWatcher, confidence, costUsd }` then deploy returns `{ ok, source, watcher, firstEventMs }` | `{ ok, status: 'live'\|'queued'\|'human-assist'\|'declined', source_id?, adapter_kind?, schema?, first_event_at?, ticket_id?, reason?, session_id, cost_usd, duration_ms }` |
| **Operator approval step** | Two-stage: analyze → operator reviews → deploy | One-stage: agent auto-deploys on Tier 1 success; operator reviews via `architect_inbox` ticket only on Tier 2 |
| **Polling for progress** | `analysisId` → poll `/analyze/[id]` (not yet implemented) | `session_id` → poll `GET /api/sources/sessions/[id]` for streaming `reasoning_log` |
| **Async path** | None | Default async mode (no `?sync=1`) returns `{ status: 'queued', request_id }`; UI polls sessions endpoint |

### Stream session-creation conventions Stream C should mirror

When Stream C's UI dispatches Source Onboarder via the real Stream E API
in production (basic-auth required), the architect_sessions row Stream E
writes uses (per session.ts patch in PR #39):
- `session_type='discovery'` (Stream D's CHECK union)
- `trigger='operator_action'` (Stream D's CHECK union)
- `agent_role='source-onboarder'`
- `input_payload` = the onboard request body

Stream C does NOT need to write architect_sessions itself — Stream E owns
that write path. Stream C only needs to consume the session id back out.

### Why the operator UX should change rather than the API

Stream E's one-stage flow is intentional. SPEC §10 calls for an "architect
is investigating..." live panel that streams reasoning, then either lands
on a confirmation card OR on a human-assist ticket. There is no
spec-required "operator reviews and approves before deploy" gate for Tier 1
— that's a Stream C UX assumption that doesn't match the spec. Stream C
should:
1. Replace the two-step `analyze → deploy` flow with a single submit + live
   reasoning_log poll.
2. Map the response to the existing UI surfaces:
   - `status='live'` → confirmation card (uses `source_id`, `adapter_kind`, `schema`, `first_event_at`).
   - `status='human-assist'` → "needs your help" card linking to the
     architect_inbox ticket (`ticket_id`).
   - `status='declined'` → decline card with `reason`.
3. Move the "operator approval before deploy" pattern over to **Coverage
   Expansion goals** (per SPEC - Coverage Expansion Agent.md §6 — that
   agent's two-stage `draft → estimate → approve → run` IS the correct
   home for two-stage UX).

### UX redesign decision (deferred to product review)

Stream C UI was speculatively designed around two-phase analyze/deploy that Stream E doesn't expose. Single-phase async is canonical. UX redesign deferred to product review: (a) Stream C accepts single-phase + removes preview, or (b) Stream E adds /api/sources/analyze for inference-without-write to preserve preview UX.

The contract file `unicron-platform/src/lib/contracts/sourceOnboarder.ts` was reconciled to Stream E's canonical shape (PR opened 2026-05-01). Legacy two-phase types kept as `@deprecated` aliases so `AddSourcePanel.tsx` and `sourceOnboarderClient.ts` continue to compile while (a)/(b) is decided.

### Stream C ↔ Stream E Coverage Expansion contract

Stream E ships these endpoints (PR #36) that Stream C has NOT yet wired:
- `POST /api/coverage/goals` — create a draft + queue estimate
- `GET /api/coverage/goals` — list (operator UI Coverage tab)
- `GET /api/coverage/goals/[id]` — goal + candidates detail
- `POST /api/coverage/goals/[id]/run` — approve + dispatch

These match the SPEC §7 UX flow exactly. No drift; pure missing implementation
on Stream C side.

### Stream C ↔ Stream E Tier 2 human-assist contract

Stream E ships (PR #36):
- `GET /api/architect/inbox?category=source-discovery` — ticket list
- `POST /api/architect/inbox/[id]/resolve` — three modes (manual / dismiss / resume)

Stream C's existing `ArchitectInbox` component should filter by
`category=source-discovery` for the Source Onboarder slice and
`category=architect-proposal` for Stream D's slice. Both surfaces share
the same table and component; the discriminator splits them.

### Action items

- [ ] **Production deploy outage (root cause identified — PR #43 in flight):** Vercel deploys for PRs #37–#40 failed at install with `ERR_PNPM_OUTDATED_LOCKFILE`. Cause: PR #38 ran `npm install` instead of `pnpm install`, committing `Pathfinder/package-lock.json` (npm lockfile in pnpm project) and leaving `pnpm-lock.yaml` out of sync with the 6 new deps. PR #39 fixed the pnpm lockfile; PR #43 deletes the stray npm lockfile and gitignore-guards against recurrence.
- [x] **Stream C Source Onboarder contract reconciliation (DONE — PR opened 2026-05-01):** Contract file rewritten to Stream E canonical shape; legacy two-phase types preserved as `@deprecated` aliases pending UX decision (a)/(b) above. `AddSourcePanel.tsx` + `sourceOnboarderClient.ts` still compile against the legacy aliases.
- [ ] **Stream C Coverage Expansion wiring:** Add Coverage tab + client per Stream E's `/api/coverage/*` endpoints.
- [ ] **Stream C Architect Inbox category filter:** Component already exists from Stream D's PR #37; add the `category` query param to scope to source-discovery / architect-proposal.
