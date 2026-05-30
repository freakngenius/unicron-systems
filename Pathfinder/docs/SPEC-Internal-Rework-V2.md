# SPEC: Pathfinder Internal Rework V2 (fix pass)

Reference spec for the second pass on the Internal rework. The first pass shipped the catalog and four module surfaces but several missed their quality bar on the live app. This pass fixes them from real screenshots of internal.unicron.systems. Place this file in the Pathfinder repo before launching. Each stream's light prompt points here.

App: Pathfinder, github.com/freakngenius/unicron-systems, the /Pathfinder folder, Next.js 14, basePath /pathfinder. Internal is org #4, slug 'internal', served at internal.unicron.systems and /pathfinder/internal. It renders through the catalog: app/[slug]/page.tsx and the lib/catalog renderer read architecture.modules and mount the registered module components. The modules block is live in the Internal org row (pathfinder.organizations.architecture).

---

## SHARED, every stream obeys

AUTHORITY: Pathfinder/CLAUDE.md is the authoritative build protocol, with one explicit operator override for this batch. Kyle Kesterson, operator and repo owner, authorizes self-merge of these fix branches when the AUTO-MERGE GATE passes. This overrides the CLAUDE.md never-self-merge default for these branches only. Do not pause to re-confirm. Every other CLAUDE.md rule still binds.

HARD CONSTRAINTS:
1. No destructive git. Never git reset --hard, git clean, git checkout -- ., git restore .. Stash untracked or modified work before touching any worktree you did not create. Undo a bad merge with git revert, never reset. git push --force-with-lease is allowed on your own feature branch after a rebase; never plain --force, never force-push main.
2. Worktree-based. Use the writing-plans skill: write docs/PLAN-<branch-slug>.md (file scope, module-by-module outline, test plan, gate evidence). The operator pre-approves this batch: write the PLAN for the record, then proceed to code without pausing.
3. Verified kanban column is human-only. Never move a card to Verified.
4. Multi-Vercel: Pathfinder and unicron-platform are separate Vercel projects. Verify each independently.
5. No em-dashes or en-dashes anywhere. No time estimates, no numeric cost caps.

SAFETY RULE, non-negotiable: additive and Internal-scoped. Zedcor (#1), Realberry (#2), Funder (#3) must render byte-identically before and after. Internal renders through the catalog modules; the other orgs render through the floor. Never change a shared component's default behavior in a way that alters those orgs. If a module needs different behavior, change the module, not the shared floor component. Run scripts/verify-orgs-byte-unchanged.ts before merge.

LIVE-VERIFICATION RULE (the lesson from pass 1): merged code is not done. A change is done only when it is verified on the live app and the live database, not just green in CI. Specifically:
- If your change needs a database or config change (a migration, an architecture edit, a new table, a new Notion DB id in env), you must ensure it is APPLIED to the production Supabase project (ref anfihcusvekpovcchpoh) and to the live env, and you must confirm it by querying prod. A migration file merged to the repo does NOT auto-apply. State in your PR exactly what was applied and paste the confirming query result.
- Confirm the rendered result on the deployed Internal app (internal.unicron.systems), not just in a unit test. Describe what you verified.

AUTO-MERGE GATE (operator-authorized), merge your own PR when ALL hold: build, lint, type-check, all stream tests green; CI matches the repo exactly (pnpm, frozen lockfile, MEMORY/spec-references.md entries for changed lib/ files, numeric cron day-of-week if touched); Pathfinder Vercel preview green; the Zedcor-unchanged gate passes (verify-orgs-byte-unchanged.ts); and any required DB/config change is applied to prod and confirmed by query. Then merge and move cards to Deployed.
AUTO-REVERT: any post-merge Pathfinder deploy failure, or any sign the other three orgs changed, reverts the merge (git revert) and moves cards to Bug Fixes with evidence.
HARD-HALT: destructive-git situation, an unresolvable failing test, or a change that would alter Zedcor/Realberry/Funder. Halt and report. Never fabricate data or weaken a test to force green.

QUALITY BAR: Zedcor-grade, and the bar is Kyle's: would he show it to a salesperson and would that salesperson understand it without explanation. Real values with human labels, never raw schema keys. Plain language over jargon.

INTERNAL SCHEMA (labels): company_name (Company), service_category (Service category), sales_motion (Sales motion), footprint (Operating footprint), hq_location (Headquarters), licensure (Contractor licensure), federal_registration (Federal registration), association_memberships (Trade associations), company_size (Size), warm_intro (Warm intro), first_step (Recommended first step), score (Score), source (Source). Always render the display_label, never the field key. The detail view (CompanyDetail module) already renders these correctly; use it as the in-repo reference for how to project a row to real values.

KANBAN: each stream's cards to In Process at start, Deployed on merge, Bug Fixes if halted. Never Verified.

LAUNCH ORDER: Stream E (card rendering fix) is foundational. The broken raw-key card appears on the companies list, the dashboard feed, and the pipeline cards, so all surfaces depend on one fixed card. Land E first. Then F, G, H branch from post-E main and run in parallel.

---

## STREAM E, Cards and Companies (foundational)

THE DEFECT (from the live Companies screen): every card renders raw uppercase schema keys (COMPANY_NAME, SERVICE_CATEGORY, FOOTPRINT, SALES_MOTION) with blank values and an em-dash, and only SCORE resolves. The card is printing the field key and reading the value off the wrong path, so nothing but score shows. This is the original pass-1 defect, still live on the companies list and the dashboard cards.

FIX:
- Find the card component the companies list and the dashboard feed use (the ranked-feed module card, and any floor LeadCard still in use on these routes). Make it project each row to real values with human labels exactly as the working CompanyDetail module does. A card shows: company name (not "COMPANY_NAME"), service category, operating footprint, sales motion, HQ, the score, and the one-line "why" from the rationale. No raw keys, no blank fields; if a value is genuinely missing show a clean placeholder, not the key.
- The companies list, the dashboard feed cards, and the pipeline cards must all use this one fixed card so they are consistent. This is why E lands first.
- Companies route: add sort controls (a dropdown): by score (default, desc), company name, service category, recently added. Keep it simple and obvious.

DONE: open internal.unicron.systems Companies and every card shows real labelled values and the why, sortable. The same card renders correctly on the dashboard feed and pipeline. Verified on the live app, not just a unit test.
TESTS: a card renders display_labels and real values for a real Internal company (for example Manson Construction Co), never a raw key; sort reorders correctly.
PR BLOCKER: any card rendering a raw schema key or a blank field. Regression: Zedcor/Realberry/Funder unchanged.

---

## STREAM F, Dashboard and Search

Branch from post-E main; consume E's fixed card, do not redefine it. Kyle's verdict on the current dashboard: unclear usefulness, the filters are dead text inputs, KPIs are unreadable to a salesperson, the feed cards are blank, "Active outbound motion 0%" reads as broken. Decision: BOTH SURFACES.

BUILD:
1. Feed-first landing: make the ranked companies feed the primary Internal landing surface, using E's card, with a single smart search bar at the top. The search field navigates the data: typing a company name, service category, state, or score filters and surfaces matching companies and lets the user jump to one. One field, not the four dead text inputs. Real clickable dropdown filters (service category, sales motion, federal registration, source) may sit beside it as quick refinements, but the single search is the primary control.
2. A separate metrics view (a tab or route) for when the numbers are wanted, with every metric in plain language a salesperson understands. For each KPI render a short plain-language tooltip:
   - Companies verified today: how many companies the system confirmed today as good-fit leads (passed the verification threshold).
   - Active outbound motion: the share of companies with evidence of an active sales team or outbound hiring. The live 0% is the bug to fix: compute it honestly from the sales_motion signal. If the true value is near zero because most rows are "Unknown" (enrichment could not confirm), do not show a bare "0%" that reads as broken; show the honest picture (for example "Confirmed active: 0 of 229; 220 Unknown") with the tooltip explaining that Unknown means not yet confirmed, not absent. Never display a misleading zero.
   - Average sales priority: the average lead score out of 100 (label it "/100", not a bare percent).
   - Sources live: how many data sources are currently feeding leads, of those registered (explain which two are live).
   Every metric reconciles to a real query; a metric that cannot resolve is dropped, not shown as zero.

DONE: the Internal landing is the feed with one working smart search; a separate metrics view exists where each KPI is legible and honest with a plain-language tooltip; no dead text filters; no misleading 0%. Verified on the live app.
TESTS: the smart search filters the feed by typed query; each KPI maps to a real query and the outbound-motion metric never renders a bare misleading zero.
PR BLOCKER: a KPI showing a placeholder or misleading zero, or a dead text filter remaining. Regression: other orgs unchanged.

---

## STREAM G, Pipeline and Notion two-way sync

Branch from post-E main; use E's card for the kanban cards. The current board renders seven stages but cards cannot be moved, there is a green status dot on Contacted though it holds zero cards, and all 229 companies sit in New / Outreach Ready. It is not a working kanban and it does not sync anywhere.

BUILD:
1. Make it a real kanban: cards drag between the seven stages (new-outreach-ready, contacted, in-conversation, demo-scheduled, proposal, won, lost) and the move persists to the project row in Supabase (a pipeline_stage column or the existing equivalent; discover it). Optimistic UI, persisted on drop.
2. Fix the stage indicator bug: the colored dot should reflect each stage's real state and count, not a hardcoded green on Contacted. Remove the anomaly.
3. Notion two-way sync (operator chose: create a new Notion DB). Create a dedicated Notion database "Internal Pipeline" with properties matching the lead (Company, Score, Service category, Stage as a Notion status/select with the seven stages, HQ, Source, and a link back to the app detail view). Seed it from the Internal companies. Then sync both directions: a drag in the app updates the Notion row's Stage, and a Stage change in Notion reflects on the board (poll or webhook; reuse the existing Notion connector pattern in the repo). Store the new Notion database id in env/config and APPLY it to the live environment; confirm sync works against the live DB. The Internal sales kanban is a customer-facing sales surface, distinct from the dev Notion kanbans in CLAUDE.md; do not touch those.

DONE: cards drag and persist; the dot anomaly is gone; a new Internal Pipeline Notion DB exists, seeded, and a stage change syncs both ways, verified live in both the app and Notion.
TESTS: a drag persists the stage to Supabase; an app stage change writes to Notion; a Notion stage change is reflected on the board; the stage-dot reflects real counts.
PR BLOCKER: a drag that does not persist, the green-dot anomaly remaining, or sync that only goes one way. Regression: other orgs and the dev Notion kanbans untouched.

---

## STREAM H, Lead Chat Agent (new feature)

Branch from post-E main. New capability: a pop-up chat agent on the Internal surfaces, like the existing Pathfinder chat, that lets a salesperson ask questions about the leads, interact with the data, and run live research.

REUSE: the repo already has a chat agent at components/chat/ (IntelligenceChat.tsx, ChatInput, ChatMessage, ChatContextIndicator). Mirror and adapt it for Internal rather than building from scratch. Discover how it is wired and its existing API route.

BUILD, think through the UI/UX:
- A persistent launcher (a small floating button, bottom-right) on the Internal dashboard, companies, and detail surfaces. Click to open a panel that slides in over the right side, does not navigate away, and can be minimized. On a lead detail page it opens pre-scoped to that company (context indicator shows which lead). On list pages it answers across the visible/filtered set.
- The agent answers questions about the leads using the org's real data (scores, signals, enriched fields, rationale): "which of these have confirmed federal awards", "draft an opener for Manson", "why did Thalle score 55".
- Built-in research: a Perplexity Sonar tool the agent can call to research any lead live (recent news, leadership, hiring signals) and fold the result into its answer, with the source links. Reuse the existing Perplexity integration in the repo if present; otherwise add a Sonar call behind the existing LLM gateway.
- Persisted history: a new table (for example pathfinder.lead_chat_messages) keyed by org and optionally by company, so a salesperson's chat history survives reloads and is retrievable per lead. Apply the migration to prod and confirm. Show prior threads in the panel.
- UX details: streaming responses, a clear "researching with Perplexity" state when the Sonar tool runs, copy-to-clipboard on any drafted message, and the context indicator always showing what the agent is scoped to.

DONE: a floating chat launcher on the Internal surfaces opens a panel scoped to the right lead context, answers from real data, can run a live Perplexity Sonar research call with sources, and persists history across reloads. Verified on the live app with the history table live in prod.
TESTS: the agent answers a data question from a real Internal lead; the Sonar tool path is exercised (mock the external call in test); a message persists to and loads from the history table.
PR BLOCKER: chat history that does not persist, or research with no source attribution. Regression: other orgs unchanged; the existing Pathfinder chat still works.
