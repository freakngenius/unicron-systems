# Atrium Reports

Reports specific to Atrium build/state live here.

## Canonical conductor state

`conductor-state.json` (Master Conductor's persisted state across Sprints 0-7) lives at the canonical path `Company Docs/Reports/conductor-state.json`, NOT under `Company Docs/Atrium/Reports/`. Reason: active conductor sessions read/write that path; relocating would break in-flight runs. Updated path may consolidate later when no in-flight conductor depends on the absolute location.

## What goes here

- Sprint retrospectives (per-sprint markdown reports authored after Verified)
- Functionality-vs-design diff reports (e.g., `atrium-design-diff-2026-05-09.md`)
- Smoke test trajectory archives if collected as artifacts
- Build incident post-mortems specific to Atrium surfaces
