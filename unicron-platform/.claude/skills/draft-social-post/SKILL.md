---
name: draft-social-post
description: Draft a LinkedIn post, Twitter/X post, or both for a given topic in the Unicron brand voice
domain: marketing
type: manual
inputs:
  - name: topic
    type: string
    required: true
    description: Topic or milestone the post should highlight
  - name: platform
    type: string
    required: false
    description: '"linkedin" | "twitter" | "both". Default "both".'
outputs:
  - type: api_response
    location: '{ linkedin?: string, twitter?: string }'
refusal_gate: no
budget_usd_per_run: 0.06
---

# draft-social-post

Draft platform-formatted social posts in the Unicron brand voice. Uses Claude when configured, falls back to mocks otherwise. Returns the post(s) for the requested platform only.

## Format constraints

- LinkedIn: 150–200 words, professional tone, 2–3 hashtags.
- Twitter/X: under 280 characters, punchy, 1–2 hashtags.
- Tone: direct, no buzzwords, operator-credible. Lead with a concrete insight or result.

## Execution

1. Normalize `target = (platform ?? "both").toLowerCase()`. Coerce to "both" if not in `{linkedin, twitter, both}`.
2. Build the prompt sections per target.
3. `callClaudeOrMock(prompt, mock)`:
   - For `both`, parse the raw response with regex `/linkedin[:\s]+([\s\S]+?)(?=twitter[:\s]+|$)/i` and `/twitter[:\s]+([\s\S]+?)$/i`.
   - For single platform, treat raw text as the post for that platform.
4. RPC `ns_append_ledger_signal` with `source_id='skill/draft-social-post'`, `insights: { topic, platform: target }`.
5. Return `{ linkedin?, twitter? }`.

## Trigger

- Manual: POST `/api/atrium/skills/run` with `{ "skill_slug": "draft-social-post", "topic": "...", "platform": "linkedin" }`.

## Refusal gate

None. Drafts are for human review before posting.

## Side effects

- Audit ledger row via `ns_append_ledger_signal`.
- LLM gateway cost row when Anthropic key is set.

## Notes

- Implementation: `unicron-platform/api/atrium/skills/run.ts → runDraftSocialPost()`.
- The brand context block is shared with draft-blog-post; updating one means revisiting the other for consistency.
