# Investigation — metacron HubSpot Reconnect 404

Filed 2026-05-03. Branch: `chore/metacron-fix-hubspot-reconnect-404`.

## Reported symptom

> On metacron.unicron.systems Connectors page, clicking "Reconnect" on the HubSpot tile returns 404.

## Findings

### 1. metacron has no Connectors page

`unicron-platform/` (the metacron operator UI) has no Connectors page in source or in the live deploy (`metacron.unicron.systems`):

- `Topbar.tsx` exposes 5 tabs: ONBOARDING, LIVE SYSTEM, ARCHITECT INBOX, AGENTS, CUSTOMERS. **No Connectors tab.**
- `SettingsDrawer.tsx` has Interface / Notifications / Architect / Access sections only. The "Access" section's `Manage →` buttons are no-op stubs (no `onClick`).
- `grep -rn -iE "connector|reconnect|hubspot" src/` finds zero matches in `unicron-platform/src/` (only "preconnect" inside React internals in the live JS bundle).
- Live deploy bundle `index-iKdMLAtY.js` and the four code-split modal chunks (`AgentLiveExecution`, `ArchitectModal`, `CoverageExpansionModal`, `CrossPollinationModal`, `SourceOnboarderModal`) contain no `HubSpot`, `Connectors`, or `Reconnect` strings.
- `vercel.json` rewrites `/(.*)` → `/index.html`, so any URL (`/connectors`, `/settings/connectors`, `/api/connectors/hubspot/install`) returns the SPA HTML with HTTP 200, not a 404. There is no source-side button that could `window.location.href = '/api/...'` and produce a real 404.

**Conclusion:** the 404 was not produced by metacron source. metacron has no Reconnect button to fix.

### 2. The actual bug + fix is on Pathfinder

Pathfinder owns `/pathfinder/settings/connectors` with a HubSpot tile (`HubspotUserTile`) and the install endpoint at `Pathfinder/app/api/connectors/hubspot/install/route.ts`.

The install route was originally **POST-only**. Per-user OAuth tile fallback navigation issues a `GET` (browsers cannot navigate via POST without a form), which returned 405 / 404 depending on the route's runtime.

A peer agent's worktree at `Pathfinder-worktrees/gate12e-hubspot-reconnect-fix/` (branch `demo-polish-ux/gate12e-hubspot-reconnect-fix`) already holds the fix as commit `1ae83e3 fix(pathfinder): demo polish UX gate 12E — HubSpot Reconnect 404`. Diff:

- Adds a shared `handleInstall(req)` helper.
- Exports `GET` and `POST` against the same handler (matches the Slack pattern at `/api/connectors/[type]/auth`).
- Comment block updated to reference Gate 12E.

**As of 2026-05-03 18:20 UTC the gate12e branch has not been pushed to `origin` and no PR is open.** Pinging peer `4qw7zwu7` to push + PR.

### 3. Why Kyle filed the bug as "metacron-side"

Best read: the Connectors UX is reached through metacron-style operator framing (Settings drawer / Connectors tile concept), so the bug was filed under metacron even though the route + handler live in Pathfinder. No metacron source change resolves it.

## Action

- **metacron side (this branch):** add this investigation memo only; no code change. PR opened so the kanban card can move through `In Process → Review` per Kyle's protocol.
- **Pathfinder side:** filed `MEMORY/operator-todos/2026-05-03-pathfinder-needs-hubspot-reconnect-endpoint.md` flagging gate12e ready-to-push. Pinged peer `4qw7zwu7`.
- **Future:** if metacron grows its own Connectors surface, this memo flags that the install route lives in Pathfinder and any metacron-hosted Reconnect button must `window.location.href` to the Pathfinder origin (cross-origin nav, not an in-app SPA route).
