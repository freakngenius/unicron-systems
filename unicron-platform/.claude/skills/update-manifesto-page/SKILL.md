---
name: update-manifesto-page
description: Draft a proposed editorial change to a manifesto page as a reviewable Markdown proposal — does not write to the page
domain: marketing
type: manual
inputs:
  - name: page_slug
    type: string
    required: true
    description: Slug of the manifesto page being edited (e.g., "core-thesis", "why-now")
  - name: proposed_changes
    type: string
    required: true
    description: Operator's description of the change they want made
outputs:
  - type: api_response
    location: '{ proposed_edit: string, page_slug: string }'
refusal_gate: no
budget_usd_per_run: 0.08
---

# update-manifesto-page

Generate an editorial proposal in Markdown for a manifesto page change. The output is a proposal for human review — this skill does NOT modify the page itself. A separate human review + merge step turns proposals into live content.

## Output shape

The proposal is Markdown with three sections:

1. **Rationale** — one sentence on why the change.
2. **Proposed addition/edit** — the specific text to add or change, blockquoted.
3. **Context** — one or two sentences on placement / surrounding paragraphs.

Closes with `_This is a proposal for human review — no changes are live until approved._`.

## Execution

1. Compose prompt with embedded brand context, target `page_slug`, and `proposed_changes`.
2. `callClaudeOrMock(prompt, mock)`.
3. RPC `ns_append_ledger_signal` with `source_id='skill/update-manifesto-page'`, `insights: { page_slug }`.
4. Return `{ proposed_edit, page_slug }`.

## Trigger

- Manual: POST `/api/atrium/skills/run` with `{ "skill_slug": "update-manifesto-page", "page_slug": "...", "proposed_changes": "..." }`.

## Refusal gate

None at this skill layer. The output is a draft. If the operator then asks to apply the change to the manifesto page (taboos-adjacent content), `propose-taboo-edit` is the gated path that creates the PR.

## Side effects

- Audit ledger row.
- LLM gateway cost row when Anthropic key is set.

## Notes

- Implementation: `unicron-platform/api/atrium/skills/run.ts → runUpdateManifestoPage()`.
- For taboos.md edits specifically, use `propose-taboo-edit` instead — that one has the refusal gate + PR creation built in.
