// atrium-routes.test.ts
//
// Bug 2 of the Atrium blockers goal (2026-05-13): verify that every navigable
// surface has its own slug, parsePathname + buildPathname round-trip cleanly,
// and deep-links (e.g. /work/calls/<id>, /settings/connections) parse to the
// right route.

import { describe, expect, it } from 'vitest';
import { parsePathname, buildPathname, type AtriumRoute } from '../atrium/routes';

describe('parsePathname', () => {
  it('treats "/" as the Now tab', () => {
    expect(parsePathname('/')).toEqual({ tab: 'now', settingsOpen: false });
  });

  it('treats "" as the Now tab', () => {
    expect(parsePathname('')).toEqual({ tab: 'now', settingsOpen: false });
  });

  it('parses every top-level slug', () => {
    const tabs = ['now', 'people', 'money', 'marketing', 'products', 'system', 'library', 'skills'];
    for (const t of tabs) {
      expect(parsePathname(`/${t}`)).toEqual({ tab: t, settingsOpen: false });
    }
  });

  it('defaults /work to /work/items', () => {
    expect(parsePathname('/work')).toEqual({ tab: 'work', workSubTab: 'items', settingsOpen: false });
  });

  it('parses /work/calls', () => {
    expect(parsePathname('/work/calls')).toEqual({ tab: 'work', workSubTab: 'calls', settingsOpen: false });
  });

  it('parses /work/calls/<id> into callDetailId', () => {
    const route = parsePathname('/work/calls/abc-123-def-456');
    expect(route.tab).toBe('work');
    expect(route.workSubTab).toBe('calls');
    expect(route.callDetailId).toBe('abc-123-def-456');
  });

  it('parses /work/items, /work/kanban, /work/decisions, /work/sprints, /work/refusals', () => {
    for (const sub of ['items', 'kanban', 'decisions', 'sprints', 'refusals']) {
      expect(parsePathname(`/work/${sub}`).workSubTab).toBe(sub);
    }
  });

  it('parses /settings as the Settings drawer on Now', () => {
    expect(parsePathname('/settings')).toEqual({ tab: 'now', settingsOpen: true, settingsSection: undefined });
  });

  it('parses /settings/connections with section', () => {
    expect(parsePathname('/settings/connections')).toEqual({
      tab: 'now',
      settingsOpen: true,
      settingsSection: 'connections',
    });
  });

  it('falls back to Now for unknown paths', () => {
    expect(parsePathname('/totally-not-a-route')).toEqual({ tab: 'now', settingsOpen: false });
  });

  it('is case-insensitive on the top-level segment', () => {
    expect(parsePathname('/People')).toEqual({ tab: 'people', settingsOpen: false });
  });
});

describe('buildPathname', () => {
  it('round-trips every top-level tab', () => {
    const tabs = ['now', 'people', 'money', 'marketing', 'products', 'system', 'library', 'skills'] as const;
    for (const tab of tabs) {
      const route: AtriumRoute = { tab, settingsOpen: false };
      expect(buildPathname(route)).toBe(`/${tab}`);
    }
  });

  it('builds /work/<subTab>', () => {
    expect(buildPathname({ tab: 'work', workSubTab: 'calls', settingsOpen: false })).toBe('/work/calls');
    expect(buildPathname({ tab: 'work', workSubTab: 'items', settingsOpen: false })).toBe('/work/items');
  });

  it('builds /work/calls/<id> when callDetailId is set', () => {
    expect(buildPathname({ tab: 'work', workSubTab: 'calls', callDetailId: 'xyz', settingsOpen: false }))
      .toBe('/work/calls/xyz');
  });

  it('builds /settings and /settings/<section>', () => {
    expect(buildPathname({ tab: 'now', settingsOpen: true })).toBe('/settings');
    expect(buildPathname({ tab: 'now', settingsOpen: true, settingsSection: 'connections' }))
      .toBe('/settings/connections');
  });

  it('round-trips through parsePathname', () => {
    const cases: AtriumRoute[] = [
      { tab: 'now', settingsOpen: false },
      { tab: 'people', settingsOpen: false },
      { tab: 'work', workSubTab: 'calls', settingsOpen: false },
      { tab: 'work', workSubTab: 'calls', callDetailId: 'cid', settingsOpen: false },
      { tab: 'work', workSubTab: 'items', settingsOpen: false },
      { tab: 'now', settingsOpen: true, settingsSection: 'connections' },
    ];
    for (const r of cases) {
      const path = buildPathname(r);
      const parsed = parsePathname(path);
      // workSubTab is omitted on parse when undefined for non-work tabs; compare the meaningful subset.
      expect(parsed.tab).toBe(r.tab);
      expect(parsed.settingsOpen).toBe(r.settingsOpen);
      if (r.workSubTab) expect(parsed.workSubTab).toBe(r.workSubTab);
      if (r.callDetailId) expect(parsed.callDetailId).toBe(r.callDetailId);
      if (r.settingsSection) expect(parsed.settingsSection).toBe(r.settingsSection);
    }
  });
});
