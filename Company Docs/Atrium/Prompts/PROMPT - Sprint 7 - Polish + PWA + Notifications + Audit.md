# PROMPT — Sprint 7: Polish + PWA + Notifications + Audit

Dispatched by the Master Conductor. Self-contained.

**Project root:** `/Users/keka/Dropbox/Projects/Unicron Systems/`

**Reference SPECs:** `Company Docs/Specs/SPEC - Unicron Nervous System.md`, `Company Docs/Specs/SPEC - Nervous System Addendum 2 (Skills + Karpathy + Refero).md`, `Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md`

This sprint is the polish pass. Atrium becomes installable, configurable, observable, and accessibility-correct.

This sprint accomplishes:
1. PWA wrapping (manifest, service worker, installable icon)
2. Notification preferences UI per team_member
3. Audit log viewer in Atrium System tab
4. Decay heatmap visualization
5. Scheduled jobs UI (list, toggle, manually trigger)
6. Edge polish: loading states, empty states, error handling, accessibility — full **Refero design consistency pass** across all 8 tabs (per Addendum 2 section 3) using design tokens established in Sprint 2 (`unicron-knowledge/wiki/specs/atrium-design-tokens.md`)
7. **Skills surface UX polish**: keyboard shortcuts to run skills (`/` to focus prompt, `cmd+K` for skill search, `cmd+enter` to run); recent runs panel fully populated; forecast panel showing budget burn per skill; PWA respects skill-click navigation
8. Final integration tests across all 8 tabs

## Parallel streams

- **Stream A** (worktree `unicron-platform-worktrees/sprint7-pwa`): PWA wrapping + service worker + manifest + icons (Task 1)
- **Stream B** (worktree `unicron-platform-worktrees/sprint7-settings`): notification preferences UI + endpoint (Task 2)
- **Stream C** (worktree `unicron-platform-worktrees/sprint7-audit-decay-jobs`): audit log viewer + decay heatmap + scheduled jobs UI (Tasks 3, 4, 5)
- **Stream D** (worktree `unicron-platform-worktrees/sprint7-polish`): edge polish across all tabs + Refero consistency pass + skills surface UX polish (Tasks 6, 7)
- **Stream E** (worktree `unicron-platform-worktrees/sprint7-tests`): final integration tests (Task 8)

---

## Pre-conditions

- Sprint 6 verified
- Atrium has all 8 tabs with content
- Wiki pages all authored
- Both Vercel projects healthy

---

## Kanban hygiene — start

Card "Sprint 7 — Polish + PWA + Notifications + Audit" → In Process. DRI: Kyle. Surface: Architecture. Verify Criteria: "Atrium installable as PWA on iOS and Android. Notification preferences per user. Audit log viewer renders all system changes. Decay heatmap renders. Scheduled jobs UI functional. Lighthouse score above 85 on Atrium home. Accessibility audit passes."

---

## Tasks

### Task 1 — PWA wrapping

In `unicron-platform/`:
1. Create `public/manifest.webmanifest`:
```json
{
  "name": "Atrium",
  "short_name": "Atrium",
  "description": "Unicron Systems internal cockpit",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "/icons/atrium-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/atrium-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/atrium-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

2. Create service worker (Workbox or hand-rolled) with:
   - Pre-cache app shell (HTML, CSS, JS)
   - Network-first for API calls (no caching of dynamic data; freshness wins)
   - Offline fallback page for navigation requests
   - Background sync for queued ingest payloads (voice memos captured offline)

3. Generate Atrium icons (use Anthropic image generation or commission; Sprint 7 acceptable to use placeholder dark-on-dark wordmark if final brand asset isn't ready)

4. Add manifest link in `index.html`. Register service worker on load.

5. iOS PWA quirks: add `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`.

### Task 2 — Notification preferences UI

Path: `unicron-platform/src/atrium/Settings.tsx` (accessible from user menu)

Per-user preferences stored in `nervous_system.team_members.config.notifications`:

```json
{
  "slack_dm": true,
  "slack_escalations_channel": true,
  "atrium_badges": {
    "escalations": true,
    "calendar": true,
    "calls": true,
    "sprints": true,
    "calendar_minutes_before": 15
  },
  "email_digest": false,
  "push_notifications": false
}
```

UI:
- Toggle switches for each option
- Save via `PATCH /api/atrium/me/preferences`
- Defaults: only escalations and DMs ping the phone; everything else accumulates in Atrium

### Task 3 — Audit log viewer

Path: `unicron-platform/src/atrium/System.tsx` add tab `Audit Log`

Components:
- Searchable, filterable table of `nervous_system.audit_log`
- Filters: actor (team_member or agent), table_name, action, date range
- Export to CSV
- Click row for full detail (before-state, after-state, payload JSON)

### Task 4 — Decay heatmap

Path: `unicron-platform/src/atrium/System.tsx` add sub-view `Decay Heatmap`

Components:
- Visual: topic clusters from `nervous_system.signals` grouped by topic
- Color: bright = strong + recently reinforced; dim = weak or stale
- Click cluster for signal list with `last_touched`, `strength`, `ttl_days`
- Action: "Archive cluster" button (Taboo-checked)

### Task 5 — Scheduled jobs UI

Path: `unicron-platform/src/atrium/System.tsx` add sub-view `Scheduled Jobs`

Components:
- List of all Inngest functions and Vercel cron jobs
- Per job: name, schedule, last run status, last run timestamp, next run timestamp, owner agent
- Toggle on/off (audit-logged)
- "Trigger now" button (audit-logged)
- Read from a `nervous_system.scheduled_jobs` registry table (add this if not yet present):

```sql
CREATE TABLE IF NOT EXISTS nervous_system.scheduled_jobs (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  schedule_cron text,
  owner_agent_id uuid references nervous_system.agents(id),
  active boolean default true,
  last_run_at timestamptz,
  last_run_status text,
  next_run_at timestamptz,
  notes text,
  created_at timestamptz default now()
);
```

Seed with all known scheduled jobs (decay tick, daily digest, weekly memory consolidation, weekly retro, monthly continuity audit, quarterly taboo review, daily Slack scan, daily email scan).

### Task 6 — Edge polish

Across all 8 tabs:
- **Loading states**: skeletons for cards, lists, tables; not spinners
- **Empty states**: descriptive, with one suggested action ("No customers yet. Add one." with a button)
- **Error states**: friendly text, retry button, error code for support
- **Optimistic UI**: drag-drop, status changes update UI before server confirmation; rollback on failure
- **Accessibility**:
  - All interactive elements keyboard-reachable
  - ARIA labels on icons and buttons
  - Color contrast ratio at least 4.5:1 for text
  - Focus indicators visible
  - Screen reader pass on Home and Work tabs
- **Responsive breakpoints tested**: 320px, 375px, 414px, 768px, 1024px, 1280px, 1536px

### Task 7 — Performance pass

- Lighthouse audit on Atrium home; target score above 85 for Performance, Accessibility, Best Practices, SEO
- Bundle size analysis; lazy-load tabs not in current view
- Image optimization (avif/webp where possible)
- Font subsetting

### Task 8 — Final integration tests

Write integration tests covering:
- Full ingest flow: voice memo upload → Whisper → ingest skill → Taboo Keeper → ledger row → vault doc → action item → Notion card
- Slack DM → Orchestrator → Taboo Keeper → action item creation → kanban writer
- Atrium edit: change agent budget → Taboo Keeper → audit log → persisted value
- PWA install on a virtual iOS device (manual smoke test if automated tooling unavailable)
- Offline ingest: queue voice memo while offline; sync when online

### Task 9 — Final wiki update

Update `vault/Memory/wiki/welcome.md` to reflect "Atrium v1 complete" status. Append entry to `vault/Memory/elder/continuity.md` recording the v1 milestone.

### Task 10 — Master conductor completion report

The Conductor's final report posts to `#orchestrator-feed` and DMs Kyle:
- Summary of all 7 sprints
- Total PRs merged
- Total Supabase migrations
- All connected services and their status
- Any taboo overrides observed across the run
- Any continuity log entries created
- Atrium URL and PWA install instructions

### Task 11 — Multi-Vercel verification

- Both Vercel projects healthy
- Lighthouse score targets met
- PWA installable on test device
- All edge polish across all tabs verified
- Audit log viewer functional
- Notification preferences UI functional with persistence
- Decay heatmap renders
- Scheduled jobs UI functional
- Integration tests pass

### Task 12 — Continuity log entry

```markdown
## YYYY-MM-DD — Atrium v1 milestone
- **Type:** architectural_decision
- **Substance:** Unicron Nervous System and Atrium internal cockpit complete at v1. All 8 tabs operational. PWA installable. Sprints 1-7 complete. The system that runs the company is now visible, editable, and self-documenting.
- **Evidence:** Conductor completion report at `vault/Reports/conductor-completion-YYYY-MM-DD.md`
- **Active_until:** indefinite
```

---

## Hard halt conditions

- PWA service worker introduces stale-cache bugs blocking critical updates
- Notification preferences endpoint introduces auth bypass
- Lighthouse score below 70 on any of Performance/Accessibility/Best Practices/SEO (below 85 is a Bug Fixes outcome, not halt)
- Either Vercel project fails to build
- Integration tests reveal a critical regression

---

## Auto-merge criteria

- PWA installable on iOS and Android (manual smoke test)
- All 4 polish targets met across all 8 tabs (loading, empty, error, optimistic UI)
- Accessibility audit passes basic checks
- Lighthouse score above 85 on Performance, Accessibility, Best Practices, SEO
- Audit log viewer renders all `audit_log` rows with filters
- Notification preferences persist per user
- Decay heatmap renders with real data
- Scheduled jobs UI renders all known jobs with toggle
- Integration tests pass
- Both Vercel projects healthy
- PR description verbatim evidence

---

## Auto-revert triggers

- PWA service worker breaks the existing live site
- Notification preferences cause notification storms
- Edge polish CSS breaks existing component layouts

---

## Done criteria

1. PWA installable; manifest valid; service worker registered
2. Notification preferences UI functional and persisted per user
3. Audit log viewer in System tab functional
4. Decay heatmap in System tab functional
5. Scheduled jobs UI in System tab functional
6. Edge polish complete across all 8 tabs
7. Lighthouse targets met
8. Integration tests pass
9. Both Vercel projects healthy
10. Conductor posts final completion report to `#orchestrator-feed` and DMs Kyle
11. Continuity log entry recording Atrium v1

---

## Out of scope

- Native iOS/Android app (deferred until adoption justifies)
- Additional Atrium tabs (the 8 are the cap)
- Customer-facing features (Pathfinder/Metacron handle those)
- New connectors beyond what's already wired

Begin.

---

## After Sprint 7

The Master Conductor's completion loop runs:

1. Generate `vault/Reports/conductor-completion-YYYY-MM-DD.md`
2. Post summary to `#orchestrator-feed`
3. DM Kyle with summary and Atrium URL
4. Final kanban audit: every Sprint 1-7 card in Deployed, Review, or Bug Fixes (Verified is Kyle's call)

The Nervous System is alive. Atrium is the visible front. The substrate runs the company.
