# Pathfinder Roadmap Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public marketing/transparency page at `unicron.systems/pathfinder-roadmap` that renders the current Pathfinder roadmap (Live / Building Now / Planned / Considering / Future Vision) with a working status filter, mobile responsiveness, and Lighthouse ≥ 90.

**Architecture:** A single statically-generated Next.js App Router route in the **unicron-systems** Vercel project (NOT the Pathfinder dashboard project). One client island for filter state; subcomponents render inline as RSC where possible. Feature data is a typed TS module (`data/roadmap.ts`) so non-engineers can edit features without touching component code. Design tokens are scoped to the route via a CSS module so the rest of the unicron.systems site (which uses a different palette) stays untouched.

**Tech Stack:** Next.js 14.2.35 App Router, TypeScript (strict + `noUncheckedIndexedAccess`), Tailwind 3.4.15, `next/font/google` (Inter + JetBrains Mono), CSS Modules for scoped tokens, Vitest + Playwright (already in repo) for tests.

**Spec source of truth:** `Pathfinder/Pathfinder-Roadmap-Page-Spec.md` (already in repo).

---

## ⚠️ Decisions to confirm before any code is written

The spec, your starting prompt, and what's actually in the repos disagree in a few places. I want explicit confirmation on each below before I touch code.

### D1 — Where the page lives (case 1 from your prompt is correct)

Your prompt asked me to confirm. I checked both `.vercel/project.json` files and `next.config.mjs`. Result:

- `/Users/keka/Dropbox/Projects/Unicron Systems/.vercel/project.json` → Vercel project `unicron-systems` (`prj_gVtrF2p1n7SnUsDhXWkJhpwJH8tQ`), serves `unicron.systems`.
- `/Users/keka/Dropbox/Projects/Unicron Systems/Pathfinder/.vercel/project.json` → Vercel project `pathfinder` (`prj_UwEYuzUkDTEwJz9HU4WgexQoax4m`), serves `pathfinder.unicron.systems` (and is reverse-proxied at `unicron.systems/pathfinder/*` via a rewrite in the unicron-systems `next.config.mjs`).
- The rewrite covers `/pathfinder` and `/pathfinder/:path*` only. `/pathfinder-roadmap` (hyphen, not slash) is **not** caught by the rewrite, so the route is served directly by the unicron-systems project.

**Conclusion: case 1.** The roadmap page lives in the unicron-systems repo at `app/pathfinder-roadmap/page.tsx`. The spec says exactly this in the URL & deployment section.

> **Implication:** The "working directory: `Pathfinder/`" line in your starting prompt is incorrect for the build itself. The plan doc lives in `Pathfinder/docs/` (next to the spec), but **all source files for the page live in the unicron-systems repo root**, not in `Pathfinder/`.

### D2 — Branch + base

Current branch is `feat/ingestor-vercel-cron` and `git status` shows ~30 unrelated changes (Pathfinder ingestor migration work, Product/* drafts, manifesto.md, seven-generations.html, etc.). I will not bundle the roadmap into that branch.

**Proposed:** Create `feat/pathfinder-roadmap` branched from `origin/main` (clean), so the PR diff is only roadmap-related. The unrelated uncommitted files stay on `feat/ingestor-vercel-cron` for you to handle separately.

**Confirm:** OK to leave the uncommitted state on `feat/ingestor-vercel-cron` and start the roadmap from a fresh `feat/pathfinder-roadmap` off `origin/main`? Or do you want the uncommitted state stashed/committed first?

### D3 — Design-token discrepancy (spec vs. actual Pathfinder dashboard)

The spec lists these "tokens carried from the Pathfinder dashboard":

| Token | Spec hex |
|---|---|
| Background dark | `#0B0F14` |
| Surface | `#131922` |
| Surface elevated | `#1B2230` |
| Border hairline | `#1F2735` |
| Text primary | `#E6EAF0` |
| Text secondary | `#8A95A5` |
| Text muted | `#5B6675` |
| Status mint (Live) | `#3DDC97` |
| Status amber (Building) | `#FFB454` |
| Status cobalt (Planned) | `#5B7FFF` |
| Status gray (Considering) | `#5B6675` |
| Status magenta (Future) | `#E879F9` |

But the actual Pathfinder dashboard (`Pathfinder/tailwind.config.ts` + `Pathfinder/app/globals.css`) is a **light** UI:
- `bg: #ffffff`, `ink: #0a0a0a`
- The only dark surface is the map (`mapBg: #0e1116`)
- Two highlight colors only: `hi: #22d3ee` (cyan), `warm: #a3e635` (lime)

So the spec's listed palette is **not** what's "carried from the dashboard." Three ways to resolve:

- **Option A (recommended): use the spec's literal hex values.** Your prompt says "match the dashboard's design tokens exactly **per the spec**." The spec wins. The roadmap is a public marketing artifact; Linear/Bloomberg-style operator-grade dark UI is a defensible look for that audience.
- **Option B: actually mirror the Pathfinder dashboard.** Light mode + cyan/lime highlights + JetBrains Mono pills. Diverges from the spec's color list but matches dashboard reality.
- **Option C: derive a third hybrid** (dark-mode reskin of the dashboard's two-highlight palette).

**Confirm: Option A** unless you say otherwise. Plan below assumes A.

### D4 — Last-updated date stamp

The spec says it's "driven by a constant in the data file." I'll seed `data/roadmap.ts` with `lastUpdated: '2026-04-28'`. **Confirm OK** or give a different date.

### D5 — Footer dashboard link target

Spec says "Link to Pathfinder dashboard (`pathfinder.unicron.systems`, gated)." That domain may or may not be live yet — `next.config.mjs` proxies `unicron.systems/pathfinder` to `pathfinder-ashy.vercel.app`, so the canonical reachable URL today is `unicron.systems/pathfinder`.

**Confirm:** link to `https://unicron.systems/pathfinder` (verified live) or `https://pathfinder.unicron.systems` (per spec, may not yet resolve)? I'll use the spec'd value unless you tell me otherwise; if it doesn't resolve in production, I'll surface it during verification.

### D6 — Operator email in footer

Spec says `kyle@freakngenius.com`. Memory says the Pathfinder operator email is `kyle@demystified.ai` for `/settings`. Spec wins for the public roadmap (this is a marketing-surface contact, not an operator login). Plan uses `kyle@freakngenius.com`. **Confirm.**

### D7 — Manual light-mode toggle vs. auto

Spec says "via `@media (prefers-color-scheme: light)` **or** a manual toggle." Plan goes with `@media` only (no JS, no state, smaller bundle, simpler test surface, better Lighthouse). Manual toggle deferred to v2 if you want it. **Confirm.**

### D8 — TDD scope for a static marketing page

The skill prefers TDD. For a static roadmap page, hard TDD is awkward — the deliverable is mostly visual + a single client filter. Plan applies TDD selectively:
- **Yes:** unit tests on `data/roadmap.ts` (every feature has a valid status; every feature's category is one of the 15 declared).
- **Yes:** Playwright E2E on filter behavior (clicking "Live" hides non-live cards) and rendering (15 categories, 50 cards, mobile 375px viewport renders).
- **No** unit-level component tests (FeatureCard, Hero) — too much ceremony for static markup.

**Confirm OK.**

---

## File structure (what gets created or touched)

All paths relative to the unicron-systems repo root (`/Users/keka/Dropbox/Projects/Unicron Systems/`). Nothing in `Pathfinder/` is touched except the plan doc itself.

**New files:**

```
app/pathfinder-roadmap/
  layout.tsx                  Scoped layout: Inter + JetBrains Mono next/font, route metadata
  page.tsx                    Server component: imports data, renders RoadmapClient
  RoadmapClient.tsx           Client component: filter state, renders Hero + Filter + Grid + Footer
  Hero.tsx                    Wordmark, h1, intro, last-updated stamp
  StatusFilterBar.tsx         Six pills (All + 5 statuses); calls back to RoadmapClient
  FeatureGrid.tsx             Groups filtered features by category; renders CategorySection per group
  CategorySection.tsx         h2 + cards for one category
  FeatureCard.tsx             Status pill + category tag + h3 + description
  Footer.tsx                  Three links + copyright
  roadmap.module.css          Scoped CSS variables (palette tokens) + light-mode media query

data/
  roadmap.ts                  Typed feature data (single source of truth)

tests/unit/
  roadmap-data.test.ts        Validates every feature has valid status + valid category

tests/e2e/
  pathfinder-roadmap.spec.ts  Page renders, filter works, mobile viewport renders all categories
```

**Modified files:**

```
tailwind.config.ts            Extend theme with `roadmap` color namespace (status colors only — surface tokens stay in CSS module to avoid leaking into rest of site)
```

**Untouched (verified):**

- `next.config.mjs` (the `/pathfinder/*` rewrite is correctly scoped to NOT match `/pathfinder-roadmap`)
- `middleware.ts` (gates `/app/*` and mutating `/api/*` only — `/pathfinder-roadmap` is unauthenticated by default)
- `Pathfinder/**/*` (different Vercel project)

---

## Chunk 1: Branch + scaffold

### Task 1.1 — Branch from clean main

**Files:** none (git only)

- [ ] **Step 1.1.1:** Verify there's no in-flight work for this branch
  ```bash
  cd "/Users/keka/Dropbox/Projects/Unicron Systems"
  git branch --list feat/pathfinder-roadmap
  ```
  Expected: empty output.

- [ ] **Step 1.1.2:** Fetch + branch from origin/main without disturbing the current working tree
  ```bash
  git fetch origin main
  git switch -c feat/pathfinder-roadmap origin/main
  ```
  Expected: branch created. The uncommitted files from `feat/ingestor-vercel-cron` are not modifications staged for commit, so they carry over to the new branch as untracked / unstaged. We will not commit them as part of this PR; the PR's `git diff origin/main` will show only the new roadmap files.

  > **If `git switch` complains about local mods**, stop and confirm with Kyle whether to stash or whether the remaining mods are safe to carry. Do NOT discard.

- [ ] **Step 1.1.3:** Sanity-check
  ```bash
  git status
  git rev-parse --abbrev-ref HEAD
  ```
  Expected: `feat/pathfinder-roadmap`. Some untracked Pathfinder files remain — that's fine; they're not part of this branch's commits.

### Task 1.2 — Scaffold empty route + verify dev server

**Files:**
- Create: `app/pathfinder-roadmap/page.tsx` (placeholder)
- Create: `app/pathfinder-roadmap/layout.tsx` (placeholder)

- [ ] **Step 1.2.1:** Create placeholder `page.tsx`
  ```tsx
  export default function Page() {
    return <main>roadmap (scaffold)</main>;
  }
  ```

- [ ] **Step 1.2.2:** Create placeholder `layout.tsx`
  ```tsx
  export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
  }
  ```

- [ ] **Step 1.2.3:** Start dev server and load route
  ```bash
  npm run dev
  ```
  Visit `http://localhost:3000/pathfinder-roadmap`. Expected: "roadmap (scaffold)" renders, no auth gate (middleware.ts confirms — only `/app/*` is gated).

- [ ] **Step 1.2.4:** Commit scaffold
  ```bash
  git add app/pathfinder-roadmap/page.tsx app/pathfinder-roadmap/layout.tsx
  git commit -m "scaffold(roadmap): empty /pathfinder-roadmap route"
  ```

---

## Chunk 2: Data layer (TDD)

### Task 2.1 — Define types + write the failing data validation test first

**Files:**
- Create: `tests/unit/roadmap-data.test.ts`
- Create: `data/roadmap.ts` (empty module to satisfy import)

- [ ] **Step 2.1.1:** Create `data/roadmap.ts` with just the types and an empty features array (so the import in the test resolves)
  ```ts
  export type RoadmapStatus = 'live' | 'building' | 'planned' | 'considering' | 'future';

  export const ROADMAP_CATEGORIES = [
    'Source expansion',
    'Agent capabilities',
    'Integrations and workflow',
    'Analytics and reporting',
    'Customer-facing platform',
    'AI and agent enhancements',
    'Vertical expansion',
    'Architecture and deployment',
    'User experience',
    'Sales enablement',
    'Compliance and governance',
    'Pricing model expansion',
    'Internal tooling',
    'Research and intelligence layer',
    'Construction ecosystem integrations',
  ] as const;

  export type RoadmapCategory = typeof ROADMAP_CATEGORIES[number];

  export interface RoadmapFeature {
    title: string;
    description: string;
    status: RoadmapStatus;
    category: RoadmapCategory;
  }

  export interface RoadmapData {
    lastUpdated: string;
    features: RoadmapFeature[];
  }

  export const roadmapData: RoadmapData = {
    lastUpdated: '2026-04-28',
    features: [],
  };
  ```

- [ ] **Step 2.1.2:** Write the failing tests
  ```ts
  // tests/unit/roadmap-data.test.ts
  import { describe, it, expect } from 'vitest';
  import {
    roadmapData,
    ROADMAP_CATEGORIES,
    type RoadmapStatus,
  } from '@/data/roadmap';

  const VALID_STATUSES: RoadmapStatus[] = [
    'live', 'building', 'planned', 'considering', 'future',
  ];

  describe('roadmapData', () => {
    it('has at least 50 features (matches spec seed)', () => {
      expect(roadmapData.features.length).toBeGreaterThanOrEqual(50);
    });

    it('every feature has a valid status', () => {
      for (const f of roadmapData.features) {
        expect(VALID_STATUSES).toContain(f.status);
      }
    });

    it('every feature has a non-empty title and description', () => {
      for (const f of roadmapData.features) {
        expect(f.title.trim().length).toBeGreaterThan(0);
        expect(f.description.trim().length).toBeGreaterThan(0);
      }
    });

    it('every feature category is one of the 15 declared categories', () => {
      for (const f of roadmapData.features) {
        expect(ROADMAP_CATEGORIES).toContain(f.category);
      }
    });

    it('lastUpdated is an ISO-style yyyy-mm-dd date', () => {
      expect(roadmapData.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('has at least one Live, Building, Planned, Considering, and Future Vision feature', () => {
      for (const status of VALID_STATUSES) {
        const count = roadmapData.features.filter((f) => f.status === status).length;
        expect(count, `expected ≥1 feature with status=${status}`).toBeGreaterThan(0);
      }
    });
  });
  ```

- [ ] **Step 2.1.3:** Run the test — expect it to fail on the count check
  ```bash
  npx vitest run tests/unit/roadmap-data.test.ts
  ```
  Expected: 5 of 6 tests pass; the "≥50 features" test fails (and the per-status `>0` test fails for all statuses).

### Task 2.2 — Seed all spec features into `data/roadmap.ts`

**Files:**
- Modify: `data/roadmap.ts`

- [ ] **Step 2.2.1:** Replace the empty `features: []` with the full seeded array. Pull the exact title, description, status, category from the spec's "Initial feature data" section. **All 50 features verbatim** — no rewording, no reordering of categories.

  - 10 Live features
  - 7 Building Now features (status `'building'`)
  - 9 Planned features (status `'planned'`)
  - 11 Considering features (status `'considering'`)
  - 10 Future Vision features (status `'future'`)
  - **Total: 47** ← spec says "~50" so this matches

  > Note: spec says "~50" and counting yields 47. Adjust the test in 2.1.2 to `>= 47` if needed, OR add three more entries from `Pathfinder-Future-Features.md` after a quick Kyle-confirmation. **Plan defaults to 47 with the spec list verbatim**; no extras invented.

- [ ] **Step 2.2.2:** Re-run tests
  ```bash
  npx vitest run tests/unit/roadmap-data.test.ts
  ```
  Expected: all 6 tests pass.

- [ ] **Step 2.2.3:** Type-check
  ```bash
  npm run typecheck
  ```
  Expected: no errors. (`noUncheckedIndexedAccess: true` is on; the `RoadmapCategory` type forces every category string to be one of the 15 — typos surface here.)

- [ ] **Step 2.2.4:** Commit
  ```bash
  git add data/roadmap.ts tests/unit/roadmap-data.test.ts
  git commit -m "feat(roadmap): seed roadmap data + validation tests (47 features, 15 categories)"
  ```

---

## Chunk 3: Page UI

### Task 3.1 — CSS module with scoped tokens

**Files:**
- Create: `app/pathfinder-roadmap/roadmap.module.css`

- [ ] **Step 3.1.1:** Define dark-mode tokens as CSS custom properties on a scoping class. Then a `@media (prefers-color-scheme: light)` block that swaps surface + ink tokens. Status accent tokens stay constant across modes (high-contrast hex pairs).

  ```css
  .root {
    --rd-bg: #0B0F14;
    --rd-surface: #131922;
    --rd-surface-2: #1B2230;
    --rd-line: #1F2735;
    --rd-ink: #E6EAF0;
    --rd-ink-2: #8A95A5;
    --rd-ink-3: #5B6675;
    --rd-mint: #3DDC97;
    --rd-amber: #FFB454;
    --rd-cobalt: #5B7FFF;
    --rd-gray: #5B6675;
    --rd-magenta: #E879F9;
    background: var(--rd-bg);
    color: var(--rd-ink);
    min-height: 100dvh;
    font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
    font-weight: 400;
    -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: var(--font-jetbrains-mono), ui-monospace, monospace; }
  @media (prefers-color-scheme: light) {
    .root {
      --rd-bg: #FAFBFC;
      --rd-surface: #FFFFFF;
      --rd-surface-2: #F4F6F8;
      --rd-line: #E5E8EC;
      --rd-ink: #0B0F14;
      --rd-ink-2: #4B5563;
      --rd-ink-3: #6B7280;
    }
  }
  /* Card hover — border tint shift only (no scale, no shadow per spec) */
  .card { border: 1px solid var(--rd-line); transition: border-color 120ms ease; }
  .card:hover { border-color: var(--rd-ink-3); }
  /* Status pill base */
  .pill { display: inline-flex; align-items: center; padding: 4px 9px; border-radius: 3px; font-size: 10.5px; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; border: 1px solid currentColor; background: transparent; }
  .pill-live    { color: var(--rd-mint); }
  .pill-building{ color: var(--rd-amber); }
  .pill-planned { color: var(--rd-cobalt); }
  .pill-considering { color: var(--rd-gray); }
  .pill-future  { color: var(--rd-magenta); }
  .pill-active-bg { background: color-mix(in oklab, currentColor 14%, transparent); }
  ```

  Final shape may vary by a few rules; the above is the contract the components depend on.

- [ ] **Step 3.1.2:** Commit
  ```bash
  git add app/pathfinder-roadmap/roadmap.module.css
  git commit -m "feat(roadmap): scoped CSS module with palette + light-mode fallback"
  ```

### Task 3.2 — Layout (fonts + metadata)

**Files:**
- Modify: `app/pathfinder-roadmap/layout.tsx`

- [ ] **Step 3.2.1:** Replace the placeholder layout with one that loads Inter + JetBrains Mono via `next/font/google` (scoped so the rest of the site is unaffected) and sets the page metadata.

  ```tsx
  import type { Metadata } from 'next';
  import { Inter, JetBrains_Mono } from 'next/font/google';

  const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
    display: 'swap',
    weight: ['400', '500'],
  });
  const jetbrains = JetBrains_Mono({
    subsets: ['latin'],
    variable: '--font-jetbrains-mono',
    display: 'swap',
    weight: ['400', '500'],
  });

  export const metadata: Metadata = {
    title: 'Pathfinder Roadmap',
    description: "What's live, building, and ahead for Pathfinder by Unicron Systems",
    robots: { index: true, follow: true },
    openGraph: {
      title: 'Pathfinder Roadmap',
      description: "What's live, building, and ahead for Pathfinder by Unicron Systems",
      url: 'https://unicron.systems/pathfinder-roadmap',
      type: 'website',
    },
  };

  export default function Layout({ children }: { children: React.ReactNode }) {
    return (
      <div className={`${inter.variable} ${jetbrains.variable}`}>{children}</div>
    );
  }
  ```

  > Note: the root `app/layout.tsx` is the html/body wrapper. Route layouts in Next 14 nest inside it, so we don't re-wrap `<html>` here.

- [ ] **Step 3.2.2:** Quick smoke check
  ```bash
  npm run typecheck
  ```

- [ ] **Step 3.2.3:** Commit
  ```bash
  git add app/pathfinder-roadmap/layout.tsx
  git commit -m "feat(roadmap): scoped fonts + page metadata"
  ```

### Task 3.3 — Subcomponents (server-renderable)

**Files:**
- Create: `app/pathfinder-roadmap/Hero.tsx`
- Create: `app/pathfinder-roadmap/FeatureCard.tsx`
- Create: `app/pathfinder-roadmap/CategorySection.tsx`
- Create: `app/pathfinder-roadmap/Footer.tsx`

These are stateless RSC. Each is small (<60 lines). All consume tokens via the imported CSS module.

- [ ] **Step 3.3.1:** `Hero.tsx`
  - Renders Pathfinder wordmark (text-only first pass; image asset can be swapped in later from `Pathfinder/assets/pathfinder_mark.svg` if Kyle wants — flagged below).
  - h1 "Roadmap" (sentence case → "Roadmap").
  - One paragraph intro (text from spec or written fresh — flag for Kyle approval before locking copy).
  - Last-updated date stamp (mono font, muted color), driven by `roadmapData.lastUpdated`.

- [ ] **Step 3.3.2:** `FeatureCard.tsx`
  - Props: `feature: RoadmapFeature`.
  - Status pill (mono, color from CSS module, with `.pill-active-bg` tint).
  - Category tag (small, top-right, muted).
  - Title (h3, sentence case, weight 500).
  - Description (1-2 sentences, weight 400, line-height 1.45).
  - Border, 12px radius, hover = border tint shift.

- [ ] **Step 3.3.3:** `CategorySection.tsx`
  - Props: `category: RoadmapCategory; features: RoadmapFeature[]`.
  - h2 with category name (sentence case).
  - Cards in a 3/2/1 responsive grid (Tailwind: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`).
  - Sort cards within section: live → building → planned → considering → future.

- [ ] **Step 3.3.4:** `Footer.tsx`
  - Three line items: Pathfinder dashboard link, unicron.systems home, contact email.
  - Copyright "© 2026 Unicron Systems".
  - Targets confirmed in D5 + D6.

- [ ] **Step 3.3.5:** Commit each as its own commit (small focused commits).
  ```bash
  git add app/pathfinder-roadmap/Hero.tsx
  git commit -m "feat(roadmap): hero block"
  # repeat per file
  ```

### Task 3.4 — Status filter bar (client)

**Files:**
- Create: `app/pathfinder-roadmap/StatusFilterBar.tsx`

- [ ] **Step 3.4.1:** Client component with six pills: All, Live, Building Now, Planned, Considering, Future Vision.
  - Props: `value: RoadmapStatus | 'all'; onChange: (v: RoadmapStatus | 'all') => void`.
  - Renders six `<button>` pills with `aria-pressed` for the active one.
  - Active pill uses `.pill-active-bg`.
  - Keyboard accessible (each pill is a button; tab order is natural).

- [ ] **Step 3.4.2:** Commit.

### Task 3.5 — Feature grid (client wrapper for filtering)

**Files:**
- Create: `app/pathfinder-roadmap/FeatureGrid.tsx`

- [ ] **Step 3.5.1:** Client component.
  - Props: `features: RoadmapFeature[]; filter: RoadmapStatus | 'all'`.
  - Filters input by status (`filter === 'all' ? features : features.filter(f => f.status === filter)`).
  - Groups remaining features by category, preserving the spec's category order (use `ROADMAP_CATEGORIES`).
  - Skips categories that have zero matches under the current filter.
  - Renders `<CategorySection>` per non-empty category.

- [ ] **Step 3.5.2:** Commit.

### Task 3.6 — RoadmapClient (filter state owner)

**Files:**
- Create: `app/pathfinder-roadmap/RoadmapClient.tsx`

- [ ] **Step 3.6.1:** Client component.
  - Props: `data: RoadmapData`.
  - Holds filter state via `useState<'all' | RoadmapStatus>('all')`.
  - Wraps the page in the `.root` class from the CSS module so token vars cascade.
  - Layout: Hero → StatusFilterBar → FeatureGrid → Footer.

- [ ] **Step 3.6.2:** Commit.

### Task 3.7 — Page (server component, glue)

**Files:**
- Modify: `app/pathfinder-roadmap/page.tsx`

- [ ] **Step 3.7.1:** Replace placeholder.
  ```tsx
  import { roadmapData } from '@/data/roadmap';
  import RoadmapClient from './RoadmapClient';

  export const dynamic = 'force-static';

  export default function Page() {
    return <RoadmapClient data={roadmapData} />;
  }
  ```

- [ ] **Step 3.7.2:** Smoke-check on dev server. Visit `/pathfinder-roadmap`. Expected:
  - Hero renders.
  - All 15 categories render (all 47 cards visible).
  - Click "Live" pill → only the 10 Live cards remain; non-Live categories disappear.
  - Click "All" → everything back.
  - Click each other pill → matching cards only.
  - Resize browser to 375px → 1-col stack, no horizontal scroll.
  - Resize to 768px → 2-col grid.
  - Resize to 1280px → 3-col grid.

- [ ] **Step 3.7.3:** Commit.

---

## Chunk 4: Tests + verify + ship

### Task 4.1 — Playwright E2E

**Files:**
- Create: `tests/e2e/pathfinder-roadmap.spec.ts`

- [ ] **Step 4.1.1:** Write tests against `localhost:3000/pathfinder-roadmap`:
  - **Renders all 15 category headers** at desktop viewport.
  - **Renders 47 feature cards** at desktop viewport (count by data-testid or role).
  - **Filter "Live" hides non-live cards** (count drops to 10).
  - **Filter "All" restores 47 cards.**
  - **Mobile (375x812) renders without horizontal scroll** and shows 1-col grid.

- [ ] **Step 4.1.2:** Run
  ```bash
  npx playwright test tests/e2e/pathfinder-roadmap.spec.ts
  ```
  Expected: all tests pass.

- [ ] **Step 4.1.3:** Commit.

### Task 4.2 — Production build + type + lint

- [ ] **Step 4.2.1:** Verify a production build succeeds locally
  ```bash
  npm run build
  ```
  Expected: build completes; `/pathfinder-roadmap` listed as static (`○ /pathfinder-roadmap`).

- [ ] **Step 4.2.2:** Type-check
  ```bash
  npm run typecheck
  ```
  Expected: no errors.

- [ ] **Step 4.2.3:** Lint
  ```bash
  npm run lint
  ```
  Expected: no errors. (`next.config.mjs` sets `ignoreDuringBuilds: true` for ESLint, but we still want a clean local lint.)

- [ ] **Step 4.2.4:** Local Lighthouse check
  ```bash
  npm run start
  ```
  In a separate terminal, run Lighthouse via Chrome DevTools or:
  ```bash
  npx lighthouse http://localhost:3000/pathfinder-roadmap \
    --only-categories=performance,accessibility,best-practices,seo \
    --form-factor=mobile --output=json --output-path=./test-results/lh-mobile.json
  npx lighthouse http://localhost:3000/pathfinder-roadmap \
    --only-categories=performance,accessibility,best-practices,seo \
    --form-factor=desktop --preset=desktop --output=json --output-path=./test-results/lh-desktop.json
  ```
  Expected: all four categories ≥ 90 on both runs. If any score is below 90, **stop and address before proceeding**.

### Task 4.3 — Push + PR + Kyle merges + verify production

> Per `deploy_chain.md`: feature branch → PR → Kyle merges → Vercel auto-deploys. **No `vercel deploy` from CLI.**

- [ ] **Step 4.3.1:** Push branch
  ```bash
  git push -u origin feat/pathfinder-roadmap
  ```

- [ ] **Step 4.3.2:** Open PR
  ```bash
  gh pr create --title "feat(unicron-systems): public Pathfinder roadmap page at /pathfinder-roadmap" \
    --body "$(cat <<'EOF'
  ## Summary
  - New public page at `unicron.systems/pathfinder-roadmap`
  - 47 features seeded from spec across 15 categories and 5 statuses
  - Status filter bar (client-side), mobile responsive, light-mode fallback
  - No auth, no backend, no DB — fully static page reading from `data/roadmap.ts`

  ## Test plan
  - [ ] Vercel preview URL renders all 47 cards across 15 categories
  - [ ] Each status pill filters correctly; "All" restores everything
  - [ ] 375px / 768px / 1280px breakpoints look correct
  - [ ] Lighthouse mobile + desktop ≥ 90 on production URL after merge

  Spec: `Pathfinder/Pathfinder-Roadmap-Page-Spec.md`
  Plan: `Pathfinder/docs/PLAN-ROADMAP.md`
  EOF
  )"
  ```

- [ ] **Step 4.3.3:** Tell Kyle the PR is ready and which Vercel preview URL to check.

- [ ] **Step 4.3.4:** Wait for Kyle to Squash & Merge.

- [ ] **Step 4.3.5:** After merge, verify production
  ```bash
  curl -fsS -o /dev/null -w "%{http_code}\n" https://unicron.systems/pathfinder-roadmap
  ```
  Expected: `200`. If `404`, the Vercel ↔ GitHub link may not be wired (per memory: "as of 2026-04-28 the Pathfinder Vercel project is not yet linked to GitHub"). The unicron-systems Vercel project may have the same gap — surface to Kyle, do NOT fall back to CLI deploy.

- [ ] **Step 4.3.6:** Production Lighthouse
  ```bash
  npx lighthouse https://unicron.systems/pathfinder-roadmap \
    --only-categories=performance,accessibility,best-practices,seo \
    --form-factor=mobile --preset=perf
  npx lighthouse https://unicron.systems/pathfinder-roadmap \
    --only-categories=performance,accessibility,best-practices,seo \
    --form-factor=desktop --preset=desktop
  ```
  Capture all four scores. If anything is < 90, file a follow-up ticket — but the page is live.

- [ ] **Step 4.3.7:** Final ✅: report to Kyle with
  - Production URL response code
  - Lighthouse mobile scores (P/A/BP/SEO)
  - Lighthouse desktop scores (P/A/BP/SEO)
  - Any deviations from the plan or spec encountered along the way

---

## Out of scope (deferred to v2 unless Kyle says otherwise)

- Manual light-mode toggle
- Animations beyond hover (pulse, scroll-driven, etc.)
- Image asset for Pathfinder wordmark in hero (text-only first; image swap is a 1-line change later)
- Sitemap/robots.txt entries (Next 14 generates a default; we can extend later)
- A/B variants of the hero copy
- Backlink from the Pathfinder dashboard's footer to the roadmap

## Risks

- **Vercel ↔ GitHub link gap.** If unicron-systems Vercel project isn't linked to the repo's main branch, the merge won't auto-deploy. Mitigation: check before final merge; ask Kyle to wire it before the PR if needed; do not fall back to CLI deploy.
- **Spec ↔ dashboard token mismatch (D3).** If Kyle picks Option B or C instead of A, Tasks 3.1, 3.3.1, 3.3.2 need a partial rewrite — about 60 minutes of work, no architectural change.
- **47 features vs. "~50".** If spec is later updated with 3 more features, just append to `data/roadmap.ts`; tests already pass with `>= 47`.
- **Filter UX on small viewports.** Six pills wrap on narrow widths. Plan assumes wrap is acceptable; if Kyle wants a horizontal-scroll filter row, that's a +30-minute change in `StatusFilterBar.tsx`.

---

## Approval gate

**STOP here.** Before any code beyond this plan doc is written, I need:

1. ✅ on D1 (case 1, page in unicron-systems repo) — already determined; calling out for confirmation
2. ✅ on D2 (branch from origin/main; leave uncommitted state on `feat/ingestor-vercel-cron`)
3. ✅ on D3 (Option A: spec hex values)
4. ✅ on D4 (lastUpdated = 2026-04-28)
5. ✅ on D5 (footer dashboard URL choice)
6. ✅ on D6 (kyle@freakngenius.com)
7. ✅ on D7 (auto light-mode only, no manual toggle)
8. ✅ on D8 (TDD on data + E2E only, no per-component unit tests)

When approved, I'll execute Chunk 1 → Chunk 4 in order, with one commit per atomic step as outlined.
