# Operator todo — Pathfinder side: push + PR Gate 12E HubSpot Reconnect 404 fix

Filed 2026-05-03. Owner: Pathfinder peer chat `4qw7zwu7`.

## Background

Kyle reported a HubSpot Reconnect 404 against metacron.unicron.systems. Metacron-side investigation (see `MEMORY/dev-handoffs/2026-05-03-metacron-hubspot-reconnect-404-investigation.md`) confirms metacron has no Connectors page in source or live deploy. The bug is on Pathfinder's `/pathfinder/api/connectors/hubspot/install` route, which is **POST-only** while the tile fallback uses browser GET navigation.

## Status of the fix — RESOLVED IN-FLIGHT

PR **#124** is already open by peer `j2fu42j9`:
https://github.com/freakngenius/unicron-systems/pull/124

Title: `fix(pathfinder): demo polish UX gate 12E — HubSpot Reconnect 404`
Branch: `demo-polish-ux/gate12e-hubspot-reconnect-fix`

Root cause per PR #124: `HubspotUserTile.handleConnect` was using `fetch('...', { method: 'POST', redirect: 'manual' })` and reading the `Location` header off the opaqueredirect — which the Fetch spec strips, so the header was always `null`. The fallback then did `window.location.href = '...install?...'` — a **GET** navigation against a POST-only handler. Next.js returned 405, surfaced as the 404 page.

Fix:
- Add `GET` handler delegating to the same `handleInstall()` body (mirrors Slack at `app/api/connectors/[type]/auth/route.ts`).
- `POST` preserved for backwards-compat.
- `HubspotUserTile.handleConnect` simplified to direct `window.location.href` navigation with `?operator_email=` query param.

Verification reported by peer:
- `pnpm typecheck` → 0 errors
- `pnpm lint` → no warnings
- `pnpm test` → 1260 passed (+6 regression tests covering GET/POST × auth states)

## Next step

Hand off to Kyle for merge of PR #124 per Pathfinder deploy chain (no self-merge).

## Cross-reference

- Metacron-side investigation memo: `MEMORY/dev-handoffs/2026-05-03-metacron-hubspot-reconnect-404-investigation.md`
- Metacron-side PR (no-op investigation only): `chore/metacron-fix-hubspot-reconnect-404`
