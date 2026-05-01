# Impeccable Audit — unicron-platform · 2026-04-30

Run via the impeccable skill's `audit` reference. Code-level review, not a design critique.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | Canvas has no keyboard equivalent for clicking nodes; panel sub-tabs and form labels lack proper roles. |
| 2 | Performance | 3 | RAF loop pauses on `visibilitychange`; HUD throttled to 10Hz. Minor: hex parsing per-frame. |
| 3 | Responsive | 2 | 480px panels and 360px settings drawer overflow on phone widths; close `×` buttons are 24×24. |
| 4 | Theming | 3 | Tailwind tokens used consistently. Canvas hex literals are acceptable (no Tailwind in 2D context). |
| 5 | Anti-Patterns | 4 | No glassmorphism, no gradient text, no AI-stock palette. Hexagon/diamond/octagon vocabulary is distinctive. |
| **Total** | | **14/20** | **Good — address weak dimensions before public demos.** |

## Anti-Patterns Verdict

**Pass.** The interface does not look AI-generated. Specific things working in its favor:

- Bold tri-color palette (cyan / gold / red) tied to mesh-layer semantics — not generic SaaS pastels.
- Mono headers + Inter body type pairing reads as software, not marketing.
- The Architect's gold sparkle (`✦`) banner is a novel affordance; not the over-used "AI shimmer."
- Concentric Canvas 2D mesh is the centerpiece — no card-grid hero, no fake "trusted by" row.

One mild tell: the gold-tint banner background (`bg-accent-gold/10 border border-accent-gold/30`) reads as "AI helper highlight" if you've spent time in Copilot UIs. Acceptable in context.

## Executive Summary

- **Audit Health Score: 14/20 (Good)**
- Issues found: 1 P0, 4 P1, 5 P2, 3 P3
- Top 3 critical:
  1. Visualizer canvas has zero keyboard / screen-reader path — operators on assistive tech cannot interact with the live system at all.
  2. Action panels (480px) and settings drawer (360px) overflow on viewports < 480px.
  3. Several icon-only buttons are below the 44×44 minimum touch target.
- Recommended next steps: run `/impeccable harden` on the visualizer to add keyboard nav + aria-labels; `/impeccable adapt` to make panels responsive; `/impeccable polish` as a final sweep.

## Detailed Findings

### [P0] Visualizer canvas has no keyboard or screen-reader path
- **Location**: `src/components/visualizer/Visualizer.tsx`, `simEngine.ts:handleClick`
- **Category**: Accessibility
- **Impact**: Operators using a keyboard or assistive tech cannot click a node to open Edit Node. They are locked out of the entire mid-flight tuning workflow.
- **WCAG**: 2.1.1 Keyboard (Level A) violation.
- **Recommendation**: Add `<canvas role="application" aria-label="Live system mesh; press Tab to cycle agents, Enter to open">`. Track a focused-node index in the engine; `keydown` on Tab/Shift-Tab cycles through agents, Enter dispatches the same `node-clicked` event the click handler does. Render a focus ring on the focused node.
- **Suggested command**: `/impeccable harden`

### [P1] Form labels in panels are styled divs, not `<label htmlFor>`
- **Location**: `src/components/live/panels/AddAgentPanel.tsx:Field`, `AddSourcePanel` sub-tab fields, `EditNodeEdit` instruction textarea
- **Category**: Accessibility
- **Impact**: Screen readers don't announce field names; click-on-label-to-focus doesn't work.
- **WCAG**: 1.3.1 Info & Relationships (Level A), 3.3.2 Labels or Instructions (Level A).
- **Recommendation**: Use `<label htmlFor={id}>` paired with `id` on the input. Keep the existing visual treatment; only the markup needs to change.
- **Suggested command**: `/impeccable harden`

### [P1] Sub-tab strips lack `role="tablist"` / `role="tab"` / `aria-selected`
- **Location**: `src/components/live/panels/EditNodePanel.tsx` sub-tabs, `AddSourcePanel.tsx` source tabs
- **Category**: Accessibility
- **Impact**: AT users hear a row of buttons, not a tab interface. Arrow-key tab navigation isn't expected.
- **Recommendation**: Wrap the strip in `role="tablist"`, set `role="tab" aria-selected={active} aria-controls={panelId}` on each, `role="tabpanel" id={panelId}` on the content region. Wire arrow keys to move between tabs.
- **Suggested command**: `/impeccable harden`

### [P1] Panels overflow on viewports under 480px
- **Location**: `src/components/live/panels/PanelShell.tsx` (fixed `w-[480px]`), `src/components/SettingsDrawer.tsx` (`w-[360px]`)
- **Category**: Responsive Design
- **Impact**: On phone-width viewports the panels cover the entire content and look broken; the close button can clip off the right edge with system gestures.
- **Recommendation**: Change to `w-full sm:w-[480px]` (and `sm:w-[360px]` for settings). Add `max-w-full`. Verify the action bar doesn't sit underneath the panel header on small screens.
- **Suggested command**: `/impeccable adapt`

### [P1] Close `×` buttons are 24×24, below the 44×44 touch target minimum
- **Location**: `PanelShell.tsx`, `SettingsDrawer.tsx`
- **Category**: Responsive Design / A11y
- **Impact**: Hard to hit on touch devices; WCAG 2.5.5 (Level AAA) but commonly enforced.
- **Recommendation**: Wrap the `×` glyph in a button that's at least `w-11 h-11` (44px) with the glyph centered. The visual `×` can stay small; only the hit area grows.
- **Suggested command**: `/impeccable adapt`

### [P2] Color-only state on activity feed dots
- **Location**: `src/components/live/ActivityFeed.tsx`
- **Category**: Accessibility
- **Impact**: Color-blind users cannot distinguish event types from the dot alone.
- **WCAG**: 1.4.1 Use of Color (Level A).
- **Recommendation**: Add an `aria-label` per row that includes the agent role and event type (e.g. "PermitWatcher · new event · 12s ago"). The dot becomes decorative.
- **Suggested command**: `/impeccable harden`

### [P2] Drawer / panel open does not trap focus
- **Location**: `PanelShell.tsx`, `SettingsDrawer.tsx`
- **Category**: Accessibility
- **Impact**: Tab continues to background DOM while the panel is open, which is disorienting for keyboard users.
- **Recommendation**: When `open`, focus the close button on mount and trap focus within the dialog until close. A small custom hook is cleaner than a dependency.
- **Suggested command**: `/impeccable harden`

### [P2] `pulseDot` and `slideOutFade` keyframes do not respect `prefers-reduced-motion` at the CSS layer
- **Location**: `tailwind.config.js` keyframes, `src/index.css` `.reduced-motion` block
- **Category**: Performance / A11y
- **Impact**: The `.reduced-motion` opt-in disables animations only when the operator toggles the setting; users who set the OS-level preference do not get an automatic short-circuit at the CSS layer.
- **Recommendation**: Add a `@media (prefers-reduced-motion: reduce)` block to `index.css` that disables the same animations the `.reduced-motion` class handles. (The simEngine already listens for the media query.)
- **Suggested command**: `/impeccable optimize`

### [P2] HUD `tabular-nums` attribute is on the value span but cell width is not min-set
- **Location**: `src/components/visualizer/Visualizer.tsx:HudCell`
- **Category**: Theming / Polish
- **Impact**: When values jump from 999 → 1,000 the layout shifts.
- **Recommendation**: Either a `min-w-[5ch]` on each value, or use `font-variant-numeric: tabular-nums` plus `inline-block min-w-[6ch] text-right`.
- **Suggested command**: `/impeccable polish`

### [P2] `Architect Inbox` proposal copy uses lowercase headlines mixed with uppercase mono labels in inconsistent ratios
- **Location**: `src/components/inbox/ProposalCard.tsx` body copy vs proposal type label
- **Category**: Theming / Polish
- **Impact**: Reading rhythm dips on long lists; screens read as "shouty mono" → "calm sentence."
- **Recommendation**: Either reduce the mono uppercase chrome in cards (just the type pill) or pull the body copy up a notch in weight.
- **Suggested command**: `/impeccable typeset`

### [P3] Bundle includes the entire `gsap` core (~80KB minified) when only a few methods are used
- **Location**: `simEngine.ts` import; `package.json`
- **Category**: Performance
- **Impact**: ~30KB of unused tweening code shipped.
- **Recommendation**: Replace with `gsap/gsap-core` or hand-roll the few transitions we use (`scaleBoost`, `birthScale`, `alphaMul`). 80% of GSAP's value here is `back.out` — easy to recreate.
- **Suggested command**: `/impeccable optimize`

### [P3] Hex strings parsed per-tracer-per-frame in `drawTracers` via `hexToRgb`
- **Location**: `simEngine.ts:drawTracers` and `trailColorForLayer`
- **Category**: Performance
- **Impact**: Tens of unnecessary string parses per frame at 60fps. Imperceptible today but adds up as instances grow.
- **Recommendation**: Memoize per-color RGB at tracer-spawn time, store on the tracer record.
- **Suggested command**: `/impeccable optimize`

### [P3] No empty-state illustration for `ArchitectInbox` when filter has zero matches
- **Location**: `src/components/inbox/ArchitectInbox.tsx`
- **Category**: Anti-pattern (negative space) / Polish
- **Impact**: Just a centered text card. Misses an opportunity for personality.
- **Recommendation**: A small low-detail mesh glyph above the "inbox clear" copy would tie it to the visualizer language.
- **Suggested command**: `/impeccable delight`

## Patterns & Systemic Issues

- **Accessibility hygiene is consistently behind visual polish.** The codebase has solid token discipline and motion craft, but every interactive surface (canvas, panels, drawer, sub-tabs, activity feed) has at least one A11y gap. Worth a single pass with `/impeccable harden` rather than per-issue fixes.
- **Fixed-width panels won't survive on mobile.** Both panel shells and settings use absolute widths. Moving them to `w-full sm:w-[fixed]` is a 2-line fix repeated three places.

## Positive Findings

- **Token system is healthy.** `bg-bg-base`, `text-text-primary`, `accent-cyan|gold|violet|magenta` are used consistently; the canvas-only hex literals are correctly scoped to the 2D rendering layer where Tailwind doesn't apply.
- **The pulse-on-update mechanism for `SAVE LIVE` is real craft.** Most apps would settle for a toast.
- **Reduced-motion plumbing is end-to-end.** `Settings → SettingsContext → root .reduced-motion class → simEngine.setReducedMotion → GSAP no-ops` is a complete chain.
- **`SystemContext` is the single source of truth.** No state duplication between simEngine and React. Mutations all route through one API.

## Recommended Actions

In priority order:

1. **[P0] `/impeccable harden`** — Make the visualizer canvas keyboard-navigable and screen-reader-aware. Add proper labels on form fields and tablist semantics on panel sub-tabs.
2. **[P1] `/impeccable adapt`** — Make panels and settings drawer responsive at < 480px and grow icon-only button hit areas to 44×44.
3. **[P2] `/impeccable optimize`** — Add `prefers-reduced-motion` CSS media query, slim GSAP, memoize tracer RGB.
4. **[P2] `/impeccable typeset`** — Resolve the mono-vs-sans rhythm in proposal cards.
5. **[P3] `/impeccable delight`** — Ship an empty-state mesh glyph for the inbox.
6. **[P3] `/impeccable polish`** — Final sweep.
