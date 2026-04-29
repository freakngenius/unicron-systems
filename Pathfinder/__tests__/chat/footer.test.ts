// __tests__/chat/footer.test.ts — covers the provenance-footer helpers
// against the shapes Sonar actually emits in production. The screenshot
// from 2026-04-29 showed `## TABLES` followed by `---` leaking into the
// rendered chat — these tests pin the behavior so it doesn't regress.

import { describe, it, expect } from 'vitest';
import {
  parseTablesFooter,
  stripTrailingTablesLine,
  stripStreamingFooter,
} from '@/lib/chat/footer';

describe('parseTablesFooter', () => {
  it('parses the canonical "TABLES: a, b" form', () => {
    expect(parseTablesFooter('Some answer.\n\nTABLES: projects, branches')).toEqual([
      'projects',
      'branches',
    ]);
  });

  it('parses with the pathfinder. prefix stripped', () => {
    expect(parseTablesFooter('x\nTABLES: pathfinder.projects, pathfinder.agent_runs')).toEqual([
      'projects',
      'agent_runs',
    ]);
  });

  it('returns empty array when "(none)" is the only entry', () => {
    expect(parseTablesFooter('x\nTABLES: (none)')).toEqual([]);
  });

  it('parses markdown-header form (## TABLES)', () => {
    expect(parseTablesFooter('Answer body.\n\n## TABLES\nprojects, branches')).toEqual([
      'projects',
      'branches',
    ]);
  });

  it('parses bold-marker form (**TABLES**)', () => {
    expect(parseTablesFooter('answer\n\n**TABLES:** projects')).toEqual(['projects']);
  });

  it('parses with a horizontal rule above the marker', () => {
    expect(parseTablesFooter('answer\n\n---\nTABLES: projects, branches')).toEqual([
      'projects',
      'branches',
    ]);
  });

  it('returns empty when no footer present', () => {
    expect(parseTablesFooter('answer body with no footer')).toEqual([]);
  });

  it('is case-insensitive on the marker', () => {
    expect(parseTablesFooter('x\nTables: projects')).toEqual(['projects']);
  });
});

describe('stripTrailingTablesLine', () => {
  it('removes the canonical line', () => {
    const out = stripTrailingTablesLine('Answer.\n\nTABLES: projects, branches');
    expect(out).toBe('Answer.');
  });

  it('removes ## TABLES form including header markers', () => {
    const out = stripTrailingTablesLine('Answer.\n\n## TABLES\nprojects, branches');
    expect(out).toBe('Answer.');
  });

  it('removes the horizontal rule that precedes the footer', () => {
    const out = stripTrailingTablesLine('Answer.\n\n---\nTABLES: projects');
    expect(out).toBe('Answer.');
  });

  it('removes **TABLES** form', () => {
    const out = stripTrailingTablesLine('Answer.\n\n**TABLES:** projects, branches');
    expect(out).toBe('Answer.');
  });

  it('leaves answer alone when no footer', () => {
    const out = stripTrailingTablesLine('Just an answer with no footer.');
    expect(out).toBe('Just an answer with no footer.');
  });
});

describe('stripStreamingFooter', () => {
  it('passes through deltas before the footer arrives', () => {
    const acc = 'Answer body so far.';
    const delta = ' more text.';
    expect(stripStreamingFooter(delta, acc + delta)).toBe(' more text.');
  });

  it('drops the delta that introduces "TABLES"', () => {
    const acc = 'Answer body.\n\nTABLES: projects';
    const delta = '\n\nTABLES: projects';
    expect(stripStreamingFooter(delta, acc)).toBe('');
  });

  it('drops a trailing horizontal rule along with the footer', () => {
    const acc = 'Answer.\n\n---\nTABLES: projects';
    // Suppose the delta is the very last chunk that completed the footer.
    const delta = '\nTABLES: projects';
    expect(stripStreamingFooter(delta, acc)).toBe('');
  });

  it('keeps the prefix when footer starts mid-delta', () => {
    const acc = 'Answer body.\n\nTABLES: projects';
    // Delta supplied only the tail half.
    const delta = 'body.\n\nTABLES: projects';
    const result = stripStreamingFooter(delta, acc);
    expect(result).toBe('body.');
  });

  it('drops the delta when ## TABLES form is detected', () => {
    const acc = 'Answer.\n\n## TABLES\nprojects';
    const delta = '## TABLES\nprojects';
    expect(stripStreamingFooter(delta, acc)).toBe('');
  });
});
