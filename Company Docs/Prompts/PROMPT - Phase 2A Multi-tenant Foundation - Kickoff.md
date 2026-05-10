# PROMPT — Phase 2A Multi-tenant Foundation Kickoff (paste-ready)

Paste into a fresh Claude Code session. Bundles Streams 2A (routing+auth) + 2B (tenant config layer) into one foundation PR. Streams 2C, 2D, 2E ship in follow-up sprints.

---

## Pre-read

1. `Company Docs/PRD/PRD - Phase 2 Tailored Pathfinder.md`
2. `Company Docs/Specs/SPEC - Phase 2A Multi-tenant Routing & Auth.md`
3. `Company Docs/Specs/SPEC - Phase 2B Tenant Config Layer.md`
4. `MEMORY/operator-todos/2026-05-04-pathfinder-needs-organizations-schema.md`
5. `Pathfinder/app/` directory structure.
6. Live `pathfinder.organizations` state via `list_migrations` + read-only `execute_sql`.
7. Existing Supabase Auth config in `Pathfinder/lib/supabase`.
8. Grep for hardcoded "zedcor" / "Zedcor" / "ZEDCOR" in `Pathfinder/`.

## Hard constraints

- No deletes (no rm, git clean, reset --hard, wipe uncommitted work). Archive to `_archive/` if needed; commit before branch switch.
- No time estimates anywhere.
- No cost caps.
- Multi-Vercel verification: Pathfinder + Metacron independent.
- No promotion to Verified column (human-only).
- Verbatim evidence in PR description (logs, schema queries).
- Cross-app boundary: Path B exception only with justification in PR.

## Phase A.0 — Peer coordination gate (HARD)

Pathfinder peer 6mz1zgdf owns `pathfinder.organizations` (operator-todo `MEMORY/operator-todos/2026-05-04-pathfinder-needs-organizations-schema.md`). Send via claude-peers MCP:

```
Phase 2A Multi-tenant Foundation kicking off. Depends on pathfinder.organizations + endpoints from operator-todo 2026-05-04.

Coordination ask:
1. Status of pathfinder.organizations migration + POST/GET/PATCH /api/organizations endpoints?
2. Confirm columns: id (uuid), slug (text UNIQUE), customer_org_id (text UNIQUE), name (text), architecture (jsonb), status (text), customer_email (text), created_at (timestamptz). Deviations?
3. Phase 2A adds pathfinder.org_memberships (new). Conflict?
4. Phase 2A migrates Zedcor's hardcoded paths to /zedcor slug. Any in-flight Pathfinder work that touches Zedcor routes?

Halt if you have anything in flight that conflicts.
```

Wait for ack. If no ack within 30 min, halt + surface to Cowork. No proceed-on-silence. No starting Phase A.1 until peer confirms.

## Phase A.1 — Investigation (Explore sub-agent, very thorough)

```
Investigate Pathfinder codebase for Phase 2A + 2B:

1. Map current Pathfinder/app/ route structure. List every page rendering Zedcor data.
2. Grep "zedcor" / "Zedcor" / "ZEDCOR" — every match.
3. Find every direct supabase.schema('pathfinder').from(...) call needing RLS scoping.
4. Identify auth middleware. Supabase Auth wired? Magic-link configured?
5. List all customer-data tables in pathfinder schema. For each: organization_id column present?
6. Check pathfinder.organizations live state (list_migrations + execute_sql): exists, columns, sample rows.
7. Find existing OrgContext / tenant primitives (likely none).
8. Identify Lead/Pipeline/Activity components for architecture-driven rendering.
9. Confirm Vercel proxy: unicron.systems/pathfinder/* routes to pathfinder-ashy.vercel.app for slug paths.
10. Report findings: file paths + line numbers + verbatim snippets.
```

## Phase B — Migration (Stream 2A schema)

```bash
git checkout main && git pull origin main
git checkout -b feat/phase-2a-multitenant-foundation
```

1. `list_migrations` against live Supabase → max number.
2. Create `Pathfinder/supabase/migrations/<NNNN>_org_memberships_and_rls.sql` (live max+1).
3. Migration content:
   - `pathfinder.org_memberships` table with RLS (per SPEC 2A).
   - For every customer-data table from Phase A.1 step 5: add `organization_id uuid` if missing, backfill with Zedcor's org_id, enable RLS, add policies per SPEC 2A.
   - Verify Zedcor first org row exists (peer should have seeded; if not, halt and report).
4. **HARD HALT FOR REVIEW**: print full migration SQL in chat, wait for Kyle's explicit "apply" before `apply_migration`.

## Phase C — Stream 2B implementation

1. `Pathfinder/lib/types/architecture.ts` — TypeScript types per SPEC 2B.
2. `Pathfinder/lib/config/baseTemplate.ts` — BASE_ARCHITECTURE.
3. `Pathfinder/lib/config/resolveArchitecture.ts` — merge resolver.
4. `Pathfinder/lib/context/OrgContext.tsx` — React context + provider.
5. `Pathfinder/lib/config/useVocab.ts` — vocab helper.
6. `Pathfinder/lib/validation/architecture.ts` — Zod schema.
7. Unit tests: resolveArchitecture (full, partial, null), useVocab (term present, fallback).

## Phase D — Stream 2A implementation

1. Create `Pathfinder/app/[slug]/` directory.
2. `[slug]/layout.tsx` per SPEC 2A: resolve org, 404 if missing, validate session, validate membership, wrap in OrgContext.Provider.
3. Move Zedcor dashboard from existing root page into `[slug]/page.tsx`. Hardcoded references stay (Stream 2D rewrites them).
4. `app/login/page.tsx` — magic-link request form.
5. `app/auth/callback/route.ts` — Supabase Auth callback handler.
6. Root `app/page.tsx` redirect: single membership → slug, multiple → picker, none → login.
7. `app/not-found.tsx` — branded 404.
8. Update `next.config.js` if needed for path-based routing.
9. E2E test (Playwright): visit `/zedcor` unauth → redirect login → submit email → mock magic-link click → land on dashboard.

## Phase E — Verification

1. Unit + integration tests pass.
2. Typecheck clean.
3. Build clean.
4. Local smoke: `/zedcor` unauth redirects, `/nonexistent` 404s, manual session loads OrgContext.
5. Print full diff + commit summary.

## Phase F — PR

1. Push branch.
2. PR titled `Phase 2A: Multi-tenant Foundation (slug routing + auth + tenant config layer)`.
3. PR body:
   - What ships (bullet list).
   - Cross-app boundary justification (if applicable).
   - Migration drift callout (live max+1 used; local files trail prod).
   - Peer coordination summary (6mz1zgdf ack timestamp + their changes).
   - Verification checklist (schema, both Vercels, auth, RLS probe).
   - Risk + rollback (revert PR; new table non-destructive; new routes additive).
4. Wait for CI green. If red, fix on branch — no force-merge.

## Phase G — Multi-Vercel verification post-merge

After Kyle merges:

1. Capture merge SHA + ISO timestamp.
2. Pathfinder verify: `pathfinder-ashy.vercel.app` green; bundle hash changed; `/zedcor` loads; `/nonexistent` 404s; login flow works.
3. Metacron verify: `metacron.unicron.systems` green; no regression.
4. Cowork handles Notion kanban moves. Just report SHA + timestamp.
5. Worktree cleanup via `git worktree remove`.

## Failure modes — halt + report

- Peer 6mz1zgdf no ack within 30 min → halt + surface.
- `pathfinder.organizations` not in production at Phase B → halt + surface.
- Migration SQL produces unexpected diff → halt.
- Customer-data tables with rows lacking org_id mapping → halt.
- E2E auth fails (cookie, RLS leak, redirect loss) → halt.
- Vercel preview red on either project → halt.
- Existing Zedcor dashboard regresses → halt.

## Kanban hygiene

- Phase A start (after peer ack): Cowork moves Phase 2A Pathfinder card → In Process.
- PR merge: Cowork moves card → Deployed. CC reports SHA + timestamp.

End.
