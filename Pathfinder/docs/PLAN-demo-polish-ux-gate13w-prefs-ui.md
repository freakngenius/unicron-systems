# PLAN — Demo Polish UX Gate 13W-C: prefs UI + manual dispatch

**Branch:** `demo-polish-ux/gate13w-prefs-ui` (stacked on
`demo-polish-ux/gate13w-cron-send` `2ab81f2`)
**Worktree:** `Pathfinder-worktrees/gate13w-prefs-ui/`

## Goal

Settings page so operators can: toggle frequency / send_hour / sections,
pause/resume, preview the last brief, and "Send me one now" for an
on-demand dispatch.

## Files

- `app/settings/briefing/page.tsx` — server shell. Renders the form
  with empty initial state; the client component self-sources
  `operator_email` from localStorage (matches `HubspotUserTile`
  pattern at `components/settings/connectors/HubspotUserTile.tsx`).
- `components/settings/BriefingPrefsForm.tsx` — client form. Loads
  prefs via `GET /api/briefing/prefs`; saves via `POST`. Preview +
  Send Now buttons hit the dispatch endpoints.
- `app/api/briefing/prefs/route.ts` — GET (load row, return defaults
  if absent) + POST (upsert). Auth via `getCurrentUserId(req)`.
- `app/api/briefing/preview/route.ts` — GET. Composes a brief and
  returns markdown + html + metrics WITHOUT sending. Used by the
  preview pane.
- `app/api/briefing/dispatch/route.ts` — POST. Composes + sends. Same
  pipeline as the cron, but bypasses the `BRIEFING_CRON_ENABLED` and
  `shouldSkip` gates so the operator can fire on-demand any time.

## Test scope

- `tests/briefer-prefs-route.test.ts` — GET/POST handlers around a
  stubbed Supabase upsert. Validates input shapes.
- `tests/briefer-dispatch-route.test.ts` — dispatch route forwards to
  `composeDailyBrief` + `sendDailyBrief`, returns the send result.
- `tests/briefing-prefs-form.test.tsx` — render + state transitions
  for the client form (frequency dropdown, hour input, section
  checkboxes, paused toggle, preview button render).

## Hard constraints

- ✅ `BRIEFING_CRON_ENABLED` doesn't gate manual dispatch — that's the
  point of the button.
- ✅ Schema unchanged.
- ✅ Auth gate matches existing pattern (`getCurrentUserId` returns
  null → 403).
- ✅ Houston flagship + cross-pollination + agent_runs untouched.

## Commit chain

```
1. docs+routes: gate 13W-C PLAN + prefs/preview/dispatch routes
2. feat(ui): gate 13W-C — settings page + BriefingPrefsForm + tests
```
