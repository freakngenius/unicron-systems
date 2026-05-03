# PLAN — Demo Polish UX Gate 13W-D: production verification

**Branch:** `demo-polish-ux/gate13w-prod-verify` (stacked on
`demo-polish-ux/gate13w-prefs-ui`)
**Worktree:** `Pathfinder-worktrees/gate13w-prod-verify/`

## Goal

Ship the verification protocol + a CLI fallback so Kyle can run the
"send a real brief to kyle@freakngenius.com and confirm it lands"
acceptance test the gate prompt requires.

## What 13W-D actually is

The gate prompt's 13W-D step is operator-action: "Send a manual brief
to kyle@freakngenius.com, verify lands, verify formatting, verify
links work." That's a manual run with a real email — Claude Code can
neither connect Kyle's gmail/outlook OAuth nor verify the email
arrived in his inbox.

What this gate ships is everything Kyle needs to perform that step
quickly:

1. A self-contained CLI script (`scripts/send-test-briefing.ts`) that
   composes + sends through the same pipeline the cron uses, so a
   single `pnpm tsx` invocation triggers a real send.
2. A step-by-step verification README at
   `MEMORY/operator-todos/2026-05-03-gate13w-d-production-verification.md`
   covering: pre-conditions, in-app dispatch path (the 13W-C UI),
   CLI fallback, SQL probes, cron enablement, and a failure
   playbook.

## Files

- `Pathfinder/scripts/send-test-briefing.ts` — CLI runner. Accepts an
  operator email, calls `composeDailyBrief` + `sendDailyBrief`, prints
  the result, exits 0/1/2/3 based on outcome.
- `MEMORY/operator-todos/2026-05-03-gate13w-d-production-verification.md`
  — verification checklist with pass-criteria, SQL probes, and a
  failure playbook.
- `Pathfinder/docs/PLAN-demo-polish-ux-gate13w-prod-verify.md` —
  this file.

## Out of scope

- Anything that requires hitting a live mailbox. That's Kyle's hands.
- Setting `BRIEFING_CRON_ENABLED` in Vercel — see § "Enable the cron"
  in the verification README. Operator action.

## Hard constraints

- ✅ No code in `Pathfinder/lib/` or `Pathfinder/services/` modified —
  this gate is documentation + a one-file script. Spec-references
  check exempt for `scripts/` (the CI regex is `^(Pathfinder/(lib|services)/|lib/)`).
- ✅ Schema unchanged.
- ✅ Auth gate untouched.
- ✅ Houston flagship + cross-pollination + agent_runs untouched.

## Commit chain

```
1. docs+scripts: gate 13W-D — verification README + CLI sender + PLAN
```
