# CONTEXT.md — unicron-platform

Domain glossary for the operator-facing UI. Use these terms verbatim in code, issues, and PRs. If you reach for a synonym, stop — either use the glossary's term, or note the gap so we can extend the glossary.

## Core domain

**Living-intelligence system** — the running configuration of agents and data sources that watches the world for buying signals on the operator's behalf. Visualized as the concentric mesh on the Live System tab.

**Operator** — the human (Kyle / Keenan / a customer) running this UI. Owns the system; configures it through Onboarding and tunes it through the Architect Inbox and Live System panels.

**Architect** — the in-product agent that drafts the system architecture during Onboarding and proposes changes after deployment (sources, agents, tunings). Distinct from the agents *in* the system.

## Configuration model

**SystemConfig** — the single source of truth for what the live system looks like. Lives in `SystemContext`. Has `status: 'unconfigured' | 'configured' | 'live'`, `dataSources[]`, `agents[]`, and the `buyerPain` prompt that produced it.

**DataSource** — an external feed that produces intake events. Examples: municipal permit feeds, SAM.gov procurement, news. Each source pulses through a Layer-2 watcher.

**Agent** — a node in the mesh. Belongs to one of three layers:

- **Watcher** (Layer 2) — polls a `DataSource`. Hexagon, cyan family.
- **Signal** (Layer 3) — qualifies, enriches, maps. Diamond, gold family.
- **Synthesis** (Layer 4) — ranks, drafts, briefs. Octagon, red family.

Each agent has a `role` (e.g. `PermitWatcher`, `Qualifier`, `Ranker`), an `instruction`, optional `inputFrom` / `outputTo` agent IDs, a `dwellMs` (processing time), and a `passRate` (0..1 chance of forwarding to the next layer).

**Operation** — one signal's journey through the cascade. Originates at an intake office, travels through one watcher → one or more signal agents → one synthesis agent → the center. Either `completed` (delivered as a report) or `rejected` (dropped at any layer).

## Visualizer concepts

**Intake office** — one of 250 dashes on the outer ring representing a permit-issuing jurisdiction or feed origin. Pulses when a new event arrives.

**Tracer** — a comet-trail that travels inward from one node to the next, carrying an in-flight operation.

**Sector lock** — tracers travel only within a ±30° wedge of their source angle. Prevents the cascade from looking like a starburst.

**Replication** — when sustained sector pressure exceeds idle capacity, a node mitoses a copy in that sector. Bounded by `maxInstancesByLayer`.

**Pulse** — a brief scale-boost on every instance of an agent, used to acknowledge a `SAVE LIVE` config edit.

## Inbox concepts

**Proposal** — a card in the Architect Inbox. Three categories:

- `sources` — "add this new feed"
- `agents` — "add this new agent"
- `tuning` — "tighten this rule on an existing agent"

Approving a proposal mutates `SystemConfig` directly via the same mutators the action panels use.
