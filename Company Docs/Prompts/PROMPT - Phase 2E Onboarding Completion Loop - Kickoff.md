# PROMPT — Phase 2E Onboarding Completion Loop Kickoff (paste-ready)

Paste into a fresh Claude Code session AFTER Phase 2A, 2C, AND 2D have all merged. This stream ties everything together — depends on routing/auth (2A), per-org agent dispatch (2C), and tailored UI rendering (2D).

Sequential — do not parallelize with anything.

---

## Pre-read

1. `Company Docs/PRD/PRD - Phase 2 Tailored Pathfinder.md`
2. `Company Docs/Specs/SPEC - Phase 2E Onboarding Completion Loop.md` — full scope + flow diagram.
3. Verify all dependencies merged:
   - Phase 2A: `pathfinder.organizations`, `org_memberships`, `[slug]` routing, magic-link auth.
   - Phase 2C: per-org agent dispatch, `ingestOrgFunction`, source registry.
   - Phase 2D: tailored UI renders for any org from `architecture` JSON.
4. Existing Metacron Approve/Deploy modal flow (post PR #156).
5. Inngest event names already in use (avoid collision).
6. Supabase Auth magic-link template config (operator-todo if not yet customized).

## Hard constraints

- No deletes, no time estimates, no cost caps, multi-Vercel verification, no auto-promotion to Verified.
- Cross-app boundary: this PR touches both `unicron-platform/` (Metacron — Approve/Deploy → trigger event) and `Pathfinder/` (Inngest functions, invite handler). Path B precedent: justify in PR.
- Verbatim evidence in PR description (paste actual Inngest run logs, email send logs, dashboard screenshots).
- Use a fresh worktree: `git worktree add .claude/worktrees/phase-2e-onboarding-loop feat/phase-2e-onboarding-loop`.

## Phase A — Investigation

```
Investigate to scope Stream 2E:

1. Map current Metacron Approve/Deploy flow: ApproveDeployModal → /api/organizations write → state update.
2. Identify where to insert Inngest.send({ name: 'org.created' }) trigger after successful org create.
3. Confirm Inngest project on Pathfinder side has the new event names available.
4. Find current Supabase Auth magic-link signInWithOtp implementation. Is templating customized?
5. Identify where org status is read in Metacron Customers tab. Need to render new states (setting_up, first_run, ranking, awaiting_threshold, ready_invite_pending, invite_sent, active).
6. Check pathfinder.organizations schema for status, customer_email, last_invite_sent_at columns. Add via migration if missing.

Report findings.
```

## Phase B — Schema additions (if needed)

If `pathfinder.organizations` lacks `status`, `customer_email`, or `last_invite_sent_at`:
1. `list_migrations` for live max+1.
2. Migration adds missing columns with defaults.
3. **HALT FOR REVIEW**: print SQL, await Kyle's apply confirmation, then `apply_migration`.

## Phase C — On-demand first-run Inngest

1. Create `Pathfinder/inngest/functions/firstRun.ts` per spec: `ingestOrgFunction` listening on `org.created`.
2. Iterates over `org.architecture.sources`, dispatches each available adapter.
3. Updates `org.status` at each phase: `first_run` → `ranking`.
4. Emits `org.ranking-complete` when ranker finishes.

## Phase D — Threshold check + invite

1. Create `checkAndInviteFunction` per spec: listens on `org.ranking-complete`, counts verified leads.
2. If `< 3`, set status `awaiting_threshold`, exit.
3. If `>= 3`, send magic link via Supabase Auth, set status `invite_sent`, log to `pathfinder.invite_log`.

## Phase E — Metacron triggers

1. After successful `POST /api/organizations` from ApproveDeployModal, call `Inngest.send({ name: 'org.created', data: { organization_id } })`.
2. Customers tab renders status badge: pending state machine per spec. Pull status via `GET /api/organizations/:slug` polling (or Realtime subscription if available).
3. Resend-invite button on Customers tab calls `POST /api/organizations/:slug/resend-invite`.

## Phase F — Email template

1. Configure Supabase Auth magic-link template in dashboard with placeholders (operator-todo, document for Kyle).
2. Or, if customization not available, use default template with redirect URL containing slug.
3. Document the chosen approach in PR.

## Phase G — Tests

- Unit: `ingestOrgFunction` with mock org.
- Unit: `checkAndInviteFunction` threshold logic.
- Integration: full flow with seeded test org → ingestion stub → threshold met → mock magic-link send → status updated.
- Manual smoke (in PR description): run end-to-end with a fresh test org (e.g. "DemoCorp") through Metacron → verify magic link arrives in test inbox → click → lands on `/democorp` dashboard.

## Phase H — Demo gate verification

The Realberry/Chad demo gate (per PRD acceptance):

1. Run Architect on the simplified Realberry prompt (in Cowork chat).
2. Approve & Deploy in Metacron with name "Realberry", slug "realberry", customer_email = test address.
3. Verify status moves through state machine.
4. Magic link arrives at test address.
5. Click link → land on `/realberry` → tailored UI renders, business summary at top, ≥3 verified leads visible.
6. Operator verifies a lead in Metacron → Realberry's Activity Ticker updates within 1s (Phase 1F bridge).

Capture screenshots at each step. Include in PR description as evidence.

## Phase I — PR open + verification

1. PR titled `Phase 2E: Onboarding Completion Loop — Architect approve to live customer dashboard`.
2. PR body: full demo-gate evidence (screenshots, Inngest logs, email, ticker).
3. Multi-Vercel verification.
4. Worktree cleanup.

## Failure modes — halt + report

- Phase 2A, 2C, or 2D not merged at branch time.
- Inngest events fail to fire or lose data.
- Magic-link emails fail to deliver to test address (Supabase Auth SMTP issue).
- Demo-gate verification fails — Realberry dashboard does not render tailored content, or tickers don't update.
- Cross-org RLS leakage detected during demo run.

## Kanban hygiene

- Phase A start: Cowork moves Phase 2E card → In Process.
- PR merge: Cowork moves card → Deployed. CC reports merge SHA + ISO timestamp.
- Demo gate is the human-only Verified promotion — Kyle moves card to Verified after Chad demo lands.

End.
