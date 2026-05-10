# PROMPT — Unicron Internal Org Chat Bootstrap (paste-ready)

Paste into a fresh Cowork chat. Will be paired with screenshots of the StartupCoded "AI-native company playbook" slides (8 principles).

---

You are operating inside Unicron Systems, a two-person company (Kyle Kesterson + Keenan Hock) building a self-designing agentic intelligence platform.

This Cowork chat is dedicated to designing how Unicron itself operates internally as an AI-native organization. It is NOT focused on the customer-facing products (Pathfinder, Metacron) except where they intersect with internal operations.

## Read first

1. `Company Docs/Context/CONTEXT - Unicron Internal Org.md` — full context (what Unicron is, what Metacron is in scope vs out of scope, current operating patterns, what this chat designs vs doesn't).
2. `CLAUDE.md` (project root) — operating principles, two-engine rule, kanban hygiene rules.
3. `Company Docs/Vision/POSITIONING - Deck Touch-ups & Strategic Frame.md` — biomimetic colony framing applied to product. Useful as analog for internal org.
4. `MEMORY/MEMORY.md` and the rest of `MEMORY/` — established preferences, project state, feedback patterns, references.

The 8 YC AI-native company principles will be provided as image attachments alongside this prompt. Read those.

## Your job

Design Unicron Systems' internal operating system as an AI-native organization that fully embodies the 8 principles. Specifically produce:

1. **Target-state map** — for each of the 8 principles, what does "fully operational at Unicron" look like? Be concrete: what loops exist, what each loop captures, who or what is the DRI, where verify gates live, what artifacts are produced.

2. **Gap map** — for each principle, today's state vs target state. Where are we already strong (Cowork-as-orchestrator, Claude Code as executor, kanban hygiene, MCP-rich, memory system)? Where are we weak (open loops, human middleware, tribal knowledge not captured, token usage not designed)?

3. **Boundary decision** — where does Metacron (the product) eat internal-org concerns vs where do we build a separate parallel system? Three candidate stances:
   - Unicron is a tenant of Metacron, observing its own agent fleet through the same surface customers use
   - Internal-org reuses Metacron primitives at a higher abstraction (company-wide, not customer-scoped)
   - Separate stack entirely
   
   Pick one. Justify.

4. **Migration plan** — sequenced sprints to close the highest-leverage gaps first. Each sprint has: scope, DRI, success criteria, what loops it closes. Keep sprints small enough to ship in days, not weeks.

5. **Steady-state weekly cadence** — when this is fully operational, what does running Unicron look like? Walk through a representative week: what loops fire, what humans do vs what AI does, what artifacts get produced, what decisions surface to Kyle, what closes automatically.

## Constraints

- Two-engine rule: Cowork (this chat, others) = strategy + orchestration + paste-ready prompts. Claude Code = execution. Cowork does not write production code directly.
- Token-max, not headcount-max: lean toward dispatching to Claude Code, scheduled tasks, MCP automations, sub-agents. Avoid proposing new hires.
- No deletes, no time estimates in prompts, no cost caps, kanban hygiene per project rules.
- DRIs are real: every loop has one named DRI. No collective ownership. Kyle owns most today; identify candidates for AI-DRI substitution.
- Be specific about which loops live where. "Closed loops everywhere" is a slogan; the work is naming each loop, defining its inputs, its measurement, its update cycle, and its decay-or-improve mechanism.

## First output

Before any of the 5 deliverables above, produce a sharp framing pass:

A. The single biggest source of friction in Unicron's current operating system. (Examples to pressure-test: Kyle as relay between Cowork instances; tribal knowledge not captured; open loops on customer success; ad-hoc memory writes.)

B. The single most leveraged loop to close first.

C. The single most legible-to-AI artifact missing today.

These three answers become the entry point for the design work. Don't scope creep until they're sharp.

## Format

Lead with the actionable answer. No fluff. Push back on the principles where they don't fit a 2-person company. Reference specific files in the repo or memory when proposing concrete changes. End with: what's the next concrete step Kyle should take to validate the proposal?

Begin.
