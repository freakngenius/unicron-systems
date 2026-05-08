---
name: propose-taboo-edit
description: Propose an edit to the taboos register — opens a GitHub PR for peer review
domain: memory
type: manual
inputs:
  - name: proposed_text
    type: string
    required: true
    description: The full proposed content for taboos.md (complete replacement, not a diff)
  - name: reason
    type: string
    required: true
    description: Why this edit is proposed — will appear in PR description and audit log
outputs:
  - type: notion_card
    location: internal kanban — taboo edit requests column
  - type: vault_doc
    location: PR link recorded in wiki/memory/taboos/proposals/YYYY-MM-DD-<slug>.md
refusal_gate: yes
budget_usd_per_run: 0.02
---

# propose-taboo-edit

Propose an edit to the taboos register (`taboos.md` in the knowledge vault). Opens a GitHub PR for peer review by the team. Requires refusal gate approval before execution.

## Refusal Gate

This skill REQUIRES human approval before executing because it modifies the taboos register — the ethical and operational constraints governing all agent behavior. Present the proposed change and reason to the operator and wait for explicit "approve" before proceeding.

Gate prompt:
> "You are proposing to edit the taboos register. This affects all agent behavior. Proposed change: [proposed_text]. Reason: [reason]. Confirm to proceed? (approve / cancel)"

## Execution

1. Fetch current `taboos.md` from `freakngenius/unicron-knowledge` main branch.
2. Diff the current content against `proposed_text`.
3. Create a new branch: `taboo-edit/YYYY-MM-DD-<slug>` where slug is the first 5 words of `reason` kebab-cased.
4. Commit `proposed_text` as `taboos.md` on that branch.
5. Open a GitHub PR with:
   - Title: `taboo(edit): REASON_SLUG`
   - Body: includes reason, diff summary, and refusal gate approval record.
6. Create a Notion card in the internal kanban under "Taboo Edit Requests".
7. Write a record to `wiki/memory/taboos/proposals/YYYY-MM-DD-<slug>.md`.
8. Write an audit log row to `nervous_system.audit_log`.

## Notes

- Cost ceiling: $0.02/run (mostly GitHub API calls, no LLM synthesis needed).
- The PR must be reviewed by at least one human team member before merging.
- Never auto-merge taboo edits regardless of CI status.
