# Context — Unicron Internal Org

Reference doc for a Cowork chat focused on how Unicron Systems operates *internally* as an AI-native organization. Distinct from Metacron (which is the customer-facing operator product). This chat designs the company's own organism.

## What Unicron Systems is

Two-person company (Kyle Kesterson + Keenan Hock) building a self-designing agentic intelligence platform. Two products:

- **Pathfinder**: customer-facing app surfacing lead intelligence per customer (Zedcor today, Realberry next, 5+ verticals in pipeline)
- **Metacron**: operator-facing platform for monitoring agent runs, configuring customer onboarding, reviewing Architect proposals

Both products share a Supabase backend, Vercel deploys, and a multi-agent backend (Architect, Source Onboarder, Coverage Expansion, Cross-Pollination, Verifier, Ranker, Enricher, Briefer).

## What Metacron is in this conversation

Metacron is a *product surface* for our customers' agent fleets. It is NOT the internal-org system, but it borrows most of the same primitives:

- Verify gates between agent output and downstream consumers
- Galaxy view of agent activity
- Architect proposals operators approve
- Per-tenant policy + audit
- Cross-customer learning compounded

The internal-org question is: do these primitives also live as Unicron's own internal operating layer, or do we build a separate parallel system for the company itself? Possibilities:

- Metacron eats both (Unicron is a tenant of Metacron observing its own agent fleet)
- Internal-org system reuses Metacron primitives but lives at a higher abstraction (company-wide, not customer-scoped)
- Separate stack entirely (different schemas, different observability, different verify model)

Resolving this is part of the chat's job.

## Current internal operating patterns (today)

Already running:

- **Cowork as orchestrator**: Claude desktop Cowork chats are the human-AI thinking layer. One per major work surface (Metacron Cowork, Pathfinder Cowork, this Internal Org Cowork).
- **Claude Code as executor**: every code change is dispatched to a fresh Claude Code session via paste-ready prompts. Cowork generates prompts, Kyle relays.
- **claude-peers MCP for coordination**: Cowork instances ping each other for cross-product schema work (e.g., Phase 1F bridge across Pathfinder + Metacron).
- **Notion kanbans as the work-in-flight ledger**: Pathfinder kanban + Metacron kanban. Cowork manages, never Claude Code (unless told). Verified column is human-only.
- **GitHub PRs as the merge gate**: every change goes through PR with multi-Vercel verification. Phase F of every prompt is "verbatim evidence in PR description."
- **MCP layer for connectors**: Supabase, Notion, Slack, Linear, Google Workspace, GitHub, Vercel — Cowork talks to them directly.
- **Memory system**: per-Cowork memory files (`MEMORY/`) capture user preferences, project state, feedback, and references that persist across sessions.
- **Operator-todos**: gating items that block one Cowork chat get filed in `MEMORY/operator-todos/` for the responsible chat to pick up.
- **Skills**: plugin-installed skills (anthropic-skills, marketing, product-management, productivity) inform specialized work.

What's missing from a YC-AI-native lens:

- Closed loops everywhere — most work is open-loop (we ship and don't measure outcomes systematically).
- Company is partially legible to AI — code + Notion + memory yes; conversations + decisions + tribal knowledge no.
- Token-max not headcount-max — currently practiced by accident, not designed.
- DRIs — implicit (Kyle owns most), not formalized.
- Software factories pattern (spec + tests + AI implements) — partially used in Phase 1F bridge, not consistent.
- Human middleware — Kyle is the relay between Cowork and Claude Code, between Cowork instances, and between products. Real friction point.

## The 8 YC AI-native principles (from StartupCoded slides)

1. **AI as operating system, not tool** — every workflow flows through an intelligent layer
2. **Closed loops everywhere** — every important process captures information, feeds back, improves over time
3. **Make your company legible** — turn every key action into data the system can learn from
4. **Software factories** — humans write specs and tests, AI agents generate implementation and iterate
5. **No more human middleware** — flatten management hierarchy, remove human routing layers
6. **Three employee archetypes** — IC builder-operator, DRI (one person, one outcome, no hiding), AI founder (still builds and coaches)
7. **Token-max, not headcount-max** — maximize token usage for what would have required headcount; lean engineering, design, HR, admin
8. **Early-stage advantage** — no legacy, no org charts, AI-first from day one

Slides will be provided directly to the new chat for full detail.

## What the new Cowork chat designs

Specifically:

1. A target-state map of Unicron Internal Org: which loops exist, what each loop captures, who/what is the DRI, where the verify gates live.
2. A gap map: today's state vs target state per principle.
3. A migration plan: what ships first to close the highest-leverage gap.
4. A boundary decision: where Metacron eats internal-org concerns vs where they live in a separate system.
5. A weekly cadence: what does running Unicron look like at steady state when the system is operational?

## What this chat does NOT do

- Build features for Pathfinder or Metacron customers (that's other Cowork chats).
- Touch customer-facing schemas or kanbans.
- Manage external customer relationships (sales, demos, contracts).
- Replace human judgment on people decisions (hiring, comp, equity).

## Linked references

- `CLAUDE.md` (project root) — operating principles and current state
- `Company Docs/Vision/POSITIONING - Deck Touch-ups & Strategic Frame.md` — biomimetic colony framing
- `Company Docs/Vision/UI - Metacron Operator System Architecture.md` — Metacron's surface
- `Company Docs/PRD/PRD - Phase 2 Tailored Pathfinder.md` — multi-tenant scope
- `Company Docs/PRD/PRD - Phase 3 Voice-Agent Swarm.md` — voice-agent swarm
- `MEMORY/` (root) — auto-memory, operator-todos, audit notes

End.
