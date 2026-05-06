# Plaud Integration — Deferred

Status: DEFERRED to Sprint 5 or later

Reason: Plaud does not offer a public webhook or transcript export API as of Sprint 1 (2026-05-06).
Fathom is the primary recorder for Sprint 1.

When Plaud releases an API:
- Wire parallel to Fathom handler at /api/ingest/plaud/route.ts
- Source type remains 'call'; add recorder: 'plaud' to metadata

Workaround until then: Team members export Plaud transcripts manually and ingest via /api/ingest with recorder='plaud' in metadata.
