# SPEC: Funder Onboarding Build (Pathfinder organization #3)

**Status:** Approved for autonomous build. 2026-05-20.
**Owner:** Cowork (Pathfinder chat). Executed by Claude Code.
**References:**
- Blueprint: `Pathfinder/Pathfinder-Funder-Blueprint.md`
- Architecture JSON: `Pathfinder/Pathfinder-Funder-Architecture.json`
- Platform specs: `Company Docs/Metacron/SPEC - Phase 2A..2E` and `SPEC - Pathfinder Build-Out Pass.md`
- Launch prompt: `Pathfinder/Pathfinder-Funder-Claude-Code-Kickoff.md`

This spec turns the blueprint into an executable, autonomous build. The blueprint covers what Funder is and why it is onboarded as organization #3, not a fork. This spec covers how the build runs, what each stage delivers, and the safeguards that let it run end to end without a human in the loop while protecting the live Zedcor customer.

---

## 0. Mission

Build, test, and deploy Funder onboarding end to end as a single autonomous run. Funder is Pathfinder organization #3 (after Zedcor and Realberry). It is onboarded as a row in `pathfinder.organizations` carrying the architecture JSON, plus the platform work required for that org to run end to end: source adapters, agent reconfiguration, the generic-org rationale, the Weekly Deal Memo, and the schema-driven dashboard. The run completes when `/funder` is live in production producing real verified opportunities and a Weekly Deal Memo, with Zedcor and Realberry unregressed.

---

## 1. Operating model for this build

This is an autonomous sprint that runs to completion without human input. It builds on an isolated integration branch so it cannot touch the live Pathfinder product.

**Isolation and merge model.** All Funder work happens on a long-lived integration branch, `funder-onboarding`, created off `origin/main`. The run auto-merges each stage into `funder-onboarding` and never commits to `main`. `funder-onboarding` gets its own Vercel branch deployment with its own URL; that URL is Funder's home for the build. The production deployment, `main`, and the live Zedcor surface are never touched by the run. The single merge to `main` happens once, at the end, as one human-reviewed pull request.

This resolves the conflict with `Pathfinder/CLAUDE.md` ("never commit to main directly, never merge your own PR"). The run never commits to `main` and never self-merges a pull request. Stage integration is a plain `git merge` of a stage branch into `funder-onboarding`, not a pull request. The only pull request in the run is `funder-onboarding` into `main` at the end, which a human reviews and merges.

**Autonomous, no pauses.** The run executes stages 1 through 10 in order with no human input. A stage self-verifies and auto-merges into `funder-onboarding` when its criteria in Section 3 are met. The run stops only on a hard-halt condition (Section 3), which is a short list, because the isolation means a regression cannot reach the live product.

**Plan-first inside the run.** Stage 1 is a no-code platform audit. It writes a findings-and-plan document, then the run continues using those findings. Evidence-first, not human-gated.

**Real data versus synthetic.** The opportunities Funder surfaces come from real public-data source adapters (IRS filings, ProPublica, EA Forum, and so on). Those are real from day one. The only synthetic element is the portfolio of orgs Funder already funds, used by the adjacency-mapper for warm-intro detection. The build seeds a clearly tagged synthetic portfolio so adjacency has data to run against. Real grantee data swaps in later through a documented path (Section 5). Adjacency degrades gracefully with synthetic data; it does not block the run.

**Zedcor and Realberry insulation.** Funder code paths are gated by `organization_id`, and the run works on an isolated branch, so the two existing orgs are insulated twice over: by data scoping and by git isolation. The build must still not modify the Zedcor-owned paths in Section 3, and it still runs the existing-customer regression check each stage. A regression does not halt the run; it is logged as a blocker for the final main-merge.

---

## 2. Resolved defaults for the autonomous run

The blueprint lists 10 open decisions. So the run does not stop, each is resolved here with a default. Kyle can redline any of these; absent a redline, the build uses them.

1. **Naming.** Build with `slug=funder`, `display_name="Funder"`, `customer_org_id="funder"`. Real customer name swaps in later.
2. **Biosecurity dual-use.** Biosecurity opportunities are surfaced and included in the memo, tagged `compliance_flag=biosecurity-review`. They are excluded from auto-generated outreach drafts. The compliance filter gains a biosecurity branch alongside the existing SEC branch.
3. **Founder-departure signals.** Out of v1. No clean public data path. No LinkedIn job-change watcher is built.
4. **Crunchbase.** Out of v1. Paid, not provisioned.
5. **Warm-intro graph.** The adjacency-mapper builds the public founder talent graph only. The private funder-to-founder second-degree graph is deferred.
6. **Funder 990 lag.** `custom-funder-990-filings` is built at priority 5 and its output is treated as enrichment context, not a timely trigger.
7. **Mission-locked for-profit detection.** v1 includes best-effort detection (business-license source plus a qualifier heuristic). Full PBC and mission-lock-LLC detection is not guaranteed.
8. **Lead table naming.** Stage 1 resolves `projects` versus `leads`. The build follows the live codebase.
9. **Score scale.** Stage 1 resolves the 0-100 versus 0-1 mismatch. The ranker and verifier reconcile to one scale, in the generic path only.
10. **Real portfolio data.** Build on a synthetic, clearly tagged portfolio. Real public-data opportunities flow from the adapters regardless. Documented swap point in Section 5.

---

## 3. Global safeguards

### Branch and merge model

- All Funder work happens on a long-lived integration branch, `funder-onboarding`, created off `origin/main` (`git fetch origin` first, then branch off `origin/main`).
- Stage work happens in worktrees on stage branches off `funder-onboarding`. Never check `funder-onboarding` out in the main working directory. Never touch `ci-billing-test` or the untracked work in the repo.
- When a stage meets the auto-merge criteria below, its stage branch is merged into `funder-onboarding` with a plain `git merge`. This is not a GitHub pull request and not a merge to `main`.
- `funder-onboarding` is pushed after each stage. Its Vercel branch deployment is Funder's URL for the build.
- `main`, the production deployment, and the live Zedcor surface are never touched by the run.
- The only GitHub pull request in the run is opened at the end: `funder-onboarding` into `main`. A human reviews and merges it. The run does not merge it.

This honors `Pathfinder/CLAUDE.md`: the run never commits to `main` and never self-merges a pull request.

### Auto-merge criteria (a stage merges into `funder-onboarding` when ALL are true)

- `next build` passes.
- Lint and type-check pass.
- Unit and integration tests for the changed area pass.
- The stage acceptance criteria in Section 4 are met, with verbatim command or test output recorded in the commit message and the stage section of the build report.
- No file in the do-not-touch list below was modified.
- Evidence is recorded verbatim. No hypothesis-driven claims. If a fix is applied, the failing output before and the passing output after are both recorded.

### Existing-customer regression check (run every stage, recorded not gating)

Every stage runs the regression check: the `/zedcor` route renders without error, the `/realberry` route renders without error, the Zedcor ranker kernel still scores a fixed sample of existing Zedcor projects with score values unchanged (exact match), and Zedcor crons do not error on a dry run. Because the run is isolated on `funder-onboarding` and never touches `main`, a regression does not halt the run or block the stage merge. It is logged in the build report as a blocker for the final `funder-onboarding` into `main` pull request, so a human resolves it before Funder reaches production.

### Auto-revert triggers (revert the stage merge into `funder-onboarding` and retry the stage if)

- The `funder-onboarding` branch deployment build fails after the stage merge.
- `next build` or type-check breaks on `funder-onboarding` after the stage merge.
- The stage merge breaks a previously passing test.

### Hard-halt conditions (stop the run, write a halt report, do not proceed)

- Any destructive git operation would be required (see HARD CONSTRAINTS in the launch prompt).
- A worktree carries uncommitted changes that cannot be safely stashed.
- Stage 1 finds the per-org dispatch path fundamentally broken, such that a stage cannot be built safely.
- A schema change would require a destructive alteration to an existing table.
- Three consecutive failed attempts on the same stage.

Zedcor and Realberry regressions are not hard-halt conditions, because the run is isolated from `main`. They are recorded for the final pull request.

### Kanban hygiene

Pathfinder Features Kanban only (`https://app.notion.com/p/futuroso/Pathfinder-Features-Kanban-354785c67e7280109d83d06461430f9f`, data source `collection://1e675609-7a89-47ff-8edb-f8ed9ccd38c1`).

- At run start: create one card per stage (Section 4) under Not Yet Started, then move the active stage to In Process when it begins.
- At each stage end: move the card to Deployed when the stage is merged into `funder-onboarding` and the branch deployment is verified, or to Bug Fixes if the stage hard-halted.
- On merge, append to the card: `Implemented at <commit-sha> · merged into funder-onboarding at <ISO timestamp>`.
- Never move a card to Verified. Verified is human-only (Kyle, Keenan, or Curtis).

### Multi-Vercel verification

Pathfinder and unicron-platform are separate Vercel projects in the same repo. This build touches the Pathfinder project only, and only its `funder-onboarding` branch deployment. Verify that branch deployment independently after every stage. Do not assume unicron-platform state. The Metacron-side onboarding UI is out of scope (Section 5).

### Do-not-touch paths (Zedcor-owned and locked)

- `Pathfinder/lib/scoring.ts` (the Zedcor geographic scoring kernel)
- `Pathfinder/lib/zedcor/**`
- `Pathfinder/app/zedcor/**`
- The Zedcor branch of `Pathfinder/app/api/cron/ranker/route.ts` (the fall-through kernel below the Phase 2C dispatch)
- Zedcor-specific logic inside the other cron routes
- `_demo-snapshot-2026-04-30/**`

All Funder scoring, rationale, and dashboard work happens in the generic (non-Zedcor) code path. If a shared file must change, the change must be additive and gated by `organization_id`, and it triggers the existing-customer regression gate.

---

## 4. Stage specs

Ten stages, run in order. Stage 1 produces a plan that may resize stages 2 through 10 based on what the platform audit finds.

### Stage 1: Platform audit (no code, no PR)

**Scope.** Verify the live state of Phase 2A, 2C, 2D, 2E, and the Build-Out Pass against blueprint Section 4. Resolve, with file and line evidence: the lead table name (`projects` versus `leads`); the score scale and threshold mismatch; which agents already dispatch per-org; whether `POST /api/organizations`, the `org.created` Inngest event, `ingestOrgFunction`, and `rankAndVerifyOrgFunction` exist; whether the `/[slug]` schema-driven renderer is wired; the `SOURCE_ADAPTERS` registry location.

**Output.** Write `Pathfinder/docs/PLAN-funder-onboarding.md` with the corrected platform state and the resized stage plan.

**Acceptance.** The plan document exists. Every blueprint Section 4 line is resolved with evidence. No code, no merge.

**Hard-halt.** Only if the per-org dispatch path is fundamentally broken.

### Stage 2: Org record and onboarding path

**Scope.** Ensure `POST /api/organizations` exists and validates an architecture payload (build it if missing, per Phase 2E). Ensure the `org.created` event, `ingestOrgFunction`, and `rankAndVerifyOrgFunction` exist (build or complete per Phase 2E). Persist Funder through the API using `Pathfinder/Pathfinder-Funder-Architecture.json`, with `name="Funder"`, `slug="funder"`, `customer_org_id="funder"`, `status="setting_up"`.

**Targets.** `app/api/organizations/route.ts`, the Inngest org functions, the organizations status column.

**Acceptance.** The Funder row exists. `resolveArchitecture` returns the resolved architecture. `/funder` routes (even if empty). The Phase 2E status state machine transitions function.

### Stage 3: Source adapters

**Scope.** Build the 7 source adapters in priority order per blueprint Section 8: ProPublica Nonprofit Explorer, IRS exempt-org filings, EA Forum, philanthropy trade-press RSS, accelerator cohort pages, business-license issuances, funder 990 filings. Register each in `SOURCE_ADAPTERS`. All writes are org-scoped to Funder. A scraping source that proves unstable within the run registers as `tier-2-human-assist` rather than blocking.

**Acceptance.** Each adapter pulls real records into the org-scoped opportunity table. `agent_runs` rows are written. At minimum the three priority sources (ProPublica, IRS exempt-org, EA Forum) produce real data.

### Stage 4: Qualifier and enrichment

**Scope.** Build the per-org qualifier that gates raw events to genuine fundable-org signals. Reconfigure the Enricher (org name, legal form, founders, raise target), the Adjacency-mapper (public founder talent graph), and the Geo-mapper (hub assignment, no branches) for Funder through prompt and config. Seed a clearly tagged synthetic portfolio for adjacency.

**Acceptance.** Raw events flow through qualify, enrich, adjacency, geo. Enriched opportunities carry founders, legal_form, and geo_hub.

### Stage 5: Ranker

**Scope.** Add the Funder feature extractors to the generic scorer: `thesis_fit`, `founder_credential`, `raise_stage`, `talent_density`, `peer_funder_signal`, `recency`. Close the generic-org Sonnet rationale gap so non-Zedcor orgs get real rationale and first-step prose, not a debug string. Reconcile the score scale per the Stage 1 finding. Do not touch the Zedcor kernel or the Zedcor ranker branch.

**Acceptance.** Funder opportunities receive a score from Funder weights plus a real Sonnet rationale and first-step recommendation. Existing-customer regression gate passes (Zedcor and Realberry scores unchanged).

### Stage 6: Verifier

**Scope.** Add Funder verification checks: the org exists, founder bios corroborate against public record, the org is not already widely funded. Thresholds read from `architecture.scoring.thresholds`. Score scale consistent with Stage 5.

**Acceptance.** Top-scored Funder opportunities receive `verified` true or false with specific, actionable notes. Thresholds come from the architecture.

### Stage 7: Weekly Deal Memo

**Scope.** Reconfigure the Briefer into the Funder Weekly Deal Memo: a one-page email plus a downloadable PDF, opportunities grouped by thesis area, each with a three-sentence org snapshot, founder bio, thesis-fit rationale, and first-step recommendation. Delivery via Resend. This is the primary customer-facing deliverable.

**Acceptance.** A memo generates from verified Funder opportunities. Email and PDF both render. Opportunities are grouped by thesis area.

### Stage 8: Outreach and integrations

**Scope.** Reconfigure the Outreach Drafter channels for Funder: a cold email, a one-line Slack alert, and pre-filled HubSpot record fields. Wire Funder's HubSpot and Slack. Gate live integration behind environment-variable presence and degrade gracefully when Funder's credentials are absent, the same pattern Pathfinder uses for the Perplexity key. Biosecurity-flagged opportunities receive no auto-draft (resolved default 2).

**Acceptance.** Each verified opportunity gets the three outreach artifacts. Integrations are wired and degrade gracefully without credentials.

### Stage 9: Dashboard renderer

**Scope.** Complete the Build-Out Pass renderer wiring for `/[slug]`, driven by `architecture.ui_plan`: KPI strip, charts, lead-card layout, filter sidebar. Funder's `ui_plan` is config. Run the headless build-out verification agent. This path is shared with Realberry; do not touch `app/zedcor` (the legacy Zedcor dashboard).

**Acceptance.** `/funder` renders the KPI strip, charts, the thesis-grouped opportunity feed, and filters from the `ui_plan`. The build-out verification passes. The Realberry regression check is green.

### Stage 10: End-to-end and final pull request

**Scope.** Run the full Phase 2E onboarding state machine for Funder on real public data on the `funder-onboarding` branch deployment. Confirm status flows setting_up, first_run, ranking, ready_to_view, build_out_complete. Verify the `funder-onboarding` Vercel branch deployment. Verify `/funder` is live there. Run the existing-customer regression check a final time and record the result. Write the build report. Open one GitHub pull request, `funder-onboarding` into `main`, with the build report attached and any regression blocker called out. Do not merge it.

**Acceptance.** Funder produces verified opportunities end to end on the branch deployment. A Weekly Deal Memo generates. `/funder` is live on the branch deployment. The pull request to `main` is open and unmerged. The build report is written.

---

## 5. Out of scope and human-only

- **Verified kanban promotion.** Human-only. Kyle, Keenan, or Curtis.
- **Real Funder grantee-portfolio data.** External dependency. The build runs on a synthetic, tagged portfolio. Swap path: when Funder delivers the grantee list and thesis taxonomy, replace the synthetic portfolio rows for `organization_id=funder` and re-run the adjacency-mapper. The opportunity feed itself is real public data and needs no swap.
- **Real customer name.** Placeholder "Funder" swaps into `branding.display_name`, the slug, `customer_org_id`, and the document filenames when the real name is known.
- **Metacron-side onboarding UI.** The ApproveDeployModal, the Customers tab status badge, and the Open Pathfinder deep-link button live in the unicron-platform repo and Vercel project. Separate Cowork chat, separate kanban. This build creates the Funder org through the Pathfinder API directly and leaves the Metacron surface as a follow-up.
- **Founder-departure signals, Crunchbase, the private warm-intro graph.** Deferred per Section 2.
- **Provisioning Funder's real HubSpot and Slack credentials.** The integration code ships and degrades gracefully until the credentials are set.

---

## 6. Definition of done

- All 10 stages merged into the `funder-onboarding` branch.
- `/funder` is live on the `funder-onboarding` Vercel branch deployment, rendering the thesis-grouped opportunity feed from real public-data opportunities.
- The Phase 2E state machine reached `build_out_complete` for Funder on the branch deployment.
- A Weekly Deal Memo has been generated from verified Funder opportunities.
- The existing-customer regression check has been run; its result is recorded in the build report.
- One GitHub pull request, `funder-onboarding` into `main`, is open and unmerged, with the build report attached and any regression blocker called out.
- Every Funder kanban card is in Deployed. None in Verified.
- A build report is written to `Pathfinder/docs/REPORT-funder-onboarding.md` covering each stage, the commit SHAs, the verbatim verification evidence, the regression-check result, any auto-reverts, and any hard-halt.
- If the run hard-halted, the report states the halted stage, the trigger, the current state, and the exact next action for a human.

The merge to `main` and the production deploy are a single human action after review. They are not part of this run.
