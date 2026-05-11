# METACRON-USAGE.md

How Metacron uses the Atrium design system.

This document is the post-rebrand contributor guide. It records what the
three-pass rebrand series (#293, #297, #299) wired up, where the seams live,
and the patterns to follow when adding new Metacron screens.

Source of truth for tokens + components: `Brand/Atrium Design System/`.
Spec: `Company Docs/Metacron/SPEC - Metacron Atrium Rebrand.md`.

---

## Tokens

The canonical token file is `Brand/Atrium Design System/tokens.css`. A
verbatim copy lives in the unicron-platform repo at
`unicron-platform/src/atrium/styles/atrium-tokens.css` (global resets such
as `* { box-sizing }`, html/body, and scrollbar rules are deliberately
omitted from the in-repo copy so they don't clobber Metacron's body
scroll — those live in `src/index.css`).

The token file is imported once at the app root via
`unicron-platform/src/main.tsx`:

```tsx
import './atrium/styles/atrium-tokens.css';
```

That makes the `:root` custom properties available on every route —
Metacron screens, Atrium tabs, Pathfinder previews. No per-component
imports needed.

When the canonical Brand source changes, sync the copy:

```bash
diff "Brand/Atrium Design System/tokens.css" \
     "unicron-platform/src/atrium/styles/atrium-tokens.css"
```

Keep the variable block verbatim. Adjust only the global-reset section if
you have a reason to.

### Token namespaces

- Surfaces: `--bg-ground / --bg-surface / --bg-elevated / --bg-raised / --bg-overlay`
- Borders: `--border-faint / --border-subtle / --border-default / --border-strong / --border-accent`
- Text: `--text-hi / --text-md / --text-lo / --text-faint / --text-on-accent`
- Accent: `--accent / --accent-soft / --accent-hover / --accent-press`
- Semantic: `--ok / --warn / --err / --info` (each with a `-soft` variant)
- Category (skills/agents): `--cat-memory / --cat-productivity / --cat-research / --cat-discovery / --cat-sales / --cat-marketing / --cat-operations`
- Type: `--font-ui / --font-display / --font-mono`, scale `--text-2xs ... --text-5xl`, line-heights `--lh-tight / --lh-snug / --lh-base`
- Spacing: `--s-1 ... --s-8` (4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px)
- Radius: `--r-sm / --r-md / --r-lg / --r-xl / --r-pill` (6 / 8 / 12 / 16 / 999 px)
- Shadow: `--sh-1 / --sh-2 / --sh-3 / --sh-glow-accent`
- Motion: `--ease`, `--d-hover`, `--d-panel`
- Layout: `--rail-w / --rail-w-expanded / --header-h / --filter-w / --detail-w`

---

## Embedding model

Host-based routing picks the entry shell (`src/App.tsx`):

```ts
const isAtrium = window.location.hostname.startsWith('atrium.');
```

- `atrium.unicron.systems` → `<AtriumApp />` (rail + header + tabs)
- `metacron.unicron.systems` (and other hosts) → `<SignInGate><AuthedShell /></SignInGate>` → standalone `<MetacronShell />`

The Atrium `Products → Metacron` sub-tab mounts the full Metacron app via
`MetacronEmbedded` (exported from `src/App.tsx`):

```tsx
// src/atrium/products/MetacronProduct.tsx (Pass 3, post-consolidation)
import { MetacronEmbedded } from '../../App';
export function MetacronProduct() {
  return <MetacronEmbedded />;
}
```

`MetacronShell` accepts an `embedded` prop. When `embedded=true`:
- Skip the fixed `<Topbar />` and the `pt-14` content offset
- Skip the `<SettingsDrawer />` (Atrium owns settings UI)
- Render an inline Atrium-style sub-nav with an `--accent` underline
  indicator and monospace labels (see `src/App.tsx` ~ line 105)

When `embedded=false` (standalone metacron.unicron.systems): keep the
existing Topbar + SettingsDrawer.

`MetacronEmbedded` wraps `<MetacronShell embedded />` in the same
`SettingsProvider + SystemProvider` stack as the standalone path, so toast
state, system context, and the operator session all behave identically
across both surfaces. Operator session is shared via the existing Supabase
auth on the Atrium host — no second login on the embed.

---

## Component patterns (Pass 2 migration table)

Use these mappings when adding new Metacron screens or porting legacy
components. Hardcoded hex is not allowed — every color resolves through a
token (directly via `var()` or indirectly via the Tailwind aliases below).

| Metacron use | Atrium tokens |
|---|---|
| Primary button | `--accent` bg, `--text-on-accent` text, `--r-md`, hover `--accent-hover`, press `--accent-press` |
| Secondary button | `--bg-elevated` bg, `--text-hi` text, `--border-default` outline, hover `--bg-raised` |
| Card / panel | `--bg-elevated` bg, `--r-lg` radius, `--sh-1` or `--sh-2` shadow |
| Status badge | Semantic text color on matching `-soft` background, `--r-pill` radius |
| Sub-nav tabs | Hairline underline, `--accent` indicator on active tab, monospace 11px uppercase labels (see `MetacronShell` embedded nav) |
| Form input | Transparent bg, `--border-default` 1px, focus ring `--accent` (uses `:focus-visible` in tokens.css) |
| Modal | Scrim `--bg-overlay`, content `--bg-elevated`, `--r-xl`, `--sh-3` |
| Skill / agent tag | Category color (`--cat-*`) text on `rgba(255,255,255,0.04)` bg, `--r-pill` |
| Activity feed item | `--text-md` body, `--text-lo` timestamps, `--border-subtle` hairline divider |
| Data table | Row hover `--bg-raised`, `--border-subtle` row dividers, mono numeric columns via `.mono` utility |
| Empty state | Centered `--text-lo` copy on `--bg-surface`, optional small icon |

---

## Tailwind theme aliases

`tailwind.config.js` re-points the legacy Metacron Tailwind color names at
Atrium tokens so the ~50+ components that already use class strings like
`text-rose-400`, `bg-emerald-400/10`, `border-amber-400/40`, `text-accent-cyan`
keep working but resolve to on-brand values:

| Tailwind class prefix | Resolves to |
|---|---|
| `accent-cyan` | `--cat-operations` (#5BB5BC) — also serves as success |
| `accent-gold` / `accent-orange` | `--accent` (#E8763A) |
| `accent-violet` | `--cat-memory` (#8B7CD8) |
| `accent-magenta` | `--err` (#DD6262) — fail indicator + category pill |
| `rose-{300,400,500}` / `red-{300,400,500}` | `--err` (#DD6262) |
| `emerald-{300,400,500}` | `--ok` (#4FB286) |
| `amber-{300,400,500}` | `--warn` (#D9A23A) |
| `bg-base / bg-panel / bg-card / bg-elevated / bg-raised` | Surface scale |
| `text-primary / text-secondary / text-muted / text-faint` | Text scale |

Authors can keep using Tailwind utility classes; the color resolution
flows through tokens. When adding a new semantic color, add the alias in
`tailwind.config.js` rather than scattering raw hex.

---

## Category color mapping (Pass 2 decisions)

The Visualizer canvas (`src/components/visualizer/`) and the eval-dashboard
pass-rate chart use category tokens for hue separation:

- **Visualizer canvas layers**:
  - Layer 2 (sources / watchers): research / info / operations (cool blues + teal)
  - Layer 3 (drafters / discovery): discovery / warn (warm gold)
  - Layer 4 (closers / sales): err / sales (warm red/orange)
- **Eval dashboard agent series**: full `--cat-*` rotation
  (sales → productivity → research → discovery → marketing → memory → operations)
- **Mesh placeholder sprites**: `--cat-{operations,discovery,marketing}` rotation
- **Cost dashboard providers**: routed through category tokens; recharts
  axes/grid/tooltip use `--text-lo / --bg-elevated / --border-default`

---

## Canvas / SVG / chart palette

CSS custom properties don't resolve inside the HTML5 Canvas API (it expects
literal color strings). Pass 2 standardized the pattern:

1. At module load (or component mount), resolve token values via
   `getComputedStyle(document.documentElement).getPropertyValue('--cat-foo')`
2. Fall back to canonical hex constants if the computed style returns
   empty (covers SSR, tests, document-not-ready edge cases)
3. Pass the resolved string to canvas fillStyle / strokeStyle calls

Reference implementation: `src/components/visualizer/shapes.ts`
(`LAYER_PALETTE`), `src/components/visualizer/simEngine.ts`
(`CANVAS_BG`, dash/node/trail/center-dot colors), `src/components/MiniSparkline.tsx`.

SVG components — including the eval-dashboard `PassRateChart` and recharts
in `CostDashboardView` — can pass `var(--cat-*)` directly as fill/stroke;
the browser resolves it.

---

## Adding a new Metacron screen

1. Tokens are already global — `var(--*)` works immediately.
2. Follow the component patterns above. Prefer Tailwind aliases for the
   common cases (surfaces, semantic colors); reach for inline
   `style={{ ... 'var(--...)' }}` for tokens not aliased in Tailwind
   (motion, radius, shadow, layout sizes).
3. For skill/agent categorization, use `--cat-*` rather than inventing
   new hex.
4. For status, prefer semantic tokens (`--ok / --warn / --err / --info`)
   over category tokens — they double-resolve through the rose/emerald/
   amber Tailwind aliases.
5. Run `npm run lint` + `npm run build` before PR. Repo baseline is
   62 lint errors / 2 warnings (all pre-existing `react-hooks/*` issues
   in unrelated files); a clean PR keeps that count flat.
6. If the new screen ships preview content that should also appear at
   the Atrium Products → Metacron entry point, mount it inside the
   relevant Metacron tab (per Pass 3 consolidation) rather than
   re-adding it to `MetacronProduct.tsx`. The `MetacronProduct` mount
   should remain a one-liner.

---

## Visual coherence checks

- Switching between Atrium top-level tabs (Now, Work, Money, etc.) and
  Products → Metacron should feel like one app. Surface scale, text
  scale, and accent color match.
- Metacron's sub-nav uses the same underline-with-accent indicator
  pattern as Atrium's primary nav.
- Toasts and modals follow Atrium's shadow + scrim conventions
  (`--bg-overlay`, `--sh-3`).

---

## Lighthouse baseline (2026-05-11)

Captured via `lighthouse@13.3.0` against the deployed app on
`dpl_8gRhe2x6VBFYNSQrjDLMHVQApES7`. Full reports under
`Company Docs/Atrium/Reports/lighthouse-metacron-rebrand-2026-05-11/`.

| Surface | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| `atrium.unicron.systems/products/metacron` | 85 | 96 | 100 | 82 |
| `metacron.unicron.systems/` (standalone) | 86 | 96 | 100 | 82 |

Core Web Vitals on the Atrium embed URL:

- FCP: 3.3 s
- LCP: 3.3 s
- TBT: 0 ms
- CLS: 0
- Speed Index: 3.3 s

Notes:
- Both URLs serve the same main bundle (`index-CulYMzZN.js` ~ 943 KB raw)
  — host-based routing happens client-side, so the Lighthouse run on the
  Atrium URL is a faithful measurement of the embed surface even though
  the rendered content past the sign-in gate isn't reachable without a
  session.
- TBT 0 ms / CLS 0 on the Atrium embed URL is the post-rebrand baseline.
  The standalone metacron shows CLS 0.042 because the standalone Topbar
  paints a moment before the rest of the shell; the embed strips the
  Topbar so that shift is gone.
- The Performance score of 85 / 86 is bottlenecked by the single ~943 KB
  main chunk — code-splitting Metacron's heavier views (Visualizer,
  Cost dashboard, Eval dashboard) is the obvious next lever and is
  tracked outside this rebrand series.
- Accessibility 96 — the four-point deduction is the `document-title`
  audit on the post-rebrand sign-in / shell HTML; documented to fix in
  follow-up.
- Best Practices 100, SEO 82 — SEO score is depressed by the missing
  meta description on the auth-gated routes; not a regression from
  Pass 0 baseline.

To re-run:

```bash
export CHROME_PATH="<path to a Chromium binary>"
npx lighthouse https://atrium.unicron.systems/products/metacron \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output=html \
  --output-path=./lighthouse-metacron \
  --chrome-flags="--headless=new --no-sandbox --disable-gpu" \
  --quiet
```

---

## Known limitations

- **Direct deep links into Metacron internal routes** (e.g. `/customers/realberry`)
  from a fresh browser load do not route through Atrium. Embedded Metacron
  uses in-component tab state; URL sync is a follow-up.
- **Width constraint on heavy views**: The embedded Metacron inherits
  Atrium's content max-width container. The Audit Log table and Cost
  Dashboard were designed for a wider canvas — they fit, but a future
  layout pass could let those tabs break out of the container.
- **Tests for components affected by the Pass 1+2 strip-mocks PRs**
  (#280, #281, #284) are archived under `src/_archive/`. Rewriting them
  against real Supabase mocks is a follow-up sweep, separate from the
  rebrand.
- **Single main bundle**: post-rebrand build still ships one ~943 KB JS
  chunk. Code-splitting is a perf follow-up, not a rebrand task.

---

## Cross-references

- Pass 1 PR (#293): tokens globalized + Metacron embed mount
- Pass 2 PR (#297): component visual sweep + Tailwind alias re-pointing
- Pass 3 PR (#299): content consolidation (Fleet Summary, Proposals This Week)
- Pass 4 PR (this): docs + Lighthouse baseline + operator walkthrough
- Operator walkthrough script: `Company Docs/Atrium/Reports/metacron-rebrand-walkthrough-2026-05-11.md`
- Lighthouse reports: `Company Docs/Atrium/Reports/lighthouse-metacron-rebrand-2026-05-11/`
- Rebrand spec: `Company Docs/Metacron/SPEC - Metacron Atrium Rebrand.md`
