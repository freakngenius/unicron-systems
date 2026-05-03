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

Peer `j2fu42j9` already shipped the fix as **PR #124** (https://github.com/freakngenius/unicron-systems/pull/124, branch `demo-polish-ux/gate12e-hubspot-reconnect-fix`). Per the PR's root-cause analysis: `HubspotUserTile.handleConnect` was using `fetch(..., { method: 'POST', redirect: 'manual' })` and trying to read `Location` off the opaqueredirect response — the Fetch spec strips that header, so the fetch fell through to `window.location.href = '/pathfinder/api/connectors/hubspot/install?...'` (a **GET**). The route was POST-only → 405 → Next.js 404 page.

Fix in PR #124:
- Add `GET` handler delegating to the same `handleInstall()` body (matches Slack's `app/api/connectors/[type]/auth/route.ts` pattern).
- `POST` preserved for backwards-compat.
- `HubspotUserTile.handleConnect` simplified to direct `window.location.href` navigation with `?operator_email=` query param.
- Verification: typecheck/lint clean, 1260 tests pass (+6 regression tests for GET/POST × auth states).

**Awaiting Kyle's merge.**

### 3. Why Kyle filed the bug as "metacron-side"

Best read: the Connectors UX is reached through metacron-style operator framing (Settings drawer / Connectors tile concept), so the bug was filed under metacron even though the route + handler live in Pathfinder. No metacron source change resolves it.

## Action

- **metacron side (this branch):** add this investigation memo only; no code change. PR opened so the kanban card can move through `In Process → Review` per Kyle's protocol.
- **Pathfinder side:** filed `MEMORY/operator-todos/2026-05-03-pathfinder-needs-hubspot-reconnect-endpoint.md` flagging gate12e ready-to-push. Pinged peer `4qw7zwu7`.
- **Future:** if metacron grows its own Connectors surface, this memo flags that the install route lives in Pathfinder and any metacron-hosted Reconnect button must `window.location.href` to the Pathfinder origin (cross-origin nav, not an in-app SPA route).
