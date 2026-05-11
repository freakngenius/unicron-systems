---
name: draft-blog-post
description: Draft a 400–600 word Markdown blog post for the Unicron brand voice on a given topic and audience
domain: marketing
type: manual
inputs:
  - name: topic
    type: string
    required: true
    description: Post topic — a question, claim, or beat the post should center on
  - name: target_audience
    type: string
    required: false
    description: Audience descriptor. Default "construction security and surveillance buyers".
outputs:
  - type: api_response
    location: '{ draft: string, word_count: number }'
refusal_gate: no
budget_usd_per_run: 0.12
---

# draft-blog-post

Draft a publishable Markdown blog post in the Unicron brand voice. Uses Claude (sonnet-4-5) when `ANTHROPIC_API_KEY` is configured; falls back to a hard-coded mock when not. The brand context is hard-coded into the prompt so output stays on-voice without operator-supplied positioning.

## Brand voice (embedded)

> Unicron Systems is a 2-person startup building a self-designing agentic intelligence platform.
> Brand voice: direct, technical, no fluff. We build for operators and sales teams who need
> intelligence without noise. Customer-zero is Zedcor (construction surveillance, mobile solar towers).
> Products: Pathfinder (customer-facing lead intelligence), Metacron (operator platform),
> Atrium (internal cockpit). We are formally fundraising.

## Output requirements

- 400–600 words
- Markdown
- Hook opening paragraph
- 2–3 body sections with `##` subheadings
- Concrete closing CTA pointing at `unicron.systems`

## Execution

1. Resolve `audience = target_audience ?? "construction security and surveillance buyers"`.
2. Compose the system+user prompt with embedded brand context, topic, and audience.
3. `callClaudeOrMock(prompt, mock)`:
   - If `ANTHROPIC_API_KEY` set → POST `https://api.anthropic.com/v1/messages`, model `claude-sonnet-4-5`, `max_tokens: 1500`.
   - If unset OR error → return the hard-coded mock draft.
4. Compute `word_count = draft.split(/\s+/).filter(Boolean).length`.
5. RPC `ns_append_ledger_signal` with `source_type='agent_run'`, `source_id='skill/draft-blog-post'`, `summary='Blog post drafted: "{topic}"'`, `insights: { topic, audience }`.
6. Return `{ draft, word_count }`.

## Trigger

- Manual: POST `/api/atrium/skills/run` with `{ "skill_slug": "draft-blog-post", "topic": "...", "target_audience": "..." }`.

## Refusal gate

None at skill layer. The drafted post is for human review before publication; Taboo Keeper does not pre-screen marketing drafts.

## Side effects

- Audit ledger row via `ns_append_ledger_signal`.
- LLM gateway cost row (when Anthropic key is set).

## Notes

- Implementation: `unicron-platform/api/atrium/skills/run.ts → runDraftBlogPost()`.
- The mock path is for local dev without an Anthropic key; production must have the key set so drafts are real.
- This skill writes a draft to the response, NOT to a file or CMS. Publishing is a separate operator step.
