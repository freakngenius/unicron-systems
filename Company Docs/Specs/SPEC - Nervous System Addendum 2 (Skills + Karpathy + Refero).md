# SPEC Addendum 2 — Skills-First Architecture + Karpathy Patterns + Refero Design References

**Status:** Active
**Parent SPECs:** SPEC - Unicron Nervous System.md, Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md
**Companion:** SPEC - Nervous System Addendum 1 (Kanban Surface Routing).md
**Date:** 2026-05-05
**Owner:** Kyle Kesterson (Internal Org Cowork chat)

This addendum integrates four threads:
1. **Skills-first architecture**: domains → tasks → skills → automations (Chase AI Agentic OS pattern)
2. **Karpathy 3-folder vault**: raw / wiki / outputs with LLM-maintained master index
3. **LLM Council and Autoresearch patterns** for hard research and verification work
4. **Refero design references** for Atrium UI

Plus a parallel-execution strategy for sprints.

Merge into main SPECs at v0.3 after Sprint 1 ships.

---

## 1. Skills-First Architecture

### 1.1 The hierarchy

```
Domain → Task → Skill → Automation
```

- **Domain**: a coherent area of work (Research, Sales, Operations, Memory, Marketing, Discovery, Internal Org, Pathfinder, Metacron)
- **Task**: a specific recurring unit of work within a domain (write a follow-up email, run a daily digest, score a lead)
- **Skill**: a codified version of a recurring task. Lives in the Claude Code skills system (`.claude/skills/<name>/SKILL.md`) and exposed in Atrium as a clickable run-target.
- **Automation**: a skill promoted to scheduled or trigger-based execution (cron, webhook, ledger event)

Every skill answers one prompt: "What recurring outcome does this produce?"

### 1.2 Skills inventory (initial set per domain)

Each entry is `skill_name (input → output)`. Sprint allocations noted.

**Internal Org / Memory** (Sprint 3, 6)
- `run-decay-tick` (none → archive count) — promote nightly cron as clickable skill
- `daily-digest` (none → vault doc + Slack post)
- `weekly-retro` (week range → vault doc)
- `monthly-continuity-audit` (none → flagged commitments)
- `quarterly-taboo-review` (none → proposed taboo edits)
- `onboard-team-member` (name, role, email → Slack invite + Notion access + welcome briefing + first action item)
- `propose-taboo-edit` (proposed text → vault PR)
- `override-taboo-bounce` (bounce_id, reason → continuity log entry + override applied)
- `regenerate-master-index` (none → updated `wiki/_master-index.md`)
- `vault-search` (query → ranked results)
- `promote-insight-to-memory` (ledger_id → vault entry + embedding)
- `vault-lint` (none → contradictions, orphans, stale claims report)

**Discovery / Sales** (Sprint 2, 5)
- `schedule-discovery-call` (contact, topic → calendar invite + ledger entry)
- `extract-vertical-signals` (call_id → vertical fit score + supporting evidence)
- `draft-follow-up-email` (call_id, tone → email draft)
- `track-pipeline-stage` (customer_id, new_stage → updated row + Notion card move)
- `generate-proposal` (customer_id, scope → docx draft in `outputs/proposals/`)

**Research** (Sprint 5)
- `deep-research` (topic → 8-15 page synthesized brief in vault `wiki/research/<topic>/`, Karpathy autoresearch pattern)
- `competitor-watch` (competitor → weekly digest of their public moves)
- `llm-council-deliberate` (question, options → council verdict per Karpathy llm-council pattern)
- `light-rag-query` (query → ranked answers with span-level citations)
- `morning-trend-scan` (none → top 5 surface signals + relevance to Unicron)

**Marketing** (Sprint 6)
- `draft-blog-post` (topic, angle, target_length → markdown draft)
- `draft-social-post` (channel, theme → 3 variants)
- `generate-positioning-deck` (audience, key_claims → pptx)
- `update-manifesto-page` (page, proposed_changes → vault PR)

**Productivity** (Sprint 2, 4)
- `morning-brief` (user → personalized brief with calendar + DRIs + escalations)
- `inbox-triage` (user → categorized email list with proposed actions)
- `quick-capture` (text or audio → ledger row + vault entry in `raw/inbox/`)

**Pathfinder / Metacron** (existing agent runs, register as skills in Sprint 5)
- Existing specialists (Ingestor, Ranker, Verifier, Enricher, AdjacencyMapper, GeoMapper, Outreach Drafter, Briefer, Cross-Pollinator, Architect, Source Onboarder, Coverage Expansion) get registered in `nervous_system.agents` and exposed as clickable skills in Atrium

### 1.3 Skill schema

Every skill lives at `.claude/skills/<skill-name>/SKILL.md` in the appropriate repo (Pathfinder, unicron-platform, or unicron-knowledge). SKILL.md frontmatter:

```yaml
---
name: skill-name
description: Short, triggering description (one sentence)
domain: research | memory | discovery | sales | operations | marketing | productivity | pathfinder | metacron
type: manual | scheduled | triggered
inputs:
  - name: param_name
    type: string | number | boolean | uuid | file
    required: true
    description: ...
outputs:
  - type: vault_doc | ledger_row | notion_card | slack_message | docx | pptx | xlsx
    location: ...
schedule_cron: optional
trigger_event: optional
refusal_gate: yes | no  # whether Taboo Keeper validates before execution
budget_usd_per_run: optional
---

# Skill body: instructions, context, examples
```

Atrium reads SKILL.md files from a registry table `nervous_system.skills` (populated by an Analyst nightly scan of all repos' `.claude/skills/` folders).

### 1.4 Atrium "Run a Skill" surface

Add a primary surface to Atrium Home tab matching the Chase AI Agentic OS pattern:

```
RUN A SKILL TO BEGIN
[click a skill · press run · or type any prompt]
[prompt textarea]
[RUN →] [CLEAR]

MEMORY:    [Vault Cleanup] [Daily Digest] [Vault Search] [KB Status]
PRODUCTIVITY: [Morning Brief] [Inbox Triage] [Quick Capture]
RESEARCH:  [Deep Research] [LLM Council] [LightRAG Query] [Morning Trend]
DISCOVERY: [Schedule Call] [Extract Signals] [Draft Follow-up]
SALES:     [Pipeline Stage] [Generate Proposal]
MARKETING: [Blog Post] [Social Post] [Positioning Deck]
OPERATIONS: [Onboard Member] [Propose Taboo Edit]

[FORECAST · 5H]    [RECENT RUNS]    [VAULT PULSE]
```

Each skill button: click to run with default params or expand to set params. Recent runs panel shows status, output link, cost.

This surface lands in **Sprint 2** (Atrium Home tab) as a stub with a placeholder skill list, then populates progressively as each domain's skills land in Sprints 3, 5, 6.

### 1.5 Skills creation strategy

Three creation paths:
1. **Analyst auto-proposes**: when a sequence of three identical or near-identical Cowork-driven prompts shows up in audit log, Analyst proposes codifying as a skill. PR opens with draft SKILL.md.
2. **Kyle, Keenan, Curtis hand-author**: any peer-tier member can write a SKILL.md and PR it.
3. **Skill creator skill** (`anthropic-skills:skill-creator` already installed): use Claude to scaffold a new skill from a description.

Adding a skill is a vault PR. Reviewer is the other peer-tier member. Merge populates the skill registry on next Analyst scan.

---

## 2. Karpathy Patterns

### 2.1 Three-folder vault (adopted with adaptations)

Karpathy: `raw/`, `wiki/`, plus `CLAUDE.md` schema. Output artifacts implied.

Unicron adoption: `raw/`, `wiki/`, `outputs/` plus a schema document at `wiki/_schema.md` (not CLAUDE.md to avoid conflict with Claude Code's CLAUDE.md convention; the schema is the wiki's editorial style guide).

```
unicron-knowledge/
├── README.md
├── raw/                                  # Immutable. Humans dump; agents do not edit.
│   ├── inbox/                            # quick captures from Slack DM, voice memos, Apple Notes
│   ├── calls/                            # raw call transcripts (Plaud, Fathom)
│   ├── slack-threads/                    # extracted Slack threads
│   ├── emails/                           # raw email content
│   ├── articles/                         # web articles, screenshots, references
│   └── _ingest_log.md                    # append-only log of what was ingested when
├── wiki/                                 # LLM-maintained codified knowledge
│   ├── _schema.md                        # editorial style guide (this is the 80%)
│   ├── _master-index.md                  # LLM's table of contents (regenerated nightly)
│   ├── _change-log.md                    # append-only log of wiki changes
│   ├── company/                          # what Unicron is (manifesto, vision, paradigm map)
│   ├── memory/                           # agent state
│   │   ├── orchestrator/
│   │   ├── analyst/
│   │   ├── elder/
│   │   │   ├── continuity.md
│   │   │   └── seven-generations.md
│   │   ├── taboos.md
│   │   └── cowork/
│   ├── customers/                        # per-customer codified knowledge
│   │   ├── _index.md
│   │   ├── zedcor/
│   │   └── realberry/                    # placeholder until real
│   ├── people/                           # team member + advisor profiles
│   ├── decisions/                        # codified decision entries
│   ├── retros/                           # weekly + sprint retros
│   ├── specs/                            # technical specs
│   ├── prds/                             # product requirements
│   ├── plans/                            # execution playbooks
│   ├── research/                         # codified research domains
│   │   └── <domain>/                     # autoresearch outputs land here
│   ├── how-to/                           # wiki onboarding/how-it-works pages
│   └── prompts/                          # paste-ready Claude Code prompts (wiki side; canonical)
└── outputs/                              # finished products, query results
    ├── reports/                          # build reports, conductor completions
    ├── decks/                            # presentation decks
    ├── briefs/                           # Briefer agent outputs
    ├── proposals/                        # generated proposals
    └── deliverables/                     # any other shipped artifact
```

### 2.2 Migration from current vault

Sprint 0 already migrated `Company Docs/` flat. Sprint 1 (or a small reorg sub-sprint between Sprint 0 and Sprint 1) restructures:

| Current location | New location |
|------------------|--------------|
| `Vision/` | `wiki/company/` |
| `Specs/` | `wiki/specs/` |
| `PRD/` | `wiki/prds/` |
| `Plans/` | `wiki/plans/` |
| `Reports/` | `outputs/reports/` |
| `Prompts/` | `wiki/prompts/` |
| `Misc Docs/` | split: operational notes → `wiki/`, transient → `raw/articles/` |
| `Memory/` | `wiki/memory/` (subdirs preserved) |
| `Inbox/` | `raw/inbox/` |
| `Decisions/` (new from Sprint 0) | `wiki/decisions/` |
| `Calls/` (new from Sprint 0) | `raw/calls/` (raw transcripts) AND `wiki/customers/<customer>/calls/` (codified summaries) |
| `Retros/` (new from Sprint 0) | `wiki/retros/` |

Critical rule: `raw/` content is **immutable** after ingest. Agents read; agents never modify. Corrections happen by adding new entries that reference and update via wiki entries, not by editing raw.

### 2.3 The schema (`wiki/_schema.md`)

The 80% of the outcome. Defines:
- Naming conventions: kebab-case files, sentence-case headers
- Frontmatter standard (already defined in parent SPEC section 6.3)
- When to create vs. append (conflict resolution)
- Cross-referencing policy (always use `[[wiki/<path>]]` not bare `[[name]]`)
- Span-level citation format: `<sup>[ledger:<uuid>:<span>]</sup>` for inline references
- Page-creation rule: a new wiki page when a topic accumulates 3+ raw sources or 1 substantive decision
- Update rule: when new raw source contradicts existing wiki, the agent appends a `## Update YYYY-MM-DD` section, not silent edit
- Lint rule: every wiki page passes a structure check (frontmatter present, links resolve, citations exist)

The schema lands in Sprint 1 (vault reorg sub-task) and is iterated by Analyst proposals over time.

### 2.4 Master index pattern

`wiki/_master-index.md` is the LLM's table of contents. Regenerated nightly by Analyst:
- Sections per top-level wiki folder
- Per section: list of pages with one-line summary
- Cross-references: which pages reference which other pages

Index-first query pattern: when Cowork or any agent wants to query the wiki, load `_master-index.md` first to orient, then fetch specific pages. This keeps context small and routing reliable.

### 2.5 Change log pattern

`wiki/_change-log.md` is append-only. Every wiki edit logs:
- Date
- Page modified
- Change type (created, appended, updated, deprecated)
- Source (raw/<path> if ingest-driven, or human author if hand-edited)
- One-line summary

Enables audit and rollback at the knowledge layer (parallel to git history but human-readable).

### 2.6 Three maintenance primitives

Promoted to scheduled jobs:

- **Ingest** (continuous, on every `/api/ingest` write): create or append wiki pages from raw sources; build cross-references; log change.
- **Query** (on demand): load index → fetch specific pages → answer.
- **Lint** (weekly Sunday 22:00 PT, by Analyst): contradictions, stale claims, orphan pages, missing cross-references, broken citations. Output: `outputs/reports/wiki-lint-YYYY-WW.md` with proposed fixes for human review.

### 2.7 LLM Council pattern

Implement as a Specialist agent for hard decisions. Three-stage loop per Karpathy llm-council:

1. **Parallel response**: dispatch query to 3+ models (Claude Opus, Claude Sonnet, plus optionally GPT or Gemini via existing LLM gateway). Each answers independently.
2. **Anonymized review**: each model receives the others' answers (identities hidden), ranks them on accuracy and insight.
3. **Chairman synthesis**: a designated Chairman (Claude Opus by default) compiles into a final answer.

Use cases:
- Hard architectural decisions ("should we adopt this third-party library")
- Customer commitment decisions ("should we accept this scope")
- Vertical fit decisions ("should we expand to this market")
- Anything tagged `priority: irreversible` per the verify gate

Skill name: `llm-council-deliberate`. Lands in **Sprint 5** as part of multi-fork sprint contract since both share parallel-dispatch + scoring infrastructure.

### 2.8 Autoresearch pattern

Implement as the `deep-research` skill. Karpathy autoresearch loop:
- Input: a topic
- Output: 8-15 synthesized wiki pages in `wiki/research/<topic>/` with span-level citations
- Process: query decomposition → parallel source ingestion → cross-reference building → multi-page synthesis
- Validators: source hashes (immutable raw), span-level citations, regression tests (lint rules), human review (PR)

Skill: `deep-research`. Lands in **Sprint 5**. Used for: vertical hunting, customer research, competitive landscape, technical due diligence.

### 2.9 Epistemic drift mitigation

The risk: LLM misinterprets a source, error becomes part of wiki, future ingests reinforce the error.

Mitigations baked into the architecture:
- **Immutable raw**: errors in interpretation can be corrected by re-deriving from raw, since raw is preserved
- **Weekly lint**: Analyst flags contradictions and stale claims for human review
- **PR review on wiki changes**: every wiki PR is reviewed by a peer-tier human or surfaces in `#orchestrator-feed` for review
- **Span-level citations**: every claim in wiki cites specific raw source span; broken citations fail lint
- **Change log**: every wiki edit traceable via `_change-log.md`

---

## 3. Refero Design References

### 3.1 Source URLs

Atrium UI sprints reference these two pages via the Refero MCP (already connected in Claude Code):
- https://refero.design/pages/52bb2c69-2d28-4fdf-8164-6f01a58eba78
- https://refero.design/pages/198ab5d6-1b94-4a92-88c0-97fb0dc9c9e7

### 3.2 Application

In Sprints 2, 4, 5, 6, 7 (any sprint that builds Atrium UI), the prompt instructs Claude Code to:

1. Use Refero MCP to fetch design context from both URLs
2. Synthesize a hybrid: take navigation, density, and information hierarchy patterns from both
3. Apply consistently across Atrium tabs

The hybrid intent: Atrium should feel like a thoughtful product, not a quick admin panel. Dark mode primary, accent color (the Unicron orange from the brand). Generous whitespace where information density is low (Now tab); dense data tables where appropriate (Work tab, Audit log).

### 3.3 Design tokens

Bake these into the unicron-platform Tailwind config or CSS variables (Sprint 2):

- Primary background: deep neutral (matches Unicron brand)
- Accent: brand orange (read from existing `Brand/Images/` palette if present, otherwise approximate)
- Type: existing unicron-platform font stack (don't replace; align)
- Card radius: 12px
- Shadow: subtle, layered
- Animation: 200ms ease for hover and state changes; 400ms for page transitions

### 3.4 Component library notes

- Status pulse indicators: refer to Refero design references for cluster patterns
- Skill cards: clickable tiles with category grouping (matches Chase AI Agentic OS screenshot)
- Activity feed: timeline style with throttled updates
- Kanban embeds: respect Notion's visual language but render in Atrium's design system
- Charts: Recharts with restrained color palette; no rainbow bars

---

## 4. Parallel Execution Strategy

### 4.1 Within-sprint parallelism

Each sprint declares parallel sub-streams. The Master Conductor dispatches them concurrently via the Task tool, each in its own git worktree (per `using-git-worktrees` skill). Streams synchronize at integration points within the sprint.

Example for Sprint 1 (already saved, this addendum applies on top):
- Stream A: Supabase migrations (customers table, ledger updates, embeddings RPC)
- Stream B: Ingest base library + call ingest skill + Taboo Keeper integration
- Stream C: `/api/ingest` real handler + Fathom webhook + Plaud handler
- Stream D: DNS provisioning + Atrium app shell + auth + email allowlist

Streams A through D run in parallel worktrees. Integration: stream B and C merge after both complete (B provides the library, C wires the route). Stream D is independent.

### 4.2 Sprint dependencies remain sequential

Sprint N+1 still requires Sprint N's done criteria. Within-sprint parallelism does not change cross-sprint dependencies.

### 4.3 Master Conductor update

The Master Conductor dispatches sprints sequentially as before, but within each sprint:
1. Read the sprint prompt
2. Identify declared parallel streams (each sprint prompt v0.2 onward will declare them under a "Parallel streams" section)
3. Create one worktree per stream
4. Dispatch each stream as a sub-agent via the Task tool
5. Wait for all streams to complete
6. Run integration tasks (which depend on multiple streams)
7. Run sprint-level done criteria
8. Promote kanban card

This change applies to Sprints 1 through 7 retroactively. Each per-sprint prompt should be amended to declare its parallel streams.

### 4.4 Stream declaration template

Add to each per-sprint prompt:

```markdown
## Parallel streams

- **Stream A** (worktree `<sprint>-streamA`): [tasks]
- **Stream B** (worktree `<sprint>-streamB`): [tasks]
- **Stream C** (worktree `<sprint>-streamC`): [tasks]

## Integration tasks (run after all streams complete)

- [task 1]
- [task 2]
```

The Conductor dispatches streams concurrently, then integration tasks after sync.

---

## 5. Sprint impact summary

| Sprint | New work added by this addendum |
|--------|--------------------------------|
| 1 | Vault reorg into raw/wiki/outputs; write `wiki/_schema.md`; migrate Company Docs into new structure; declare 4 parallel streams |
| 2 | Atrium Home tab includes "Run a Skill" surface (stub initially); skills registry table provisioned; Refero MCP referenced for UI patterns |
| 3 | Skills surface populated with Internal Org / Memory skills; Analyst auto-regenerates `wiki/_master-index.md` nightly + runs weekly lint |
| 4 | Skills surface adds Productivity skills (morning-brief, inbox-triage, quick-capture); Refero patterns extended to Now and Work |
| 5 | LLM Council specialist agent built; `deep-research` skill (autoresearch pattern); skills surface adds Research/Sales/Discovery; multi-fork uses LLM Council for scoring |
| 6 | Skills surface adds Marketing skills; Library/Wiki view renders `_master-index.md` first; auto-generated wiki pages (whats-connected, master-index) all working |
| 7 | Skills surface UX polish; PWA respects skill click flow; final consistency pass against Refero references |

---

## 6. Open decisions

1. **Refero MCP scope**: confirm Refero MCP can pull design specifications (not just thumbnails). If Claude Code's Refero MCP only returns image URLs, the design hybrid happens by visual reference, not programmatic component extraction. Sprint 2 verifies.

2. **LLM Council model selection**: Claude Opus + Claude Sonnet + GPT (via gateway) is the proposed default. Confirm or adjust before Sprint 5. Cost implication: each council deliberation costs ~3x a single-model call.

3. **Skill auto-promotion threshold**: Analyst auto-proposes a skill when 3 identical prompts appear in audit log within 30 days. Tune the threshold based on observed false positives.

4. **Vault reorg timing**: insert as a sub-task in Sprint 1, or as a dedicated tiny sprint between 0 and 1? Recommendation: Sprint 1 sub-task (Stream A). Less ceremony, same outcome.

End Addendum 2.
