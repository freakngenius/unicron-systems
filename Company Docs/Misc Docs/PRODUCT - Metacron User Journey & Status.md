# Metacron — Product Description, User Journey, Production Status

A non-technical walkthrough of what Metacron is, what an operator does with it, and what's production-ready vs. prototype after the current sprint of kanban cards ships. Written for new team members, partners, and investors.

Version: 2026-05-03 (post-Phase-1 cascade + Issue #48 fix). Author: Kyle Kesterson.

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

## Production-Ready vs. Prototype (as of 2026-05-03)

### Real — production, demo-able now

**Frontend.** metacron.unicron.systems live with public access, magic-link sign-in functional, custom domain attached. Living Intelligence visualizer, activity feed, HUD counters all rendering real data from production Supabase. Settings drawer functional after 0090_unicron_settings.sql migration applied. Architect Inbox, Add Source, Edit Node panel, Customers tab + Zedcor profile all rendering live data.

**Backend.** Pathfinder agent backend fully shipped: Ingestor (sam.gov, USAspending, Harris County, news), Ranker, Verifier, Enricher (Perplexity), AdjacencyMapper, GeoMapper, Outreach Drafter, Briefer. Architect agent (decomposition, tuning, discovery) shipped. Source Onboarder shipped (Tier 1 auto + Tier 2 escalation). Coverage Expansion shipped. Cross-Pollination shipped.

**Database.** unicron.agent_dispatches + unicron.agent_dispatch_events + unicron.settings live in production Supabase. RLS enabled on all customer-facing tables. Realtime subscriptions powering visualizer, activity feed, agent console live execution.

**Infrastructure.** Three Vercel projects (pathfinder, metacron, unicron-systems) all deploying independently, all auto-reverted on regression. Issue #48 (recurring prerender flake) permanently resolved via PR #93 force-dynamic cleanup.

### Prototype — deployed but mock-mode only

**Coverage Expansion modal.** Full UX flow (input → live → result → verify) functional in mock mode. Real-mode dispatch gated on Pathfinder shipping /api/coverage/goals* HTTP routes. Operator-todo filed.

**Source Onboarder modal real mode.** Mock-mode complete. Real mode needs operator session permissions tested against Stream E /api/sources/onboard endpoint from metacron domain.

**Architect modal real mode.** Three sub-modes (Decomposition, Tuning, Discovery) functional in mock mode. Real mode needs VITE_ARCHITECT_API_URL env config + bearer token set on metacron Vercel project.

**Tier 2 ticket resolve real mode.** Mock works; real mode needs anon-vs-service-role permission validation.

**Cross-Pollination modal.** Review-only mode functional against real pathfinder.cross_pollination_matches. On-demand dispatch endpoint not yet shipped on Pathfinder side.

### Not yet started — gaps for the demo

**Phase 1F Living System bridge.** The marquee demo moment per SPEC §12 (operator clicks Verify in Metacron → Pathfinder customer dashboard activity ticker updates in real time) is NOT FUNCTIONAL. Verify currently writes to unicron.agent_dispatches only. The bridge to pathfinder.agent_verifications is gated on Pathfinder shipping that table + the customer-side ActivityTicker component. Coordination operator-todo filed; 24h escalation deadline 2026-05-04T00:30:00Z.

**Galaxy canvas (multi-clustomer view).** Phase 2 design priority. Operators see single-customer Zedcor only today.

**New Cluster slide-out (Architect-driven onboarding).** Phase 2 design priority. New colonies require direct backend setup today.

**Persistent HUD top bar + Escalations drawer.** Phase 2 design priority.

**Signal Stack right rail on Galaxy home.** Phase 2 design priority.

**Per-paradigm visualizers** (bees / ants / slime / mycelium / murmuration / sperm-egg). Phase 4 design lift.

**Operator RBAC, audit log surface, eval pass-rate dashboard, cost tracking dashboard, connector health dashboard, Inngest job monitor.** Phase 2/3.

**Conductor v1+v2, plugin marketplace, self-modifying Architect, inter-customer learning.** Phase 4+ vision-level.

### Demo paths today

1. Sign in at metacron.unicron.systems via magic-link
2. Living Intelligence visualizer renders with real-time agent activity
3. HUD counters show real cost data from pathfinder.llm_calls
4. Activity feed scrolls with live Pathfinder agent events
5. Architect Inbox surfaces real Stream D proposals (if queued)
6. Add Source accepts a real URL and onboards via Stream E
7. Customers tab shows Zedcor profile with live lead volume, cost, sources, agents
8. Agents tab shows four registered modals; each demoable in mock mode end-to-end

### Demo gaps

- Phase 1F not shipped: Verify click does not propagate to Pathfinder customer ticker. Marquee "Living System" demo moment unavailable.
- Real-mode agent dispatches require Vercel env vars set on the metacron project (VITE_COVERAGE_API_*, VITE_ARCHITECT_API_*, VITE_SOURCE_ONBOARDER_*). Without them, all four agent modals demo in mock mode only.
- Galaxy view is single-customer. Multi-customer constellation is Phase 2.
- New Cluster onboarding flow has no UI yet. Phase 2 design priority.

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
