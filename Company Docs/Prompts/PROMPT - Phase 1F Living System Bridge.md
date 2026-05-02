# PROMPT — Phase 1F: Living System Bridge

Paste-ready Claude Code launch prompt. Generated 2026-05-02. Run AFTER at least one of M1 / M2 / M4 / M5 merges (need a verifying agent to test against). Coordinates with the Pathfinder Cowork chat.

## Goal

Ship the bridge that makes operator-verified work in Metacron visible to Zedcor in Pathfinder in real time. Per SPEC §7. Two sides:

1. **Pathfinder side (Pathfinder chat owns):** `pathfinder.agent_verifications` migration + customer-facing `ActivityTicker` component subscribed via Supabase Realtime.
2. **Metacron side (this sprint):** when operator clicks Verify in any agent modal, write a `pathfinder.agent_verifications` row in addition to updating `unicron.agent_dispatches`.

This is the demo moment from SPEC §12: open Metacron + Pathfinder side by side, run Coverage Expansion in Metacron, watch Pathfinder customer dashboard ticker reflect the verification.

## Authoritative spec

`Company Docs/Specs/SPEC - Agent Console (Metacron).md` §6 + §7 + §8 + §12

## Pre-flight reading

- `Company Docs/Specs/SPEC - Agent Console (Metacron).md`
- `MEMORY/operator-todos/2026-05-02-pathfinder-needs-verification-bridge.md` (filed by Phase 0.5)
- Phase 0.5 outputs
- Phase 1 stream outputs (M1/M2/M4/M5 — at least one merged)
- Pathfinder chat's MEMORY notes for the corresponding sprint (read `MEMORY/zedcor-sprint-live-status.md` and similar files for Pathfinder chat's status)

## Coordination protocol

This sprint touches BOTH chats' territories. Two paths:

**Path A (default — coordinated):** Pathfinder chat ships migration + ActivityTicker first; Metacron chat picks up and adds the write side. Sequence:
1. Confirm `MEMORY/operator-todos/2026-05-02-pathfinder-needs-verification-bridge.md` has been picked up by Pathfinder chat (look for matching entry in `MEMORY/progress.md` under any `## Stream P` heading)
2. Confirm `pathfinder.agent_verifications` exists in Supabase (verify via `list_tables` MCP or SQL)
3. Confirm Pathfinder customer dashboard has `ActivityTicker` deployed (curl `unicron.systems/pathfinder/` and grep for the component)
4. Then proceed with Metacron-side write path

**Path B (escalation — Kyle authorizes single-PR cross-chat):** if Kyle in chat says "ship it both sides," Metacron chat ships the migration AND the ActivityTicker AND the write path in one PR. Default is Path A.

## In-scope files (Path A — Metacron-side write only)

- `unicron-platform/src/lib/agentConsoleClient.ts` (extend) — `verifyDispatch` now ALSO writes a `pathfinder.agent_verifications` row alongside the `unicron.agent_dispatches` update
- `unicron-platform/src/components/agent-console/AgentResult.tsx` (extend) — Verify action surfaces "Customer ticker updated" toast on success
- `unicron-platform/__tests__/agent-console/verification-bridge.test.ts` (new — mocks `pathfinder.agent_verifications` write)
- `MEMORY/operator-todos/2026-05-02-pathfinder-needs-verification-bridge.md` — mark as Done

## Out of scope (Path A)

- Pathfinder customer UI (Pathfinder chat owns)
- `pathfinder.agent_verifications` migration (Pathfinder chat owns)
- Per-agent ticker copy customization (use a generic `summary` field for Phase 1F; per-agent voice is a Phase 3 polish)

## In-scope files (Path B — only if Kyle escalates)

Add to Path A's list:
- `Pathfinder/supabase/migrations/<next>_agent_verifications.sql` (new — pathfinder.agent_verifications per SPEC §8)
- `Pathfinder/components/dashboard/ActivityTicker.tsx` (new) — Realtime subscription + animated entry
- `Pathfinder/app/dashboard/page.tsx` or equivalent — mount ActivityTicker
- `Pathfinder/__tests__/dashboard/activity-ticker.test.tsx` (new)

## UX requirements (per SPEC §7 + §12)

**Metacron side:**
- On Verify in any agent modal: write `unicron.agent_dispatches` (verified) + `pathfinder.agent_verifications` row in same transaction or sequential calls (transaction preferred — surface failure mode if cross-schema transaction not supported)
- Toast: "Verified — customers will see this update in their activity ticker"

**Pathfinder side (Path B only, otherwise documented for Pathfinder chat):**
- Activity ticker on Zedcor dashboard
- Subscribed to `pathfinder.agent_verifications` filtered by `customer_org_id='zedcor'`
- New row → animated entry: "{summary} · verified by {operator name} just now"
- Stale entries fade after 7 days

## Auto-merge criteria (Path A)

ALL of:
- Verify action writes `pathfinder.agent_verifications` row successfully
- Pathfinder customer dashboard's `ActivityTicker` (already deployed) receives the row via Realtime within 3s (smoke test from preview)
- `pnpm --filter unicron-platform typecheck` + `test` clean
- `metacron` deploy state=READY
- No regression in `pathfinder` or `unicron-systems` main deploys

Path B adds: Pathfinder customer dashboard renders ticker with Realtime updates; existing customer dashboard tests pass.

## Auto-revert triggers

- `metacron` deploy fails three consecutive pushes
- `pathfinder` main deploy regresses
- Cross-schema write fails consistently (RLS, permission, transaction issue)

## Hard halt conditions

- `pathfinder.agent_verifications` doesn't exist AND Path A is the chosen path (wait for Pathfinder chat; surface to Kyle if no progress visible)
- Cross-schema transactions not supported by the Supabase client (fall back to sequential write with explicit failure handling; document in PR)

## Kanban hygiene

Card: **"Living System Bridge (verification → Pathfinder ticker)"** — CREATE on Metacron Kanban (`collection://07970e18-984a-4034-b491-cde76b9b1bad`).

If Path B: also create matching card on Pathfinder Kanban (`collection://1e675609-7a89-47ff-8edb-f8ed9ccd38c1`) titled **"ActivityTicker (operator-verification surface)"**.

At run start: `In Process`. At end: `Deployed` / `Review` / `Bug Fixes` per outcome. NEVER `Verified`.

On merge, append to card content: `Implemented at <commit-sha> · merged at <ISO timestamp>`.

## PR description requirements

- Path taken (A or B)
- Verbatim test output (count, names)
- `metacron` and `pathfinder` deploy URLs + states
- Screenshot of side-by-side Metacron Verify + Pathfinder ticker update (the demo moment)
- Verbatim Realtime smoke test output (write `pathfinder.agent_verifications` → receive in customer dashboard subscription)
- Verbatim cross-schema transaction or sequential-write outcome with timing

## On completion

Append to `MEMORY/progress.md` under `## Stream M-Bridge (Metacron) — 2026-05-02`:
- Path taken
- Cross-chat coordination notes
- Demo moment confirmation (the SPEC §12 sequence executed once end-to-end)

Begin.
