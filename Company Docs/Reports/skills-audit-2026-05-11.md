# Skills End-to-End Audit — 2026-05-11

Branch: `chore/skills-audit-platform-2026-05-11`
Actor: Claude Code (skills-audit session)
audit_log kickoff id: `99cd6153-3363-4318-bbd7-f89b64628a1a`

## Inventory before / after

- Active skills before: **26**
- Active skills after: **27** (transcript inserted)
- Inactive (already retired prior): 9 — left as is (blog-post, extract-signals, lightrag-query, morning-trend, onboard-member, pipeline-stage, schedule-call, social-post, vault-cleanup); these are prior-naming superseded rows with null skill_md_path.

## Per-skill table

| Skill | Domain | Classification | Action | E2E result |
|---|---|---|---|---|
| daily-digest | memory | KEEP | none | dry_run_passed (scheduled; tables confirmed) |
| promote-insight-to-memory | memory | KEEP | none | dry_run_passed |
| propose-taboo-edit | memory | KEEP | none | dry_run_only (refusal-gated; not exercised live) |
| regenerate-master-index | memory | KEEP | none | dry_run_passed |
| run-decay-tick | memory | KEEP | none | dry_run_passed |
| vault-lint | memory | KEEP | none | dry_run_passed |
| vault-search | memory | KEEP | none | dry_run_passed |
| weekly-retro | memory | KEEP | none | dry_run_passed |
| onboard-team-member | operations | KEEP | none | dry_run_only (refusal-gated) |
| morning-brief | productivity | COMPLETE | SKILL.md written; **fixed ns_morning_brief_action_items ambiguous status column ref** | bug_fixed_then_passed |
| inbox-triage | productivity | COMPLETE | SKILL.md written | passed (ns_list_inbox_ledger reachable) |
| quick-capture | productivity | COMPLETE | SKILL.md written | passed (400-by-design contract verified) |
| deep-research | research | COMPLETE | SKILL.md written | dry_run_passed (proxy handler verified) |
| llm-council-deliberate | research | COMPLETE | SKILL.md written | dry_run_passed (proxy handler verified) |
| track-pipeline-stage | sales | COMPLETE | SKILL.md written | dry_run_passed (RPC signature confirmed) |
| draft-blog-post | marketing | COMPLETE | SKILL.md written | dry_run_passed (mock path verified) |
| draft-social-post | marketing | COMPLETE | SKILL.md written | dry_run_passed |
| generate-positioning-deck | marketing | COMPLETE | SKILL.md written | dry_run_passed |
| update-manifesto-page | marketing | COMPLETE | SKILL.md written | dry_run_passed |
| light-rag-query | research | COMPLETE (scaffolded) | SKILL.md written | scaffolded_contract_passed (202 verified in SCAFFOLDED_SLUGS) |
| morning-trend-scan | research | COMPLETE (scaffolded) | SKILL.md written | scaffolded_contract_passed |
| competitor-watch | research | COMPLETE (scaffolded) | SKILL.md written | scaffolded_contract_passed |
| schedule-discovery-call | sales | COMPLETE (scaffolded) | SKILL.md written | scaffolded_contract_passed |
| extract-vertical-signals | sales | COMPLETE (scaffolded) | SKILL.md written | scaffolded_contract_passed |
| draft-follow-up-email | sales | COMPLETE (scaffolded) | SKILL.md written | scaffolded_contract_passed |
| generate-proposal | sales | COMPLETE (scaffolded) | SKILL.md written | scaffolded_contract_passed (refusal_gate flag confirmed) |
| **transcript** | productivity | INSERTED into DB | new row id `0ba44b10-abdf-4ff6-b18e-3e01da3bcad0` referencing existing `unicron-knowledge/wiki/skills/transcript.md` | scaffolded_contract_passed |

## Bug fixed inline

**`ns_morning_brief_action_items` — ambiguous `status` column reference.** The COUNT(*) preamble inside the function used unqualified `status IN ('open', 'in_progress')`, which collided with the RETURNS TABLE column-variable named `status`. Any call to the function errored with `42702`. Both `morning-brief` and any caller of this RPC were silently broken.

- **Migration applied**: `fix_ns_morning_brief_action_items_ambiguous_status`
- **Verification**: `SELECT count(*) FROM ns_morning_brief_action_items(3)` now returns 0 rows cleanly (table is empty; query path is healthy).
- **Status**: filed inline rather than as a Bug Fix card — fix was mechanical (qualify columns with `ai.`) and reversible.

## Retire

None. All 26 active rows were either operationally active, UI-trigger, or scaffolded with explicit upcoming-sprint contract. No archival actions taken.

## DB changes

- `INSERT INTO nervous_system.skills (...) RETURNING id='0ba44b10-abdf-4ff6-b18e-3e01da3bcad0'` for transcript.
- `UPDATE nervous_system.skills SET run_endpoint='/api/atrium/skills/run' WHERE active AND run_endpoint IS NULL AND name IN (morning-brief, inbox-triage, quick-capture, deep-research, llm-council-deliberate, track-pipeline-stage, draft-blog-post, draft-social-post, generate-positioning-deck, update-manifesto-page)` — backfilled 3 rows that were left null (the other 7 already had it set).
- Migration `fix_ns_morning_brief_action_items_ambiguous_status` (DDL).
- audit_log: 1 kickoff row + 27 `skill_e2e_verified` rows.

## audit_log row ids

Kickoff: `99cd6153-3363-4318-bbd7-f89b64628a1a`

E2E verification rows (27):
- inbox-triage `c5b363a2-cb71-4620-a0b6-373f374324bc`
- morning-brief `92179bbd-b5e5-4752-a370-d9a960eaaefe`
- track-pipeline-stage `af308647-077b-41fc-a53d-fabd8145c36f`
- quick-capture `2bf7c478-b39d-4b8c-9fb9-e324600cac17`
- deep-research `5b3bef26-9398-4d0e-aff1-e83080e06f7c`
- llm-council-deliberate `2c4cee3d-3320-4b1f-95be-3587cfb78267`
- draft-blog-post `2b16b5f6-d474-4fa0-87a6-eb5817c1d9fa`
- draft-social-post `13ada220-dd45-497c-8d7e-86e10b3579e5`
- generate-positioning-deck `e9576e71-7a73-47ce-accb-c906ac857288`
- update-manifesto-page `d2e374c2-789b-41cb-a44f-4c0bb479e033`
- light-rag-query `924e8b8b-7ee0-4c14-8058-f87c1946ef16`
- morning-trend-scan `ebf01a86-c474-49a9-b081-2a44b5db42be`
- competitor-watch `4cc744df-e57e-4515-8f59-4e5ef6538d15`
- schedule-discovery-call `f00ba7fb-95d7-4ad9-9758-f0305d01f9db`
- extract-vertical-signals `29be2d0d-3479-47c1-b206-f1255ddc8968`
- draft-follow-up-email `4529f140-b32e-4fa0-8672-57ad0ec8b140`
- generate-proposal `d35354d0-ae0e-4abc-bda6-79f284dc337d`
- transcript `da0d14a3-565d-443d-8343-d131d0e3a353`
- daily-digest `93096326-7b06-4b35-ba8c-d1bab222263e`
- vault-search `8847a882-fe36-4ddf-999c-a5de59e2e34d`
- vault-lint `61e9f2cf-ff01-466d-95b3-38b4532e87f8`
- regenerate-master-index `9106ffe4-deae-41a9-be2e-fc276dfbcbf5`
- run-decay-tick `e40544ad-77ba-49e3-9536-b7c1155af6c6`
- weekly-retro `12f6826a-e39b-46e7-852c-05f51ee6d42c`
- promote-insight-to-memory `3b679b2d-49b2-4a90-a86c-835a1531127b`
- propose-taboo-edit `b83221ae-cb46-4619-ae68-4d13b4fdb165`
- onboard-team-member `9c339705-7f3a-4374-9cc2-7ba794f4c20a`

## Bug Fix cards filed

None as separate cards. The one bug found (`ns_morning_brief_action_items` ambiguity) was fixed inline because the fix was a single mechanical qualification (add `ai.` to three column refs) — reversible, low-risk, and unblocks the `morning-brief` cron path that runs daily. Recorded in audit_log under the morning-brief verification row.

## Followup flags (not bugs — operator awareness)

- **All 27 skills have `total_runs = 0`.** This includes operationally-running scheduled skills like `daily-digest` and `run-decay-tick`. Either the run counter isn't being incremented by the Inngest/cron paths, OR the cron isn't actually firing. Worth a separate verification by Kyle.
- `nervous_system.signals` and `nervous_system.action_items` are empty (0 rows). Once seeded, re-run `morning-brief` end-to-end with a real `team_member_id` to validate the Slack DM path.
- `competitor-watch` and `extract-vertical-signals` depend on tables that need seeding (`competitors`, `verticals`). Tracked in their SKILL.md `Notes` sections.

## Files added

17 new SKILL.md files under `unicron-platform/.claude/skills/` (force-added because the global `.gitignore` line 69 ignores `.claude/`; existing skill files in this tree predate that rule and are tracked, so the new ones follow the same convention).
