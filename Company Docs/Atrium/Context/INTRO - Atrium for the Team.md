# Welcome to Atrium

For Keenan and Curtis, with love. A short overview to get you oriented.

## What Atrium is

Atrium is the company's cockpit. It is where you see what Unicron is doing, where you direct what Unicron does next, and where you find anything we have decided, captured, or learned. One screen, one place, all surfaces.

Atrium does not replace Slack, Notion, or your inbox. It pulls from all of them and surfaces what matters. You still talk to humans in Slack, edit cards in Notion, take calls on Zoom, and read email in your client. Atrium is the layer above those tools where the company itself becomes legible.

It lives at https://atrium.unicron.systems. Sign in with magic link to your @unicron.systems email.

## Why it exists

Unicron is three people plus a fleet of agents. The agents run continuously, ingest calls and Slack threads, score leads, draft outreach, propose architecture. Without a cockpit, all of that activity is invisible to us, and we are reduced to asking each other "what's happening?" Atrium makes the activity visible, the decisions traceable, and the directing one click away.

The principle is calm at rest. You should be able to open Atrium, glance for ten seconds, and know what needs you today. If anything is shouting for your attention, it is shouting for a real reason.

## The eight surfaces

**Now** — your morning view. Greeting, status pulse (agent fleet, escalations, budget, decay), top of mind cards (3-5 items needing you), today's calendar, yesterday's digest, live activity feed, and the Run a Skill grid where you click any of our standardized workflows to fire it off.

**People** — customers (pipeline + per-customer health cards), team (each member's My Day), network (advisors, warm contacts), hiring (when active).

**Work** — cross-kanban action items, the three Notion kanbans embedded read-only side-by-side, calls log with transcripts, decisions timeline (Elder's continuity log rendered visually), refusals log (every Taboo Keeper bounce).

**Money** — connected service accounts with status and cost, runway burn-down, revenue per customer, expenses categorized monthly, cost spike alerts.

**Marketing** — campaigns, published content with traction, analytics, brand assets gallery.

**Products** — split into Pathfinder (active tenants like Zedcor with deep tenant view: cities live, activating, on deck, hard costs, sales agents, lead funnel) and Metacron (operator console, Architect proposals, agent fleet across tenants).

**System** — agents galaxy, taboos viewer, refusal log table, services health, decay heatmap, memory search, scheduled jobs, audit log, continuity log.

**Library** — wiki (these welcome pages and others), full-text search across all docs, templates for new docs (PRD, SPEC, Prompt, Retro, Decision), brand assets.

## How you participate day to day

Four loops:

1. **Capture is automatic.** Take a call (Plaud or Fathom records), drop a thought in a Slack thread, jot a voice memo on your phone. The system catches it, extracts decisions and action items, files cards on the right kanban, and stamps a ledger entry. You do not paste transcripts manually.

2. **Direct via Slack.** DM the Orchestrator bot in Slack. Say "what's on my plate today" or "schedule a Realberry follow-up Thursday" or "draft a positioning paragraph for the Phoenix expansion." It queries real state, runs proposed actions through the refusal layer, and either executes or returns a paste-ready Claude Code prompt for code work. It is a peer, not an intent classifier.

3. **Judge what needs you.** The Verified column on every kanban is human-only. Cards land in Deployed when work is done; you promote them to Verified after a quick visual check. Taboo overrides are the other place your judgment is needed.

4. **Reflect at the rhythms.** The Analyst posts a daily digest at 6am to #orchestrator-feed and a weekly retro Friday afternoon. Read on phone in five minutes. Push back on the system if it is wrong; the Analyst learns.

## A few rules worth knowing

- **The refusal layer is real.** We have a public list of things this organism will not do, at vault Memory/taboos.md. Every system-modifying action passes through the Taboo Keeper before executing. If something gets bounced, the bounce reason lands in #orchestrator-escalations and you can override with a written reason that gets logged forever.
- **Verified column is yours alone.** Agents move cards to Deployed. Only humans move cards to Verified. This is the asymmetry that keeps the system honest.
- **Decay is on by default.** Every signal, every action item, every memory file has a TTL. If it stops being touched, it archives. If it stays alive, it has earned its place.
- **R3 reciprocity.** When the company benefits from your warm-network introductions, your discovery work, or your operating contributions, that should flow back to you. The architectural hooks are in the schema; the actual cap-table mechanics are a Kyle and Keenan conversation. Curtis gets equal visibility, equal editing, equal DRI eligibility now; equity-side reciprocity is on the same conversation track.

## What is still in progress

Atrium is currently mid-build (Sprints 1 through 7 are running). What works today:

- Sign-in with magic link (Google SSO is deferred to Sprint 7)
- Now tab with Run a Skill surface, status pulse, activity feed, quick capture
- Slack Orchestrator bot in DM and channel mentions
- Call ingest from Fathom (Plaud is best-effort; some manual workarounds while we wait on their API)
- Vault on git at github.com/freakngenius/unicron-knowledge with the Karpathy three-folder pattern (raw / wiki / outputs)

What is coming in the next sprints:

- Persistent Analyst and Elder agents with nightly digests, weekly retros, continuity advisories
- iOS Shortcuts for voice memo and Apple Notes capture
- Email ingest, multi-fork sprint contract, LLM Council for hard decisions
- Atrium polish, PWA install on phone, full Refero design pass

## How to give feedback

Two paths:

1. DM the Orchestrator with your reaction. The Analyst reads patterns and proposes system changes weekly.
2. Post directly in #orchestrator-escalations or #orchestrator-feed for things that should reach all three of us.

If something feels wrong, say so. The system is supposed to be honest, and that includes admitting when it is not yet good.

## One last thing

Atrium is not a tool you use. It is the room you walk into to see how the company is breathing. The literal meaning of atrium is the open central courtyard, lit from above. That is what we are building. Welcome.
