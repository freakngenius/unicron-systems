# SPEC — Z15 — Demo prep: verified runbook + pilot proposal

## Goal
Finalize the Zedcor demo materials so every quantitative and capability claim is backed by a live Supabase/Notion query, not by a stale memory file. Output: a committed demo runbook (script + FAQ) and a customer-facing pilot proposal in which no number is asserted without evidence and nothing in the "do not show" list can be accidentally demoed.

## Seed material (already drafted by Cowork — refine, do not start from zero)
- `Claude Files/Plans/Z15-demo-runbook.md` — demo script + FAQ + show/do-not-show list.
- `Claude Files/Plans/Z15-pilot-proposal.md` — customer-facing pilot proposal.
Treat these as the v1 draft. Your job is to verify, correct, and finalize, not to rewrite their structure.

## Why this is a Claude Code session (not just docs)
The demo's credibility rests on accurate counts. Counts drift as the other sprints land rows. This session's real work is the verification pass: pull live state, reconcile every number in both docs against it, and flag/fix any claim that no longer holds.

## Sequencing
Run this session LAST, after Z14.2, Contact Cleanup, and Z16 have merged, so the demo reflects final state. If launched in parallel, it must re-run its full verification pass once those three are merged and update any changed numbers (the docs carry an "as verified <ISO timestamp>" line so staleness is visible).

## Verification checklist (every claim → a query → pasted evidence in the PR)
1. Notion Lead Feed row count (data source 39b001e3-fa1f-4fbf-aeea-219d4ef2b19a). Confirm the "~47 rows" / "14 in-window" / "23 pre-window" / "3 multi-metro" splits against the live DB. Correct the docs to actual numbers.
2. In-window definition: count `pathfinder.projects` (Zedcor org `6cd87740-7c72-4337-ac79-316a54242eef`) with bid stage GC Selected / Sub Bid / Mobilization and buy_window_open=true. Must match the "hero rows" claim.
3. Customer base: confirm `pathfinder.zedcor_customer_sites` counts (sites / unique companies / TX companies). Correct the 3,627 / 803 / 205 figures to live values.
4. Warm intros: confirm the cross-pollination match count (claimed 0). If Z14.2/Z16 changed it, update the FAQ answer accordingly.
5. Contact emails: confirm post-cleanup state (Class-A garbage NULLed). The FAQ "company-level not person-level" framing must match what's actually in the DB after the cleanup sprint.
6. Active sources: confirm the count of sources producing rows in the last 7 days (claimed 8, plus any new Z16 sources). Update.
7. Multi-metro: confirm Fort Worth + San Antonio rows still present.
8. Do-not-show list still valid: confirm the contact-email column and warm-intro column states justify keeping them off-screen, or update if a sprint fixed them.

## Acceptance criteria
1. Both docs updated with live-verified numbers; each numeric claim has a pasted query + result in the PR.
2. An "as verified <ISO timestamp>" line at the top of each doc.
3. Any claim that changed because of a sibling sprint (Z14.2/Z16/cleanup) is reconciled, and the FAQ answers for contacts and warm intros match post-sprint reality.
4. Show / do-not-show list is consistent with verified state (nothing on "show" is actually empty; nothing demoable was wrongly hidden).
5. No em-dashes in the customer-facing pilot proposal. Pricing matches: cloud setup $5,000-$7,500/hub, $2,500/hub/month. No on-prem pricing in the customer doc.

## Loop directive
Pull state → reconcile both docs → if any number is wrong, fix it and re-verify → repeat until every claim matches a live query. Commit. This is a docs + verification sprint; no production code.

## Hard-halt conditions (only these)
- Notion or Supabase access fails (can't verify). Halt and report which.
- A verified number contradicts the demo's core spine so badly the demo strategy needs a human call (e.g., in-window hero rows dropped to 0). Halt and surface, do not quietly ship a hollow demo.

## Safeguards
- Docs-only; no production diffs, so no auto-revert risk. Auto-merge when acceptance criteria pass with pasted evidence.
- No time estimates, no cost caps.

## Kanban hygiene (Pathfinder Features Kanban — data source 1e675609-7a89-47ff-8edb-f8ed9ccd38c1 ONLY)
- Start: card to **In Process** ("Z15 — Demo prep: verified runbook + pilot proposal").
- End: **Deployed** on merge; append `Finalized at <commit-sha> · verified at <ISO timestamp>`. Never **Verified** (human-only).
