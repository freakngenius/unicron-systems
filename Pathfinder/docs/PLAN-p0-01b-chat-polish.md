# PLAN — P0-01b Chat panel polish

**Branch:** `feat/p0-01b-chat-polish`
**Status:** Approved verbally on 2026-04-29 ("go") after Kyle shared a screenshot showing literal `**bold**`, ASCII pipe-tables, visible backticks around project IDs, and a stray `## TABLES` + horizontal rule leaking into the rendered chat. This plan ships those fixes as a small follow-up to PR #14.

## Problem

The chat panel currently renders assistant content with `whiteSpace: 'pre-wrap'`. Sonar emits markdown (bold, tables, inline code, headers, links) so the user sees the raw markup instead of the formatted version. Three concrete symptoms in the screenshot:

1. `**TxDOT I-45 corridor security expansion**` shows literal asterisks instead of bold.
2. The leaderboard renders as ASCII pipe-table characters instead of an HTML `<table>`.
3. Project IDs in backticks (`` `sam.gov:TXDOT-I45-2026-001` `` ) display the backticks alongside the ID and aren't actionable.
4. The `TABLES:` provenance line — which the route is supposed to strip — leaked through as a `## TABLES` markdown header followed by an `---` horizontal rule because Sonar promoted it to a section header instead of the plain trailing line we asked for.

## Scope

Five files. Strictly additive to the chat panel; no changes to other features, agents, or shared types.

- `package.json` + `package-lock.json` — add `react-markdown@^9` and `remark-gfm@^4`.
- `components/chat/MarkdownBody.tsx` — **new** — wraps `react-markdown` with `pf-*` styled component overrides. Tables, bold, italic, lists, inline code, headers, links, hr, blockquote.
- `components/chat/ChatMessage.tsx` — assistant text branch swaps the pre-wrap `<div>` for `<MarkdownBody />`. User messages keep pre-wrap (they don't contain markdown). New optional `onProjectClick` prop threaded down.
- `components/chat/IntelligenceChat.tsx` — accepts `onOpenProject` prop, forwards to `<ChatMessage onProjectClick={...} />`.
- `components/dashboard.tsx` — passes `setOpenProjectId` (guarded by an "ID exists in loaded set" check) into `<IntelligenceChat onOpenProject={...} />`.
- `lib/chat/footer.ts` — **new** — extracts the provenance-footer parsing and stripping from the route file so it can be unit-tested. Three exports: `parseTablesFooter(text)`, `stripTrailingTablesLine(text)`, `stripStreamingFooter(delta, accumulated)`.
- `app/api/chat/route.ts` — imports the helpers from `lib/chat/footer.ts`, deletes the inline copies. Tightens the system prompt so Sonar is less likely to format the footer as a header in the first place.
- `__tests__/chat/footer.test.ts` — **new** — 18 tests covering the formats Sonar actually emits (canonical, `## TABLES`, `**TABLES**`, leading horizontal rule, mid-stream detection, no-footer pass-through).

## Behavior locked

- **Project-ID detection:** inline code matching `^(sam\.gov|usaspending|news|harris):[A-Za-z0-9._:-]+$` renders as a clickable button. Click → `onProjectClick(id)` → dashboard opens the project modal IF the ID is present in `initialProjects` (otherwise no-op, no error). Other inline code (regular `` `code` ``) stays non-clickable but gets the monospace + light-grey-bg treatment.
- **Headers collapse to one style:** chat doesn't need h1/h2 sizing. All `h1`–`h6` render as a small uppercase mono label that matches `pf-label` so promoted-header text doesn't dominate the bubble.
- **Tables:** wrapped in a horizontally-scrollable container so wide tables don't break the panel layout. Header row is uppercase mono on `bgAlt`. Body cells use tabular-nums so numeric columns line up.
- **Links:** open in a new tab with `rel="noopener noreferrer"`. Subtle underline (`textDecorationColor: ruleSoft`).
- **Footer-strip resilience:** the streaming and final-strip helpers both accept `## TABLES`, `**TABLES**`, plain `TABLES:`, leading horizontal rule, case-insensitive marker. `(none)` is treated as empty. Pathfinder schema prefix is stripped from each table name.

## What's NOT in scope (explicitly)

- No changes to `app/api/chat/actions/route.ts` (action handlers stay as-is).
- No changes to outreach drafter or any non-chat code.
- No changes to the dashboard layout outside the new `onOpenProject` prop on `<IntelligenceChat>`.
- No styling overhaul of the existing `pf-*` system; we layer MarkdownBody onto it, not replace it.
- No mobile responsiveness pass.

## Verification

- `npm run typecheck` — clean
- `npm run lint` — clean (ESLint warnings: 0)
- `npm test` — all 61 chat tests pass (43 existing + 18 new footer tests)
- `npm run build` — production build clean, both `/api/chat` and `/api/chat/actions` register as dynamic routes
- Dev-server smoke: SSE route streams markdown deltas correctly with both `ANTHROPIC_API_KEY` (rationale) and `PERPLEXITY_API_KEY` (chat) set
- **NOT verified in this session:** browser-rendered output. The Chrome extension MCP isn't connected to me and computer-use only allows screenshot of the browser, not interaction. Kyle to verify visually in the Vercel preview deploy before merging — the same screenshot prompt that produced the broken render should now show formatted bold, an HTML table with thin borders, monospace project-ID chips that respond to click, and no stray `TABLES` block.

## Risks

- **react-markdown bundle weight (~50KB gzip including remark-gfm):** chat panel is dynamically loaded, so first-paint isn't affected. Acceptable.
- **Project-ID click handler depends on the project being in `initialProjects`:** if the chat references a project that hasn't loaded into the dashboard yet (rare; dashboard fetches all projects on mount), the click is a no-op. Acceptable for V1.
- **Footer-strip regex:** broader pattern than before. Tests cover the production-observed shapes but Sonar can always invent new ones. The `lib/chat/footer.ts` extraction makes future tightening cheap.
- **Sources popover (#20) just landed in main:** independent surface (top-bar source filter pills, not the chat provenance footer). No collision.
