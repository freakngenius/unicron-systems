# PROMPT — Connector Framework Sprint

Paste-ready autonomous launch prompt for `Company Docs/Specs/SPEC - Connectors (Slack, Teams, HubSpot).md`. Same v3 autonomous safeguards.

NOTE: As of 2026-05-02, this sprint has SHIPPED 8 PRs across all 4 phases. 5 streams deferred (C-3B HubSpot webhooks, C-3C field/stage mapping UI, C-3D nightly recon, C-4B operator dashboard, C-4C audit log surfacing). Re-read before re-launching.

---

CONNECTOR FRAMEWORK SPRINT — AUTONOMOUS MODE

You are running a 3-phase connector implementation. Same v3 autonomous safeguards: auto-merge with rollback tags, auto-revert on Vercel ERROR or post-deploy smoke fail, live status doc, hard halt conditions. Phased execution lets Kyle gate-review between phases.

## Read first

1. `Company Docs/Specs/SPEC - Connectors (Slack, Teams, HubSpot).md` (primary)
2. `Company Docs/PRD/PRD - Pathfinder Form-Fit for Zedcor.md`
3. `Company Docs/Plans/00 - TUESDAY DEMO PLAN.md` (Tuesday-stub scope only)
4. `MEMORY/progress.md`, `decisions.md`, `conventions.md`, `learnings.md`, `audit-pathfinder.md`
5. Cowork-managed memory feedback rules (auto-loaded):
   - `feedback_kanban_column_rules.md`, `feedback_kanban_auto_update.md`
   - `feedback_multi_vercel_per_repo.md`
   - `feedback_no_time_estimates.md`, `feedback_prompts_no_estimates_or_caps.md`
   - `feedback_token_rigor.md`
   - `feedback_no_deletes.md`

Pre-flight: confirm Pathfinder Vercel deploy READY on main HEAD. Confirm marketing-site (`unicron-systems`) state. Halt if Pathfinder is not green.

## Hard auto-merge criteria (ALL must be true)

1. CI green
2. Local pre-flight matches: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test` from Pathfinder/ AND repo root
3. No merge conflicts
4. PR body has verbatim evidence
5. Stream-specific eval/smoke per the SPEC's per-section acceptance criteria
6. Additive migrations only
7. Multi-Vercel state captured before merge

**Connector-specific safeguard:** for any feature touching token storage or OAuth, MUST include a security review checklist in the PR body (token encryption verified, scope minimization confirmed, state validation enforced). If any item fails, halt for human review.

## Auto-revert triggers

Same v3 plus:
- Token leak indicator in logs (regex match on common token formats)
- Cross-tenant data leakage in audit log
- Customer-facing message sent to wrong channel/user

## Pre-merge tagging

```
git tag -a "pre-merge/connectors/${stream}/${gate}" origin/main -m "Known-good before #${PR}"
git push origin --tags
```

## Hard halt conditions

Same v3 plus:
1. Token leak indicator
2. Cross-tenant data leakage
3. Customer-facing message sent wrong
4. Phase gate review pending — STOP at end of phase, do not auto-advance

## Kanban hygiene (per `feedback_kanban_auto_update.md`)

At start of each gate: card → "In Process" via `notion-update-page`.
At end of each gate: card → "Deployed" (if shipped + deployed), "Review" (PR open), "Bug Fixes" (parked needing fix), or "Not Yet Started" (deferred).
Never to "Verified" — Kyle-only.

Pathfinder Kanban data source: `collection://1e675609-7a89-47ff-8edb-f8ed9ccd38c1`

## Phase 0 — Tuesday demo stub (SHIPPED PR #61)

Status: complete. Settings page renders three connector tiles. Slack Connected via existing webhook. Teams + HubSpot show Connect placeholders.

## Phase 1 — Foundation + Slack OAuth (SHIPPED PR #62, #63, #64)

Status: complete.
- Stream C-1A — Connector framework (foundation, schema migrations 0105-0107)
- Stream C-1B — Slack OAuth + slash commands + Block Kit + reaction feedback
- Stream C-1C — Settings UI replacement + routing rules editor

## Phase 2 — Microsoft Teams parity (SHIPPED PR #66, #69)

Status: complete (pending operator setup of Teams app).
- Stream C-2A — Teams OAuth + Bot Framework wiring (Adaptive Cards, @mention, DM)
- Stream C-2B — Per-customer Slack/Teams manifest generation

## Phase 3 — HubSpot bi-directional (Phase 3A SHIPPED PR #68)

Status: foundation complete. Phases 3B-3D deferred.
- Stream C-3A — HubSpot OAuth + bulk sync foundation (migration 0108) [SHIPPED]
- Stream C-3B — HubSpot webhook subscriptions + outbound push [DEFERRED]
- Stream C-3C — Field/stage mapping + conflict resolution UI [DEFERRED]
- Stream C-3D — Nightly reconciliation cron [DEFERRED]

## Phase 4 — Productization polish

- Stream C-4A — Customer onboarding wizard [SHIPPED PR #67]
- Stream C-4B — Operator connector health dashboard [DEFERRED to Metacron chat]
- Stream C-4C — Audit log + sync history surfacing [DEFERRED]

## Operator-side env vars required for live functionality

1. Slack OAuth: SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_SIGNING_SECRET
2. Teams (Microsoft Entra app): TEAMS_APP_ID, TEAMS_TENANT_ID, TEAMS_CLIENT_SECRET, TEAMS_BOT_ID, TEAMS_BOT_PASSWORD
3. HubSpot OAuth: HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET
4. Connector framework: CONNECTOR_TOKEN_KEY (32+ byte hex), CONNECTOR_OAUTH_STATE_SECRET (or fallback to CRON_SECRET)

Documented in `MEMORY/operator-todos/2026-05-02-c2a-teams-operator-setup.md` and similar.

## Live status doc

`MEMORY/connector-sprint-live-status.md` updated at every gate.

## Notification protocol

SLACK_WEBHOOK_URL preferred; fallback to `MEMORY/connector-sprint-notifications.md`.

## Phase gate review

After each phase merges, write phase report to `MEMORY/connector-sprint-phase-N-report.md`. Kyle gates the next phase.

## When to re-launch

If/when the deferred streams (C-3B, C-3C, C-3D, C-4B, C-4C) need to ship, re-launch with this prompt. The completed phases can be skipped via the "Status: complete" markers above.

For Phase 3B HubSpot webhooks specifically: requires operator-side webhook subscription registration in HubSpot dashboard + an inbound endpoint at `/api/connectors/hubspot/webhook`. Documented in the SPEC.

## Hard constraints

- Don't `rm`, `git clean`, `git reset --hard`, or wipe uncommitted work (per `feedback_no_deletes.md`)
- Commit after every gate before branch switches
- Don't bypass auto-merge criteria
- Don't auto-advance between phases without Kyle's gate review

When ready, post start ping. Then begin from the appropriate phase per the status above.
