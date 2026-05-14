// routes.ts — Bug 2 of the Atrium blockers goal (2026-05-13)
//
// Real route slugs for Atrium without pulling in a router library. Maps
// window.location.pathname ↔ { tab, subTab, detailId, settingsOpen, settingsSection }
// and offers a push() helper that updates the URL via History API.
//
// Top-level slugs:
//   /                       → tab='now'
//   /now                    → tab='now'
//   /people                 → tab='people'
//   /work                   → tab='work'    subTab='items'
//   /work/items             → tab='work'    subTab='items'
//   /work/calls             → tab='work'    subTab='calls'
//   /work/calls/<id>        → tab='work'    subTab='calls'      detailId=<id>
//   /work/kanban|decisions|sprints|refusals
//                            → tab='work'    subTab=<segment>
//   /money                  → tab='money'
//   /marketing              → tab='marketing'
//   /products               → tab='products'
//   /system                 → tab='system'
//   /library                → tab='library'
//   /skills                 → tab='skills'
//   /settings               → settingsOpen=true
//   /settings/connections   → settingsOpen=true settingsSection='connections'
//
// The Vercel SPA rewrite in unicron-platform/vercel.json sends every non-/api/
// path to index.html so deep links work on refresh.

import type { AtriumTab } from './AtriumLayout';

export type WorkSubTab = 'items' | 'kanban' | 'calls' | 'decisions' | 'sprints' | 'refusals';

export interface AtriumRoute {
  tab: AtriumTab;
  workSubTab?: WorkSubTab;
  callDetailId?: string;
  settingsOpen: boolean;
  settingsSection?: string;
}

const TOP_LEVEL_TABS: ReadonlySet<AtriumTab> = new Set<AtriumTab>([
  'now', 'people', 'work', 'money', 'marketing', 'products', 'system', 'library', 'skills',
]);

const WORK_SUB_TABS: ReadonlySet<WorkSubTab> = new Set<WorkSubTab>([
  'items', 'kanban', 'calls', 'decisions', 'sprints', 'refusals',
]);

function defaultRoute(): AtriumRoute {
  return { tab: 'now', settingsOpen: false };
}

export function parsePathname(pathname: string): AtriumRoute {
  const segments = pathname.split('/').map((s) => s.trim()).filter(Boolean);

  // Bare "/" or empty path → Now.
  if (segments.length === 0) return defaultRoute();

  const first = segments[0].toLowerCase();

  if (first === 'settings') {
    const section = segments[1]?.toLowerCase();
    return { tab: 'now', settingsOpen: true, settingsSection: section };
  }

  if (TOP_LEVEL_TABS.has(first as AtriumTab)) {
    const tab = first as AtriumTab;
    if (tab === 'work') {
      const sub = segments[1]?.toLowerCase();
      if (sub && WORK_SUB_TABS.has(sub as WorkSubTab)) {
        const out: AtriumRoute = { tab: 'work', workSubTab: sub as WorkSubTab, settingsOpen: false };
        if (sub === 'calls' && segments[2]) out.callDetailId = segments[2];
        return out;
      }
      return { tab: 'work', workSubTab: 'items', settingsOpen: false };
    }
    return { tab, settingsOpen: false };
  }

  // Unknown route → Now (matches the legacy state-based behavior).
  return defaultRoute();
}

export function buildPathname(route: AtriumRoute): string {
  if (route.settingsOpen) {
    return route.settingsSection ? `/settings/${route.settingsSection}` : '/settings';
  }
  if (route.tab === 'work') {
    const sub = route.workSubTab ?? 'items';
    if (sub === 'calls' && route.callDetailId) return `/work/calls/${route.callDetailId}`;
    return `/work/${sub}`;
  }
  return `/${route.tab}`;
}

export function pushRoute(route: AtriumRoute): void {
  const path = buildPathname(route);
  if (typeof window === 'undefined') return;
  if (window.location.pathname !== path) {
    window.history.pushState({ atrium: route }, '', path);
  }
}

export function replaceRoute(route: AtriumRoute): void {
  const path = buildPathname(route);
  if (typeof window === 'undefined') return;
  window.history.replaceState({ atrium: route }, '', path);
}

export function currentRoute(): AtriumRoute {
  if (typeof window === 'undefined') return defaultRoute();
  return parsePathname(window.location.pathname);
}
