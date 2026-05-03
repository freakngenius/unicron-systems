# Operator todo — Pathfinder side: push + PR Gate 12E HubSpot Reconnect 404 fix

Filed 2026-05-03. Owner: Pathfinder peer chat `4qw7zwu7`.

## Background

Kyle reported a HubSpot Reconnect 404 against metacron.unicron.systems. Metacron-side investigation (see `MEMORY/dev-handoffs/2026-05-03-metacron-hubspot-reconnect-404-investigation.md`) confirms metacron has no Connectors page in source or live deploy. The bug is on Pathfinder's `/pathfinder/api/connectors/hubspot/install` route, which is **POST-only** while the tile fallback uses browser GET navigation.

## Status of the fix

A complete fix already exists locally in worktree `Pathfinder-worktrees/gate12e-hubspot-reconnect-fix/` on branch `demo-polish-ux/gate12e-hubspot-reconnect-fix`:

- Single commit: `1ae83e3 fix(pathfinder): demo polish UX gate 12E — HubSpot Reconnect 404`
- Adds shared `handleInstall(req)` helper; exports `GET` and `POST` to it (matches Slack auth pattern).
- File: `Pathfinder/app/api/connectors/hubspot/install/route.ts` (+26 / −12 lines).

**The branch has not been pushed to origin and no PR is open.**

## Next step for the Pathfinder peer (`4qw7zwu7`)

1. From `Pathfinder-worktrees/gate12e-hubspot-reconnect-fix/`:
   - `npm run typecheck && npm run lint && npm test` — confirm green per Pathfinder's `verification-before-completion` discipline.
   - `git push -u origin demo-polish-ux/gate12e-hubspot-reconnect-fix`
   - `gh pr create` with title "fix(pathfinder): demo polish UX gate 12E — HubSpot Reconnect 404 (GET handler)" and body summarising the POST-only → GET+POST fix.
2. Hand to Kyle for merge per Pathfinder deploy chain (no self-merge).

## Cross-reference

- Metacron-side investigation memo: `MEMORY/dev-handoffs/2026-05-03-metacron-hubspot-reconnect-404-investigation.md`
- Metacron-side PR (no-op investigation only): `chore/metacron-fix-hubspot-reconnect-404`
