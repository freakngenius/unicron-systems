// __tests__/chat/context.test.ts — pure-function tests for the chat context
// helpers. No DB, no network.

import { describe, it, expect } from 'vitest';
import {
  buildContextKey,
  buildContextLabel,
  buildSnapshot,
  suggestedPrompts,
} from '@/lib/chat/context';
import type { ChatContextSnapshot } from '@/lib/types';

const baseSnap = (over: Partial<ChatContextSnapshot> = {}): ChatContextSnapshot => ({
  view: 'dashboard',
  selectedBranchId: null,
  openProjectId: null,
  sourceFilter: 'all',
  crossPoll: false,
  filteredProjectIds: [],
  totalProjects: 0,
  hiddenProjectIds: [],
  timestamp: '2026-04-28T00:00:00Z',
  ...over,
});

const lookup = {
  projects: [{ id: 'p1', title: 'Hines VA Hospital perimeter renovation' }],
  branches: [{ id: 'b-hou', name: 'Houston', code: 'HOU' }],
};

describe('buildContextKey', () => {
  it('keys by project when openProjectId set', () => {
    expect(buildContextKey(baseSnap({ openProjectId: 'p1' }))).toBe('project:p1');
  });
  it('keys by branch when only branch selected', () => {
    expect(buildContextKey(baseSnap({ selectedBranchId: 'b-hou' }))).toBe('branch:b-hou');
  });
  it('falls back to dashboard:default', () => {
    expect(buildContextKey(baseSnap())).toBe('dashboard:default');
  });
  it('project takes precedence over branch', () => {
    expect(
      buildContextKey(baseSnap({ openProjectId: 'p1', selectedBranchId: 'b-hou' })),
    ).toBe('project:p1');
  });
});

describe('buildContextLabel', () => {
  it('returns project title when project is open', () => {
    expect(
      buildContextLabel(baseSnap({ openProjectId: 'p1' }), lookup),
    ).toContain('Hines VA Hospital');
  });
  it('appends branch context when both project and branch are set', () => {
    expect(
      buildContextLabel(
        baseSnap({ openProjectId: 'p1', selectedBranchId: 'b-hou' }),
        lookup,
      ),
    ).toContain('Houston');
  });
  it('returns "<name> branch" when only branch selected', () => {
    expect(buildContextLabel(baseSnap({ selectedBranchId: 'b-hou' }), lookup)).toBe(
      'Houston branch',
    );
  });
  it('returns "All projects" when nothing focused', () => {
    expect(buildContextLabel(baseSnap(), lookup)).toBe('All projects');
  });
});

describe('suggestedPrompts', () => {
  it('returns project-specific chips when project open', () => {
    const chips = suggestedPrompts(baseSnap({ openProjectId: 'p1' }));
    expect(chips.length).toBeGreaterThanOrEqual(3);
    expect(chips.join(' ').toLowerCase()).toContain('outreach');
  });
  it('returns cross-poll chips when crossPoll on', () => {
    const chips = suggestedPrompts(baseSnap({ crossPoll: true }));
    expect(chips.join(' ').toLowerCase()).toContain('warm-intro');
  });
  it('returns branch chips when only branch selected', () => {
    const chips = suggestedPrompts(baseSnap({ selectedBranchId: 'b-hou' }));
    expect(chips.join(' ').toLowerCase()).toContain('branch');
  });
  it('returns default chips when nothing set', () => {
    const chips = suggestedPrompts(baseSnap());
    expect(chips.length).toBeGreaterThanOrEqual(3);
  });
  it('never produces a chip with em-dash or en-dash', () => {
    const all = [
      suggestedPrompts(baseSnap()),
      suggestedPrompts(baseSnap({ openProjectId: 'p1' })),
      suggestedPrompts(baseSnap({ selectedBranchId: 'b-hou' })),
      suggestedPrompts(baseSnap({ crossPoll: true })),
    ].flat();
    for (const chip of all) {
      expect(/[—–]/.test(chip)).toBe(false);
    }
  });
});

describe('buildSnapshot', () => {
  it('caps filteredProjectIds at 50', () => {
    const projects = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}` }));
    const snap = buildSnapshot({
      view: 'dashboard',
      selectedBranchId: null,
      openProjectId: null,
      sourceFilter: 'all',
      crossPoll: false,
      filteredProjects: projects,
      totalProjects: 100,
      hiddenProjectIds: [],
    });
    expect(snap.filteredProjectIds.length).toBe(50);
    expect(snap.totalProjects).toBe(100);
  });
  it('preserves everything else', () => {
    const snap = buildSnapshot({
      view: 'dashboard',
      selectedBranchId: 'b-hou',
      openProjectId: 'p1',
      sourceFilter: 'usa',
      crossPoll: true,
      filteredProjects: [{ id: 'p1' }],
      totalProjects: 1,
      hiddenProjectIds: ['p9'],
    });
    expect(snap.selectedBranchId).toBe('b-hou');
    expect(snap.openProjectId).toBe('p1');
    expect(snap.sourceFilter).toBe('usa');
    expect(snap.crossPoll).toBe(true);
    expect(snap.hiddenProjectIds).toEqual(['p9']);
    expect(typeof snap.timestamp).toBe('string');
  });
});
