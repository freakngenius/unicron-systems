# Metacron — Product Description, User Journey, Production Status

A non-technical walkthrough of what Metacron is, what an operator does with it, and what's production-ready vs. prototype after the current sprint of kanban cards ships. Written for new team members, partners, and investors.

Version: 2026-05-02 (revised post-Agent-Console spec). Author: Kyle Kesterson.

---

## What Metacron Is (in plain language)

Unicron Systems builds AI agents that find and qualify sales leads for our customers. The first customer is Zedcor, a mobile solar surveillance company protecting construction sites. The customer-facing product is called **Pathfinder**: Zedcor's sales team logs in and sees scored leads with drafted outreach, pulled from public data sources by a fleet of AI agents working around the clock.

**Metacron** is the operator's view of the same agent system. It's the cockpit. While Pathfinder shows the customer their scored leads, Metacron shows our internal team what the agents are doing, why, and how to steer them. As we add more customers, Metacron is also the place where new customers get onboarded, configured, monitored, and where each agent's work is reviewed and committed to production.

The strategic frame: Dodge Construction Network tracks 636K+ projects per year because they employ 400+ field specialists who physically call planning offices, scrape portals, and maintain industry contacts. Their moat is human labor at scale. Pathfinder's moat is doing that work with agents. Metacron is the surface that makes those agents transparent, reviewable, and steerable. Together they're the "we don't need 400 people" pitch made concrete.

Two products, one platform. Pathfinder is what customers buy. Metacron is what makes Pathfinder run, scale, and improve.

---

## The Agent Console — the heart of Metacron

Once the current kanban list ships, the central surface in Metacron is the **Agent Console**. Every agent in our system is a first-class citizen there, with its own modal interface tuned to its role.

Each agent modal follows the same pattern: an input panel where the operator specifies a goal in plain language, a live execution panel where the agent's reasoning and intermediate work stream in real time, a result panel where the operator reviews and clicks Verify, and a history grid of every prior run.

When the operator clicks Verify, the agent's output flows to Pathfinder customers as production data. Without verification, results sit in a staging state visible only to operators. This is the explicit handoff that turns AI work into product value.

---

## A Day in Metacron — Operator User Journey

The user is an operator on the Unicron team. They sit down to start the day.

They open `metacron.unicron.systems` and sign in with a magic link sent to their work email. No password.

They land on the **Living Intelligence Visualizer**. It's a real-time map of the agent network, drawn live on canvas. Each node is an agent: ingest agents pulling from public data sources, ranking agents scoring leads, enrichment agents adding context, outreach agents drafting emails. Links between nodes pulse when work flows. New leads appear as small lights traveling through the network. The operator sees, at a glance, that everything is alive and moving.

Above the visualizer, three counters: today's spend, active agent count, active runs. To the left, an activity feed scrolls in real time. The operator skims it like Slack.

A notification badge sits on the **Architect Inbox**. The Architect agent watches the system, proposes improvements, and queues them for human approval. The operator clicks. Three proposals waiting. They open the **Architect Modal** in Tuning sub-mode and review last week's proposed scoring weight updates. The reasoning chain renders as type-on text. Three weight changes are obvious wins. They click Verify on each. The new weights propagate to the ranker on its next run.

Next: the operator wants to expand Zedcor's pipeline into Pittsburgh and Nashville. They click the **Coverage Expansion** agent in the console. Modal opens. They draft a goal in the input panel: "Pittsburgh + Nashville construction projects, March 2026 forward, target 50 leads." They click Dispatch. The live panel lights up. The Architect surfaces eight candidate sources. The Source Onboarder agent connects two Tier 1 sources within ninety seconds, queues six Tier 2 sources for review. The operator watches the geographic map fill with new coverage. When the run completes, the result panel shows the source list, the lead pool delta (47 new leads in the new metros), and a Commit button. They commit. The verified work flows to Pathfinder.

Of the six Tier 2 sources queued, one needs schema help. The operator clicks the source in the result panel. The **Source Onboarder Modal** opens with that ticket loaded. They review the failed adapter, supply the corrected schema mapping in a notes field, click Resolve. The agent resumes and ships the adapter.

A **Cross-Pollination** notification fires — a new lead in Pittsburgh has an ambiguous match against an existing Zedcor relationship in Atlanta. They open the Cross-Pollination Modal, see the candidate match (confidence 0.81 — in the ambiguous band), review the relationship metadata, click Verify. The lead's outreach draft now opens with the relationship reference baked in.

They click **Customers**. Today only Zedcor is live, but the layout already supports many. They open Zedcor's detail view: lead volume over the last 7 and 30 days, what percent of leads scored above 80, outreach delivery rate, and a list of the most recent agent errors. Lead volume is up 12% week-over-week from yesterday's coverage expansion. Outreach delivery is at 96%. Healthy.

Last stop: the **Living System surface** demo. They open Pathfinder in a second window — Zedcor's customer dashboard. The activity ticker reads: "Pathfinder is expanding coverage in Pittsburgh — 2 new sources connected, 6 under review." Two minutes later, "Architect tuning verified — scoring updated to weight recency higher." The customer sees the operator's verified work as ongoing intelligence improvements. Living system, in motion.

They close the laptop. The agents keep working through the night.

---

## Feature Inventory

What ships once the current kanban list is executed.

### Already in production (deployed before this sprint)

1. **Living Intelligence Visualizer** — real-time canvas view of the agent network.
2. **Activity Feed** — live event stream from the agent log.
3. **HUD Counters** — cost, agent count, active runs.
4. **Architect Inbox** — review and approve proposals (predecessor to the Architect Modal; will be folded in over time).
5. **Add Source UI** — single-phase source onboarding (will be replaced by the Source Onboarder Modal).
6. **Settings Drawer** — read and edit per-org configuration (scoring weights, source enable/disable, agent prompts).
7. **Magic-Link Authentication** — passwordless sign-in via Supabase Auth.
8. **Edit Node Panel** — inspect and modify a single agent or source from inside the visualizer.

### New in this sprint (the kanban cards being executed)

9. **Metacron Vercel Project + Domain** — `metacron.unicron.systems` is the dedicated production deploy chain for the operator UI (Phase 0).
10. **Agent Console Foundation** — shared schemas (`unicron.agent_dispatches`, `agent_dispatch_events`), modal shell components, generic Realtime subscription, history grid pattern, agent registry. Foundation every agent modal shares (Phase 0.5).
11. **Coverage Expansion Modal** — operator drafts a goal, agent estimates yield, operator approves, agent dispatches (Phase 1 / M1).
12. **Source Onboarder Modal** — single-phase onboarding refactored into the modal pattern, plus the Tier 2 escalation review flow (Phase 1 / M2).
13. **Architect Modal** — three sub-modes for Decomposition, Tuning, Discovery (Phase 1 / M4).
14. **Cross-Pollination Modal** — operator reviews ambiguous lead-to-customer-relationship matches (Phase 1 / M5).
15. **Customer List + Per-Customer Health Dashboard** — multi-tenant grid + per-customer health (Phase 1 / M3).
16. **Living System Bridge** — operator's Verify action writes `pathfinder.agent_verifications`; Pathfinder customer dashboard activity ticker subscribes via Realtime. The "demo moment" surface (Phase 1F).
17. **Two-Visualizers Cleanup** — retire the older Pixi.js iframe visualizer (Phase 2).
18. **Conductor Relay v0.1** — internal tool that bridges this Cowork chat to Claude Code execution sessions, replacing manual copy-paste (Phase 2).

### Pending — not in this sprint but on the roadmap

After this sprint, the remaining backlog. These are still vision-level until prioritized.

19. Enricher Modal (research agent for top leads).
20. Verifier Modal (multi-pass quality gate for leads).
21. Ranker Modal (scoring weights tuning desk; partially overlapping with Architect Tuning sub-mode).
22. Outreach Drafter Modal (per-lead draft generation with voice override).
23. Briefer Modal (Friday weekly brief editor).
24. Per-agent personality (custom icons, color schemes, voice copy for each agent).
25. Agent-to-agent composition (one agent's verified output triggers another).
26. User management for the operator team (role-based access control).
27. Audit log of operator actions.
28. Eval pass-rate dashboard (agent quality over time).
29. Cost tracking dashboard (cross-agent, cross-customer spend trends).
30. Background job monitor (Inngest health surface).
31. Schema migration runner UI.
32. Force re-run on failed agent runs.
33. Ban / unban a source.
34. Replay / time-travel debugging.
35. Connector health dashboard (cross-customer Slack / Teams / HubSpot status).
36. Operator-side customer onboarding wizard.
37. Conductor v1.0 (multi-session orchestration daemon with web UI).
38. Conductor v2.0 (productized, per-tenant policies).
39. Self-modifying Architect (the agent that improves the agents proposes changes to itself).
40. Inter-customer learning (anonymized signal sharing across customers).
41. Spec-compliance checker.
42. Plugin marketplace (third-party agents).

---

## Production-Ready vs. Prototype After This Sprint

The operator UI being demoable does not mean the platform is investor-ready in every layer. Where things stand once these cards merge.

### Frontend (the operator UI itself)

**Production-ready.** Vite + React 19, deployed to a dedicated Vercel project at `metacron.unicron.systems`. Typecheck and tests gate every merge. Deploy is auto-reverted on regression. Magic-link authentication is wired to Supabase Auth, sessions persist, sign-out works. The visualizer renders at 60fps under realistic agent loads. The Agent Console shell + the four primary agent modals (Coverage Expansion, Source Onboarder, Architect, Cross-Pollination) ship with mock-mode fixtures so they're demoable with no backend dependency.

**Gap.** No mobile-responsive treatment — operator team uses laptops, acceptable for now. No accessibility audit yet. The five Phase 2 agent modals (Enricher, Verifier, Ranker, Outreach Drafter, Briefer) are not yet built; their backend agents run autonomously today, but operator-facing transparency on those runs is still on the roadmap.

### Backend (the agent system)

**Production-ready.** Pathfinder agent backend is fully shipped and running against Zedcor's data: Ingestor (sam.gov, USAspending, Harris County, news), Ranker, Verifier, Enricher (Perplexity-driven), AdjacencyMapper, GeoMapper, Outreach Drafter, Briefer. All on Vercel cron + Inngest. Cost tracking on every LLM call via the gateway. Architect agent (decomposition, tuning, discovery) is shipped. Source Onboarder is shipped (Tier 1 auto-deploy + Tier 2 human-assist queue). Coverage Expansion agent is shipped. Cross-pollination engine is shipped.

**Gap.** Agent code is heavily Pathfinder-specific. The Agent Console abstraction is new in this sprint, so the dispatch / event / verify pattern is untested at scale. Conductor v1.0 (build-time supervisor) is vision-level, not built. Self-modifying Architect is vision-level. Auto-fan-out from Architect Decomposition (one verify spawns Coverage Expansion + Source Onboarder dispatches) is a gap in the M4 sprint and needs follow-up work.

### Database

**Production-ready.** Supabase project hosting both `pathfinder.*` and `unicron.*` schemas. RLS enabled on all customer-facing tables. Migrations versioned in source control. Realtime subscriptions powering the visualizer, activity feed, and the new Agent Console live execution surface.

**New in this sprint.** `unicron.agent_dispatches` and `unicron.agent_dispatch_events` tables ship in Phase 0.5; `pathfinder.agent_verifications` ships in Phase 1F as a coordinated cross-chat sprint. These three tables are the spine of the verified-completion handoff.

**Gap.** No formal multi-tenant org table on the Pathfinder side — Zedcor is currently a hardcoded constant. Adding customer #2 will require a migration. Tracked as a follow-up. No replica strategy yet, no point-in-time recovery testing.

### Security

**Mixed.** Authentication is solid: magic-link via Supabase Auth, no passwords, JWT sessions with rotation. RLS guards customer-data access. Service-role keys live only in server environments and are not committed.

**New in this sprint.** Verification records carry `verified_by_user_id` + `verified_at`, giving us per-action attribution for everything an operator commits to production. That's the foundation for an audit log even though the audit log surface itself isn't in this sprint.

**Gap.** Three meaningful holes remain:
- No operator-team RBAC. Anyone with a magic-link to an authorized email sees everything. Acceptable for a 2-person team; not acceptable when we add agent-orchestrator engineers.
- No audit log surface. Verification records exist in the database now, but there's no UI for who-approved-what review. Needed before any customer asks for compliance evidence.
- Per-customer data isolation in the operator UI is enforced by RLS at the database but not yet by RBAC at the UI layer. An operator with access to customer A could in principle query customer B's data through Metacron. Acceptable while we are the only customers; not acceptable at customer #2.

### APIs

**Production-ready.** Architect Agent endpoints (decompose / tune / discover), Source Onboarder endpoints (single-phase onboard + sessions polling), Coverage Expansion endpoints (goals CRUD + run dispatch), Architect Inbox endpoints (list + resolve). All Bearer-token authenticated, rate-limited at the Vercel layer, with eval coverage for the agent calls behind them.

**Gap.** Cross-Pollination has no on-demand HTTP dispatch endpoint yet — it's cron-driven. The Cross-Pollination modal ships in review-only mode until that endpoint lands (a Pathfinder chat task). No public API for customers; Pathfinder is closed UI today. No webhook system for outbound events. The Connector Framework (Slack, Microsoft Teams, HubSpot) is in flight in a parallel sprint and not yet shipped to production.

### Deployment & Infrastructure

**Production-ready.** Three independent Vercel projects (Pathfinder customer app, Marketing Site, Metacron operator UI), each auto-deployed from main, each independently auto-reverted on failure. GitHub Actions for typecheck, lint, test. Inngest for cron + background jobs. Custom domains and SSL handled.

**Gap.** No staging environment separate from preview deploys. No formal incident-response runbook. No on-call rotation.

### Observability

**Mixed.** LLM-call cost tracked per agent per run via the gateway. Agent runs logged to `pathfinder.agent_log` with realtime subscription powering the activity feed. Vercel deploy logs and runtime logs available. Agent Console adds per-dispatch reasoning trail in `unicron.agent_dispatch_events`.

**Gap.** No centralized error monitoring (Sentry not wired). No SLA dashboards. Eval pass-rate dashboard is on the roadmap but not yet built. Cost tracking dashboard for cross-customer spend is on the roadmap but not yet built. No alerting on dispatch failures or verification stalls.

---

## The Demo Moment

When all of this lands, the demo moment is straightforward:

Open Metacron and Pathfinder side by side. In Metacron, open the Coverage Expansion modal. Type "Pittsburgh, 50 leads, construction security." Click Dispatch. Watch the live panel as the Architect surfaces eight candidate sources, Source Onboarder connects two within ninety seconds, six get queued for Tier 2 review. In Pathfinder, the customer's activity ticker updates in real time: "Pathfinder is expanding coverage in Pittsburgh — 2 new sources connected, 6 under review." After ninety seconds, new leads appear in the Pittsburgh branch view. Click Verify in Metacron. The Pathfinder ticker confirms: "Coverage expansion verified by Kyle just now."

That's the "we don't need 400 people" moment, made visible in two browser windows.

---

## Bottom Line for a New Audience

The customer-facing product (Pathfinder) and the agent system behind it are working in production today. The first customer (Zedcor) is in active pilot. Once this sprint of kanban cards lands, the operator team has every tool needed to run that pilot transparently, expand it geographically, onboard a second customer, and demonstrate the operator-to-customer Living System bridge end to end.

What's still rough: multi-tenant RBAC, audit logging surface, several monitoring dashboards, the five Phase 2 agent modals. None of those block the current pilot; all of them are required before the platform reaches "any operator can run any customer with confidence" state. The roadmap above lists them in priority order.

The team running this is two people plus AI orchestration. That ratio is the bet.

---

End.
