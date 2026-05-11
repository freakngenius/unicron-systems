# Metacron Rebrand — Operator Walkthrough (2026-05-11)

Visual + functional regression script for an allowlisted operator
(kyle@, keenan@, curtis@, team@unicron.systems) to run against the
deployed Metacron embed after merging Pass 4.

Deployment under test: `dpl_8gRhe2x6VBFYNSQrjDLMHVQApES7` (live on
`https://atrium.unicron.systems` and `https://metacron.unicron.systems`,
same Vercel project, host-based routing).

This document is the script a human follows. Claude Code can't run it —
the routes are auth-gated behind Supabase magic-link.

## Sign-in flow

Open `https://atrium.unicron.systems` in a fresh browser session
(incognito recommended). Visual: dark cool-charcoal background
(`--bg-ground` #0A0C10), Unicron-orange accent (`--accent` #E8763A) on the
sign-in card border and primary action. Geist UI font, Inter Tight for
the headline, Geist Mono for any input placeholder labels. Enter your
allowlisted email, submit, click the magic link. You should land on the
Atrium shell with the left rail visible — no flash of unstyled content,
no Metacron Topbar visible at any point during the redirect.

Functional: confirm the session persists across a hard refresh of the
Atrium tab. Confirm Metacron's `/api/atrium/products/metacron` endpoint
returns 200 (DevTools → Network → look for the fetch fired by
`FleetSummary` and `ProposalsThisWeek` when you visit the Agents and
Architect Inbox tabs).

## Products → Metacron entry

Click `Products` in Atrium's left rail. The Products tab opens with two
sub-tabs: `Pathfinder` and `Metacron`. Click `Metacron`. Verify visually
that:
- Atrium's left rail (64 px collapsed / 220 px expanded) stays visible
- Atrium's top header (56 px) stays visible
- The Metacron Topbar from the standalone app does NOT appear (no double
  header)
- A Metacron sub-nav renders inline at the top of the content area:
  monospace 11 px uppercase labels (`ONBOARDING`, `LIVE SYSTEM`,
  `ARCHITECT INBOX`, `AGENTS`, `CUSTOMERS`, `AUDIT LOG`, `CONNECTORS`,
  `EVALS`, `INNGEST`, `COST`) with a hairline divider below
- Active tab gets an orange (`--accent`) underline indicator and a
  raised background (`--bg-elevated`)
- Default landing tab is `Onboarding`

Functional: clicking each sub-nav tab should swap content without a
network round-trip (in-component state). Atrium's left rail and top
header stay mounted across all sub-tab switches.

## Onboarding tab

Visual: the Onboarding wizard sits on `--bg-surface`. Cards use
`--bg-elevated` with `--r-lg` radius and `--sh-1` shadow. Primary CTA
uses `--accent` background with `--text-on-accent` (dark) text. Hairline
dividers between sections. No legacy `#22D3EE` cyan or `#22C55E` green
should be visible.

Functional: the discovery → workspace flow still works end-to-end.
Creating a new customer should hand off to the `Customers` tab with the
created org pre-selected (existing prop wiring through `onCustomerCreated`
in `MetacronShell`). No console errors in DevTools.

Known: the onboarding form's input borders should resolve to
`--border-default` (rgba(255,255,255,0.10)) via the focus-visible ring;
focused inputs glow with `--accent` outline 2 px / 2 px offset.

## Live System tab (Visualizer)

Visual: this tab hosts the canvas-based visualizer (`simEngine.ts` +
`shapes.ts`). Background `--bg-ground`. Nodes draw using category tokens
resolved at module load: layer-2 sources use cool blues + teal
(research / info / operations), layer-3 watchers use warm gold
(discovery / warn), layer-4 drafters use warm orange/red (err / sales).
Pulsing center dot uses `--accent`. Mesh dashes draw at
`--bg-raised`/`--bg-elevated`.

Functional: hover interactions on nodes still fire. The `onArchitectClick`
callback (left over from the spec preview era) should still route the
operator to the Architect Inbox tab when triggered. Pan/zoom works,
canvas doesn't blank between Atrium tab switches.

Known issue surface: if a screenshot test in the repo asserts on the
literal old hex (#22D3EE etc), it'll fail — the Pass 2 PR confirmed no
such tests exist as of merge. Re-run `npm test` if you suspect drift.

## Architect Inbox tab

Visual: lands on `<ProposalsThisWeek />` (Pass 3 mount) at the top of the
tab. That summary card shows: a row of this-week proposals with status
chips (`OK/WARN/ERR` semantic colors on `-soft` backgrounds, `--r-pill`),
a pending + approved count pill header, confidence percentages in mono.
Below is the existing category-filtered proposal grid.

Functional: opening a proposal should still call the existing approve /
reject endpoints. The `ProposalsThisWeek` summary and the underlying
grid hit `/api/atrium/products/metacron` and the architect proposals
table independently — two network calls are expected per visit, this is
documented in Pass 3 PR description and is not a regression.

Visual regression check: the old `Products → Metacron` page's "Architect
Proposals This Week" preview row should NOT also be rendering at the top
of the page outside this tab. If you see it duplicated, the Pass 3
consolidation regressed.

## Agents tab

Visual: lands on `<FleetSummary />` (Pass 3 mount) — a four-card row for
the Nervous System agents (Analyst, Elder, Orchestrator, Taboo Keeper)
with archetype color pills (`--cat-*`), Active/Inactive status pills
(`--ok-soft` vs `--text-faint` ghost), and specialty subtitle in
`--text-md`. Below is the existing per-agent registry grid.

Functional: clicking an agent card should route to that agent's detail
view (existing behavior). The four-card summary fetches via
`/api/atrium/products/metacron` with the same data shape and color map
as the retired preview, so visual parity with the pre-Pass-3 Atrium
Products preview is preserved.

Regression check: the original Products → Metacron preview row of
"Agent Fleet" cards should NOT also be rendering above the Metacron
sub-nav. If you see it duplicated, the Pass 3 consolidation regressed.

## Customers tab

Visual: customer table on `--bg-surface`. Row hover `--bg-raised`,
row dividers `--border-subtle`. Numeric columns (lead counts, MRR,
etc.) in the mono utility font. Status badges use semantic-color text on
matching `-soft` background.

Functional: clicking a customer drills into `<CustomerDetailView />`.
The error sparkline on the detail view should render in `--err` /
`--err-soft` (Pass 2 changed this from hardcoded Tailwind `rose-400`).
The back button returns to the list, preserving filter state if any was
set.

Deep-link known limitation: pasting a fresh URL like
`https://atrium.unicron.systems/products/metacron` always lands on the
`onboarding` tab. There's no URL sync for the embedded sub-nav yet
(documented in METACRON-USAGE.md as a Pass-N follow-up).

## Audit Log tab

Visual: full-width table inside the Atrium content max-width container.
Mono columns for timestamps, agent IDs, and event IDs. Status pills
follow the semantic palette. Hairline row dividers using
`--border-subtle`.

Functional: filters apply client-side. CSV export (if surfaced) still
works. The table may feel cramped inside Atrium's max-w-5xl container —
this is a known layout limitation; the standalone `metacron.unicron.systems`
route gives it the full viewport.

## Connectors tab

Visual: per-connector health cards on `--bg-elevated`. Health status
chips use semantic colors. Slack/Teams/HubSpot icons should render in
their brand-correct colors (these are external brand assets, not
re-tinted by the rebrand). Last-sync timestamps in `--text-lo`.

Functional: the "trigger sync" action still posts to its endpoint and
shows a toast. Toast appears at bottom-center with the post-rebrand
styling (mono uppercase, `--accent-gold` text, `--bg-panel` background,
`--border-default` border, fade-in animation `toastUp`).

## Evals tab

Visual: `PassRateChart` SVG renders with the full `--cat-*` rotation
(sales / productivity / research / discovery / marketing / memory /
operations) for max hue separation between agent series. Grid lines
hairline (`--border-subtle`). Tooltip uses `--bg-elevated` background.

Functional: switching agent filters re-renders the chart with the
correct series subset. Hover tooltips fire. No console errors from
`recharts`.

## Inngest tab

Visual: function-list table with run status pills (`--ok-soft` for
succeeded, `--warn-soft` for queued/in-progress, `--err-soft` for
failed). Numeric throughput columns in mono.

Functional: clicking into a run loads the run detail. No regressions
from the rebrand expected — this tab was lightly touched.

## Cost tab

Visual: `CostDashboardView` with recharts. Bar series uses `--accent`,
line series uses `--cat-memory`. Provider color pills use category
tokens. Recharts axes/grid/tooltip resolved to `--text-lo /
--bg-elevated / --border-default` per the Pass 2 migration.

Functional: date-range picker still works. Aggregations match the
standalone metacron view (cross-check by opening
`https://metacron.unicron.systems/cost` in another tab).

## Settings drawer (standalone only)

In the Atrium embed, the SettingsDrawer is intentionally NOT mounted —
Atrium provides its own settings surface. If you click any UI affordance
that previously opened the Metacron SettingsDrawer inside the embed, it
should be either suppressed or wired to the Atrium equivalent.

In the standalone metacron route, open the drawer via the gear icon in
the Topbar. Confirm it slides in with the `--d-panel` 400 ms ease.
Drawer background `--bg-elevated`, scrim `--bg-overlay`.

## Cross-surface coherence

Switch from Atrium → Products → Metacron back to Atrium → Now (or any
other top-level tab). The transition should feel continuous: same
accent, same surface scale, same text hierarchy, same border weights.
No "now I'm in a different app" feeling. If there's a jarring style
break, file it against the surface that diverges.

## Regression checklist

- [ ] Sign-in flow works on `atrium.unicron.systems` with an allowlisted
      email; magic link routes to the Atrium shell
- [ ] Products → Metacron renders the embedded Metacron with sub-nav
- [ ] Each sub-tab (Onboarding, Live, Inbox, Agents, Customers, Audit,
      Connectors, Evals, Inngest, Cost) loads without console errors
- [ ] Onboarding's "create customer" flow still hands off to Customers
- [ ] Live System's visualizer canvas renders with the new layer palette
- [ ] Architect Inbox shows `<ProposalsThisWeek />` at the top
- [ ] Agents shows `<FleetSummary />` (4 NS agents) at the top
- [ ] Customer Detail's error sparkline uses `--err` / `--err-soft`
- [ ] Cost Dashboard renders without recharts errors
- [ ] Eval Dashboard chart uses the full category-token rotation
- [ ] Switching between Atrium top-level tabs and Products → Metacron
      shows no jarring style change
- [ ] No legacy `#22D3EE / #22C55E / #EF4444 / #EC4899` hex visible in
      DevTools computed-styles inspection of any visible element
- [ ] Toast displays correctly post-action
- [ ] Hard refresh on `atrium.unicron.systems/products/metacron`
      preserves session and lands back on Products tab
- [ ] Standalone `metacron.unicron.systems` still works (Topbar visible,
      Settings drawer reachable, same data)
- [ ] Sign-out from Atrium clears both surfaces' session

## Known issues / open items

- Deep-link URL sync for the embedded sub-nav is not yet wired
  (documented in METACRON-USAGE.md). Tracked for a follow-up sweep.
- The Audit Log table sits inside Atrium's max-width container and feels
  cramped. Standalone metacron is the wider-canvas escape hatch.
- Lighthouse baseline: Performance 85 / Accessibility 96 / Best Practices
  100 / SEO 82 on the Atrium embed URL. Perf bottleneck is the single
  ~943 KB main JS chunk. Code-splitting is a perf follow-up, not a
  rebrand task. See `lighthouse-metacron-rebrand-2026-05-11/`.

## If you find a regression

Open an issue on `freakngenius/unicron-systems` with the screen name +
the legacy hex / pattern that's still showing through. Pass 2's
`tailwind.config.js` aliasing is the highest-leverage place to fix
broad color drift; per-component inline styles need targeted edits.

End.
