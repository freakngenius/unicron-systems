# 2026-05-02 — PR rebase queue (3 conflicting PRs)

After bulk-merge of PRs #19 (outreach progress UI), #15 (worktree docs), #47 (vercel typecheck), and #49 (cron telemetry), three open Pathfinder PRs remain. All three are CONFLICTING/DIRTY against current main and can't auto-merge. Diffs sized for Kyle's wake-up review.

Current main HEAD: post-#49 merge (cron telemetry helper landed).

---

## PR #34 — Stream B Phase 2 CRM extensions (Gates B1-B3)

**Branch:** `stream/b-pathfinder` · **Size:** +6,523 / −1 across 42 files · **Open since:** 2026-05-01

**What it ships (verbatim from PR body):**
- **Gate B1** — Pipeline Kanban + `pathfinder.deals` + `pathfinder.deal_activities` schema (migration `0050_deals.sql`), 7-column drag/drop Kanban at `/pathfinder/pipeline`.
- **Gate B2** — Send-from-Pathfinder via Gmail + Microsoft Graph OAuth (migration `0051_outreach_edits.sql`), outreach edit capture (Levenshtein + 4-band classifier).
- **Gate B3** — Activity timeline + reply detection (migration `0052_email_threads.sql`).

**Files conflicting with main (only 2):**
- `Pathfinder/middleware.ts` — needs additive entry to exempt `/api/email/oauth/callback` from basic-auth (per PR body, this exemption is part of B2).
- `STREAM-README.md` — root README updated by other streams since branch point.

**Stream affiliation:** Yes — Stream B. Genuinely unmerged. Streams A/C/D/E all landed; B is the last one outstanding.

**Effort to rebase:** ~30 minutes. Both conflicts are trivially additive: middleware adds one new path entry; STREAM-README is a pure additive merge. The 42 other touched files are all NEW (deals routes, email routes, lead detail, components, tests) — they don't exist on main and won't conflict.

**Recommendation: rebase + merge.** This is the highest-value unblock. Stream B's tables (`deals`, `email_integrations`, `outreach_edits`, `email_threads`) are referenced in the Tuesday-demo Pipeline Kanban view. Without it, /pathfinder/pipeline 404s behind auth.

**Caution before merge:**
- Stream B added migrations `0050`, `0051`, `0052`. Verify these apply cleanly against current Supabase state — Stream D added `0070`, Stream E added `0080`/`0081`/`0082`. Numbering is not strictly sequential; check for filename collisions.
- B2's OAuth flow needs `GOOGLE_OAUTH_CLIENT_ID/_SECRET` + `MICROSOFT_GRAPH_CLIENT_ID/_SECRET` env vars on the Pathfinder Vercel project. Will fail fail-open at runtime if missing — won't break deploy.

---

## PR #11 — Ranker drains full queue + Ingestor auto-triggers

**Branch:** `feat/ranker-drain-and-autotrigger` · **Size:** +332 / −197 across 3 files · **Open since:** 2026-04-29

**What it ships (verbatim from PR body):**
- Ranker parallelization: `maxDuration` 60s → 300s, `QUEUE_LIMIT` 30 → 200, `CYCLE_BUDGET_MS` 50s → 270s, Sonnet concurrency 1 → 5 parallel workers via worker pool with shared cursor.
- Ingestor → Ranker auto-trigger: fire-and-forget GET to `/api/cron/ranker` after `insertNewProjects` succeeds. `AbortController` + 2s timeout.
- `docs/specs/ranker.md` updated.

**Files conflicting with main:**
- `Pathfinder/app/api/cron/ranker/route.ts` — Stream A's PR #33 rewrote this file (added agent_runs lifecycle, basePath fixes, error tracking). #11's parallelization + worker pool needs to be reapplied on top of #33's changes.
- `Pathfinder/lib/ingestor.ts` — Stream A also touched this; the auto-trigger logic in #11 needs reconciliation with Stream A's Inngest emission added in PR #33.

**Stream affiliation:** None directly, but the ranker file is heavily owned by Stream A's evolution. Confirmed PR #11's parallelization features are NOT in current main (Stream A kept the serial loop).

**Effort to rebase:** ~2 hours. Non-trivial. The ranker's `processOneProject` extraction + worker pool is a structural change that needs to coexist with Stream A's agent_runs lifecycle, error budget, and basePath wiring. Best done as a careful side-by-side review of `Pathfinder/app/api/cron/ranker/route.ts` rather than a `git rebase` blind resolution.

**Recommendation: defer until post-Tuesday-demo.** The current serial ranker is processing 44 ranks/24h, which is enough for demo throughput. Parallelization is a 10x throughput win but not a demo-day blocker. Capture the rebase work as its own follow-up issue.

---

## PR #21 — chat polish: markdown + clickable project IDs + footer strip

**Branch:** `feat/p0-01b-chat-polish` · **Size:** +1,468 / −43 across 10 files · **Open since:** 2026-04-29

**What it ships (verbatim from PR body):**
- `**bold**` literal and pipe-table rendering (`react-markdown` + `remark-gfm`).
- Clickable project IDs as chips that open the project modal.
- Stripped `## TABLES` + horizontal rule from the streaming chat output.
- `lib/chat/footer.ts` extracted with 18 unit tests.

**Files conflicting with main:**
- `Pathfinder/components/chat/ChatMessage.tsx` — PR #38 (chat-renderer) rewrote ChatMessage.tsx to add markdown + table heuristics. Likely **partially supersedes** #21.
- `Pathfinder/package.json` + `pnpm-lock.yaml` — `react-markdown` + `remark-gfm` were added by PR #38; lockfile divergence is mechanical.

**Stream affiliation:** None. Predates the Phase 2 streams.

**Effort to rebase:** ~1 hour. The footer-strip logic in `lib/chat/footer.ts` and the clickable-project-ID chip behavior may not be in main. The markdown rendering itself almost certainly is (per PR #38). Three tasks:
1. Audit current `ChatMessage.tsx` + `MarkdownBody.tsx` for footer-strip and clickable-ID functionality.
2. If absent: cherry-pick those pieces only (`lib/chat/footer.ts` + the chip-click handler in MarkdownBody).
3. Drop the markdown-rendering portion of #21 (already in main via #38).

**Recommendation: Kyle review on a slow afternoon.** Possibly close as superseded if the chip-click behavior isn't critical for demo. The visible artifacts (literal `**bold**`, pipe-tables) are already fixed by #38.

---

## Bulk action queue (for Kyle)

| PR | Action | Effort | Demo impact |
|---|---|---|---|
| #34 | ✅ **MERGED** 2026-05-02 04:07 UTC + 3 migrations applied (sha `6b0aa5f`) | done | unblocked |
| #21 | Audit + cherry-pick or close | 1 hr | LOW (cosmetic chips) |
| #11 | Defer to post-demo | 2 hr | MEDIUM (10x ranker throughput, not blocking) |

---

## Already merged this session

| PR | Title | Merged |
|---|---|---|
| #47 | exclude unicron-platform/ from root marketing-site build | 03:23 UTC |
| #19 | P0-02b outreach visible progress | 03:28 UTC |
| #49 | cron telemetry agent_runs writes | 03:42 UTC |
| #15 | worktree coordination docs | 03:44 UTC |

Verification routine for #49 firing at 04:02 UTC (trigger `trig_01RGn1PpcfxCfk5UjsJA32Bx`).
