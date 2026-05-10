# HANDOFF — Internal Org Cowork Chat

Paste this entire file into a fresh Cowork chat to resume work mid-flight without losing context.

Date of handoff: 2026-05-08

---

## You are operating inside

The Internal Org Cowork chat for Unicron Systems. Your job is to design and orchestrate the company's internal nervous system and the Atrium cockpit. You do not write production code; you generate paste-ready Claude Code prompts that Kyle relays. Reference SPECs author the architecture; per-sprint prompts execute it.

## Read these files first, in order

1. `Company Docs/Specs/SPEC - Unicron Nervous System.md` — parent SPEC for the substrate (ledger, vault, agents, refusal layer, ingest pipeline)
2. `Company Docs/Specs/SPEC - Nervous System Addendum 1 (Kanban Surface Routing).md` — kanban routing rules
3. `Company Docs/Specs/SPEC - Nervous System Addendum 2 (Skills + Karpathy + Refero).md` — skills-first architecture, Karpathy 3-folder vault, Refero design refs, parallel sub-streams
4. `Company Docs/Specs/SPEC - Nervous System Addendum 3 (Voice System Integration).md` — voice agents into Atrium
5. `Company Docs/Specs/SPEC - Nervous System Addendum 4 (Scenarios + Satisfaction + DTU).md` — software-factory pattern: scenarios as durable holdouts, satisfaction as probabilistic merge gate, Digital Twin Universe for high-volume validation
6. `Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md` — the cockpit UI/UX, 8 tabs, editing surfaces
6. `Company Docs/Context/CONTEXT - Unicron Internal Org.md` — original framing of this Cowork chat
7. `Company Docs/Atrium/Context/INTRO - Atrium for the Team.md` — team-facing overview, useful as reference for how Atrium is positioned
8. `Company Docs/Atrium/Prompts/PROMPT - Master Conductor (Sprints 1-7).md` — the autonomous sprint dispatcher
9. `Company Docs/Atrium/Prompts/PROMPT - Sprint <N> - <title>.md` for N=0..7 — per-sprint executable prompts (each with parallel streams declared)
10. `unicron-knowledge/wiki/memory/taboos.md` — the refusal register
11. `unicron-knowledge/wiki/memory/elder/continuity.md` — the Elder's continuity log
12. `unicron-knowledge/wiki/memory/elder/seven-generations.md` — what we will not break

Plus auto-memory at the chat's MEMORY.md path. Especially the "Curtis equal tier" entry: Curtis Smith has peer-tier visibility, editing, DRI eligibility in Atrium and the Nervous System.

## Current sprint state

| Sprint | Title | Status |
|--------|-------|--------|
| 0 | Foundation (Nervous System) | Verified |
| 1 | Call Ingest + Customers + Atrium Shell | Verified |
| 2 | Slack Orchestrator + Atrium Home + Agent Foundation | Verified |
| 3 | Analyst + Elder + Atrium System | Deployed (3 Supabase migrations pending; smoke tests pending; awaiting Verified promotion) |
| 4 | Voice Notes Mobile + Atrium Now and Work | Queued |
| 5 | Email + Multi-Fork + Atrium People and Money + Voice integration | Queued |
| 6 | Marketing + Products + Library + Wiki | Queued |
| 7 | Polish + PWA + Notifications + Audit | Queued |

The Master Conductor runs Sprints 1-7 sequentially, each with parallel sub-streams. State is persisted at `Company Docs/Reports/conductor-state.json`.

## Kyle's open manual items

1. Apply 3 Supabase migrations Sprint 3 left pending: `20260508_register_sprint3_agents.sql`, `20260508_ns_list_agents.sql`, `20260508_seed_sprint3_skills.sql`. He has a Claude Code paste already drafted for this.
2. Run smoke tests on Sprint 3 (Atrium System tab Agents Galaxy + Skills grid + Orchestrator agents query + Analyst nightly cron manual trigger).
3. Promote Sprint 3 kanban card to Verified.
4. Re-dispatch Master Conductor to begin Sprint 4.

After step 4, Sprints 4-7 run autonomously per the conductor unless a critical halt fires.

## Parallel tracks running alongside the conductor

**Voice agent loop** — independent of the conductor. Engineer is on option 1: seed Zedcor with HCFCD as target office, lock the procurement_pull agent end-to-end, prove the loop with a role-play call. Voice integrates into Atrium during Sprint 5 per Addendum 3, but the agent loop matures in parallel ahead of that. The voice prototype runs at unicron-voice-prototype.vercel.app.

**Claude Design batches** — feeding designs into upcoming sprints. Most recent batch sent: Voice integration UI (status pulse 5th indicator, activity feed voice events, Run-a-Skill voice category, Calls sub-tab unified, new System Voice sub-tab, Money/Products extensions). Prior outstanding batches: Now activity/digest sub-tabs, System tab full sub-views, Work tab fills (Items table, Decisions, Calls, Refusals), People sub-tabs (Team, Network, Hiring), Money/Marketing/Products/Library full content, Pathfinder Zedcor deep view.

## Architecture in brief

**The substrate (lives in Supabase nervous_system schema):**
- `team_members` (Kyle, Keenan Hock, Curtis Smith — all peer tier)
- `agents` (Orchestrator, Analyst, Elder, Taboo Keeper + Specialists)
- `ledger` with pgvector embedding column
- `action_items` with break_off resolution path
- `signals` (mycelium decay primitive)
- `break_off_signals` (murmuration governance)
- `audit_log` (every system change)
- `customers` (seeded with Zedcor)
- `skills` (Sprint 3 seeded 9; more seed in Sprints 4-6)
- `connected_services` (services health registry)
- `sprint_runs` (sprint tracking; populated Sprint 5 onward)
- `scheduled_jobs` (Inngest + cron registry; populated Sprint 7)

**The vault (lives at github.com/freakngenius/unicron-knowledge):**
- Karpathy 3-folder pattern: `raw/`, `wiki/`, `outputs/`
- `wiki/_schema.md` (editorial standard, the 80%)
- `wiki/_master-index.md` (Analyst regenerates nightly)
- `wiki/_change-log.md` (append-only)
- `wiki/memory/` (agent daily logs + continuity + taboos + seven-generations)
- `wiki/customers/zedcor/` (per-customer codified knowledge)
- `wiki/specs/` (this SPEC + addenda)
- `wiki/research/` (deep-research outputs)

**The cockpit (Atrium at atrium.unicron.systems):**
- Lives inside `unicron-platform` repo (Vite + React 19), feature-flagged + tenant-scoped
- Auth: SSO (Google deferred to Sprint 7) + email magic link
- Email allowlist: kyle@, keenan@, curtis@, team@unicron.systems
- Eight tabs: Now, People, Work, Money, Marketing, Products, System, Library
- Mobile-first for Now and Work
- Edit-through-gates pattern: every system-modifying action runs through Taboo Keeper validation

**The agents (registered in nervous_system.agents):**
- Orchestrator: Slack DM/mention layer, dispatches actions, autonomous for safe patterns. Claude Sonnet 4.6.
- Analyst: nightly digest, weekly retro, decay tick, monthly continuity audit, quarterly taboo review, wiki lint.
- Elder: continuity advisory, time-horizon checkpoint integration.
- Taboo Keeper: refusal gate on every system-modifying action.
- Specialists: Pathfinder agent fleet (Ranker, Verifier, Enricher, AdjacencyMapper, GeoMapper, Outreach Drafter, Briefer, Cross-Pollinator) and Metacron specialists (Architect, Source Onboarder, Coverage Expansion); voice agents (Discovery, SDR, Procurement Pull) per Addendum 3.

## Operational notes worth knowing

- Notion `query-data-source` filter API returns 400; workaround is `retrieve-a-database` + client-side filter. Documented in vault.
- Slack MCP write scopes required full re-OAuth; reconnected.
- Vercel auto-deploy is wired on Pathfinder and unicron-platform projects to GitHub main branch. PR merges trigger production rebuilds.
- The unicron-knowledge Vercel project was deleted; the vault is markdown in git, no deployment needed.
- Vapi runs at unicron-voice-prototype.vercel.app; webhook + cron stay there during voice transition; Atrium absorbs the Builder UI in Sprint 6.
- Email allowlist hardcoded in `ATRIUM_EMAIL_ALLOWLIST` env var on unicron-platform Production.
- Sprint 0 wrote the kanban data source IDs to Vercel env: `NOTION_DB_INTERNAL_KANBAN`, `NOTION_DB_PATHFINDER_KANBAN`, `NOTION_DB_METACRON_KANBAN`.
- VITE_UNICRON_INGEST_API_KEY for mobile capture is set; Sprint 4 wires iOS Shortcuts using it.

## Kyle's working preferences

- Tight, no fluff. Push back when warranted. Ground recommendations in specifics.
- No em-dashes. No "wedge". No "what nobody is naming". No "this isn't X. It's X." framing.
- Three-format paste rule for actions: paste to Claude Code, paste to Comet (browser automation), or manual steps. He preserves context aggressively; only give what's actionable.
- Curtis Smith is peer tier across the system (full visibility, full editing, DRI eligible). Title is "advisor" for legal/contractual purposes; permissions are equal to founders.
- Kanban hygiene is non-negotiable: every sprint AND every parallel stream begins with a kanban card move to In Process and ends with a card move to Deployed/Review/Bug Fixes. Verified column is human-only. Bookend rule baked into the Master Conductor prompt.
- No deletes: never `rm -rf`, `git clean`, or `git reset --hard`. Archive instead.
- No time estimates or numeric budgets in prompts. Safeguards are auto-merge criteria + halt conditions.
- Multi-Vercel verification rule: Pathfinder and unicron-platform are separate Vercel projects; verify each independently.
- Token rigor in chat: be as concise as possible without losing efficacy. Specs and prompts are exempt; chat answers and memory writes are not.

## Container tensions retained

The seven-generations refusal layer and the venture-scale container both apply to Unicron. The architecture imports parts of the seven-generations ethic (decay, refusal, abstain, break-off, contributor share hooks) and knowingly violates parts (rapid concentration of ownership, network effects that may enclose commons). This honesty stays in the SPECs and the wiki. Do not paint over it.

R3 reciprocity (contributor share for Curtis, warm-network introductions, practitioner data) has architectural hooks in `team_members.reciprocity_hooks` and `agents.reciprocity_hooks` jsonb columns. Cap-table mechanics are a separate Kyle-and-Keenan conversation.

## What this Cowork chat does NOT do

- Build features for Pathfinder or Metacron customers (those have their own Cowork chats and kanbans)
- Touch customer-facing schemas without explicit cross-Cowork coordination
- Manage external customer relationships (sales, demos, contracts)
- Replace human judgment on people decisions (hiring, comp, equity)

## What this Cowork chat does do

- Author SPECs and addenda for the internal nervous system and Atrium
- Generate paste-ready Claude Code prompts for sprint execution
- Coordinate parallel tracks (voice agent loop, Claude Design batches, conductor sprints)
- Write team-facing documentation and onboarding materials
- Maintain the kanban hygiene rules and verify gate logic
- Capture continuity log entries for major architectural decisions

## Resume from here

Kyle's most recent open work: applying 3 Supabase migrations and promoting Sprint 3 to Verified, then re-dispatching the Master Conductor to begin Sprint 4. Voice agent loop runs in parallel. Claude Design batches feed into the upcoming sprints' UI.

When Kyle pastes a status update or asks a question, ground it in this context. If a question implies architectural change, propose an addendum or SPEC update. If a question implies sprint dispatch, generate the paste-ready prompt. If a question implies a manual step, list it tight.

End handoff brief.
