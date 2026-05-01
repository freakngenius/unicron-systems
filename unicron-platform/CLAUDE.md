# CLAUDE.md — unicron-platform

The operator-facing UI for Unicron Systems. Vite + React + TypeScript + Tailwind. Renders the living-intelligence visualizer driven by a `SystemConfig` the user creates through onboarding and tunes via Architect Inbox proposals and the Live System action panels.

## How to run

- `npm run dev` — Vite dev server on `localhost:5173` (or `5174` if the first is taken)
- `npm run build` — TypeScript build + Vite production bundle
- `npm run lint` — ESLint

## Architecture overview

- `src/context/SystemContext.tsx` — the load-bearing piece. Holds `SystemConfig` (`status`, `dataSources[]`, `agents[]`) plus mutators (`deploy`, `addAgent`, `updateAgent`, `removeAgent`, `addDataSource`).
- `src/components/visualizer/` — Canvas 2D port of `living-intelligence.html`. `simEngine.ts` runs the simulation; `Visualizer.tsx` mounts it and exposes `pulseSignal` for live highlight on agent updates.
- `src/components/onboarding/` — `define → thinking → deployed` flow that writes `SystemConfig` on `APPROVE & DEPLOY`.
- `src/components/live/` — Live System tab with the visualizer + activity feed. `panels/` holds the operator action panels (`AddAgentPanel`, `AddSourcePanel`, `EditNodePanel`) which all mutate `SystemContext`.
- `src/components/inbox/` — Architect Inbox; approving a proposal calls into `SystemContext` mutators.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `freakngenius/unicron-systems`. Use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default mattpocock/skills vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo. `CONTEXT.md` + `docs/adr/` at this directory's root. See `docs/agents/domain.md`.

## Conventions

- TypeScript strict; never silence with `any` without a comment justifying it.
- Tailwind utility-first; design tokens in `tailwind.config.js`. Mono = JetBrains Mono, sans = Inter.
- One component per file; named exports. Keep files <300 lines when possible.
- Visualizer mutations route through `SystemContext` — never reach into `simEngine` from React except via the prop interface on `<Visualizer>`.
