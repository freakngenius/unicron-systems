# PLAN: Chat launcher restyle (Internal)

Branch: `chat-launcher-restyle`
Worktree: `/private/tmp/chat-launcher-restyle`
Base: `origin/main` @ `adeec4e` (post Stream G merge).

## Diagnosis

`Pathfinder/components/internal/lead-chat/LeadChatLauncher.tsx` (Stream H) renders a 52x52 black pill with white text "CHAT" / "CLOSE". SPEC wants a white circle with a black chat icon, no text, subtle shadow, hover state, aria-label="Open chat".

lucide-react is NOT in `Pathfinder/package.json`. To avoid pulling a new runtime dependency for a single icon, inline the lucide `MessageCircle` SVG path (and `X` for the open state, since the launcher currently swaps state-content and the SPEC says "if the open/close state already swaps the icon, keep that behavior but restyle"). Two tiny inline SVGs, black stroke, no fill.

## Scope

Single component restyle, one test update, one spec-references entry.

Touched paths:
- `Pathfinder/components/internal/lead-chat/LeadChatLauncher.tsx` (presentation rewrite, additive: same props, same exports, same click behavior)
- `Pathfinder/__tests__/internal-chat/lead-chat-panel.test.tsx` (the two LeadChatLauncher assertions: drop the `/CHAT/` text expectation and update the aria-label from "Open Lead Chat" to "Open chat", per SPEC)
- `MEMORY/spec-references.md` (Chat launcher restyle section)
- `Pathfinder/docs/PLAN-chat-launcher-restyle.md` (this file)

Not touched: `LeadChatPanel.tsx`, the chat API route, the chat lib (`lib/chat/*`), any other org's components, package.json.

## Design notes

- 52x52 button, `border-radius: 50%`, white background, black 24x24 SVG centered.
- Hover: `transform: scale(1.06)` + lifted box-shadow, 140ms ease.
- Focus-visible ring: 2px solid `#0a0a0a` with 2px offset, injected via a single `<style>` element next to the button (scoped to `[data-testid="lead-chat-launcher"]:focus-visible`).
- Tap target 52px (>= 44px minimum).
- Drop shadow: rests at `0 6px 20px rgba(10,10,10,0.15)`, lifts to `0 10px 28px rgba(10,10,10,0.22)`.
- Open state swaps the MessageCircle SVG for an X SVG, matching the existing toggle-content behavior.

## Test plan

`pnpm lint && pnpm typecheck && pnpm test` (locally before push). The two LeadChatLauncher tests in `__tests__/internal-chat/lead-chat-panel.test.tsx` get their assertions adjusted: drop `toHaveTextContent(/CHAT/)`, change `aria-label` to `Open chat`, optionally assert the SVG is present.

## Gate

build, lint, type-check, tests green; CI matches; Pathfinder Vercel green; verify-orgs-byte-unchanged.ts passes; live-verify on `internal.unicron.systems` shows the white circle + black icon with no "Chat" text.

## Rollback

`git revert` on the merge commit. No DB or env changes.
