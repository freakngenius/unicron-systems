# Gate 15A — Intercepting Routes Modal Backdrop — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `/pathfinder/leads/[projectId]` to a Next.js parallel + intercepting route so clicking a lead from the dashboard opens a true overlay modal over the live map (40% black + `backdrop-blur-md`), while direct URL loads still render a standalone full-page lead. Replaces Gate 12A's "alpha-boost over white" pragmatic patch.

**Architecture:**
- Add a `@modal` parallel slot to `app/layout.tsx`. Layout becomes `{children}{modal}`.
- Add `app/@modal/default.tsx` returning `null` (slot's no-modal state).
- Add `app/@modal/(.)leads/[projectId]/page.tsx` — intercepted page. Performs the same data fetch as the standalone page, then wraps `<LeadDetail />` in `<LeadDetailModal />` with the new transparent backdrop.
- Keep `app/leads/[projectId]/page.tsx` as the standalone full-page render. Drop the modal wrapper from the standalone path so direct URL loads look like a full page (no modal frame on white body).
- Update `LeadDetailModal.tsx` backdrop from `rgba(10,10,10,0.92)` → `rgba(0,0,0,0.40)` with `backdrop-filter: blur(12px)` (Tailwind `backdrop-blur-md` equivalent), preserving WebKit fallback.

**Tech Stack:** Next.js 14.2.18 (App Router, parallel routes, intercepting routes), React 18, TypeScript, Vitest + React Testing Library.

**Reference:** https://nextjs.org/docs/app/building-your-application/routing/intercepting-routes — canonical photo-modal `(.)photo/[id]` pattern inside a `@modal` slot.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `Pathfinder/app/@modal/default.tsx` | Slot's no-modal state. Exports `default` returning `null`. |
| `Pathfinder/app/@modal/(.)leads/[projectId]/page.tsx` | Intercepted lead page. Fetches data + wraps `<LeadDetail />` in `<LeadDetailModal />`. |
| `Pathfinder/lib/lead-detail-data.ts` | Extract shared data-fetching helpers (`fetchLeadData`, `fetchNeighborIds`) so the standalone + intercepted pages share a single source of truth without duplication. |
| `Pathfinder/tests/lead-detail-intercepted-route.test.tsx` | RTL test asserting the intercepted page wraps `<LeadDetail>` in `<LeadDetailModal>`. |
| `Pathfinder/tests/lead-detail-standalone-route.test.tsx` | RTL test asserting the standalone page renders `<LeadDetail>` WITHOUT the modal shell. |

### Modified files

| Path | What changes |
|---|---|
| `Pathfinder/app/layout.tsx` | Accept `modal` prop alongside `children`. Render `<>{children}{modal}</>`. |
| `Pathfinder/app/leads/[projectId]/page.tsx` | Remove `<LeadDetailModal>` wrapper from standalone render. Extract data fetching into `lib/lead-detail-data.ts` and import. The page returns just `<LeadDetail />`. |
| `Pathfinder/components/lead/LeadDetailModal.tsx` | Backdrop: `rgba(10,10,10,0.92)` → `rgba(0,0,0,0.4)`; `backdrop-filter`: `blur(8px)` → `blur(12px)`. Preserve WebKit fallback. |
| `Pathfinder/tests/lead-detail-modal.test.tsx` | Update Gate 12A backdrop assertions from `rgba(10,10,10,0.92)` → `rgba(0,0,0,0.4)` and blur from `8px` → `12px`. Keep test count; do not delete assertions. |

### Out of scope (do not touch)

- `Pathfinder/app/api/**`
- `LeadDetail.tsx` and any sub-components
- `Pathfinder/components/dashboard.tsx` (existing `router.push('/leads/...')` already triggers the intercept correctly; basePath is auto-prepended by Next router)
- `next.config.js`, env, migrations
- `vercel.json`
- Gate 11D's `ProjectFactsGrid` / `QuickMetricsStrip`

---

## Why split data fetching into `lib/lead-detail-data.ts`?

The standalone page (`app/leads/[projectId]/page.tsx`) and the intercepted page (`app/@modal/(.)leads/[projectId]/page.tsx`) need to perform the **same** data load: `fetchData(projectId)` (project + drafts + contacts + edits + timeline + cross-poll + branch), `fetchNeighborIds()`, and `resolveActiveConnection(DEMO_OPERATOR_EMAIL)`. Duplicating ~80 lines across two files invites drift. Extracting them into one module keeps the two routes synchronised.

The module exports:
- `loadLeadDetailPayload(projectId: string)` — returns `{ project, latestEmailDraft, contacts, leadContacts, recentEdits, timelineEvents, crossPollMatches, zedcorBranch, neighborIds, connection, redesignEnabled, isTopFifty, fromDisplay, isConnected }`. Single Promise.all under the hood. Both pages consume it.

---

## Behavior matrix (what must keep working)

| Action | Expected |
|---|---|
| Click a lead pin/row from `/pathfinder` dashboard | Intercept fires. `<LeadDetail />` renders inside `<LeadDetailModal />` over the live map. Backdrop is 40% black + 12px blur — map reads through. URL is `/pathfinder/leads/<id>`. |
| ESC inside modal | `router.push('/pathfinder')` closes the modal. |
| ←/→ inside modal | Cycles through neighbor IDs (existing behavior). |
| Browser back | Returns to dashboard map (modal disappears, no flash). |
| Browser forward | Re-opens modal. |
| Direct URL load `/pathfinder/leads/<id>` (refresh, deep link) | Standalone full-page `<LeadDetail />` render. No modal frame, no map behind. |
| Refresh while modal open | Falls through to standalone render (intercept does not fire on hard navigation). |

This matches the Next.js canonical photo-modal pattern.

---

## Chunk 1: Extract shared data loader

### Task 1: Create `lib/lead-detail-data.ts`

**Files:**
- Create: `Pathfinder/lib/lead-detail-data.ts`

- [ ] **Step 1: Write the module**

```typescript
// lib/lead-detail-data.ts — Demo Polish UX Gate 15A.
//
// Shared data loader for the standalone (`app/leads/[projectId]/page.tsx`)
// and the intercepted (`app/@modal/(.)leads/[projectId]/page.tsx`) lead
// detail routes. Both routes need identical reads; centralising here
// prevents drift between the two surfaces.

import type { CrossPollinationMatchRow } from '@/components/zedcor/ZedcorRelationshipContext';
import {
  formatFromDisplay,
  resolveActiveConnection,
} from '@/lib/outreach/user-connection';
import { supabase } from '@/lib/supabase';
import { buildTimelineForProject, type TimelineEvent } from '@/lib/timeline';
import type {
  LeadContactRow,
  OutreachDraft,
  OutreachEdit,
  Project,
  ProjectContact,
} from '@/lib/types';

export const DEMO_OPERATOR_EMAIL =
  process.env.PF_DEMO_OPERATOR_EMAIL ?? 'kyle@freakngenius.com';

// Top 200 by score / posted_date for arrow-key cycling. Mirrors the
// dashboard's default ranking (Gate 9A).
const NEIGHBOR_CAP = 200;
// Top-50 score floor for the ContactsCard empty-state classifier. (Gate 8C)
const TOP_FIFTY_SCORE_FLOOR = 50;

export interface ZedcorBranchInfo {
  id: string;
  branch_name: string;
  state: string;
}

export interface LeadDetailPayload {
  project: Project | null;
  latestEmailDraft: OutreachDraft | null;
  contacts: ProjectContact[];
  leadContacts: LeadContactRow[];
  recentEdits: OutreachEdit[];
  timelineEvents: TimelineEvent[];
  crossPollMatches: CrossPollinationMatchRow[];
  zedcorBranch: ZedcorBranchInfo | null;
  neighborIds: string[];
  redesignEnabled: boolean;
  isTopFifty: boolean;
  fromDisplay: string;
  isConnected: boolean;
}

async function fetchData(projectId: string) {
  const [
    projectRes,
    draftRes,
    contactsRes,
    leadContactsRes,
    editsRes,
    timelineEvents,
    crossPollRes,
  ] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
    supabase
      .from('outreach_drafts')
      .select('*')
      .eq('project_id', projectId)
      .eq('channel', 'email')
      .order('draft_at', { ascending: false })
      .limit(1),
    supabase
      .from('project_contacts')
      .select('*')
      .eq('project_id', projectId)
      .order('confidence', { ascending: false }),
    supabase
      .from('lead_contacts')
      .select('*')
      .eq('project_id', projectId)
      .order('enriched_at', { ascending: false }),
    supabase
      .from('outreach_edits')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(20),
    buildTimelineForProject(projectId).catch(() => [] as TimelineEvent[]),
    supabase
      .from('lead_cross_pollination')
      .select('*')
      .eq('lead_id', projectId)
      .order('match_confidence', { ascending: false })
      .limit(10),
  ]);

  const project = (projectRes.data as Project | null) ?? null;

  let zedcorBranch: ZedcorBranchInfo | null = null;
  if (project?.nearest_zedcor_branch_id) {
    const { data: branchRow } = await supabase
      .from('zedcor_branches')
      .select('id, branch_name, state')
      .eq('id', project.nearest_zedcor_branch_id)
      .maybeSingle();
    if (branchRow) zedcorBranch = branchRow as unknown as ZedcorBranchInfo;
  }

  return {
    project,
    latestEmailDraft:
      ((draftRes.data ?? [])[0] as OutreachDraft | undefined) ?? null,
    contacts: ((contactsRes.data ?? []) as ProjectContact[]) ?? [],
    leadContacts: ((leadContactsRes.data ?? []) as LeadContactRow[]) ?? [],
    recentEdits: ((editsRes.data ?? []) as OutreachEdit[]) ?? [],
    timelineEvents,
    crossPollMatches:
      ((crossPollRes.data ?? []) as unknown as CrossPollinationMatchRow[]) ?? [],
    zedcorBranch,
  };
}

async function fetchNeighborIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .order('score', { ascending: false, nullsFirst: false })
    .order('posted_date', { ascending: false, nullsFirst: false })
    .limit(NEIGHBOR_CAP);
  if (error) return [];
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

export async function loadLeadDetailPayload(
  projectId: string,
): Promise<LeadDetailPayload> {
  const [data, neighborIds, connection] = await Promise.all([
    fetchData(projectId),
    fetchNeighborIds(),
    resolveActiveConnection(DEMO_OPERATOR_EMAIL),
  ]);

  const redesignEnabled = process.env.LEAD_DETAIL_REDESIGN === '1';
  const isTopFifty = (data.project?.score ?? 0) >= TOP_FIFTY_SCORE_FLOOR;

  return {
    ...data,
    neighborIds,
    redesignEnabled,
    isTopFifty,
    fromDisplay: formatFromDisplay(connection),
    isConnected: connection?.isConnected ?? false,
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add Pathfinder/lib/lead-detail-data.ts
git commit -m "refactor(pathfinder): extract shared lead-detail loader for gate 15A"
```

---

## Chunk 2: Standalone route — drop modal wrapper

### Task 2: Refactor `app/leads/[projectId]/page.tsx` to standalone

**Files:**
- Modify: `Pathfinder/app/leads/[projectId]/page.tsx`

- [ ] **Step 1: Replace file contents**

```typescript
// Lead Detail — Stream B Gate B2.
//
// Demo Polish UX Gate 15A: this route is now the STANDALONE full-page
// render only. Direct URL loads, refreshes-while-modal-open, and deep
// links all hit this route. The intercepted-route variant lives at
// `app/@modal/(.)leads/[projectId]/page.tsx` and is what gets rendered
// when navigation originates from the dashboard.

import { notFound } from 'next/navigation';

import { LeadDetail } from '@/components/lead/LeadDetail';
import { loadLeadDetailPayload } from '@/lib/lead-detail-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function LeadDetailPage({
  params,
}: {
  params: { projectId: string };
}) {
  // Next.js 14 page params are URL-encoded; project ids in
  // pathfinder.projects use literal colons (`sam.gov:<noticeid>`).
  const projectId = decodeURIComponent(params.projectId);

  const payload = await loadLeadDetailPayload(projectId);
  if (!payload.project) notFound();

  return (
    <LeadDetail
      project={payload.project}
      latestEmailDraft={payload.latestEmailDraft}
      contacts={payload.contacts}
      leadContacts={payload.leadContacts}
      recentEdits={payload.recentEdits}
      timelineEvents={payload.timelineEvents}
      crossPollMatches={payload.crossPollMatches}
      zedcorBranch={payload.zedcorBranch}
      redesignEnabled={payload.redesignEnabled}
      isTopFifty={payload.isTopFifty}
      isAdmin={true}
      fromDisplay={payload.fromDisplay}
      isConnected={payload.isConnected}
    />
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add Pathfinder/app/leads/[projectId]/page.tsx
git commit -m "refactor(pathfinder): standalone lead route renders without modal shell (gate 15A)"
```

---

## Chunk 3: Layout `@modal` slot + intercepted route

### Task 3: Add `@modal` slot to root layout

**Files:**
- Modify: `Pathfinder/app/layout.tsx`

- [ ] **Step 1: Replace file contents**

```typescript
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Pathfinder · Field Intel',
  description: 'Operations console for the Pathfinder Computer agent fleet.',
  robots: { index: false, follow: false },
};

// Demo Polish UX Gate 15A — `@modal` parallel slot powers the
// intercepting-route lead detail modal. The slot renders alongside
// children; its `default.tsx` returns `null` so the slot is empty until
// an intercept fires.
export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        {children}
        {modal}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

### Task 4: Create `app/@modal/default.tsx`

**Files:**
- Create: `Pathfinder/app/@modal/default.tsx`

- [ ] **Step 1: Write file**

```typescript
// app/@modal/default.tsx — Demo Polish UX Gate 15A.
//
// Default export for the `@modal` parallel slot. Returns null so the
// slot is empty when no intercepting route is active (i.e. on every
// page that isn't a lead-detail intercept).
export default function ModalDefault() {
  return null;
}
```

### Task 5: Create the intercepted route

**Files:**
- Create: `Pathfinder/app/@modal/(.)leads/[projectId]/page.tsx`

- [ ] **Step 1: Write file**

```typescript
// app/@modal/(.)leads/[projectId]/page.tsx — Demo Polish UX Gate 15A.
//
// Intercepting-route variant of the lead detail. Fires when the
// navigation to /pathfinder/leads/[projectId] originates from a sibling
// route (the dashboard at /pathfinder). Renders the same <LeadDetail />
// payload as the standalone route, wrapped in <LeadDetailModal /> so
// the live map remains visible behind a 40% black + 12px blur backdrop.
//
// Direct URL loads / refresh hit the standalone route at
// `app/leads/[projectId]/page.tsx` and skip this intercept entirely.

import { notFound } from 'next/navigation';

import { LeadDetail } from '@/components/lead/LeadDetail';
import { LeadDetailModal } from '@/components/lead/LeadDetailModal';
import { loadLeadDetailPayload } from '@/lib/lead-detail-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InterceptedLeadDetailPage({
  params,
}: {
  params: { projectId: string };
}) {
  const projectId = decodeURIComponent(params.projectId);

  const payload = await loadLeadDetailPayload(projectId);
  if (!payload.project) notFound();

  return (
    <LeadDetailModal
      currentProjectId={payload.project.id}
      neighborIds={payload.neighborIds}
    >
      <LeadDetail
        project={payload.project}
        latestEmailDraft={payload.latestEmailDraft}
        contacts={payload.contacts}
        leadContacts={payload.leadContacts}
        recentEdits={payload.recentEdits}
        timelineEvents={payload.timelineEvents}
        crossPollMatches={payload.crossPollMatches}
        zedcorBranch={payload.zedcorBranch}
        redesignEnabled={payload.redesignEnabled}
        isTopFifty={payload.isTopFifty}
        isAdmin={true}
        fromDisplay={payload.fromDisplay}
        isConnected={payload.isConnected}
      />
    </LeadDetailModal>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Run build to verify route compiles**

Run: `pnpm build`
Expected: Both `/leads/[projectId]` and `/@modal/(.)leads/[projectId]` listed under the route manifest. No errors.

- [ ] **Step 4: Commit**

```bash
git add Pathfinder/app/layout.tsx Pathfinder/app/@modal/default.tsx 'Pathfinder/app/@modal/(.)leads/[projectId]/page.tsx'
git commit -m "feat(pathfinder): @modal parallel slot + intercepted lead route (gate 15A)"
```

---

## Chunk 4: Backdrop redesign — blur over map

### Task 6: Update `LeadDetailModal.tsx` backdrop

**Files:**
- Modify: `Pathfinder/components/lead/LeadDetailModal.tsx` lines ~123-150

- [ ] **Step 1: Edit the backdrop styles**

Replace the entire Gate 12A comment block + backdrop `<div>` with:

```tsx
      {/* Backdrop — click-to-close + dim + blur.
       *
       * Gate 15A: the lead detail now ships as an intercepting route
       * (`app/@modal/(.)leads/[projectId]/page.tsx`) over the dashboard
       * map. Backdrop is 40% black + 12px blur so the live map reads
       * through the dim. The standalone route at
       * `app/leads/[projectId]/page.tsx` no longer wraps in this shell,
       * so we no longer need the Gate-12A near-opaque dark fill that
       * covered the white body background.
       */}
      <div
        data-testid="lead-detail-modal-backdrop"
        onClick={close}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      />
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: clean.

---

## Chunk 5: Test updates + new tests

### Task 7: Update `tests/lead-detail-modal.test.tsx` — Gate 12A → Gate 15A backdrop assertions

**Files:**
- Modify: `Pathfinder/tests/lead-detail-modal.test.tsx` lines 206-247

- [ ] **Step 1: Replace the Gate 12A `describe` block**

Replace the `describe('LeadDetailModal — backdrop styling (Gate 12A)', ...)` block with:

```tsx
// Gate 15A — Modal backdrop styling.
//
// The lead detail now ships as an intercepting route over the live
// dashboard map (app/@modal/(.)leads/[projectId]/page.tsx). The
// backdrop is 40% black + 12px blur so the map is visible through the
// dim. Standalone direct URL loads no longer go through this modal
// shell.
describe('LeadDetailModal — backdrop styling (Gate 15A)', () => {
  it('renders a 40%-opacity black backdrop with 12px blur', () => {
    renderModal();
    const backdrop = screen.getByTestId('lead-detail-modal-backdrop');
    const bg = backdrop.style.background || backdrop.style.backgroundColor;
    expect(bg).toMatch(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.4\s*\)/);
    expect(bg).not.toMatch(/#fff/i);
    expect(bg).not.toMatch(/white/i);
    // Alpha must read through (not near-opaque) so the underlying map
    // remains visible.
    const alphaMatch = bg.match(
      /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*(0?\.\d+)\s*\)/,
    );
    expect(alphaMatch).not.toBeNull();
    const alpha = Number(alphaMatch![1]);
    expect(alpha).toBeGreaterThan(0.2);
    expect(alpha).toBeLessThanOrEqual(0.5);
    // Blur upgraded from 8px → 12px (Tailwind backdrop-blur-md
    // equivalent) per Gate 15A.
    expect(backdrop.style.backdropFilter).toBe('blur(12px)');
    expect(
      (backdrop.style as unknown as Record<string, string>)[
        'WebkitBackdropFilter'
      ],
    ).toBe('blur(12px)');
  });

  it('backdrop covers the viewport (position absolute, inset 0)', () => {
    renderModal();
    const backdrop = screen.getByTestId('lead-detail-modal-backdrop');
    expect(backdrop.style.position).toBe('absolute');
    expect(['0', '0px']).toContain(backdrop.style.inset);
  });
});
```

- [ ] **Step 2: Run the modal test suite**

Run: `pnpm test tests/lead-detail-modal.test.tsx`
Expected: all 18 tests pass (16 carry-over + 2 updated).

### Task 8: Add `tests/lead-detail-intercepted-route.test.tsx`

**Files:**
- Create: `Pathfinder/tests/lead-detail-intercepted-route.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// @vitest-environment jsdom
//
// tests/lead-detail-intercepted-route.test.tsx — Demo Polish UX Gate 15A.
//
// The intercepting-route variant at
// app/@modal/(.)leads/[projectId]/page.tsx must wrap <LeadDetail /> in
// <LeadDetailModal />, so navigation from the dashboard renders the
// modal frame over the live map. We assert the wrapper is present by
// rendering the route's component output directly and checking for the
// modal shell test ids.

import * as React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  notFound: () => {
    throw new Error('notFound');
  },
}));

// Stub LeadDetail so the test focuses on the modal-wrapping behaviour
// (LeadDetail's own rendering is covered by other suites).
vi.mock('@/components/lead/LeadDetail', () => ({
  LeadDetail: () => <div data-testid="lead-detail-stub">lead detail</div>,
}));

vi.mock('@/lib/lead-detail-data', () => ({
  loadLeadDetailPayload: vi.fn(async () => ({
    project: { id: 'sam.gov:p1', score: 90 },
    latestEmailDraft: null,
    contacts: [],
    leadContacts: [],
    recentEdits: [],
    timelineEvents: [],
    crossPollMatches: [],
    zedcorBranch: null,
    neighborIds: ['sam.gov:p1', 'sam.gov:p2'],
    redesignEnabled: true,
    isTopFifty: true,
    fromDisplay: 'kyle@example.com via Gmail',
    isConnected: true,
  })),
  DEMO_OPERATOR_EMAIL: 'kyle@example.com',
}));

import InterceptedLeadDetailPage from '@/app/@modal/(.)leads/[projectId]/page';

afterEach(() => cleanup());

describe('Intercepted lead detail route — Gate 15A', () => {
  it('wraps <LeadDetail /> in <LeadDetailModal /> with the new backdrop styling', async () => {
    const ui = await InterceptedLeadDetailPage({
      params: { projectId: 'sam.gov%3Ap1' },
    });
    render(ui as React.ReactElement);
    expect(screen.getByTestId('lead-detail-modal-root')).toBeInTheDocument();
    expect(screen.getByTestId('lead-detail-modal-backdrop')).toBeInTheDocument();
    expect(screen.getByTestId('lead-detail-stub')).toBeInTheDocument();
    const backdrop = screen.getByTestId('lead-detail-modal-backdrop');
    const bg = backdrop.style.background || backdrop.style.backgroundColor;
    expect(bg).toMatch(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.4\s*\)/);
    expect(backdrop.style.backdropFilter).toBe('blur(12px)');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm test tests/lead-detail-intercepted-route.test.tsx`
Expected: 1 pass.

### Task 9: Add `tests/lead-detail-standalone-route.test.tsx`

**Files:**
- Create: `Pathfinder/tests/lead-detail-standalone-route.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// @vitest-environment jsdom
//
// tests/lead-detail-standalone-route.test.tsx — Demo Polish UX Gate 15A.
//
// Direct URL loads (refreshes, deep links, opening a lead URL in a new
// tab) hit the standalone route at app/leads/[projectId]/page.tsx and
// must render <LeadDetail /> without the <LeadDetailModal /> wrapper —
// the page reads as a full-page lead, not a floating modal on a white
// body. Asserts the modal shell test-ids are absent.

import * as React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  notFound: () => {
    throw new Error('notFound');
  },
}));

vi.mock('@/components/lead/LeadDetail', () => ({
  LeadDetail: () => <div data-testid="lead-detail-stub">lead detail</div>,
}));

vi.mock('@/lib/lead-detail-data', () => ({
  loadLeadDetailPayload: vi.fn(async () => ({
    project: { id: 'sam.gov:p1', score: 90 },
    latestEmailDraft: null,
    contacts: [],
    leadContacts: [],
    recentEdits: [],
    timelineEvents: [],
    crossPollMatches: [],
    zedcorBranch: null,
    neighborIds: ['sam.gov:p1'],
    redesignEnabled: true,
    isTopFifty: true,
    fromDisplay: 'kyle@example.com via Gmail',
    isConnected: true,
  })),
  DEMO_OPERATOR_EMAIL: 'kyle@example.com',
}));

import StandaloneLeadDetailPage from '@/app/leads/[projectId]/page';

afterEach(() => cleanup());

describe('Standalone lead detail route — Gate 15A', () => {
  it('renders <LeadDetail /> WITHOUT the modal shell', async () => {
    const ui = await StandaloneLeadDetailPage({
      params: { projectId: 'sam.gov%3Ap1' },
    });
    render(ui as React.ReactElement);
    expect(screen.getByTestId('lead-detail-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('lead-detail-modal-root')).toBeNull();
    expect(screen.queryByTestId('lead-detail-modal-backdrop')).toBeNull();
    expect(screen.queryByTestId('lead-detail-modal-card')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm test tests/lead-detail-standalone-route.test.tsx`
Expected: 1 pass.

- [ ] **Step 3: Commit tests + backdrop change**

```bash
git add Pathfinder/components/lead/LeadDetailModal.tsx Pathfinder/tests/lead-detail-modal.test.tsx Pathfinder/tests/lead-detail-intercepted-route.test.tsx Pathfinder/tests/lead-detail-standalone-route.test.tsx
git commit -m "feat(pathfinder): backdrop = 40% black + 12px blur over map (gate 15A)"
```

---

## Chunk 6: Verification + PR

### Task 10: Full verification gates

- [ ] **Step 1: typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 2: lint**

Run: `pnpm lint`
Expected: ✔ no warnings or errors.

- [ ] **Step 3: full test suite**

Run: `pnpm test`
Expected: ≥1244 passed (Gate 12D baseline) + 2 net new tests = ≥1246 passed | 24 skipped. Hard halt if regression.

- [ ] **Step 4: build**

Run: `pnpm build`
Expected: clean build. Route manifest lists both `/leads/[projectId]` and the intercepted variant.

- [ ] **Step 5: smoke standalone route via dev server (manual / curl)**

Run: `pnpm dev` (in background) and `curl -sI http://localhost:3000/pathfinder/leads/sam.gov%3Atest`
Expected: 200 (or 404 if no project — acceptable; 500 is hard halt).

### Task 11: Push, open PR, enable auto-merge

- [ ] **Step 1: Push branch**

```bash
git push -u origin demo-polish-ux/gate15a-intercepting-routes-modal
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "fix(pathfinder): demo polish UX gate 15A — intercepting routes modal backdrop" --body "$(cat <<'EOF'
## Summary

- Replaces Gate 12A's `rgba(10,10,10,0.92)` near-opaque backdrop with a true overlay over the dashboard map
- Adds Next.js parallel + intercepting routes: `app/@modal/(.)leads/[projectId]/page.tsx`
- Standalone route (direct URL load, refresh, deep link) renders `<LeadDetail />` without the modal shell — full-page render
- New backdrop: `rgba(0,0,0,0.4)` + `backdrop-filter: blur(12px)` so the live map reads through

## Spec / context

- `Company Docs/Specs/SPEC - Lead Detail Page v2.md` (modal shell over dashboard)
- `MEMORY/gate12-fixes-live-status.md` — Gate 12A flagged this as the "Gate 12.5" follow-up; this PR is that follow-up
- Reference: https://nextjs.org/docs/app/building-your-application/routing/intercepting-routes

## Files

- NEW: `Pathfinder/lib/lead-detail-data.ts` — shared data loader for both routes
- NEW: `Pathfinder/app/@modal/default.tsx` — slot's no-modal state
- NEW: `Pathfinder/app/@modal/(.)leads/[projectId]/page.tsx` — intercepted page
- NEW: `Pathfinder/tests/lead-detail-intercepted-route.test.tsx`
- NEW: `Pathfinder/tests/lead-detail-standalone-route.test.tsx`
- MOD: `Pathfinder/app/layout.tsx` — accepts `modal` slot
- MOD: `Pathfinder/app/leads/[projectId]/page.tsx` — standalone, no modal wrapper
- MOD: `Pathfinder/components/lead/LeadDetailModal.tsx` — new backdrop
- MOD: `Pathfinder/tests/lead-detail-modal.test.tsx` — Gate 12A assertions updated to Gate 15A values

## Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — clean
- `pnpm test` — paste actual `<n>` passed | 24 skipped (baseline 1244 from Gate 12D)
- `pnpm build` — clean

## Behaviour kept

- Click lead from `/pathfinder` → modal opens with map visible behind blur
- ESC / ✕ / backdrop click → close back to dashboard
- ←/→ cycles between leads in the modal
- Direct URL `/pathfinder/leads/<id>` → standalone full-page lead
- Browser back/forward preserved
- Houston flagship + Hines VA + Whiteriver still render all v2 sections (LeadDetail untouched)

## Hard halts not tripped

- ✅ Standalone route still works (verified via build manifest + standalone-route test)
- ✅ ESC + arrow cycling preserved (existing tests pass)
- ✅ Test count above 1244 baseline
- ✅ TypeScript + lint clean
- ✅ `app/page.tsx` untouched
- ✅ No `app/api/**` modifications

## Manual verification needed (post-deploy)

- [ ] Visual screenshot of modal opened from dashboard with map visible behind blur
- [ ] Refresh while modal open → standalone full-page render
- [ ] Browser back from modal → dashboard map (no flash)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Enable auto-merge (Gate 15 sub-gate convention)**

```bash
gh pr merge --auto --squash <PR#>
```

- [ ] **Step 4: Append entry to `MEMORY/lead-detail-v2-live-status.md` (newest on top)**

Add a section dated `2026-05-03 <UTC> — Gate 15A …` summarising shipped scope, PR number, verification numbers, hard-halts not tripped, deferred-to-Kyle items.

---

## Hard-halt triggers

STOP and report if any of:
- `/pathfinder/leads/<id>` standalone returns 5xx
- ESC / ←/→ break post-refactor (existing tests must pass unchanged besides the Gate 12A backdrop assertions)
- Houston flagship rendering regresses
- Test count drops below 1244
- TypeScript or lint errors after the refactor
- Intercept pattern requires touching `app/page.tsx` (it doesn't — only `layout.tsx` adds the slot)
- Discover `app/page.tsx` is NOT the dashboard the user means by "map page"

## Auto-revert triggers (post-merge — surface to Kyle)

- `pnpm test` regresses below baseline
- `/pathfinder/leads/[id]` returns 5xx in any path
- Map page fails to render when modal closes

---

## Notes for the executor

- Do NOT touch `components/dashboard.tsx`. The existing `router.push('/leads/<id>')` already triggers the intercept correctly because basePath is auto-prepended by the Next router.
- Do NOT touch `app/api/**`.
- Do NOT touch `LeadDetail.tsx` or sub-components.
- The `(.)` matcher in the intercept folder name means "intercept from the same level". Since `@modal` and `leads` are siblings under `app/`, `(.)leads/[projectId]` matches sibling navigation — exactly what we want.
- `default.tsx` is required for parallel slots; without it, hard navigations (refresh) to other routes throw because the slot has no fallback.
- `import` from `@/app/@modal/(.)leads/[projectId]/page` may need quoting in shell commands due to `(.)` being shell-significant; tests import via the alias and Vitest resolves it normally.
