# PRD - Procedural Memory & Skill Forge

**Atrium · Metacron · Pathfinder. One substrate, one new layer.**

Author: Kyle Kesterson · Cofounder review: Keenan Hock · Peer review: Curtis Smith
Status: Tightened for Master Conductor handoff
Date: 2026-05-14 (tightened 2026-05-14 against live codebase)
Supersedes: nothing. Extends the Unicron Nervous System SPEC and Nervous System Addenda 1 through 4.
Related: Engineer Brief (Atrium > Metacron > Pathfinder), Hermes Agent research pass (2026-05-14)

---

## Codebase reconciliation note

This PRD was tightened against the live repo on 2026-05-14. Four corrections from the original draft:

1. **Schema is `nervous_system.*`, not `atrium.*`.** There is no `atrium` schema. Atrium is a feature-flagged surface inside `unicron-platform`. The procedural layer lives in the `nervous_system` schema next to the ledger, agents, and taboos.
2. **`nervous_system.skills` already exists and is live.** It was created in Sprint 3 and is seeded with roughly 40 skills across Sprints 3 through 6. Addendum 5 extends this table in place. It does not create a new one.
3. **Sprint numbers are 9 through 12.** Sprint 8 ("Atrium Usefulness Pass") already ran on 2026-05-13. This work follows it.
4. **Addendum 4 is Active.** Its scenario and satisfaction primitives shipped in Sprint 5. They are a live dependency, not a future one.

The migration safety rule from the Master Conductor applies: before any SQL touching `nervous_system.skills`, query `information_schema.columns` for the live column names and write the migration against verified names, not against names in this PRD.

---

## Executive summary

Today our agents resolve problems and the resolution evaporates. The next time a near-identical problem arrives, a new procurement office that looks structurally like Harris County, a new Cowork thread that mirrors one we closed last month, a new ingest source that needs the same Tier-1 onboarding pattern, the fleet starts from zero.

This is the gap between "agents that work" and "a company that learns." It is the gap the marketing pitch already promises ("closed loops, not copilots bolted on") but the SPECs do not yet close.

**Procedural Memory & Skill Forge** closes it.

We add a third memory tier (procedural) on top of the existing active and session layers. We add a fifth always-on agent (Skill Forge) whose only job is to distill successful trajectories into reusable, refusal-gated, decay-aware Skill artifacts. We add a programmatic-tool-calling primitive (`execute_skill`) that lets the Orchestrator collapse multi-step pipelines into one inference call. And we ship a dogfood gateway (Atrium Companion) so the three of us stop losing 11pm car-ride ideas to the void.

The architecture move is small. It reuses the existing skills table, the existing Taboo Keeper, the existing Inngest runtime, the existing ingest pipeline. The product move is the largest single upgrade since the Taboo Keeper. It is what makes "the company is the product" structurally true instead of rhetorically true.

---

## North Star: what this layer makes possible

This PRD ships a substrate. The substrate exists to serve three product visions. None of the three are buildable without procedural memory underneath them, which is why this PRD comes first.

**Atrium becomes the living company.** The vision: Atrium knows all, is thoughtful about all, self-improves, has the memory structure to actually remember and leverage what it needs, and is proactive in taking decisions that grow the company toward its goals. The ultimate collaborator with the human counterparts. Procedural Memory is the "memory structure to actually remember." Skill Forge is the "self-improves." What this PRD does NOT yet ship is proactivity: an agent that pursues company goals without being asked. That is **Addendum 9 (Goal-Pursuit Loop)**, stubbed below. It cannot be built first, because proactive action toward a goal requires a memory of what worked and a library of runnable moves. This PRD builds that memory and that library.

**Metacron becomes the self-improving product-mother.** The vision: Metacron improves its own ability to be the mother that creates the products and systems that solve problems and generate revenue. Today the Architect agent decomposes, tunes, and discovers, but every decomposition starts cold. Once Skill Forge is live, the Architect's successful onboardings and decompositions become distilled Skills. The per-tenant Skill Library (Sprint 11) gives each customer's fleet a growing library of proven moves. What this PRD does NOT yet ship is the Architect consuming its own distilled Skills to improve how it creates. That is **Addendum 10 (Architect Self-Improvement)**, stubbed below.

**Pathfinder learns to think like the customer.** The vision: Pathfinder listens to and adapts to customers, self-improves, gets better at writing and thinking in the customer's voice, and improves both how it captures signals and how it converts them. The BD-rep user story below ("this draft is in your voice because 14 of your last 20 replies trained it") is the seed. `execute_skill` (Sprint 11) is the latency and cost foundation. What this PRD does NOT yet ship is the per-customer voice model and the signal-to-conversion feedback loop. That is **Addendum 11 (Customer Voice Model & Signal Quality Loop)**, stubbed below.

The sequencing is deliberate. Substrate first (this PRD, Sprints 9 through 12). Proactive and self-improving layers second (Addenda 9 through 11, scoped after Sprint 12 ships and the substrate has real usage data). Discovery before commitment applies: we scope the vision addenda against real Skill Forge output, not against this document.

---

## Why now

Three forcing functions converged this week:

1. **Sprints 3 through 8 shipped a skills surface that humans still have to fill.** `nervous_system.skills` is live and the Library tab renders it, but every skill in it was hand-authored in a Cowork chat or seeded by a migration. That does not scale, and it is not the closed loop we are selling.

2. **Pathfinder's 9-agent chain is hitting cost and latency walls.** At Zedcor's current 601-lead inventory we are fine. At 10 tenants times 50k leads per week the per-hop inference bill compresses our margin and the "source to sales rep in under an hour" claim becomes a lie. Programmatic tool calling, where one inference emits the deterministic glue and Inngest runs it sandboxed, gives us a 5 to 10x token compression and brings the latency floor under 15 minutes.

3. **The Hermes Agent research pass surfaced a vocabulary we can adopt without adopting the runtime.** Three-layer memory, skill self-authoring, `execute_code` as a tool. These are well-trodden patterns now. We can ship them on our existing Inngest plus Supabase plus Slack-Orchestrator stack faster than we could vet, fork, and integrate Hermes. Build the artifact, skip the dependency. Critically, our refusal layer is the structural answer to Hermes's documented failure mode (self-improvement overwriting manual edits): Skill Forge writes only to a proposal queue, never to an approved Skill.

---

## What we are NOT doing

State these out loud so the engineer and the Master Conductor do not drift.

- **We are not installing Hermes Agent or any external agent runtime.** No new VPS. No new Python process with its own memory store. The procedural layer lives in `nervous_system` next to the active and session layers.
- **We are not letting Skill Forge edit approved Skills.** It proposes new versions. Diffs go to Taboo Keeper plus a human reviewer. The "self-improvement overwrites manual edits" failure mode that has bitten Hermes users does not exist in our model by construction.
- **We are not adding a ninth Atrium tab.** Skills live inside the existing Library tab. The Now tab surfaces them. The System tab shows Skill Forge as a node in the Agents Galaxy. No new top-level navigation.
- **We are not building a customer-facing skills marketplace this quarter.** That is a Phase 3 conversation. Today: system skills plus per-tenant skills, both gated.
- **We are not exposing `execute_skill` to non-validated code.** Every code body Skill Forge emits passes Taboo Keeper plus a static-analysis gate before it is callable.
- **We are not creating a new skills table.** `nervous_system.skills` exists and is load-bearing. We extend it.
- **We are not shipping proactivity, Architect self-improvement, or the customer voice model in this PRD.** Those are Addenda 9 through 11, scoped after the substrate ships.

---

## Goals & non-goals

### Goals

1. Extend the live `nervous_system.skills` table into a procedural-memory layer with refusal gating, decay, lineage to source trajectories, version history, and per-tenant scoping. Preserve every existing seeded skill.
2. Ship the Skill Forge agent as the fifth always-on role, on the same Inngest runtime as the existing four.
3. Wire Skill Forge proposals into the existing Taboo Keeper validation path. No new refusal primitives.
4. Surface Skills in three places: Atrium Library tab (system plus per-tenant), Atrium Now tab (contextual surfacing), Metacron per-tenant Skill Library (operator self-service).
5. Implement `execute_skill` as a programmatic tool-calling primitive for the Slack Orchestrator and the Pathfinder agent chain.
6. Stand up Atrium Companion as a minimal Telegram, Signal, and SMS to ingest gateway for the three of us, reusing existing auth and RLS.
7. Hit the "source to sales rep in under 15 minutes" latency target on the Pathfinder pipeline by end of Sprint 12.

### Non-goals

- Hermes-style autonomous self-improvement loop on already-approved Skills.
- Honcho-style dialectic user model. The Elder owns long-term user modeling.
- A customer-facing Skills marketplace.
- Cross-tenant Skill sharing without explicit promotion to system-tier via Taboo Keeper.
- Extending Atrium Companion beyond the three of us in Phase 1.
- Replacing pgvector with FTS. FTS sits next to pgvector for exact-match recall, not instead of it.
- Proactive goal pursuit, Architect self-improvement, customer voice modeling. Addenda 9 through 11.

---

## Success metrics

These are scenario-satisfaction-gated per Addendum 4, not boolean.

| Metric | Baseline (today) | Target (Sprint 12 exit) |
|---|---|---|
| Skills authored by Skill Forge per week (system plus per-tenant) | 0 | >= 15, with >= 80% approved on first review |
| Slack Orchestrator pipelines using `execute_skill` | 0 | >= 40% of multi-step tool chains |
| Pathfinder end-to-end ingest to BD-rep-screen latency (p50) | ~55 min | < 15 min |
| Pathfinder per-lead inference cost (p50) | $0.42 | < $0.10 |
| Library tab skills authored by non-human authors | 0% | >= 70% of net-new skills |
| Atrium Companion captures landing in ingest per week (3 founders) | 0 | >= 50 |
| Refusal-layer overrides of Skill Forge proposals | n/a | < 10% (signal the gate is well-calibrated, not theater) |

---

## User stories

### Kyle (founder, internal)
- "I run the Zedcor weekly digest by hand. Skill Forge watches me, proposes a Skill, Taboo Keeper passes it, Keenan approves, next Friday the Now tab surfaces 'Run Zedcor weekly digest?' as a one-click."
- "At 11pm in the car I voice-memo 'push Zedcor on HubSpot write-through tomorrow' into Telegram. Atrium Companion structures it, ingest writes it, the Now tab shows it on my morning."

### Keenan (cofounder, internal)
- "I review the Skill Forge proposal queue every Monday. Each card shows the trajectory it learned from, the diff against any existing Skill, and the Taboo Keeper signoff. I approve, request changes, or reject. Approvals become runnable. No code review for me."

### Curtis (peer-tier advisor, internal)
- "I cover the proposal queue when Kyle and Keenan are heads-down. Same surface, same authority. My approvals are as load-bearing as theirs."

### Customer admin (Zedcor admin, Metacron)
- "Skill Forge proposed a new 'Harris County monthly check-in' Skill from a successful voice call last week. I see it in my Skill Library, run a dry-run preview, approve. Now my voice agent runs that pattern monthly without me writing a config."

### BD rep (Zedcor end-user, Pathfinder)
- "The outreach draft on this lead says 'this is in your voice because 14 of your last 20 replies trained it.' I click 'use this draft,' edit one line, send. Pathfinder learns from my edit and the next draft is closer." (Note: the full voice model is Addendum 11. Sprint 11 ships the `execute_skill` foundation and the per-tenant Skill that this story sits on top of.)

### Architect agent (autonomous)
- "I am about to propose a new Tier-1 source. I query the Skills procedural layer for any onboarding Skill that matches this source's structure. I find one (`onboard_county_records_source`), invoke it via `execute_skill`, and the source is registered, validated, and added to the rotation in one Inngest run instead of nine."

---

## Architecture overview

```
                    +--------------------------------------------------+
                    |          Atrium Library + Now + System           |
                    |   Metacron per-tenant Skill Library              |
                    |   Pathfinder skill-driven Outreach Drafter        |
                    +--------------------------------------------------+
                                          ^
                                          |  Reads
                                          |
+------------------------------+   +------+-------------+   +----------------------+
|  Active Memory (Now state,   |   | Procedural Memory  |   | Session Memory       |
|  open threads, USER.md-like) |   |  (Skills, runnable |   | (ledger + pgvector + |
|                              |   |   recipes, gated)  |   |  Postgres FTS)       |
+------------------------------+   +--------------------+   +----------------------+
                                          ^
                                          |  Proposes / refines
                                          |
                                  +-------+--------+
                                  |  Skill Forge   |  (5th always-on agent)
                                  +-------+--------+
                                          |
                                  Taboo Keeper validates, then human approver, then persist
                                          |
                                          v
                       Invoked by Slack Orchestrator,
                       Pathfinder agents, Architect via execute_skill()
```

Five concrete additions, all reuse-first:

1. **`nervous_system.skills` extended** (procedural columns, version, lineage, decay) plus `nervous_system.proposed_skills` and `nervous_system.skill_invocations` (net-new). Nervous System Addendum 5.
2. **Skill Forge agent** registered in `nervous_system.agents`. Nervous System Addendum 6.
3. **`execute_skill` tool** in the agent runtime, sandboxed via Inngest step. Nervous System Addendum 7.
4. **Atrium Companion**, Telegram, Signal, and SMS gateway to the existing ingest pipeline. Nervous System Addendum 8.
5. **Postgres FTS columns** added to the ledger and skills, alongside existing pgvector.

Everything else is reuse. No new auth model. No new refusal primitive. No new tab. No new schema.

---

## Phasing

Four sprints across two phases. The Master Conductor (Sprints 9 through 12) runs them in sequence.

**Phase 1, Substrate (Sprints 9 and 10)**

- Sprint 9: Schema extension plus Skill Forge stub plus Library tab Skills surface (read-only).
- Sprint 10: Skill Forge end-to-end (observe, distill, propose, approve, persist), Now tab contextual surfacing.

**Phase 2, Activation (Sprints 11 and 12)**

- Sprint 11: `execute_skill` primitive, Pathfinder agent chain migration to skill-driven pipelines, Metacron per-tenant Skill Library.
- Sprint 12: Atrium Companion v1 for the three of us, observability plus alerting, scenario-satisfaction validation per Addendum 4 wired into Skill approval.

After Sprint 12: >= 15 Skills per week, < 15 min Pathfinder latency, founders capturing via Telegram, and the marketing pitch's "closed loops" sentence is structurally honest. The substrate is then ready for Addenda 9 through 11 to be scoped.

---

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration breaks the ~40 live seeded skills by assuming wrong column names | Medium | High | Mandatory `information_schema` query before the ALTER TABLE, per the Master Conductor migration safety rule. New columns are additive and nullable. No renames of live columns. |
| Skill Forge proposes low-quality Skills and drowns the review queue | High | Medium | Scenario-satisfaction gate per Addendum 4 before a proposal hits the human queue. Auto-reject below threshold. Queue-depth halt at 50 unreviewed. |
| `execute_skill` becomes an RCE vector across tenants | Low | Critical | Static-analysis gate plus Inngest sandbox plus per-tenant RLS on tool inputs plus Taboo Keeper diff review on every code body change. |
| Procedural and session layers drift; same fact in two places with different values | Medium | Medium | Skills reference session-layer trajectory IDs as lineage. Skill cards always show source pointers. Decay on stale Skills. |
| Atrium Companion ingest leaks across tenant boundaries | Low | High | Companion writes are scoped to the founder's `user_id`, never `customer_id`. Founder captures cannot ever land in a customer tenant. |
| Skill Forge collides with Analyst (both pattern-find from the ledger) | Medium | Low | Clear contract: Analyst summarizes for humans, Skill Forge distills for re-execution. They share a query layer, distinct outputs. |
| Existing `status` column (active/scaffolded/deprecated) conflicts with the approval lifecycle (proposed/approved/retired/rejected) | Medium | Medium | Do not overload `status`. Add a separate `lifecycle_status` column. Existing skills default to `lifecycle_status='approved'`. Addendum 5 specifies this. |
| Hermes-style "overwrite manual edits" failure mode sneaks in | Low | High | Hard constraint: Skill Forge writes only to `proposed_skills`, never to `skills` directly. Promotion is human plus Taboo Keeper only. |

---

## Dependencies

- Unicron Nervous System SPEC and Nervous System Addenda 1 through 4 shipped. Sprints 0 through 8 are Deployed or Verified.
- Taboo Keeper API stable (Sprint 3, Verified).
- Scenario and satisfaction validation primitives from Addendum 4 (shipped in Sprint 5, Verified). `vault/wiki/scenarios/` exists and the LLM judge function is live. Confirm both on Sprint 9 day 1.
- `nervous_system.skills` table live with roughly 40 seeded skills (Sprints 3 through 6).
- Inngest step sandbox capability. Confirm with the engineer on Sprint 11 day 1; fall back to Vercel function isolation if needed.
- Slack Orchestrator tool registry extensible (Sprint 2, Verified).
- `pathfinder` schema multi-tenant scoping (live).
- Telegram Bot API, Signal-CLI, and Twilio SMS for Companion. All accounts already exist.

---

## Open questions for engineer

1. **Live skills schema shape.** Run the `information_schema.columns` query on `nervous_system.skills` on Sprint 9 day 1 and reconcile Addendum 5's column list against the verified output before writing the migration. The Sprint 3 migration file and the live schema are known to have diverged (column alignment patches #233 and #234).
2. **Inngest step sandboxing.** Does Inngest's `step.run` give us strong-enough isolation for `execute_skill` code bodies, or do we need to wrap each call in a separate Vercel function? Sprint 11 day-1 spike.
3. **FTS index lifecycle.** Rebuild on every write versus trigger-based? Confirm Supabase's `tsvector` GIN index cost profile at our row counts.
4. **Skill schema versus the SKILL.md convention.** `nervous_system.skills` already carries `skill_md_path` and the repo has a SKILL.md convention from Addendum 2. Align the procedural `steps` representation to the existing SKILL.md shape, not to a new format. Confirm the mapping.
5. **Atrium Companion auth.** Magic Link tied to a Telegram `user_id`, or a static signed token per founder? The latter is faster; the former is cleaner. Default to static signed token for Phase 1.
6. **Decay defaults.** 90 days unused for per-tenant Skills, 180 days for system Skills. Feels right; please challenge.

---

## Appendix: SPECs and Sprint Prompts shipped alongside this PRD

All in the repo, all Master Conductor-runnable:

- **SPEC - Nervous System Addendum 5 (Procedural Memory Layer).md**, in `Company Docs/Specs/`
- **SPEC - Nervous System Addendum 6 (Skill Forge Agent).md**, in `Company Docs/Specs/`
- **SPEC - Nervous System Addendum 7 (Programmatic Tool Calling).md**, in `Company Docs/Specs/`
- **SPEC - Nervous System Addendum 8 (Atrium Companion).md**, in `Company Docs/Specs/`
- **PROMPT - Sprint 9 through 12**, in `Company Docs/Atrium/Prompts/`
- **PROMPT - Master Conductor (Sprints 9-12).md**, in `Company Docs/Atrium/Prompts/`. This is the single paste-ready prompt Kyle relays to Claude Code.

Future, scoped after Sprint 12 ships and Skill Forge has real output:

- **Addendum 9, Goal-Pursuit Loop** (Atrium proactivity: agents that pursue company goals unprompted).
- **Addendum 10, Architect Self-Improvement** (Metacron as self-improving product-mother).
- **Addendum 11, Customer Voice Model & Signal Quality Loop** (Pathfinder thinks and writes like the customer).

- Kyle Kesterson · Unicron Systems · 2026-05-14
