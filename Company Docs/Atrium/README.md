# Atrium — Reproducibility Folder

Every artifact required to recreate Atrium (the internal cockpit at atrium.unicron.systems) and the Internal Org Cowork chat that orchestrates its build lives here. Reproducibility-first.

## What is Atrium

Internal cockpit for Unicron Systems' team. Lives inside `unicron-platform/` repo, feature-flagged + tenant-scoped. Eight tabs: Now, People, Work, Money, Marketing, Products, System, Library. SSO + email magic link, allowlist of kyle@, keenan@, curtis@, team@unicron.systems. Built across Sprints 0-7 by the Master Conductor running inside the Internal Org Cowork chat.

## Inventory

### Specs
- `Specs/SPEC - Atrium (Internal Cockpit).md` — canonical UI/UX SPEC for the cockpit, eight tabs, edit-through-gates pattern.

### Prompts
- `Prompts/PROMPT - Sprint 0 Foundation (Nervous System).md`
- `Prompts/PROMPT - Sprint 1 - Call Ingest + Customers + Atrium Shell.md`
- `Prompts/PROMPT - Sprint 2 - Slack Orchestrator + Atrium Home + Agent Foundation.md`
- `Prompts/PROMPT - Sprint 3 - Analyst + Elder + Atrium System.md`
- `Prompts/PROMPT - Sprint 4 - Voice Notes Mobile + Atrium Now and Work.md`
- `Prompts/PROMPT - Sprint 5 - Email + Multi-Fork + Atrium People and Money.md`
- `Prompts/PROMPT - Sprint 6 - Marketing + Products + Library + Wiki.md`
- `Prompts/PROMPT - Sprint 7 - Polish + PWA + Notifications + Audit.md`
- `Prompts/PROMPT - Master Conductor (Sprints 1-7).md` — autonomous sprint dispatcher
- `Prompts/PROMPT - Unicron Internal Org Chat - Bootstrap.md` — chat bootstrap

### Context
- `Context/HANDOFF - Internal Org Cowork Chat.md` — chat-resume brief for the Cowork chat that builds Atrium
- `Context/INTRO - Atrium for the Team.md` — team-facing overview of Atrium

### Reports
- `Reports/README.md` — pointer to canonical conductor-state.json location
- (sprint retrospectives, design diff reports, post-mortems go here)

### PRD
- (Atrium-only PRDs go here)

### Plans
- (Atrium-only plans go here)

## Cross-cutting artifacts that stay in their canonical locations

These artifacts touch Atrium but also serve substrate / Pathfinder / Metacron / voice agent purposes. They live elsewhere and Atrium references them.

- `Company Docs/Specs/SPEC - Unicron Nervous System.md` — parent substrate SPEC. Atrium consumes this; substrate also serves Pathfinder + Metacron.
- `Company Docs/Specs/SPEC - Nervous System Addendum 1 (Kanban Surface Routing).md` — kanban routing across all three kanbans (Pathfinder, Metacron, Internal Org).
- `Company Docs/Specs/SPEC - Nervous System Addendum 2 (Skills + Karpathy + Refero).md` — skills architecture, Karpathy 3-folder vault, Refero design refs.
- `Company Docs/Specs/SPEC - Nervous System Addendum 3 (Voice System Integration).md` — voice agents into Atrium, Pathfinder, and standalone voice loop.
- `Company Docs/Specs/SPEC - Nervous System Addendum 4 (Scenarios + Satisfaction + DTU).md` — scenario gating + DTU across all surfaces.
- `Company Docs/Reports/conductor-state.json` — Master Conductor's persisted state. Stays at canonical path because active conductor sessions read/write it.
- `Company Docs/Context/CONTEXT - Unicron Internal Org.md` — original framing of the Internal Org chat.
- `Company Docs/Context/ENGINEER BRIEF - Atrium Metacron Pathfinder.md` — tri-product engineer brief.

## Design source files (separate location, active references)

Canonical Atrium UI design lives at `/Users/keka/Dropbox/Projects/Unicron Systems/Atrium/Web UI/`, NOT under `Company Docs/Atrium/`. Reason: absolute paths in active Sprint 5+ design addendum reference that location. Consolidate into this folder later when no in-flight conductor depends on the path.

Design source inventory:
- `tokens.css` — design tokens
- `components.jsx` — shared component primitives
- `shell.jsx` — app shell layout
- `tweaks-panel.jsx` — settings panel pattern
- `v3-now-feeds.jsx`, `v3-work-fills.jsx`, `v3-money.jsx`, `v3-marketing.jsx`, `v3-products.jsx`, `v3-library.jsx`, `v3-system.jsx`, `v3-skills.jsx`, `v3-voice.jsx`, `v3-pathfinder.jsx` — per-tab v3 designs (canonical)
- `screens/now.jsx`, `screens/work-people-money.jsx`, `screens/rest.jsx` — screen-level fragments
- `Atrium.html`, `Atrium v2.html`, `Atrium v3.html` — earlier and current consolidated HTML references
- `uploads/` — refero design references that informed the v3 JSX

## Going forward

- All new Atrium-only artifacts (PRDs, design SPECs, post-mortems, design diff reports, retros) drafted directly in `Company Docs/Atrium/<subdir>`.
- Cowork chat prompts going forward reference Atrium artifacts from this folder.
- Sprints 8+ (post-Sprint-7) sprint prompts go in `Atrium/Prompts/`.
- When an artifact spans Atrium + substrate or Atrium + another surface, leave it in `Company Docs/Specs/` (substrate) or the relevant per-product folder and link to it from this README's cross-cutting section.
- Recreating Atrium from scratch later: this folder + the Web UI design source + the cross-cutting Nervous System SPECs is the complete reproducibility kit.

## Reproducibility checklist

To rebuild Atrium from scratch, you need:

1. This folder (`Company Docs/Atrium/`) in full
2. The 5 Nervous System SPECs at `Company Docs/Specs/` (parent + addenda 1/2/3/4)
3. The design source at `Atrium/Web UI/`
4. The unicron-platform repo (Vite + React 19) — the codebase the prompts target
5. A Supabase project with `nervous_system` exposed via PostgREST
6. The vault at github.com/freakngenius/unicron-knowledge for Karpathy 3-folder pattern + scenarios
7. Inngest account for cron + agent runtime
8. Vercel project with Root Directory set to `unicron-platform`
9. Slack workspace + app for Orchestrator integration
10. The Atrium email allowlist environment variable
